// Bloco Desempenho (RF-11/RF-18): números de um período escolhido, gráfico de
// 12 meses, meta do mês e rankings. Server Component ASSÍNCRONO — chama
// `getDashboardPerformance` (nunca lança) e vira `SectionError` isolado em
// caso de falha, sem derrubar os demais blocos da home.

import type { DashboardPeriodQuery } from "@clientela/shared";
import Link from "next/link";
import { updateGoalAction } from "@/app/(crm)/crm/actions";
import { GoalCard } from "@/components/dashboard/goal-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MonthlyBarsChart } from "@/components/dashboard/monthly-bars";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { SectionError } from "@/components/dashboard/section-error";
import { TopLists } from "@/components/dashboard/top-lists";
import { getDashboardPerformance } from "@/lib/dashboard-api";
import { buildPerformanceKpis, hasNoMovement } from "@/lib/dashboard-kpis";
import {
  formatComparisonLabel,
  formatPeriodLabel,
} from "@/lib/dashboard-period-params";
import { loadWebEnv } from "@/lib/env";

const TITLE = "Desempenho";
const NO_MOVEMENT_TEXT = "Sem vendas neste período.";
const REGISTER_SALE_LABEL = "Registrar venda";
const REGISTER_SALE_HREF = "/crm/sales/new";

export type PerformanceSectionProps = {
  token: string;
  query: DashboardPeriodQuery;
  todayIso: string;
};

export async function PerformanceSection({
  token,
  query,
  todayIso,
}: PerformanceSectionProps) {
  const result = await getDashboardPerformance(query, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return <SectionError title={TITLE} message={result.message} />;
  }

  const { performance } = result;
  const kpis = buildPerformanceKpis(performance);
  const periodLabel = formatPeriodLabel(performance.period);
  const comparisonLabel = formatComparisonLabel(performance.period);
  const noMovement = hasNoMovement(performance.current);

  return (
    <section
      aria-labelledby="performance-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <h2
          id="performance-heading"
          className="font-heading text-xl font-semibold"
        >
          {TITLE}
        </h2>
        <PeriodSelector
          query={query}
          period={performance.period}
          todayIso={todayIso}
        />
        <div className="text-sm text-muted-foreground">
          <p>{periodLabel}</p>
          {comparisonLabel !== null ? <p>{comparisonLabel}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.key}
            title={kpi.title}
            value={kpi.value}
            secondaryLine={kpi.secondaryLine}
            delta={kpi.delta}
            href={kpi.href}
          />
        ))}
      </div>

      {noMovement ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">{NO_MOVEMENT_TEXT}</p>
          <Link
            href={REGISTER_SALE_HREF}
            className="text-sm font-medium text-primary hover:underline focus-visible:underline"
          >
            {REGISTER_SALE_LABEL}
          </Link>
        </div>
      ) : null}

      <MonthlyBarsChart
        series={performance.series}
        period={performance.period}
      />

      {performance.goal !== null ? (
        <GoalCard
          goal={performance.goal}
          soldCents={performance.current.soldCents}
          month={performance.period.fromMonth}
          onUpdateGoal={updateGoalAction}
        />
      ) : null}

      <TopLists
        topProducts={performance.topProducts}
        topClients={performance.topClients}
      />
    </section>
  );
}
