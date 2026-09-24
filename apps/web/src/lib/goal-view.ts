// Textos de origem e ritmo da meta mensal no Desempenho (RF-10/RF-24) — só
// FORMATAÇÃO do que o bloco `goal` de `GET /dashboard/performance` (RF-11) e
// `goalPace` (shared) já resolveram. Módulo PURO, sem jsdom (lesson): o
// critério de UI vira helper testável em vez de teste de componente.

import { type DashboardGoalSource, goalPace } from "@clientela/shared";
import { monthFullName } from "./dashboard-period-params";
import { formatBRL } from "./format";

const EXPLICIT_GOAL_TEXT = "Definida para este mês";
// Mês PASSADO com meta explícita (S2, rodada 2): "este mês" some no mês
// corrente — sem o mês por extenso, o texto vira falso no histórico (a home
// permite navegar para meses anteriores, RF-24).
const EXPLICIT_GOAL_PAST_PREFIX = "Definida para";
const INHERITED_GOAL_PREFIX = "Mesma meta de";
const INHERITED_GOAL_MISSING_MONTH_ERROR =
  "Meta herdada sem mês de origem (contrato quebrado)";
const NONE_SOURCE_ERROR =
  "Origem da meta 'none' não deveria chamar goalOriginText (contrato quebrado)";
const NO_GOAL_PACE_ERROR =
  "Ritmo de meta chamado sem meta definida (contrato quebrado)";

const GOAL_REACHED_PREFIX = "Meta batida!";
const GOAL_REACHED_SUFFIX = "acima";
const GOAL_PENDING_PREFIX = "Faltam";
const GOAL_PENDING_PER_DAY_SUFFIX = "por dia";
const DAY_SINGULAR = "dia";
const DAY_PLURAL = "dias";
const SINGLE_DAY = 1;

const yearOf = (yearMonth: string): string => yearMonth.slice(0, 4);

/**
 * "agosto de 2026" a partir de `yyyy-mm`. `monthFullName` já é exportado de
 * `dashboard-period-params.ts` (RF-21) — a composição com o ano fica aqui
 * porque é específica do texto de origem da meta.
 */
export function monthFullLabel(yearMonth: string): string {
  return `${monthFullName(yearMonth)} de ${yearOf(yearMonth)}`;
}

/**
 * Texto de origem da meta efetiva (RF-10/RF-24): "Definida para este mês" no
 * mês CORRENTE (`isCurrentMonth`) ou "Definida para {mês} de {ano}" num mês
 * passado (S2, rodada 2 — "este mês" seria falso fora do mês corrente), para
 * a meta explícita; "Mesma meta de {mês} de {ano}" para a herdada. Só chamado
 * quando `goalCents !== null` — `source` nunca é "none" nesse caso (contrato
 * do bloco `goal`, RF-11); chamado fora dessa condição é erro de programação.
 */
export function goalOriginText(
  source: DashboardGoalSource,
  inheritedFromMonth: string | null,
  month: string,
  isCurrentMonth: boolean,
): string {
  if (source === "explicit") {
    return isCurrentMonth
      ? EXPLICIT_GOAL_TEXT
      : `${EXPLICIT_GOAL_PAST_PREFIX} ${monthFullLabel(month)}`;
  }
  if (source === "none") {
    throw new Error(NONE_SOURCE_ERROR);
  }
  if (inheritedFromMonth === null) {
    throw new Error(INHERITED_GOAL_MISSING_MONTH_ERROR);
  }
  return `${INHERITED_GOAL_PREFIX} ${monthFullLabel(inheritedFromMonth)}`;
}

const dayLabel = (days: number): string =>
  `${days} ${days === SINGLE_DAY ? DAY_SINGULAR : DAY_PLURAL}`;

/**
 * Texto do ritmo da meta do mês corrente (RF-10/RF-24): "Faltam {valor} em
 * {N} dias — {valor} por dia" (pendente) ou "Meta batida! {valor} acima"
 * (batida). Só chamado no mês corrente com meta definida (`goal.editable` e
 * `goalCents !== null`) — o status "sem meta" de `goalPace` é inalcançável
 * aqui porque `goalCents` chega sempre como `number`.
 */
export function goalPaceText(input: {
  soldCents: number;
  goalCents: number;
  daysRemaining: number;
}): string {
  const pace = goalPace(input);
  if (pace.status === "reached") {
    return `${GOAL_REACHED_PREFIX} ${formatBRL(pace.surplusCents)} ${GOAL_REACHED_SUFFIX}`;
  }
  if (pace.status === "pending") {
    return `${GOAL_PENDING_PREFIX} ${formatBRL(pace.remainingCents)} em ${dayLabel(
      input.daysRemaining,
    )} — ${formatBRL(pace.perDayCents)} ${GOAL_PENDING_PER_DAY_SUFFIX}`;
  }
  throw new Error(NO_GOAL_PACE_ERROR);
}
