import type {
  Receivable,
  ReceivablesSummary,
  Sale,
  SaleItem,
  SaleListItem,
  SaleStatus,
} from "@clientela/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  clients,
  products,
  receivables,
  saleItems,
  sales,
} from "../../db/schema";
import {
  InsufficientStockError,
  InvalidSaleClientError,
  ReceivableNotFoundError,
  SaleNotFoundError,
  SaleStateError,
} from "./sales.errors";
import type {
  ListReceivablesParams,
  ListSalesParams,
  ReceivableData,
  ReceivableWithSale,
  SaleData,
  SaleItemData,
  SaleProductSnapshot,
  SalesRepositoryPort,
} from "./sales.service";

export type SalesRepository = ReturnType<typeof createSalesRepository>;

// Executor: aceita tanto a conexão (`db`) quanto a transação (`tx`), permitindo
// reusar os carregadores (loadSale/mappers) dentro e fora de transação sem
// duplicar SQL. Derivado do tipo do callback de `db.transaction`.
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

const COMPLETED_STATUS: SaleStatus = "completed";
const CANCELED_STATUS: SaleStatus = "canceled";

// Snapshot do nome quando a venda não tem cliente identificada (client_id null).
// A coluna client_name é NOT NULL; o web exibe "—" pela ausência de clientId.
const ANONYMOUS_CLIENT_NAME = "Cliente não identificada";

const SALE_ALREADY_CANCELED_MESSAGE = "Esta venda já está cancelada.";
const CANCEL_WITH_PAID_MESSAGE =
  "Não é possível cancelar: há parcela paga. Estorne o pagamento antes de cancelar.";
const RECEIVABLE_SALE_CANCELED_MESSAGE =
  "Não é possível alterar a parcela: a venda está cancelada.";
const RECEIVABLE_ALREADY_PAID_MESSAGE = "Esta parcela já está paga.";
const RECEIVABLE_NOT_PAID_MESSAGE = "Esta parcela ainda não foi paga.";

// Converte um agregado monetário (SUM em centavos, vindo como string/number do
// driver) para número inteiro seguro. Acima de MAX_SAFE_INTEGER a conversão
// perde precisão SILENCIOSAMENTE — dinheiro exige exatidão, então lançamos
// (última defesa da invariante "dinheiro exato"). Replicado de
// products.repository (padrão do projeto) para não cruzar a fronteira de módulo.
const toSafeInteger = (value: string | number, field: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `Agregado de ${field} excede a precisão inteira segura (${value})`,
    );
  }
  return parsed;
};

// `overdue` derivado no SQL com a data do servidor (CURRENT_DATE, UTC): parcela
// vencida = due_date no passado E ainda não paga. Mesma regra no summary.
const overdueExpression: SQL<boolean> = sql<boolean>`(${receivables.dueDate} < CURRENT_DATE) AND (${receivables.paidAt} IS NULL)`;

// Colunas do recebível na resposta (inclui overdue derivado). Reusado por
// getById/createSale/setReceivablePaid.
const receivableColumns = {
  id: receivables.id,
  saleId: receivables.saleId,
  amountCents: receivables.amountCents,
  dueDate: receivables.dueDate,
  paidAt: receivables.paidAt,
  overdue: overdueExpression,
};

type SaleRow = typeof sales.$inferSelect;
type SaleItemRow = typeof saleItems.$inferSelect;
type ReceivableRow = {
  id: string;
  saleId: string;
  amountCents: number;
  dueDate: string;
  paidAt: Date | null;
  overdue: boolean;
};

const toSaleItem = (row: SaleItemRow): SaleItem => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  qty: row.qty,
  unitPriceCents: row.unitPriceCents,
});

const toReceivable = (row: ReceivableRow): Receivable => ({
  id: row.id,
  saleId: row.saleId,
  amountCents: row.amountCents,
  dueDate: row.dueDate,
  // Timestamp `Date` → ISO 8601; null = pendente.
  paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  overdue: row.overdue,
});

const toSaleListItem = (row: SaleRow): SaleListItem => ({
  id: row.id,
  clientId: row.clientId,
  clientName: row.clientName,
  totalCents: row.totalCents,
  paymentMethod: row.paymentMethod,
  status: row.status,
  soldAt: row.soldAt.toISOString(),
});

const toSale = (
  row: SaleRow,
  itemRows: SaleItemRow[],
  receivableRows: ReceivableRow[],
): Sale => ({
  ...toSaleListItem(row),
  items: itemRows.map(toSaleItem),
  receivables: receivableRows.map(toReceivable),
});

// Carrega a venda completa (cabeçalho + itens + recebíveis) em 3 queries
// escopadas — sem N+1 (database.md). Aceita `db` ou `tx`.
const loadSale = async (
  executor: Executor,
  consultantId: string,
  saleId: string,
): Promise<Sale | undefined> => {
  const [saleRow] = await executor
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.consultantId, consultantId)))
    .limit(1);

  if (!saleRow) {
    return undefined;
  }

  const itemRows = await executor
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId))
    .orderBy(asc(saleItems.id));

  const receivableRows = await executor
    .select(receivableColumns)
    .from(receivables)
    .where(eq(receivables.saleId, saleId))
    .orderBy(asc(receivables.dueDate), asc(receivables.id));

  return toSale(saleRow, itemRows, receivableRows);
};

// Única camada que toca o banco (api.md/database.md). TODA query escopa por
// `consultant_id` (direto em sales; via join com sales para receivables).
export const createSalesRepository = (db: Database): SalesRepositoryPort => {
  // Carrega os produtos do escopo para o service compor snapshot/preço. Fora de
  // transação: o snapshot de preço é intencionalmente a leitura deste momento.
  const findProductsByIds = async (
    consultantId: string,
    ids: string[],
  ): Promise<SaleProductSnapshot[]> => {
    if (ids.length === 0) {
      return [];
    }
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        priceCents: products.priceCents,
        costCents: products.costCents,
      })
      .from(products)
      .where(
        and(eq(products.consultantId, consultantId), inArray(products.id, ids)),
      );

    return rows;
  };

  // Criação transacional (RF-03): resolve clientName (snapshot escopado), baixa
  // o estoco com UPDATE condicional ORDENADO por product_id (anti-deadlock e
  // nunca-negativo), insere venda + itens (snapshots) + recebíveis, e devolve a
  // venda completa. Qualquer falha lança e faz rollback (atomicidade).
  const createSale = async (
    consultantId: string,
    sale: SaleData,
    items: SaleItemData[],
    receivablesData: ReceivableData[],
  ): Promise<Sale> => {
    return db.transaction(async (tx) => {
      // (a) Snapshot do nome da cliente (escopado). clientId inválido/alheio ⇒
      // 422 antes de qualquer escrita; sem cliente ⇒ sentinel.
      let clientName = ANONYMOUS_CLIENT_NAME;
      if (sale.clientId !== null) {
        const [clientRow] = await tx
          .select({ name: clients.name })
          .from(clients)
          .where(
            and(
              eq(clients.id, sale.clientId),
              eq(clients.consultantId, consultantId),
            ),
          )
          .limit(1);
        if (!clientRow) {
          throw new InvalidSaleClientError();
        }
        clientName = clientRow.name;
      }

      // (b) Baixa de estoque ORDENADA por product_id (duas transações com os
      // mesmos produtos travam na mesma ordem — sem deadlock). UPDATE
      // condicional `stock_qty >= qty`: 0 linhas ⇒ leitura do estoque atual e
      // InsufficientStockError (rollback). Nunca-negativo sob concorrência.
      const orderedItems = [...items].toSorted((left, right) =>
        left.productId.localeCompare(right.productId),
      );
      for (const item of orderedItems) {
        const decremented = await tx
          .update(products)
          .set({ stockQty: sql`${products.stockQty} - ${item.qty}` })
          .where(
            and(
              eq(products.id, item.productId),
              eq(products.consultantId, consultantId),
              gte(products.stockQty, item.qty),
            ),
          )
          .returning({ id: products.id });

        if (decremented.length === 0) {
          const [current] = await tx
            .select({ stockQty: products.stockQty })
            .from(products)
            .where(
              and(
                eq(products.id, item.productId),
                eq(products.consultantId, consultantId),
              ),
            )
            .limit(1);
          throw new InsufficientStockError(
            item.productName,
            current?.stockQty ?? 0,
          );
        }
      }

      // (c) Insere a venda, os itens (snapshots) e os recebíveis.
      const [saleRow] = await tx
        .insert(sales)
        .values({
          consultantId,
          clientId: sale.clientId,
          clientName,
          totalCents: sale.totalCents,
          paymentMethod: sale.paymentMethod,
        })
        .returning({ id: sales.id });

      if (!saleRow) {
        throw new Error("Falha ao persistir venda: insert não retornou id");
      }

      await tx.insert(saleItems).values(
        items.map((item) => ({
          saleId: saleRow.id,
          productId: item.productId,
          productName: item.productName,
          qty: item.qty,
          unitPriceCents: item.unitPriceCents,
          costCents: item.costCents,
        })),
      );

      if (receivablesData.length > 0) {
        await tx.insert(receivables).values(
          receivablesData.map((receivable) => ({
            saleId: saleRow.id,
            amountCents: receivable.amountCents,
            dueDate: receivable.dueDate,
          })),
        );
      }

      const created = await loadSale(tx, consultantId, saleRow.id);
      if (!created) {
        throw new Error("Falha ao carregar venda recém-criada");
      }
      return created;
    });
  };

  const list = async (
    consultantId: string,
    { page, perPage, status, clientId }: ListSalesParams,
  ): Promise<{ rows: SaleListItem[]; total: number }> => {
    const conditions: SQL[] = [eq(sales.consultantId, consultantId)];
    if (status) {
      conditions.push(eq(sales.status, status));
    }
    if (clientId) {
      conditions.push(eq(sales.clientId, clientId));
    }
    const where = and(...conditions);
    const offset = (page - 1) * perPage;

    const rows = await db
      .select()
      .from(sales)
      .where(where)
      // Vendas mais recentes primeiro; id desc como desempate determinístico.
      .orderBy(desc(sales.soldAt), desc(sales.id))
      .limit(perPage)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(sales)
      .where(where);

    return {
      rows: rows.map(toSaleListItem),
      total: totalRow?.value ?? 0,
    };
  };

  const getById = (
    consultantId: string,
    id: string,
  ): Promise<Sale | undefined> => loadSale(db, consultantId, id);

  // Cancelamento transacional (RF-05). A PRIMEIRA escrita é o UPDATE condicional
  // de sales (status='completed' → 'canceled'): serializa com o SELECT ... FOR
  // UPDATE do setReceivablePaid (disputam a mesma linha da venda). 0 linhas ⇒
  // distinguir inexistente (404) de já-cancelada (409) via select posterior.
  const cancel = async (
    consultantId: string,
    saleId: string,
  ): Promise<Sale> => {
    return db.transaction(async (tx) => {
      const canceled = await tx
        .update(sales)
        .set({ status: CANCELED_STATUS })
        .where(
          and(
            eq(sales.id, saleId),
            eq(sales.consultantId, consultantId),
            eq(sales.status, COMPLETED_STATUS),
          ),
        )
        .returning({ id: sales.id });

      if (canceled.length === 0) {
        const [existing] = await tx
          .select({ status: sales.status })
          .from(sales)
          .where(
            and(eq(sales.id, saleId), eq(sales.consultantId, consultantId)),
          )
          .limit(1);
        if (!existing) {
          throw new SaleNotFoundError();
        }
        throw new SaleStateError(SALE_ALREADY_CANCELED_MESSAGE);
      }

      // Bloqueia cancelamento com parcela paga (⇒ rollback do UPDATE acima).
      const [paidReceivable] = await tx
        .select({ id: receivables.id })
        .from(receivables)
        .where(
          and(eq(receivables.saleId, saleId), isNotNull(receivables.paidAt)),
        )
        .limit(1);
      if (paidReceivable) {
        throw new SaleStateError(CANCEL_WITH_PAID_MESSAGE);
      }

      // Devolve o estoque só dos itens cujo produto ainda existe (product_id não
      // nulo), ORDENADO por product_id (mesma ordem da baixa — anti-deadlock).
      const itemsToRestock = await tx
        .select({ productId: saleItems.productId, qty: saleItems.qty })
        .from(saleItems)
        .where(
          and(eq(saleItems.saleId, saleId), isNotNull(saleItems.productId)),
        )
        .orderBy(asc(saleItems.productId));

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

      // Remove os recebíveis pendentes (os pagos já barraram o cancelamento).
      await tx
        .delete(receivables)
        .where(and(eq(receivables.saleId, saleId), isNull(receivables.paidAt)));

      const result = await loadSale(tx, consultantId, saleId);
      if (!result) {
        throw new Error("Falha ao carregar venda cancelada");
      }
      return result;
    });
  };

  // Lista "quem me deve" (RF-06): join com sales para escopo + dados da cliente;
  // ordenada por vencimento; overdue derivado no SQL. `pending` filtra só as não
  // pagas.
  const listReceivables = async (
    consultantId: string,
    { page, perPage, pending }: ListReceivablesParams,
  ): Promise<{ rows: ReceivableWithSale[]; total: number }> => {
    const conditions: SQL[] = [eq(sales.consultantId, consultantId)];
    if (pending) {
      conditions.push(isNull(receivables.paidAt));
    }
    const where = and(...conditions);
    const offset = (page - 1) * perPage;

    const rows = await db
      .select({
        ...receivableColumns,
        clientId: sales.clientId,
        clientName: sales.clientName,
        // LEFT JOIN por sales.client_id: null quando a cliente foi excluída
        // (SET NULL) ou a venda é anônima (client_id null). O clientName snapshot
        // segue legível mesmo sem a cliente viva (LGPD/histórico).
        clientWhatsapp: clients.whatsapp,
      })
      .from(receivables)
      .innerJoin(sales, eq(receivables.saleId, sales.id))
      .leftJoin(clients, eq(sales.clientId, clients.id))
      .where(where)
      .orderBy(asc(receivables.dueDate), asc(receivables.id))
      .limit(perPage)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(receivables)
      .innerJoin(sales, eq(receivables.saleId, sales.id))
      .where(where);

    return {
      rows: rows.map((row) => ({
        ...toReceivable(row),
        clientId: row.clientId,
        clientName: row.clientName,
        clientWhatsapp: row.clientWhatsapp,
      })),
      total: totalRow?.value ?? 0,
    };
  };

  // Agregado "a receber" (RF-06): SUM SQL escopado por join com sales. `FILTER`
  // separa pendente de vencido. `::bigint` evita overflow de integer no SUM;
  // COALESCE devolve 0 sem dados. Total financeiro nunca vem de lista paginada.
  const receivablesSummary = async (
    consultantId: string,
  ): Promise<ReceivablesSummary> => {
    const [row] = await db
      .select({
        pendingCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.paidAt} IS NULL), 0)::bigint`,
        overdueCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.paidAt} IS NULL AND ${receivables.dueDate} < CURRENT_DATE), 0)::bigint`,
        overdueCount: sql<string>`COUNT(*) FILTER (WHERE ${receivables.paidAt} IS NULL AND ${receivables.dueDate} < CURRENT_DATE)`,
      })
      .from(receivables)
      .innerJoin(sales, eq(receivables.saleId, sales.id))
      .where(eq(sales.consultantId, consultantId));

    return {
      pendingCents: toSafeInteger(row?.pendingCents ?? 0, "pendingCents"),
      overdueCents: toSafeInteger(row?.overdueCents ?? 0, "overdueCents"),
      overdueCount: toSafeInteger(row?.overdueCount ?? 0, "overdueCount"),
    };
  };

  // Baixa/estorno transacional (RF-06). Serializa contra o cancelamento: trava a
  // linha da venda (SELECT ... FOR UPDATE) ANTES de gravar, re-checa
  // status='completed' e o estado atual da parcela. Ordem: localizar (escopo) →
  // travar venda → checar estado → gravar.
  const setReceivablePaid = async (
    consultantId: string,
    receivableId: string,
    paid: boolean,
  ): Promise<Receivable> => {
    return db.transaction(async (tx) => {
      // (a) Localiza a parcela escopada (join com sales por consultant_id) e
      // obtém o sale_id. Inexistente/alheia ⇒ 404.
      const [located] = await tx
        .select({ saleId: receivables.saleId })
        .from(receivables)
        .innerJoin(sales, eq(receivables.saleId, sales.id))
        .where(
          and(
            eq(receivables.id, receivableId),
            eq(sales.consultantId, consultantId),
          ),
        )
        .limit(1);
      if (!located) {
        throw new ReceivableNotFoundError();
      }

      // (b) Trava a linha da venda (FOR UPDATE) — serializa com o cancel.
      const [saleRow] = await tx
        .select({ status: sales.status })
        .from(sales)
        .where(
          and(
            eq(sales.id, located.saleId),
            eq(sales.consultantId, consultantId),
          ),
        )
        .for("update");
      if (!saleRow) {
        throw new ReceivableNotFoundError();
      }

      // (c) Venda cancelada ⇒ parcela não é pagável/estornável (409).
      if (saleRow.status !== COMPLETED_STATUS) {
        throw new SaleStateError(RECEIVABLE_SALE_CANCELED_MESSAGE);
      }

      // (d) Estado atual da parcela sob o lock (fresco): pagar paga / estornar
      // pendente ⇒ 409 explícito.
      const [current] = await tx
        .select({ paidAt: receivables.paidAt })
        .from(receivables)
        .where(eq(receivables.id, receivableId))
        .limit(1);
      if (!current) {
        throw new ReceivableNotFoundError();
      }
      const isPaid = current.paidAt !== null;
      if (paid && isPaid) {
        throw new SaleStateError(RECEIVABLE_ALREADY_PAID_MESSAGE);
      }
      if (!paid && !isPaid) {
        throw new SaleStateError(RECEIVABLE_NOT_PAID_MESSAGE);
      }

      // (e) Grava a baixa (now do banco) ou o estorno (null).
      await tx
        .update(receivables)
        .set({ paidAt: paid ? sql`now()` : null })
        .where(eq(receivables.id, receivableId));

      const [updated] = await tx
        .select(receivableColumns)
        .from(receivables)
        .where(eq(receivables.id, receivableId))
        .limit(1);
      if (!updated) {
        throw new ReceivableNotFoundError();
      }
      return toReceivable(updated);
    });
  };

  return {
    findProductsByIds,
    createSale,
    list,
    getById,
    cancel,
    listReceivables,
    receivablesSummary,
    setReceivablePaid,
  };
};
