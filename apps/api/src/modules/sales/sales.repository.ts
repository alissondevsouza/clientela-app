import type {
  DeliveryStatus,
  Receivable,
  ReceivablesSummary,
  Sale,
  SaleItem,
  SaleListItem,
  SaleStatus,
} from "@clientela/shared";
import { appLocalDateIso } from "@clientela/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  receivableOverdueCondition,
  receivableOverdueExpression,
} from "../../db/derived-expressions";
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
  ReceivableWithSale,
  SaleCreationRequest,
  SalesRepositoryPort,
} from "./sales.service";
import { derivePaymentSummary } from "./sales.service";

export type SalesRepository = ReturnType<typeof createSalesRepository>;

// Executor: aceita tanto a conexão (`db`) quanto a transação (`tx`), permitindo
// reusar os carregadores (loadSale/mappers) dentro e fora de transação sem
// duplicar SQL. Derivado do tipo do callback de `db.transaction`.
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

const COMPLETED_STATUS: SaleStatus = "completed";
const CANCELED_STATUS: SaleStatus = "canceled";
const OPEN_STATUS: SaleStatus = "open";

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

// Total efetivamente recebido de uma venda: soma das cobranças pagas e NÃO
// anuladas. Subquery escalar correlacionada para a listagem calcular o estado
// financeiro na MESMA instrução (RF-09) — sem N+1 e sem valor de fachada.
const paidCentsExpression = sql<string>`COALESCE((
  SELECT SUM("paid_receivables"."amount_cents"::bigint)
  FROM "receivables" AS "paid_receivables"
  WHERE "paid_receivables"."sale_id" = "sales"."id"
    AND "paid_receivables"."paid_at" IS NOT NULL
    AND "paid_receivables"."voided_at" IS NULL
), 0)`;

// Colunas do recebível na resposta (inclui overdue derivado a partir do
// `todayIso` — dia local resolvido pelo relógio injetado do service, RF-04).
// Reusado por getById/createSale/setReceivablePaid. Função (não objeto
// estático) porque `overdue` depende do "hoje" de cada chamada.
const receivableColumns = (todayIso: string) => ({
  id: receivables.id,
  saleId: receivables.saleId,
  amountCents: receivables.amountCents,
  dueDate: receivables.dueDate,
  dueKind: receivables.dueKind,
  paidAt: receivables.paidAt,
  voidedAt: receivables.voidedAt,
  createdAt: receivables.createdAt,
  updatedAt: receivables.updatedAt,
  overdue: receivableOverdueExpression(todayIso),
});

type SaleRow = typeof sales.$inferSelect;
type SaleItemRow = typeof saleItems.$inferSelect;
type ReceivableRow = {
  id: string;
  saleId: string;
  amountCents: number;
  dueDate: string | null;
  dueKind: "scheduled" | "on_delivery" | "unknown";
  paidAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  dueKind: row.dueKind,
  // Timestamp `Date` → ISO 8601; null = pendente.
  paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
  status: row.voidedAt ? "voided" : row.paidAt ? "paid" : "pending",
  overdue: row.overdue,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toSaleListItem = (row: SaleRow, paidCents: number): SaleListItem => {
  const deliveryStatus: DeliveryStatus = row.deliveredAt
    ? "delivered"
    : "pending";
  const payment = derivePaymentSummary(row.totalCents, row.status, paidCents);
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    totalCents: row.totalCents,
    paymentMethod: row.paymentMethod,
    paymentCondition: row.paymentCondition,
    cardType: row.cardType,
    installments: row.installments,
    paymentPlanKnown: row.paymentPlanKnown,
    status: row.status,
    deliveryStatus,
    paymentStatus: payment.paymentStatus,
    paidCents: payment.paidCents,
    outstandingCents: payment.outstandingCents,
    soldAt: row.soldAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

const toSale = (
  row: SaleRow,
  itemRows: SaleItemRow[],
  receivableRows: ReceivableRow[],
): Sale => ({
  ...toSaleListItem(
    row,
    receivableRows.reduce(
      (sum, receivable) =>
        receivable.paidAt !== null && receivable.voidedAt === null
          ? sum + receivable.amountCents
          : sum,
      0,
    ),
  ),
  items: itemRows.map(toSaleItem),
  receivables: receivableRows.map(toReceivable),
});

// Carrega a venda completa (cabeçalho + itens + recebíveis) em 3 queries
// escopadas — sem N+1 (database.md). Aceita `db` ou `tx`. `todayIso` (dia
// local do relógio injetado do service) decide `overdue` das cobranças
// (RF-04) — nunca a data corrente do servidor Postgres.
const loadSale = async (
  executor: Executor,
  consultantId: string,
  saleId: string,
  todayIso: string,
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
    .select(receivableColumns(todayIso))
    .from(receivables)
    .where(eq(receivables.saleId, saleId))
    .orderBy(
      asc(receivables.dueDate),
      asc(receivables.dueKind),
      asc(receivables.id),
    );

  return toSale(saleRow, itemRows, receivableRows);
};

// Única camada que toca o banco (api.md/database.md). TODA query escopa por
// `consultant_id` (direto em sales; via join com sales para receivables).
export const createSalesRepository = (db: Database): SalesRepositoryPort => {
  // Criação transacional (RF-04): trava as linhas dos produtos referenciados,
  // compõe a venda com o instante canônico do Postgres, resolve clientName
  // (snapshot escopado), baixa o estoque com UPDATE condicional ORDENADO por
  // product_id (anti-deadlock e nunca-negativo), insere venda + itens
  // (snapshots) + recebíveis e devolve a venda completa. Qualquer falha lança e
  // faz rollback (atomicidade).
  const createSale = async (
    consultantId: string,
    request: SaleCreationRequest,
  ): Promise<Sale> => {
    return db.transaction(async (tx) => {
      // (a) Instante ÚNICO da transação, vindo do banco: todos os timestamps
      // gravados neste caminho derivam dele, então as relações temporais
      // cross-table dos CHECKs não dependem do relógio da aplicação.
      // `to_json` devolve ISO 8601 com fuso ("...T...+00:00") — o driver não
      // tipa expressões cruas, então o texto ISO é a forma determinística de
      // trazer o instante para o JS (a precisão de milissegundos do Date basta:
      // todos os campos deste caminho recebem exatamente este valor).
      const [nowRow] = await tx
        .select({ now: sql<string>`to_json(transaction_timestamp()) #>> '{}'` })
        .from(sql`(SELECT 1) AS "transaction_clock"`);
      const transactionNow = new Date(nowRow?.now ?? "");
      if (Number.isNaN(transactionNow.getTime())) {
        throw new Error("Falha ao obter o instante canônico da transação");
      }

      // (b) Trava as linhas do catálogo referenciadas, ordenadas por id
      // (anti-deadlock) e escopadas pela consultora. Serializa com o DELETE de
      // produto (RF-05) e com outras baixas de estoque: entre travar e inserir
      // o item ninguém apaga o produto. Produto ausente ⇒ o composer lança o
      // 422 genérico de item inválido.
      const lockedProducts =
        request.productIds.length === 0
          ? []
          : await tx
              .select({
                id: products.id,
                name: products.name,
                priceCents: products.priceCents,
                costCents: products.costCents,
              })
              .from(products)
              .where(
                and(
                  eq(products.consultantId, consultantId),
                  inArray(products.id, request.productIds),
                ),
              )
              .orderBy(asc(products.id))
              .for("update");

      const composed = request.compose(lockedProducts, transactionNow);

      // (c) Snapshot do nome da cliente (escopado). clientId inválido/alheio ⇒
      // 422 antes de qualquer escrita; sem cliente ⇒ sentinel.
      let clientName = ANONYMOUS_CLIENT_NAME;
      if (composed.sale.clientId !== null) {
        const [clientRow] = await tx
          .select({ name: clients.name })
          .from(clients)
          .where(
            and(
              eq(clients.id, composed.sale.clientId),
              eq(clients.consultantId, consultantId),
            ),
          )
          .limit(1);
        if (!clientRow) {
          throw new InvalidSaleClientError();
        }
        clientName = clientRow.name;
      }

      // (d) Baixa de estoque ORDENADA por product_id (duas transações com os
      // mesmos produtos travam na mesma ordem — sem deadlock). UPDATE
      // condicional `stock_qty >= qty`: 0 linhas ⇒ leitura do estoque atual e
      // InsufficientStockError (rollback). Nunca-negativo sob concorrência.
      const orderedItems = [...composed.items].toSorted((left, right) =>
        left.productId.localeCompare(right.productId),
      );
      for (const item of composed.deliveryStatus === "delivered"
        ? orderedItems
        : []) {
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

      // (e) Insere a venda, os itens (snapshots) e os recebíveis.
      const [saleRow] = await tx
        .insert(sales)
        .values({
          consultantId,
          clientName,
          ...composed.sale,
        })
        .returning({ id: sales.id });

      if (!saleRow) {
        throw new Error("Falha ao persistir venda: insert não retornou id");
      }

      await tx.insert(saleItems).values(
        composed.items.map((item) => ({
          saleId: saleRow.id,
          productId: item.productId,
          productName: item.productName,
          qty: item.qty,
          unitPriceCents: item.unitPriceCents,
          costCents: item.costCents,
        })),
      );

      if (composed.receivables.length > 0) {
        await tx.insert(receivables).values(
          composed.receivables.map((receivable) => ({
            saleId: saleRow.id,
            ...receivable,
          })),
        );
      }

      const created = await loadSale(
        tx,
        consultantId,
        saleRow.id,
        request.today,
      );
      if (!created) {
        throw new Error("Falha ao carregar venda recém-criada");
      }
      return created;
    });
  };

  // Listagem (RF-14): `status` já chega como o(s) status REAL(is) — o service
  // traduziu "sold" para `["open", "completed"]`. `soldAtFromUtc`/
  // `soldAtToUtc` são instantes UTC prontos (RF-04): comparação sargável
  // contra `sold_at`, sem função sobre a coluna. `delivery` filtra por
  // `delivered_at` nulo/não nulo.
  const list = async (
    consultantId: string,
    {
      page,
      perPage,
      status,
      clientId,
      soldAtFromUtc,
      soldAtToUtc,
      delivery,
    }: ListSalesParams,
  ): Promise<{ rows: SaleListItem[]; total: number }> => {
    const conditions: SQL[] = [eq(sales.consultantId, consultantId)];
    if (status && status.length > 0) {
      conditions.push(inArray(sales.status, status));
    }
    if (clientId) {
      conditions.push(eq(sales.clientId, clientId));
    }
    if (soldAtFromUtc !== undefined) {
      conditions.push(gte(sales.soldAt, new Date(soldAtFromUtc)));
    }
    if (soldAtToUtc !== undefined) {
      conditions.push(lt(sales.soldAt, new Date(soldAtToUtc)));
    }
    if (delivery === "pending") {
      conditions.push(isNull(sales.deliveredAt));
    } else if (delivery === "delivered") {
      conditions.push(isNotNull(sales.deliveredAt));
    }
    const where = and(...conditions);
    const offset = (page - 1) * perPage;

    const rows = await db
      .select({ ...getTableColumns(sales), paidCents: paidCentsExpression })
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
      rows: rows.map(({ paidCents, ...row }) =>
        toSaleListItem(row, toSafeInteger(paidCents, "paidCents")),
      ),
      total: totalRow?.value ?? 0,
    };
  };

  // Detalhe em transação read-only REPEATABLE READ (RF-09): venda, itens e
  // cobranças vêm do MESMO snapshot — uma entrega ou baixa concorrente nunca
  // produz combinação impossível (venda ainda `open` com todas as parcelas
  // pagas, p.ex.) entre as três leituras.
  const getById = (
    consultantId: string,
    id: string,
    today: string,
  ): Promise<Sale | undefined> =>
    db.transaction((tx) => loadSale(tx, consultantId, id, today), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });

  // Cancelamento transacional (RF-05). A PRIMEIRA escrita é o UPDATE condicional
  // de sales (status='completed' → 'canceled'): serializa com o SELECT ... FOR
  // UPDATE do setReceivablePaid (disputam a mesma linha da venda). 0 linhas ⇒
  // distinguir inexistente (404) de já-cancelada (409) via select posterior.
  const cancel = async (
    consultantId: string,
    saleId: string,
    today: string,
  ): Promise<Sale> => {
    return db.transaction(async (tx) => {
      const now = new Date();
      const canceled = await tx
        .update(sales)
        .set({
          status: CANCELED_STATUS,
          canceledAt: now,
          completedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(sales.id, saleId),
            eq(sales.consultantId, consultantId),
            inArray(sales.status, [OPEN_STATUS, COMPLETED_STATUS]),
          ),
        )
        .returning({ id: sales.id, deliveredAt: sales.deliveredAt });

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

      // Devolve o estoque somente quando a venda havia sido entregue.
      // nulo), ORDENADO por product_id (mesma ordem da baixa — anti-deadlock).
      const itemsToRestock = await tx
        .select({ productId: saleItems.productId, qty: saleItems.qty })
        .from(saleItems)
        .where(
          and(eq(saleItems.saleId, saleId), isNotNull(saleItems.productId)),
        )
        .orderBy(asc(saleItems.productId));

      for (const item of canceled[0]?.deliveredAt ? itemsToRestock : []) {
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

      await tx
        .update(receivables)
        .set({ voidedAt: now, updatedAt: now })
        .where(
          and(
            eq(receivables.saleId, saleId),
            isNull(receivables.paidAt),
            isNull(receivables.voidedAt),
          ),
        );

      const result = await loadSale(tx, consultantId, saleId, today);
      if (!result) {
        throw new Error("Falha ao carregar venda cancelada");
      }
      return result;
    });
  };

  // Exclusão transacional (RF-08/RF-09/RF-10/RF-11/RF-12/RF-13). Verbo distinto
  // do cancelamento (RF-14): a venda "nunca existiu", não "existiu e não se
  // concretizou" — por isso NÃO há guarda de estado nenhuma aqui: cobrança já
  // paga é permitida (RF-10, ao contrário do cancel, que bloqueia) e não há
  // trava de prazo (RF-13, qualquer data). FOR UPDATE trava a linha da venda
  // ANTES de decidir, serializando com cancel/deliver/setReceivablePaid
  // concorrentes sobre a MESMA venda (mesmo padrão de lock do cancel/deliver).
  //
  // Estoque tem três estados e só UM devolve (RF-09) — errar aqui credita em
  // dobro, silenciosamente:
  //   (a) entregue e NÃO cancelada  ⇒ devolve (a venda debitou e nunca foi
  //       revertida);
  //   (b) aberta e não entregue     ⇒ não toca (nunca debitou; a reserva é
  //       derivada da própria linha e desaparece com o DELETE, nada a fazer);
  //   (c) já cancelada              ⇒ não toca (o cancel já devolveu, se havia
  //       o que devolver — devolver de novo dobraria o crédito).
  // Item com product_id nulo (produto excluído depois da venda, ADR-0013 item
  // 2) é ignorado: não há linha de produto para creditar.
  const remove = async (
    consultantId: string,
    saleId: string,
  ): Promise<void> => {
    await db.transaction(async (tx) => {
      const [saleRow] = await tx
        .select({ status: sales.status, deliveredAt: sales.deliveredAt })
        .from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.consultantId, consultantId)))
        .for("update");
      // Mesmo 404 para inexistente e para venda de outra consultora (RF-12) —
      // não vaza existência.
      if (!saleRow) {
        throw new SaleNotFoundError();
      }

      const shouldRestock =
        saleRow.deliveredAt !== null && saleRow.status !== CANCELED_STATUS;

      if (shouldRestock) {
        // Itens ORDENADOS por product_id (mesma ordem da baixa em `create` —
        // anti-deadlock), ignorando os que já perderam o produto.
        const itemsToRestock = await tx
          .select({ productId: saleItems.productId, qty: saleItems.qty })
          .from(saleItems)
          .where(
            and(eq(saleItems.saleId, saleId), isNotNull(saleItems.productId)),
          )
          .orderBy(asc(saleItems.productId));

        for (const item of itemsToRestock) {
          // isNotNull já filtra, mas o tipo permanece nullable — guarda
          // explícita (mesmo padrão do cancel).
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
      }

      // DELETE na mesma transação da reversão de estoque (nunca `DELETE` cru):
      // a cascata do banco leva sale_items e receivables (onDelete cascade);
      // appointments.sale_id vira NULL pela FK (onDelete set null) — o
      // compromisso sobrevive, só perde o vínculo (RF-11).
      await tx
        .delete(sales)
        .where(and(eq(sales.id, saleId), eq(sales.consultantId, consultantId)));
    });
  };

  const deliver = async (
    consultantId: string,
    saleId: string,
    today: string,
  ): Promise<Sale> =>
    db.transaction(async (tx) => {
      const [saleRow] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.consultantId, consultantId)))
        .for("update");
      if (!saleRow) throw new SaleNotFoundError();
      if (saleRow.status === CANCELED_STATUS || saleRow.deliveredAt !== null) {
        throw new SaleStateError("Esta venda não pode ser entregue.");
      }
      const items = await tx
        .select({
          productId: saleItems.productId,
          qty: saleItems.qty,
          productName: saleItems.productName,
        })
        .from(saleItems)
        .where(
          and(eq(saleItems.saleId, saleId), isNotNull(saleItems.productId)),
        )
        .orderBy(asc(saleItems.productId));
      for (const item of items) {
        if (!item.productId) continue;
        const changed = await tx
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
        if (changed.length === 0) {
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
      const now = new Date();
      const localDate = appLocalDateIso(now.toISOString());
      const [pending] = await tx
        .select({ id: receivables.id })
        .from(receivables)
        .where(
          and(
            eq(receivables.saleId, saleId),
            isNull(receivables.paidAt),
            isNull(receivables.voidedAt),
          ),
        )
        .limit(1);
      await tx
        .update(receivables)
        .set({ dueKind: "scheduled", dueDate: localDate, updatedAt: now })
        .where(
          and(
            eq(receivables.saleId, saleId),
            eq(receivables.dueKind, "on_delivery"),
          ),
        );
      await tx
        .update(sales)
        .set({
          deliveredAt: now,
          completedAt: pending ? null : now,
          status: pending ? OPEN_STATUS : COMPLETED_STATUS,
          updatedAt: now,
        })
        .where(eq(sales.id, saleId));
      const result = await loadSale(tx, consultantId, saleId, today);
      if (!result) throw new SaleNotFoundError();
      return result;
    });

  // Lista "quem me deve" (RF-06/RF-15): join com sales para escopo + dados da
  // cliente; overdue derivado no SQL. `pending` filtra só as não pagas;
  // `overdue` (só válido com `pending=true`, garantido pelo schema) restringe
  // às atrasadas via `receivableOverdueCondition(today)` — a MESMA regra do
  // `overdue` projetado na coluna (RF-04), nunca CURRENT_DATE. Quando
  // `paidAtFromUtc`/`paidAtToUtc` está presente (só com `pending=false`),
  // filtra só as pagas nesse intervalo e ordena por `paid_at desc, id desc`
  // (RF-15); senão mantém a ordem por vencimento de sempre.
  const listReceivables = async (
    consultantId: string,
    {
      page,
      perPage,
      pending,
      overdue,
      paidAtFromUtc,
      paidAtToUtc,
      today,
    }: ListReceivablesParams,
  ): Promise<{ rows: ReceivableWithSale[]; total: number }> => {
    // Cobrança ANULADA nunca entra em "quem me deve" — nem no modo histórico
    // (`pending=false`): ela existe só para preservar o plano no detalhe da
    // venda cancelada (RF-09). `pending` filtra adicionalmente as já pagas.
    const conditions: SQL[] = [
      eq(sales.consultantId, consultantId),
      isNull(receivables.voidedAt),
    ];
    if (pending) {
      conditions.push(isNull(receivables.paidAt));
    }
    if (overdue) {
      conditions.push(receivableOverdueCondition(today));
    }
    const hasPaidRange =
      paidAtFromUtc !== undefined || paidAtToUtc !== undefined;
    if (hasPaidRange) {
      conditions.push(isNotNull(receivables.paidAt));
      if (paidAtFromUtc !== undefined) {
        conditions.push(gte(receivables.paidAt, new Date(paidAtFromUtc)));
      }
      if (paidAtToUtc !== undefined) {
        conditions.push(lt(receivables.paidAt, new Date(paidAtToUtc)));
      }
    }
    const where = and(...conditions);
    const offset = (page - 1) * perPage;
    const orderBy = hasPaidRange
      ? [desc(receivables.paidAt), desc(receivables.id)]
      : [
          asc(receivables.dueDate),
          asc(receivables.dueKind),
          asc(receivables.id),
        ];

    const rows = await db
      .select({
        ...receivableColumns(today),
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
      .orderBy(...orderBy)
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
  // separa pendente de vencido — o atraso usa `receivableOverdueCondition(today)`
  // (dia local do relógio injetado, RF-04), nunca a data corrente do servidor
  // Postgres. `::bigint` evita overflow de integer no SUM; COALESCE devolve 0
  // sem dados. Total financeiro nunca vem de lista paginada.
  const receivablesSummary = async (
    consultantId: string,
    today: string,
  ): Promise<ReceivablesSummary> => {
    const overdueCondition = receivableOverdueCondition(today);
    const [row] = await db
      .select({
        pendingCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.paidAt} IS NULL AND ${receivables.voidedAt} IS NULL), 0)::bigint`,
        overdueCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${overdueCondition}), 0)::bigint`,
        overdueCount: sql<string>`COUNT(*) FILTER (WHERE ${overdueCondition})`,
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
    today: string,
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
      if (saleRow.status === CANCELED_STATUS) {
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
      const now = new Date();
      await tx
        .update(receivables)
        .set({ paidAt: paid ? now : null, updatedAt: now })
        .where(eq(receivables.id, receivableId));

      const [remaining] = await tx
        .select({ id: receivables.id })
        .from(receivables)
        .where(
          and(
            eq(receivables.saleId, located.saleId),
            isNull(receivables.paidAt),
            isNull(receivables.voidedAt),
          ),
        )
        .limit(1);
      const [freshSale] = await tx
        .select({ deliveredAt: sales.deliveredAt })
        .from(sales)
        .where(eq(sales.id, located.saleId))
        .limit(1);
      const complete = freshSale?.deliveredAt !== null && !remaining;
      await tx
        .update(sales)
        .set({
          status: complete ? COMPLETED_STATUS : OPEN_STATUS,
          completedAt: complete ? now : null,
          updatedAt: now,
        })
        .where(eq(sales.id, located.saleId));

      const [updated] = await tx
        .select(receivableColumns(today))
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
    createSale,
    list,
    getById,
    cancel,
    remove,
    deliver,
    listReceivables,
    receivablesSummary,
    setReceivablePaid,
  };
};
