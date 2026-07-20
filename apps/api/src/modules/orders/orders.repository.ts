import type {
  Order,
  OrderItem,
  OrderListItem,
  OrderStatus,
} from "@clientela/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client";
import { clients, orderItems, orders, products } from "../../db/schema";
import { OrderNotFoundError, OrderStateError } from "./orders.errors";
import type {
  ListOrdersParams,
  OrderClientRef,
  OrderItemData,
  OrderProductSnapshot,
  OrdersRepositoryPort,
} from "./orders.service";

export type OrdersRepository = ReturnType<typeof createOrdersRepository>;

// Executor: aceita tanto a conexão (`db`) quanto a transação (`tx`), permitindo
// reusar o carregador (loadOrder/mappers) dentro e fora de transação sem
// duplicar SQL. Derivado do tipo do callback de `db.transaction` (padrão de
// sales.repository).
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

const DRAFT_STATUS: OrderStatus = "draft";
const PLACED_STATUS: OrderStatus = "placed";
const DELIVERED_STATUS: OrderStatus = "delivered";
const CANCELED_STATUS: OrderStatus = "canceled";

const REPLACE_ITEMS_DRAFT_ONLY_MESSAGE =
  "Só é possível editar itens de um rascunho.";
const PLACE_INVALID_TRANSITION_MESSAGE =
  "Só é possível fazer o pedido a partir de um rascunho.";
const PLACE_EMPTY_ORDER_MESSAGE = "Não é possível fazer um pedido sem itens.";
const DELIVER_INVALID_TRANSITION_MESSAGE =
  "Só é possível marcar como entregue um pedido já feito.";
const CANCEL_INVALID_TRANSITION_MESSAGE =
  "Só é possível cancelar um pedido em rascunho ou já feito.";

type OrderRow = typeof orders.$inferSelect;

// Item já com o nome da cliente derivado pelo LEFT JOIN com `clients` (RF-01:
// sem snapshot — nome ATUAL, null quando sem cliente ou cliente excluída).
type OrderItemJoinRow = {
  id: string;
  productId: string | null;
  productName: string;
  clientId: string | null;
  clientName: string | null;
  qty: number;
  unitCostCents: number;
};

const toOrderItem = (row: OrderItemJoinRow): OrderItem => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  clientId: row.clientId,
  clientName: row.clientName,
  qty: row.qty,
  unitCostCents: row.unitCostCents,
});

const toOrderListItem = (row: OrderRow): OrderListItem => ({
  id: row.id,
  totalCents: row.totalCents,
  status: row.status,
  // Timestamps de transição `Date` → ISO 8601; null = transição ainda não
  // ocorreu.
  placedAt: row.placedAt ? row.placedAt.toISOString() : null,
  deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
  canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

const toOrder = (row: OrderRow, itemRows: OrderItemJoinRow[]): Order => ({
  ...toOrderListItem(row),
  items: itemRows.map(toOrderItem),
});

// Carrega o pedido completo (cabeçalho + itens) em 2 queries escopadas — sem
// N+1 (database.md). Aceita `db` ou `tx`.
const loadOrder = async (
  executor: Executor,
  consultantId: string,
  orderId: string,
): Promise<Order | undefined> => {
  const [orderRow] = await executor
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.consultantId, consultantId)))
    .limit(1);

  if (!orderRow) {
    return undefined;
  }

  // LEFT JOIN em clients (RF-01): clientName é derivado, NUNCA snapshot —
  // reflete o nome atual e vira null quando o item não tem cliente ou a
  // cliente foi excluída (SET NULL na FK apagou o vínculo, LGPD).
  const itemRows = await executor
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      productName: orderItems.productName,
      clientId: orderItems.clientId,
      clientName: clients.name,
      qty: orderItems.qty,
      unitCostCents: orderItems.unitCostCents,
    })
    .from(orderItems)
    .leftJoin(clients, eq(orderItems.clientId, clients.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id));

  return toOrder(orderRow, itemRows);
};

// Única camada que toca o banco (api.md/database.md). TODA query escopa por
// `consultant_id`.
export const createOrdersRepository = (db: Database): OrdersRepositoryPort => {
  // Carrega os produtos do escopo para o service compor snapshot/custo. Fora
  // de transação: o snapshot de custo é intencionalmente a leitura deste
  // momento (mesmo padrão de sales.findProductsByIds).
  const findProductsByIds = async (
    consultantId: string,
    ids: string[],
  ): Promise<OrderProductSnapshot[]> => {
    if (ids.length === 0) {
      return [];
    }
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        costCents: products.costCents,
      })
      .from(products)
      .where(
        and(eq(products.consultantId, consultantId), inArray(products.id, ids)),
      );

    return rows;
  };

  // Carrega as clientes do escopo para o service validar o vínculo de
  // encomenda (RF-02). Padrão simétrico a findProductsByIds.
  const findClientsByIds = async (
    consultantId: string,
    ids: string[],
  ): Promise<OrderClientRef[]> => {
    if (ids.length === 0) {
      return [];
    }
    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(eq(clients.consultantId, consultantId), inArray(clients.id, ids)),
      );

    return rows;
  };

  // Criação transacional (RF-01): insere o pedido (nasce `draft`) e, se houver,
  // os itens (snapshots já compostos pelo service) — depois devolve o pedido
  // completo. Rascunho vazio é permitido (itens é opcional).
  const createOrder = async (
    consultantId: string,
    items: OrderItemData[],
    totalCents: number,
  ): Promise<Order> => {
    return db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(orders)
        .values({ consultantId, totalCents })
        .returning({ id: orders.id });

      if (!orderRow) {
        throw new Error("Falha ao persistir pedido: insert não retornou id");
      }

      if (items.length > 0) {
        await tx.insert(orderItems).values(
          items.map((item) => ({
            orderId: orderRow.id,
            productId: item.productId,
            productName: item.productName,
            clientId: item.clientId,
            qty: item.qty,
            unitCostCents: item.unitCostCents,
          })),
        );
      }

      const created = await loadOrder(tx, consultantId, orderRow.id);
      if (!created) {
        throw new Error("Falha ao carregar pedido recém-criado");
      }
      return created;
    });
  };

  // Substituição completa dos itens (RF-02). A PRIMEIRA escrita é o UPDATE
  // condicional do total (status='draft' como guarda): serializa a edição
  // contra as transições de status (place/cancel disputam a mesma linha). 0
  // linhas ⇒ distinguir inexistente (404) de fora-de-draft (409) via select
  // posterior.
  const replaceItems = async (
    consultantId: string,
    orderId: string,
    items: OrderItemData[],
    totalCents: number,
  ): Promise<Order> => {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ totalCents })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.consultantId, consultantId),
            eq(orders.status, DRAFT_STATUS),
          ),
        )
        .returning({ id: orders.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: orders.status })
          .from(orders)
          .where(
            and(eq(orders.id, orderId), eq(orders.consultantId, consultantId)),
          )
          .limit(1);
        if (!existing) {
          throw new OrderNotFoundError();
        }
        throw new OrderStateError(REPLACE_ITEMS_DRAFT_ONLY_MESSAGE);
      }

      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

      if (items.length > 0) {
        await tx.insert(orderItems).values(
          items.map((item) => ({
            orderId,
            productId: item.productId,
            productName: item.productName,
            clientId: item.clientId,
            qty: item.qty,
            unitCostCents: item.unitCostCents,
          })),
        );
      }

      const result = await loadOrder(tx, consultantId, orderId);
      if (!result) {
        throw new Error("Falha ao carregar pedido após substituição de itens");
      }
      return result;
    });
  };

  const list = async (
    consultantId: string,
    { page, perPage, status }: ListOrdersParams,
  ): Promise<{ rows: OrderListItem[]; total: number }> => {
    const conditions: SQL[] = [eq(orders.consultantId, consultantId)];
    if (status) {
      conditions.push(eq(orders.status, status));
    }
    const where = and(...conditions);
    const offset = (page - 1) * perPage;

    const rows = await db
      .select()
      .from(orders)
      .where(where)
      // Pedidos mais recentes primeiro; id desc como desempate determinístico.
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(perPage)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(orders)
      .where(where);

    return {
      rows: rows.map(toOrderListItem),
      total: totalRow?.value ?? 0,
    };
  };

  const getById = (
    consultantId: string,
    id: string,
  ): Promise<Order | undefined> => loadOrder(db, consultantId, id);

  // Transição draft → placed (RF-03). Guarda por UPDATE condicional como
  // primeira escrita (serializa com replaceItems/cancel na mesma linha). Antes
  // de commitar, exige ≥ 1 item (RF-03: pedido sem itens não tem semântica) —
  // o throw após a escrita provoca rollback da transação inteira.
  const place = async (
    consultantId: string,
    orderId: string,
  ): Promise<Order> => {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ status: PLACED_STATUS, placedAt: sql`now()` })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.consultantId, consultantId),
            eq(orders.status, DRAFT_STATUS),
          ),
        )
        .returning({ id: orders.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: orders.status })
          .from(orders)
          .where(
            and(eq(orders.id, orderId), eq(orders.consultantId, consultantId)),
          )
          .limit(1);
        if (!existing) {
          throw new OrderNotFoundError();
        }
        throw new OrderStateError(PLACE_INVALID_TRANSITION_MESSAGE);
      }

      const [itemCountRow] = await tx
        .select({ value: count() })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      if ((itemCountRow?.value ?? 0) === 0) {
        throw new OrderStateError(PLACE_EMPTY_ORDER_MESSAGE);
      }

      const result = await loadOrder(tx, consultantId, orderId);
      if (!result) {
        throw new Error("Falha ao carregar pedido após fazer o pedido");
      }
      return result;
    });
  };

  // Transição placed → delivered (RF-03/RF-04). Guarda por UPDATE condicional
  // como primeira escrita (serializa contra deliver concorrente e contra
  // cancel). Crédito de estoque ORDENADO por product_id (anti-deadlock, mesmo
  // padrão do restock do cancel de sales) — só itens com produto vivo
  // (product_id não nulo); item com produto excluído fica no histórico sem
  // creditar (RF-04/RF-05).
  const deliver = async (
    consultantId: string,
    orderId: string,
  ): Promise<Order> => {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ status: DELIVERED_STATUS, deliveredAt: sql`now()` })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.consultantId, consultantId),
            eq(orders.status, PLACED_STATUS),
          ),
        )
        .returning({ id: orders.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: orders.status })
          .from(orders)
          .where(
            and(eq(orders.id, orderId), eq(orders.consultantId, consultantId)),
          )
          .limit(1);
        if (!existing) {
          throw new OrderNotFoundError();
        }
        throw new OrderStateError(DELIVER_INVALID_TRANSITION_MESSAGE);
      }

      const itemsToRestock = await tx
        .select({ productId: orderItems.productId, qty: orderItems.qty })
        .from(orderItems)
        .where(
          and(eq(orderItems.orderId, orderId), isNotNull(orderItems.productId)),
        )
        .orderBy(asc(orderItems.productId));

      for (const item of itemsToRestock) {
        // isNotNull já filtra, mas o tipo permanece nullable — guarda explícita.
        if (item.productId === null) {
          continue;
        }
        await tx
          .update(products)
          .set({ stockQty: sql`${products.stockQty} + ${item.qty}` })
          .where(
            and(
              eq(products.id, item.productId),
              eq(products.consultantId, consultantId),
            ),
          );
      }

      const result = await loadOrder(tx, consultantId, orderId);
      if (!result) {
        throw new Error("Falha ao carregar pedido após entrega");
      }
      return result;
    });
  };

  // Transição draft|placed → canceled (RF-03). Guarda por UPDATE condicional
  // (`inArray`) como primeira escrita — 0 linhas ⇒ distinguir inexistente
  // (404) de já-entregue/já-cancelado (409). Sem efeito de estoque (RF-04).
  const cancel = async (
    consultantId: string,
    orderId: string,
  ): Promise<Order> => {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ status: CANCELED_STATUS, canceledAt: sql`now()` })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.consultantId, consultantId),
            inArray(orders.status, [DRAFT_STATUS, PLACED_STATUS]),
          ),
        )
        .returning({ id: orders.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: orders.status })
          .from(orders)
          .where(
            and(eq(orders.id, orderId), eq(orders.consultantId, consultantId)),
          )
          .limit(1);
        if (!existing) {
          throw new OrderNotFoundError();
        }
        throw new OrderStateError(CANCEL_INVALID_TRANSITION_MESSAGE);
      }

      const result = await loadOrder(tx, consultantId, orderId);
      if (!result) {
        throw new Error("Falha ao carregar pedido cancelado");
      }
      return result;
    });
  };

  return {
    findProductsByIds,
    findClientsByIds,
    createOrder,
    replaceItems,
    list,
    getById,
    place,
    deliver,
    cancel,
  };
};
