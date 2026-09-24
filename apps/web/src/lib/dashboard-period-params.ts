// Seletor de período da home (RF-21): converte `searchParams` crus em
// `DashboardPeriodQuery`, monta hrefs e rótulos por extenso. Módulo PURO —
// nenhuma função aqui lê o relógio real; `todayIso` é sempre injetado (nunca
// jsdom, lesson do spec.md: critério de UI vira helper puro testável).

import {
  addMonthsToYearMonth,
  type DashboardPeriodQuery,
  dashboardPeriodKindValues,
  dashboardPeriodQuerySchema,
  type ResolvedDashboardPeriod,
  SOLD_ON_MIN_DATE,
  yearMonthOfDate,
} from "@clientela/shared";

const DASHBOARD_HOME_PATH = "/crm";

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_PATTERN = /^\d{4}$/;

// Piso do histórico (mesma fonte que `dashboard-period.ts` no shared — nunca
// redigitar "2015-01"/"2015").
const PERIOD_MIN_MONTH = SOLD_ON_MIN_DATE.slice(0, 7);
const PERIOD_MIN_YEAR = SOLD_ON_MIN_DATE.slice(0, 4);

const DEFAULT_QUERY: DashboardPeriodQuery = { period: "month" };

// Nome do mês por extenso (Intl sobre um instante construído em UTC — nunca o
// fuso do processo, RF-21). Formatter reusado: custo de construção não é
// trivial.
const monthFullNameFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
});

// Abreviação de 3 letras SEM ponto (RF-23: "set", "jan" — o `Intl` de "short"
// devolve "set."/"jan." com ponto final, formato diferente do pedido pela
// spec). Tabela fixa é mais previsível entre runtimes/versões de ICU do que
// depender do "short" do Intl.
const MONTH_ABBREVIATIONS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

const parseYearMonthParts = (
  yearMonth: string,
): { year: number; month: number } => {
  const match = YEAR_MONTH_PATTERN.exec(yearMonth);
  if (match === null) {
    throw new Error(`Mês aaaa-mm inválido: ${yearMonth}`);
  }
  const [, monthStr] = match;
  if (monthStr === undefined) {
    throw new Error(`Mês aaaa-mm inválido: ${yearMonth}`);
  }
  return { year: Number(yearMonth.slice(0, 4)), month: Number(monthStr) };
};

/** Nome do mês por extenso em pt-BR ("setembro") a partir de `yyyy-mm`. */
export function monthFullName(yearMonth: string): string {
  const { year, month } = parseYearMonthParts(yearMonth);
  return monthFullNameFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Abreviação de 3 letras SEM ponto ("set") a partir de `yyyy-mm`. */
export function monthAbbreviation(yearMonth: string): string {
  const { month } = parseYearMonthParts(yearMonth);
  const abbreviation = MONTH_ABBREVIATIONS[month - 1];
  if (abbreviation === undefined) {
    throw new Error(`Mês aaaa-mm inválido: ${yearMonth}`);
  }
  return abbreviation;
}

const yearOf = (yearMonthOrDate: string): string => yearMonthOrDate.slice(0, 4);
const dayOfDate = (dateIso: string): number => Number(dateIso.slice(8, 10));

// Convenção de data por extenso pt-BR: o dia 1 é ordinal ("1º"); os demais,
// cardinais ("23") — usado só nas frases completas de comparação (RF-21),
// nunca no intervalo compacto "D1–D2 de mês".
const FIRST_DAY = 1;
const ordinalDay = (day: number): string =>
  day === FIRST_DAY ? "1º" : String(day);

const fullDateNoYear = (dateIso: string): string =>
  `${ordinalDay(dayOfDate(dateIso))} de ${monthFullName(yearMonthOfDate(dateIso))}`;

// ---------------------------------------------------------------------------
// `searchParams` → `DashboardPeriodQuery` (RF-21). Nunca lança: qualquer
// desvio (array, formato inválido, combinação incompleta) cai no mês
// corrente; mês/ano/intervalo fora da janela válida é CLAMPADO (não
// rejeitado) — a home nunca mostra 422 por causa de um link/favorito velho.
// ---------------------------------------------------------------------------

type RawSearchParams = Record<string, string | string[] | undefined>;

const isDashboardPeriodKind = (
  value: string,
): value is DashboardPeriodQuery["period"] =>
  (dashboardPeriodKindValues as readonly string[]).includes(value);

const clamp = (value: string, min: string, max: string): string => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

// Rede de segurança final: garante que o candidato monta um
// `DashboardPeriodQuery` de fato válido pelo contrato do shared — qualquer
// bug de composição acima cai no mês corrente em vez de vazar um shape
// inválido para a API.
const finalize = (candidate: DashboardPeriodQuery): DashboardPeriodQuery => {
  const parsed = dashboardPeriodQuerySchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_QUERY;
};

/**
 * Sanea os `searchParams` crus da rota `/crm` num `DashboardPeriodQuery`
 * válido — NUNCA lança (RF-21). Regras: parâmetro em array, fora do formato
 * ou combinação incompleta (`range` sem `from`/`to`) caem no mês corrente;
 * mês/ano posterior ao corrente é limitado ao corrente; mês/ano/`from`/`to`
 * anterior a 2015-01 é limitado a 2015-01; `range` com `from > to` (depois de
 * clampados) tem as datas trocadas, nunca gera erro.
 */
export function parseDashboardPeriodSearchParams(
  searchParams: RawSearchParams,
  todayIso: string,
): DashboardPeriodQuery {
  const periodRaw = searchParams.period;
  if (Array.isArray(periodRaw)) {
    return DEFAULT_QUERY;
  }
  const periodKind = periodRaw ?? "month";
  if (!isDashboardPeriodKind(periodKind)) {
    return DEFAULT_QUERY;
  }

  const currentMonth = yearMonthOfDate(todayIso);
  const currentYear = currentMonth.slice(0, 4);

  if (periodKind === "all") {
    return finalize({ period: "all" });
  }

  if (periodKind === "month") {
    const monthRaw = searchParams.month;
    if (Array.isArray(monthRaw)) {
      return DEFAULT_QUERY;
    }
    if (monthRaw === undefined) {
      return finalize({ period: "month" });
    }
    if (!YEAR_MONTH_PATTERN.test(monthRaw)) {
      return DEFAULT_QUERY;
    }
    return finalize({
      period: "month",
      month: clamp(monthRaw, PERIOD_MIN_MONTH, currentMonth),
    });
  }

  if (periodKind === "year") {
    const yearRaw = searchParams.year;
    if (Array.isArray(yearRaw)) {
      return DEFAULT_QUERY;
    }
    if (yearRaw === undefined) {
      return finalize({ period: "year" });
    }
    if (!YEAR_PATTERN.test(yearRaw)) {
      return DEFAULT_QUERY;
    }
    return finalize({
      period: "year",
      year: clamp(yearRaw, PERIOD_MIN_YEAR, currentYear),
    });
  }

  // periodKind === "range"
  const fromRaw = searchParams.from;
  const toRaw = searchParams.to;
  if (Array.isArray(fromRaw) || Array.isArray(toRaw)) {
    return DEFAULT_QUERY;
  }
  if (fromRaw === undefined || toRaw === undefined) {
    return DEFAULT_QUERY;
  }
  if (!YEAR_MONTH_PATTERN.test(fromRaw) || !YEAR_MONTH_PATTERN.test(toRaw)) {
    return DEFAULT_QUERY;
  }
  const clampedFrom = clamp(fromRaw, PERIOD_MIN_MONTH, currentMonth);
  const clampedTo = clamp(toRaw, PERIOD_MIN_MONTH, currentMonth);
  const [from, to] =
    clampedFrom > clampedTo
      ? [clampedTo, clampedFrom]
      : [clampedFrom, clampedTo];
  return finalize({ period: "range", from, to });
}

// ---------------------------------------------------------------------------
// Hrefs (RF-21)
// ---------------------------------------------------------------------------

/**
 * Href de `/crm` para a `query` dada — só os parâmetros necessários. O mês
 * corrente sem `month` explícito (o default de `period=month`) vira a home
 * "nua" (`/crm`), a forma mais curta e compartilhável do link "hoje".
 */
export function buildDashboardPeriodHref(query: DashboardPeriodQuery): string {
  if (query.period === "month" && query.month === undefined) {
    return DASHBOARD_HOME_PATH;
  }

  const params = new URLSearchParams({ period: query.period });
  if (query.period === "month" && query.month !== undefined) {
    params.set("month", query.month);
  }
  if (query.period === "year" && query.year !== undefined) {
    params.set("year", query.year);
  }
  if (query.period === "range") {
    if (query.from !== undefined) {
      params.set("from", query.from);
    }
    if (query.to !== undefined) {
      params.set("to", query.to);
    }
  }
  return `${DASHBOARD_HOME_PATH}?${params.toString()}`;
}

export type PeriodPresetKey =
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "all"
  | "custom";

export type PeriodPreset = {
  key: PeriodPresetKey;
  label: string;
  href: string | null;
  active: boolean;
};

const THIS_MONTH_LABEL = "Este mês";
const LAST_MONTH_LABEL = "Mês passado";
const THIS_YEAR_LABEL = "Este ano";
const ALL_LABEL = "Tudo";
const CUSTOM_LABEL = "Personalizado";

/**
 * Atalhos do seletor de período (RF-21). "Personalizado" não tem href (é um
 * formulário De/Até) — `href: null`; fica ativo quando `period=range`.
 */
export function buildPeriodPresets(
  activeQuery: DashboardPeriodQuery,
  todayIso: string,
): PeriodPreset[] {
  const currentMonth = yearMonthOfDate(todayIso);
  const currentYear = currentMonth.slice(0, 4);
  const lastMonth = addMonthsToYearMonth(currentMonth, -1);

  return [
    {
      key: "thisMonth",
      label: THIS_MONTH_LABEL,
      href: buildDashboardPeriodHref({ period: "month" }),
      active:
        activeQuery.period === "month" &&
        (activeQuery.month === undefined || activeQuery.month === currentMonth),
    },
    {
      key: "lastMonth",
      label: LAST_MONTH_LABEL,
      href: buildDashboardPeriodHref({ period: "month", month: lastMonth }),
      active: activeQuery.period === "month" && activeQuery.month === lastMonth,
    },
    {
      key: "thisYear",
      label: THIS_YEAR_LABEL,
      href: buildDashboardPeriodHref({ period: "year" }),
      active:
        activeQuery.period === "year" &&
        (activeQuery.year === undefined || activeQuery.year === currentYear),
    },
    {
      key: "all",
      label: ALL_LABEL,
      href: buildDashboardPeriodHref({ period: "all" }),
      active: activeQuery.period === "all",
    },
    {
      key: "custom",
      label: CUSTOM_LABEL,
      href: null,
      active: activeQuery.period === "range",
    },
  ];
}

export type PeriodNavigation = {
  previousHref: string | null;
  nextHref: string | null;
};

/**
 * Setas ‹ › do seletor (RF-21): só `month`/`year` navegam; "seguinte"
 * desabilitada no mês/ano corrente, "anterior" desabilitada em 2015-01/2015;
 * `range`/`all` não têm setas (as duas sempre `null`).
 */
export function buildPeriodNavigation(
  period: ResolvedDashboardPeriod,
  todayIso: string,
): PeriodNavigation {
  if (period.kind === "month") {
    const currentMonth = yearMonthOfDate(todayIso);
    const previousHref =
      period.fromMonth <= PERIOD_MIN_MONTH
        ? null
        : buildDashboardPeriodHref({
            period: "month",
            month: addMonthsToYearMonth(period.fromMonth, -1),
          });
    const nextHref =
      period.fromMonth >= currentMonth
        ? null
        : buildDashboardPeriodHref({
            period: "month",
            month: addMonthsToYearMonth(period.fromMonth, 1),
          });
    return { previousHref, nextHref };
  }

  if (period.kind === "year") {
    const currentYear = yearMonthOfDate(todayIso).slice(0, 4);
    const year = period.fromMonth.slice(0, 4);
    const previousHref =
      year <= PERIOD_MIN_YEAR
        ? null
        : buildDashboardPeriodHref({
            period: "year",
            year: String(Number(year) - 1),
          });
    const nextHref =
      year >= currentYear
        ? null
        : buildDashboardPeriodHref({
            period: "year",
            year: String(Number(year) + 1),
          });
    return { previousHref, nextHref };
  }

  return { previousHref: null, nextHref: null };
}

// ---------------------------------------------------------------------------
// Rótulos por extenso (RF-21)
// ---------------------------------------------------------------------------

const COMPARISON_PREFIX = "comparado com ";

// `range` com `from === to` é, na prática, um único mês — mostra o MESMO
// rótulo por extenso de `month` (nunca "set/2026 – set/2026"), tanto no
// período quanto na comparação (A2, rodada 2).
const isSingleMonthRange = (period: ResolvedDashboardPeriod): boolean =>
  period.kind === "range" && period.fromMonth === period.toMonth;

/**
 * Rótulo por extenso do período (ex.: "setembro de 2026 (até dia 23)"; em
 * `range` de vários meses ainda em andamento, "jul/2026 – set/2026 (até dia
 * 23)" — A2, rodada 2: o trecho parcial precisa aparecer, senão o rótulo
 * some a comparação real com o trecho equivalente do ano anterior).
 */
export function formatPeriodLabel(period: ResolvedDashboardPeriod): string {
  if (period.kind === "month" || isSingleMonthRange(period)) {
    const label = `${monthFullName(period.fromMonth)} de ${yearOf(period.fromMonth)}`;
    return period.inProgress
      ? `${label} (até dia ${dayOfDate(period.endDate)})`
      : label;
  }

  if (period.kind === "year") {
    const year = yearOf(period.fromMonth);
    return period.inProgress
      ? `${year} (até ${dayOfDate(period.endDate)} de ${monthFullName(period.toMonth)})`
      : year;
  }

  if (period.kind === "all") {
    return "Todo o período";
  }

  // range de vários meses
  const label = `${monthAbbreviation(period.fromMonth)}/${yearOf(period.fromMonth)} – ${monthAbbreviation(period.toMonth)}/${yearOf(period.toMonth)}`;
  return period.inProgress
    ? `${label} (até dia ${dayOfDate(period.endDate)})`
    : label;
}

/**
 * Rótulo por extenso da comparação (ex.: "comparado com 1–23 de agosto");
 * `null` quando o período não tem comparação (`all`, `range` com mais de 12
 * meses).
 */
export function formatComparisonLabel(
  period: ResolvedDashboardPeriod,
): string | null {
  const comparison = period.comparison;
  if (comparison === null) {
    return null;
  }

  if (period.kind === "month" || isSingleMonthRange(period)) {
    if (period.inProgress) {
      const startDay = dayOfDate(comparison.startDate);
      const endDay = dayOfDate(comparison.endDate);
      const monthLabel = monthFullName(comparison.fromMonth);
      // Ano só aparece quando difere do ano do período atual — no intervalo
      // compacto "D1–D2 de mês" o ano do próprio período já dá o contexto.
      const yearSuffix =
        yearOf(comparison.fromMonth) !== yearOf(period.fromMonth)
          ? ` de ${yearOf(comparison.fromMonth)}`
          : "";
      return `${COMPARISON_PREFIX}${startDay}–${endDay} de ${monthLabel}${yearSuffix}`;
    }
    return `${COMPARISON_PREFIX}${monthFullName(comparison.fromMonth)} de ${yearOf(comparison.fromMonth)}`;
  }

  if (period.kind === "year") {
    if (period.inProgress) {
      const startYear = yearOf(comparison.startDate);
      const endYear = yearOf(comparison.endDate);
      const body =
        startYear === endYear
          ? `${fullDateNoYear(comparison.startDate)} a ${fullDateNoYear(comparison.endDate)} de ${endYear}`
          : `${fullDateNoYear(comparison.startDate)} de ${startYear} a ${fullDateNoYear(comparison.endDate)} de ${endYear}`;
      return `${COMPARISON_PREFIX}${body}`;
    }
    return `${COMPARISON_PREFIX}${yearOf(comparison.fromMonth)}`;
  }

  // range de vários meses: em andamento, acrescenta o trecho parcial por
  // extenso (A2, rodada 2) — sem isso, "jul/2025 – set/2025" parece um
  // trecho fechado, mas a comparação real vai só até o dia equivalente.
  const body = `${monthAbbreviation(comparison.fromMonth)}/${yearOf(comparison.fromMonth)} – ${monthAbbreviation(comparison.toMonth)}/${yearOf(comparison.toMonth)}`;
  if (period.inProgress) {
    const endDay = dayOfDate(comparison.endDate);
    const endMonthLabel = monthFullName(comparison.toMonth);
    return `${COMPARISON_PREFIX}${body} (até ${endDay} de ${endMonthLabel})`;
  }
  return `${COMPARISON_PREFIX}${body}`;
}

/**
 * Rótulo curto da comparação para o texto da variação dos cartões (RF-22,
 * ex.: "▲ 12% vs agosto") — `null` quando não há comparação. Simplificação
 * documentada: nunca inclui o ano (mesmo quando difere do período), porque o
 * cartão já mostra o rótulo completo do período ao lado.
 */
export function formatComparisonShortLabel(
  period: ResolvedDashboardPeriod,
): string | null {
  const comparison = period.comparison;
  if (comparison === null) {
    return null;
  }

  if (period.kind === "month" || isSingleMonthRange(period)) {
    return monthFullName(comparison.fromMonth);
  }

  if (period.kind === "year") {
    return yearOf(comparison.fromMonth);
  }

  // range de vários meses
  return `${monthAbbreviation(comparison.fromMonth)}–${monthAbbreviation(comparison.toMonth)}/${yearOf(comparison.toMonth)}`;
}
