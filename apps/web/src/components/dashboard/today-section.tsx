// Bloco "Hoje" da HOME (RF-12/RF-20a — emenda de 2026-09-24): a grade de
// cartões-resumo, um por tipo visível, cada um levando à seção correspondente
// de `/crm/today` (RF-28) — o conteúdo detalhado (listas, WhatsApp) mudou de
// lá para cá. Server Component assíncrono: chama `getDashboardToday` (NUNCA
// lança); `ok: false` vira `SectionError` só neste bloco (RF-18). Tudo vazio
// ⇒ estado único "Tudo em dia por hoje" (mantido — `TodayEmptyState`).

import Link from "next/link";
import { getDashboardToday } from "@/lib/dashboard-api";
import { buildTodayTiles } from "@/lib/dashboard-today-tiles";
import { isTodayEmpty } from "@/lib/dashboard-today-view";
import { loadWebEnv } from "@/lib/env";
import { SectionError } from "./section-error";
import { TodayEmptyState } from "./today-empty-state";
import { TodaySummaryTiles } from "./today-summary-tiles";

const TODAY_TITLE = "Hoje";
const VIEW_ALL_LABEL = "Ver tudo";
const TODAY_PATH = "/crm/today";
const LINK_CLASS =
  "text-sm font-medium text-primary hover:underline focus-visible:underline";

export type TodaySectionProps = {
  token: string;
  /** Instante atual do servidor (RF-20a/A1) — decide o "próximo compromisso" do cartão Agenda. */
  nowIso: string;
};

export async function TodaySection({ token, nowIso }: TodaySectionProps) {
  const apiUrl = loadWebEnv().API_URL;
  const result = await getDashboardToday({ fetchImpl: fetch, apiUrl, token });

  if (!result.ok) {
    return <SectionError title={TODAY_TITLE} message={result.message} />;
  }

  const { today } = result;
  const empty = isTodayEmpty(today);

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-heading" className="font-heading text-xl font-semibold">
          {TODAY_TITLE}
        </h2>
        {/* "Tudo em dia" não tem para onde "ver tudo" — /crm/today mostraria o
            mesmo vazio (S4/QA Emenda M8). */}
        {empty ? null : (
          <Link href={TODAY_PATH} className={LINK_CLASS}>
            {VIEW_ALL_LABEL}
          </Link>
        )}
      </div>

      {empty ? (
        <TodayEmptyState />
      ) : (
        <TodaySummaryTiles tiles={buildTodayTiles(today, nowIso)} />
      )}
    </section>
  );
}
