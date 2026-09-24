import { appLocalDateIso } from "@clientela/shared";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PerformanceSection } from "@/components/dashboard/performance-section";
import { PositionSection } from "@/components/dashboard/position-section";
import { QuickActions } from "@/components/dashboard/quick-actions";
import {
  PerformanceSkeleton,
  PositionSkeleton,
  TodaySummarySkeleton,
} from "@/components/dashboard/section-skeletons";
import { TodaySection } from "@/components/dashboard/today-section";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  buildDashboardPeriodHref,
  parseDashboardPeriodSearchParams,
} from "@/lib/dashboard-period-params";

const PAGE_TITLE = "Início";
const LOGIN_PATH = "/login";

// Robots (noindex) é herdado do layout do grupo `(crm)` — a page só define o
// título.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type CrmHomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Home "Início" do CRM (RF-13/RF-18/RF-20a/RF-21 — CRM-14, emenda 2026-09-24):
// três blocos independentes, nesta ordem — Desempenho, Hoje (cartões-resumo,
// RF-20a), Posição agora —, cada um seu próprio Server Component assíncrono
// num `Suspense` próprio (plan.md: "um Suspense por bloco") — uma falha
// isolada não derruba os outros dois (`SectionError`, dentro de cada seção).
// Nenhum `await` aqui precede a renderização dos três além do cookie e do
// saneamento (síncrono) do período — as três buscas saem em paralelo, cada
// uma disparada pelo próprio Server Component quando o React o renderiza.
export default async function CrmHomePage({ searchParams }: CrmHomePageProps) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const nowIso = new Date().toISOString();
  const todayIso = appLocalDateIso(nowIso);
  const rawSearchParams = await searchParams;
  const query = parseDashboardPeriodSearchParams(rawSearchParams, todayIso);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
      </header>

      <QuickActions />

      <Suspense
        key={buildDashboardPeriodHref(query)}
        fallback={<PerformanceSkeleton />}
      >
        <PerformanceSection token={token} query={query} todayIso={todayIso} />
      </Suspense>

      <Suspense fallback={<TodaySummarySkeleton />}>
        <TodaySection token={token} nowIso={nowIso} />
      </Suspense>

      <Suspense fallback={<PositionSkeleton />}>
        <PositionSection token={token} />
      </Suspense>
    </div>
  );
}
