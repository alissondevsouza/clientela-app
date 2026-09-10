import type { SaleStatus } from "@clientela/shared";
import { eq, type SQL, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { consultants, receivables, saleItems, sales } from "../../db/schema";
import type {
  DashboardRepositoryPort,
  DashboardSummaryData,
} from "./dashboard.service";

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;

const COMPLETED_STATUS: SaleStatus = "completed";

// Converte um agregado monetário (SUM em centavos, vindo como string/number do
// driver) para número inteiro seguro. Acima de MAX_SAFE_INTEGER a conversão
// perde precisão SILENCIOSAMENTE — dinheiro exige exatidão, então lançamos
// (última defesa da invariante "dinheiro exato"). Replicado de
// products.repository/sales.repository (padrão do projeto) para não cruzar a
// fronteira de módulo. Aceita negativo (monthProfitCents pode ser negativo —
// `Number.isSafeInteger` também vale para negativos).
const toSafeInteger = (value: string | number, field: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `Agregado de ${field} excede a precisão inteira segura (${value})`,
    );
  }
  return parsed;
};

// Escopo do "mês corrente" pela data do SERVIDOR (UTC) — mesma decisão do
// `overdue` (plan.md/RF-04): vendas completed da consultora cujo `sold_at` cai
// no intervalo [início do mês, início do próximo mês). Comparação por
// intervalo (em vez de `date_trunc` na coluna) evita função sobre coluna
// indexável, embora aqui o filtro dominante seja `consultant_id`.
const monthSalesScope = (consultantId: string): SQL =>
  sql`${sales.consultantId} = ${consultantId} AND ${sales.status} = ${COMPLETED_STATUS} AND ${sales.completedAt} >= date_trunc('month', now()) AND ${sales.completedAt} < date_trunc('month', now()) + interval '1 month'`;

// Única camada que toca o banco (api.md/database.md). Leitura agregada
// cross-tabela (sales/sale_items/receivables/consultants) é o domínio do
// dashboard (plan.md) — não delega a outro módulo; replica a MESMA lógica do
// `receivablesSummary` de sales.repository (pendente/atrasado por
// CURRENT_DATE) para não divergir a regra.
export const createDashboardRepository = (
  db: Database,
): DashboardRepositoryPort => {
  // Todos os agregados na MESMA leitura (RF-10): transação read-only
  // REPEATABLE READ garante um snapshot único — concluir, estornar ou cancelar
  // em paralelo nunca produz uma resposta que mistura commits diferentes.
  const summary = async (consultantId: string): Promise<DashboardSummaryData> =>
    db.transaction(
      async (tx) => {
        const [salesRow] = await tx
          .select({
            monthSalesCents: sql<string>`COALESCE(SUM(${sales.totalCents}), 0)::bigint`,
            monthSalesCount: sql<string>`COUNT(*)`,
          })
          .from(sales)
          .where(monthSalesScope(consultantId));

        const [openSalesRow] = await tx
          .select({
            openSalesCents: sql<string>`COALESCE(SUM(${sales.totalCents}), 0)::bigint`,
            openSalesCount: sql<string>`COUNT(*)`,
          })
          .from(sales)
          .where(
            sql`${sales.consultantId} = ${consultantId} AND ${sales.status} = 'open'`,
          );

        // Lucro do mês (RF-03/RF-04): soma sobre os itens das vendas do mês
        // corrente, `(unit_price_cents - cost_cents) * qty`, com cast para bigint
        // ANTES da multiplicação (evita overflow de integer). COM SINAL — pode ser
        // negativo (override de preço abaixo do custo).
        const [profitRow] = await tx
          .select({
            monthProfitCents: sql<string>`COALESCE(SUM((${saleItems.unitPriceCents} - ${saleItems.costCents})::bigint * ${saleItems.qty}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .where(monthSalesScope(consultantId));

        // Recebíveis: MESMA query do `receivablesSummary` (sales.repository) —
        // `FILTER` separa pendente de vencido; `::bigint` evita overflow.
        const [receivablesRow] = await tx
          .select({
            pendingCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.paidAt} IS NULL AND ${receivables.voidedAt} IS NULL), 0)::bigint`,
            overdueCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.paidAt} IS NULL AND ${receivables.voidedAt} IS NULL AND ${receivables.dueDate} < CURRENT_DATE), 0)::bigint`,
            overdueCount: sql<string>`COUNT(*) FILTER (WHERE ${receivables.paidAt} IS NULL AND ${receivables.voidedAt} IS NULL AND ${receivables.dueDate} < CURRENT_DATE)`,
          })
          .from(receivables)
          .innerJoin(sales, eq(receivables.saleId, sales.id))
          .where(eq(sales.consultantId, consultantId));

        const [consultantRow] = await tx
          .select({ monthlyGoalCents: consultants.monthlyGoalCents })
          .from(consultants)
          .where(eq(consultants.id, consultantId))
          .limit(1);

        return {
          monthSalesCents: toSafeInteger(
            salesRow?.monthSalesCents ?? 0,
            "monthSalesCents",
          ),
          monthSalesCount: toSafeInteger(
            salesRow?.monthSalesCount ?? 0,
            "monthSalesCount",
          ),
          monthProfitCents: toSafeInteger(
            profitRow?.monthProfitCents ?? 0,
            "monthProfitCents",
          ),
          openSalesCents: toSafeInteger(
            openSalesRow?.openSalesCents ?? 0,
            "openSalesCents",
          ),
          openSalesCount: toSafeInteger(
            openSalesRow?.openSalesCount ?? 0,
            "openSalesCount",
          ),
          pendingReceivablesCents: toSafeInteger(
            receivablesRow?.pendingCents ?? 0,
            "pendingReceivablesCents",
          ),
          overdueReceivablesCents: toSafeInteger(
            receivablesRow?.overdueCents ?? 0,
            "overdueReceivablesCents",
          ),
          overdueReceivablesCount: toSafeInteger(
            receivablesRow?.overdueCount ?? 0,
            "overdueReceivablesCount",
          ),
          monthlyGoalCents: consultantRow?.monthlyGoalCents ?? null,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

  // Grava/remove a meta mensal (consultora sempre existe na sessão — plan.md:
  // sem erro de domínio próprio aqui). `null` remove a meta.
  const updateGoal = async (
    consultantId: string,
    monthlyGoalCents: number | null,
  ): Promise<number | null> => {
    const [row] = await db
      .update(consultants)
      .set({ monthlyGoalCents })
      .where(eq(consultants.id, consultantId))
      .returning({ monthlyGoalCents: consultants.monthlyGoalCents });

    return row?.monthlyGoalCents ?? null;
  };

  return { summary, updateGoal };
};
