import type { SaleStatus } from "@clientela/shared";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lt,
  lte,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  clients,
  monthlyGoals,
  products,
  receivables,
  saleItems,
  sales,
} from "../../db/schema";
import type {
  DashboardMonthlySeriesItemData,
  DashboardPerformanceData,
  DashboardPerformanceQueryInput,
  DashboardPerformanceRepositoryPort,
  DashboardPeriodBounds,
  DashboardPeriodMetricsData,
  DashboardSeriesMonthInput,
  DashboardTopClientData,
  DashboardTopProductData,
  EffectiveGoalRow,
} from "./dashboard.service";

export type DashboardPerformanceRepository = ReturnType<
  typeof createDashboardPerformanceRepository
>;

// Executor: aceita tanto a conexão (`db`) quanto a transação (`tx`) — mesmo
// padrão de sales/appointments.repository.ts. `metrics`/`series`/`topProducts`/
// `topClients`/`effectiveGoal` são exportados como funções livres (recebem o
// executor explícito) para serem testáveis em integração sem passar pelo
// service — `performance()` os compõe dentro de UMA transação read-only.
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

const CANCELED_STATUS: SaleStatus = "canceled";

// Converte um agregado monetário/contagem (vindo como string/number do
// driver — bigint/numeric do Postgres) para número inteiro seguro. Acima de
// MAX_SAFE_INTEGER a conversão perde precisão SILENCIOSAMENTE — lançamos em
// vez de devolver dinheiro errado. Replicado de products/sales/dashboard
// repository (convenção aceita do projeto — known-issue "toSafeInteger
// replicado", project-memory/known-issues.md).
const toSafeInteger = (value: string | number, field: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `Agregado de ${field} excede a precisão inteira segura (${value})`,
    );
  }
  return parsed;
};

// Escopo "Vendido" (RF-05, Glossário): vendas da consultora, `status <>
// 'canceled'`, `sold_at` no intervalo `[startUtc, endUtc)` já resolvido pelo
// service (nunca CURRENT_DATE/now()/date_trunc — RF-04/ADR-0018). Array de
// condições (não `and()` já combinado) para reusar tanto em `metrics` quanto
// em `topProducts`/`topClients` sem repetir a lista.
const soldScopeConditions = (
  consultantId: string,
  bounds: DashboardPeriodBounds,
): SQL[] => [
  eq(sales.consultantId, consultantId),
  ne(sales.status, CANCELED_STATUS),
  gte(sales.soldAt, new Date(bounds.startUtc)),
  lt(sales.soldAt, new Date(bounds.endUtc)),
];

// Métricas de um intervalo (RF-05): Vendido/contagem/clientes distintas numa
// query sobre `sales`; Lucro numa query separada sobre `sale_items` (evita
// multiplicar as linhas de `sales` pelos itens); Recebido por `paid_at` da
// cobrança (não pelo escopo Vendido — RF-05: cobrança paga fora do período de
// venda ainda conta no período em que foi PAGA). `::bigint` antes de
// multiplicar (nunca depois — overflow de integer).
export const metrics = async (
  tx: Executor,
  consultantId: string,
  bounds: DashboardPeriodBounds,
): Promise<DashboardPeriodMetricsData> => {
  const scope = and(...soldScopeConditions(consultantId, bounds));

  const [salesRow] = await tx
    .select({
      soldCents: sql<string>`COALESCE(SUM(${sales.totalCents}), 0)::bigint`,
      soldCount: sql<string>`COUNT(*)`,
      // COUNT(DISTINCT ...) já ignora NULL — clientsCount conta só client_id
      // não nulos (RF-05: venda sem cliente não conta como "cliente atendida").
      clientsCount: sql<string>`COUNT(DISTINCT ${sales.clientId})`,
    })
    .from(sales)
    .where(scope);

  const [profitRow] = await tx
    .select({
      profitCents: sql<string>`COALESCE(SUM((${saleItems.unitPriceCents} - ${saleItems.costCents})::bigint * ${saleItems.qty}), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(scope);

  const [receivedRow] = await tx
    .select({
      receivedCents: sql<string>`COALESCE(SUM(${receivables.amountCents}), 0)::bigint`,
    })
    .from(receivables)
    .innerJoin(sales, eq(receivables.saleId, sales.id))
    .where(
      and(
        eq(sales.consultantId, consultantId),
        isNull(receivables.voidedAt),
        gte(receivables.paidAt, new Date(bounds.startUtc)),
        lt(receivables.paidAt, new Date(bounds.endUtc)),
      ),
    );

  return {
    soldCents: toSafeInteger(salesRow?.soldCents ?? 0, "soldCents"),
    soldCount: toSafeInteger(salesRow?.soldCount ?? 0, "soldCount"),
    profitCents: toSafeInteger(profitRow?.profitCents ?? 0, "profitCents"),
    receivedCents: toSafeInteger(
      receivedRow?.receivedCents ?? 0,
      "receivedCents",
    ),
    clientsCount: toSafeInteger(salesRow?.clientsCount ?? 0, "clientsCount"),
  };
};

// Série de 12 meses (RF-11) numa ÚNICA query: `(VALUES (mês, início, fim),
// ...) AS months(...)` monta a tabela derivada de bounds (parâmetros via
// `sql.join` — arrays JS não vão crus ao template do Drizzle, plan.md); duas
// CTEs separadas (`sold` só em `sales`, `profit` em `sales` + `sale_items`)
// evitam multiplicar `sold_cents` pela quantidade de itens da venda. `LEFT
// JOIN` preserva meses sem venda (zeros via COALESCE), na ordem de entrada.
export const series = async (
  tx: Executor,
  consultantId: string,
  months: DashboardSeriesMonthInput[],
): Promise<DashboardMonthlySeriesItemData[]> => {
  if (months.length === 0) {
    return [];
  }

  const monthsValues = sql.join(
    months.map(
      (entry) =>
        sql`(${entry.month}::text, ${entry.startUtc}::timestamptz, ${entry.endUtc}::timestamptz)`,
    ),
    sql`, `,
  );

  const rows = await tx.execute<{
    month: string;
    sold_cents: string;
    profit_cents: string;
  }>(sql`
    WITH months(month, start_at, end_at) AS (
      VALUES ${monthsValues}
    ),
    sold AS (
      SELECT months.month AS month,
        COALESCE(SUM(${sales.totalCents}), 0)::bigint AS sold_cents
      FROM months
      LEFT JOIN ${sales}
        ON ${sales.consultantId} = ${consultantId}
        AND ${sales.status} <> ${CANCELED_STATUS}
        AND ${sales.soldAt} >= months.start_at
        AND ${sales.soldAt} < months.end_at
      GROUP BY months.month
    ),
    profit AS (
      SELECT months.month AS month,
        COALESCE(SUM((${saleItems.unitPriceCents} - ${saleItems.costCents})::bigint * ${saleItems.qty}), 0) AS profit_cents
      FROM months
      LEFT JOIN ${sales}
        ON ${sales.consultantId} = ${consultantId}
        AND ${sales.status} <> ${CANCELED_STATUS}
        AND ${sales.soldAt} >= months.start_at
        AND ${sales.soldAt} < months.end_at
      LEFT JOIN ${saleItems} ON ${saleItems.saleId} = ${sales.id}
      GROUP BY months.month
    )
    SELECT months.month AS month,
      COALESCE(sold.sold_cents, 0) AS sold_cents,
      COALESCE(profit.profit_cents, 0) AS profit_cents
    FROM months
    LEFT JOIN sold ON sold.month = months.month
    LEFT JOIN profit ON profit.month = months.month
    ORDER BY months.month
  `);

  return rows.map((row) => ({
    month: row.month,
    soldCents: toSafeInteger(row.sold_cents, "soldCents"),
    profitCents: toSafeInteger(row.profit_cents, "profitCents"),
  }));
};

// Top produtos (RF-11): agrupados por `COALESCE(product_id::text, 'snapshot:'
// || product_name)` — produto renomeado não se divide (mesmo product_id, nomes
// diferentes ao longo do tempo continuam UM grupo); produto excluído
// (`product_id` NULL) agrupa pelo snapshot do nome. `name` = nome ATUAL via
// LEFT JOIN products quando o produto existe, senão o snapshot. Ordem: qty
// desc, soldCents desc, nome asc (RF-11).
export const topProducts = async (
  tx: Executor,
  consultantId: string,
  bounds: DashboardPeriodBounds,
  limit: number,
): Promise<DashboardTopProductData[]> => {
  const scope = and(...soldScopeConditions(consultantId, bounds));
  const groupKey = sql`COALESCE(${saleItems.productId}::text, 'snapshot:' || ${saleItems.productName})`;
  const nameExpression = sql`COALESCE(MAX(${products.name}), MAX(${saleItems.productName}))`;
  const qtyExpression = sql`SUM(${saleItems.qty})`;
  const soldCentsExpression = sql`SUM(${saleItems.unitPriceCents}::bigint * ${saleItems.qty})`;

  const rows = await tx
    .select({
      // Postgres não tem agregado MAX/MIN nativo para `uuid` ("function
      // max(uuid) does not exist") — cast para `text` antes de agregar.
      productId: sql<string | null>`MAX(${saleItems.productId}::text)`,
      name: sql<string>`${nameExpression}`,
      qty: sql<string>`${qtyExpression}`,
      soldCents: sql<string>`${soldCentsExpression}`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(scope)
    .groupBy(groupKey)
    .orderBy(
      sql`${qtyExpression} DESC`,
      sql`${soldCentsExpression} DESC`,
      sql`${nameExpression} ASC`,
      // Desempate final (S6/determinismo, mesmo padrão de `topClients`): dois
      // produtos DISTINTOS (grupos diferentes) empatados em qty, soldCents E
      // nome precisam de UMA ordem estável — o `groupKey` é único por grupo.
      sql`${groupKey} ASC`,
    )
    .limit(limit);

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    qty: toSafeInteger(row.qty, "qty"),
    soldCents: toSafeInteger(row.soldCents, "soldCents"),
  }));
};

// Top clientes (RF-11): só vendas com `client_id` não nulo (INNER JOIN com
// `clients` já exclui venda anônima); agrupadas por cliente; nome ATUAL (join,
// não snapshot). Ordem: soldCents desc, salesCount desc, nome asc.
export const topClients = async (
  tx: Executor,
  consultantId: string,
  bounds: DashboardPeriodBounds,
  limit: number,
): Promise<DashboardTopClientData[]> => {
  const scope = and(...soldScopeConditions(consultantId, bounds));

  const rows = await tx
    .select({
      clientId: clients.id,
      name: clients.name,
      salesCount: sql<string>`COUNT(*)`,
      soldCents: sql<string>`COALESCE(SUM(${sales.totalCents}), 0)::bigint`,
    })
    .from(sales)
    .innerJoin(clients, eq(sales.clientId, clients.id))
    .where(scope)
    .groupBy(clients.id, clients.name)
    .orderBy(
      sql`SUM(${sales.totalCents}) DESC`,
      sql`COUNT(*) DESC`,
      asc(clients.name),
      // Desempate final (S7/determinismo): `id` — dois clientes empatados em
      // valor, contagem E nome (nunca acontece na prática, mas nome não é
      // único) precisam de UMA ordem estável.
      asc(clients.id),
    )
    .limit(limit);

  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.name,
    salesCount: toSafeInteger(row.salesCount, "salesCount"),
    soldCents: toSafeInteger(row.soldCents, "soldCents"),
  }));
};

// Meta efetiva de um mês M (RF-07): a linha de MAIOR `month_start <= M`; sem
// linha, `null` (sem meta). Herança sem materializar meses (plan.md).
export const effectiveGoal = async (
  tx: Executor,
  consultantId: string,
  monthStart: string,
): Promise<EffectiveGoalRow | null> => {
  const [row] = await tx
    .select({
      goalCents: monthlyGoals.goalCents,
      monthStart: monthlyGoals.monthStart,
    })
    .from(monthlyGoals)
    .where(
      and(
        eq(monthlyGoals.consultantId, consultantId),
        lte(monthlyGoals.monthStart, monthStart),
      ),
    )
    .orderBy(desc(monthlyGoals.monthStart))
    .limit(1);

  return row ?? null;
};

// Upsert da meta (RF-07/RF-09): `ON CONFLICT (consultant_id, month_start) DO
// UPDATE` — sem corrida de duplicata; devolve o valor GRAVADO (não o pedido —
// são o mesmo valor aqui, mas a leitura pelo `returning()` prova que a
// escrita de fato commitou). `null` remove a meta a partir deste mês (RF-07).
// Recebe `db`/`tx` explícito (não fecha sobre `db` do módulo): é chamada tanto
// pela fábrica (produção) quanto direto pelos testes de integração.
export const upsertGoal = async (
  db: Executor,
  consultantId: string,
  monthStart: string,
  goalCents: number | null,
): Promise<number | null> => {
  const [row] = await db
    .insert(monthlyGoals)
    .values({ consultantId, monthStart, goalCents })
    .onConflictDoUpdate({
      target: [monthlyGoals.consultantId, monthlyGoals.monthStart],
      set: { goalCents, updatedAt: new Date() },
    })
    .returning({ goalCents: monthlyGoals.goalCents });

  return row?.goalCents ?? null;
};

// Única camada que toca o banco (api.md/database.md). `performance()` é a
// função de alto nível (RF-11): abre UMA transação read-only `repeatable
// read` — concluir/cancelar/pagar em paralelo nunca produz uma resposta que
// mistura commits diferentes entre métricas/série/tops/meta — e compõe as
// funções livres acima com os bounds que o SERVICE decidiu.
export const createDashboardPerformanceRepository = (
  db: Database,
): DashboardPerformanceRepositoryPort => {
  const performance = (
    consultantId: string,
    input: DashboardPerformanceQueryInput,
  ): Promise<DashboardPerformanceData> =>
    db.transaction(
      async (tx) => {
        const current = await metrics(tx, consultantId, input.current);
        const previous = input.previous
          ? await metrics(tx, consultantId, input.previous)
          : null;
        const seriesData = await series(tx, consultantId, input.series);
        const topProductsData = await topProducts(
          tx,
          consultantId,
          input.current,
          input.topLimit,
        );
        const topClientsData = await topClients(
          tx,
          consultantId,
          input.current,
          input.topLimit,
        );
        const goal =
          input.goalMonthStart !== null
            ? await effectiveGoal(tx, consultantId, input.goalMonthStart)
            : null;

        return {
          current,
          previous,
          series: seriesData,
          topProducts: topProductsData,
          topClients: topClientsData,
          goal,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

  return {
    performance,
    upsertGoal: (consultantId, monthStart, goalCents) =>
      upsertGoal(db, consultantId, monthStart, goalCents),
  };
};
