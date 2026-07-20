import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { updateGoalAction } from "@/app/(crm)/crm/actions";
import { GoalCard } from "@/components/dashboard/goal-card";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard-api";
import { loadWebEnv } from "@/lib/env";

const PAGE_TITLE = "Início";
const LOGIN_PATH = "/login";
const NEW_SALE_HREF = "/crm/sales/new";
const NEW_CLIENT_HREF = "/crm/clients/new";
const RECEIVABLES_HREF = "/crm/sales/receivables";

// Robots (noindex) é herdado do layout do grupo `(crm)` — a page só define o
// título.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Home "Início" do CRM (RF-05 — CRM-07): painel com vendas do mês, lucro
// estimado, a receber e meta mensal. RSC server-first: 1 request
// (`getDashboardSummary`) no servidor; a única folha interativa é o
// `GoalCard` (client). Falha do helper vira `throw` para o `error.tsx`
// (retry) — mesmo padrão de `sales/page.tsx`; o helper NUNCA lança sozinho
// (resultado discriminado).
export default async function CrmHomePage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const result = await getDashboardSummary({
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const { summary } = result;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
        <p className="text-muted-foreground">Resumo de {summary.monthLabel}.</p>
      </header>

      <SummaryCards
        summary={summary}
        newSaleHref={NEW_SALE_HREF}
        newClientHref={NEW_CLIENT_HREF}
        receivablesHref={RECEIVABLES_HREF}
      />

      <GoalCard
        monthlyGoalCents={summary.monthlyGoalCents}
        monthSalesCents={summary.monthSalesCents}
        onUpdateGoal={updateGoalAction}
      />
    </div>
  );
}
