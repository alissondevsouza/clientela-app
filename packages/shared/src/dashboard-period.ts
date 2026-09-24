import { z } from "zod";
import { addMonthsClamped, SOLD_ON_MIN_DATE } from "./sales";
import { appLocalDateTimeToUtc } from "./time";

// ---------------------------------------------------------------------------
// Contrato de período do painel (RF-01). A query chega crua (strings de query
// string HTTP); `month`/`year` ficam OPCIONAIS aqui porque o default de cada
// um ("mês corrente"/"ano corrente") depende do relógio — só
// `resolveDashboardPeriod` (que recebe `todayIso`) decide isso. O que não
// depende do relógio (formato, piso 2015-01, `from > to`, parâmetro alheio ao
// `period` escolhido) fica todo aqui, no Zod.
// ---------------------------------------------------------------------------

export const dashboardPeriodKindValues = [
  "month",
  "year",
  "all",
  "range",
] as const;

export type DashboardPeriodKind = (typeof dashboardPeriodKindValues)[number];

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_PATTERN = /^\d{4}$/;

// Piso do histórico (RF-01/RF-02): mesmo mês/ano de `SOLD_ON_MIN_DATE`
// (sales.ts) — fonte única, nunca redigitar "2015-01" em outro lugar.
const PERIOD_MIN_MONTH = SOLD_ON_MIN_DATE.slice(0, 7);
const PERIOD_MIN_YEAR = SOLD_ON_MIN_DATE.slice(0, 4);

const PERIOD_INVALID_MESSAGE = "Período inválido";
const MONTH_FORMAT_MESSAGE = "Informe o mês no formato aaaa-mm";
const YEAR_FORMAT_MESSAGE = "Informe o ano no formato aaaa";
const FROM_FORMAT_MESSAGE = "Informe o mês inicial no formato aaaa-mm";
const TO_FORMAT_MESSAGE = "Informe o mês final no formato aaaa-mm";
const MONTH_ONLY_WITH_MONTH_PERIOD_MESSAGE =
  'O parâmetro "month" só é aceito quando period=month';
const YEAR_ONLY_WITH_YEAR_PERIOD_MESSAGE =
  'O parâmetro "year" só é aceito quando period=year';
const FROM_ONLY_WITH_RANGE_PERIOD_MESSAGE =
  'O parâmetro "from" só é aceito quando period=range';
const TO_ONLY_WITH_RANGE_PERIOD_MESSAGE =
  'O parâmetro "to" só é aceito quando period=range';
const FROM_REQUIRED_MESSAGE = "Informe o mês inicial do intervalo (from)";
const TO_REQUIRED_MESSAGE = "Informe o mês final do intervalo (to)";
const MONTH_MIN_MESSAGE = "O mês não pode ser anterior a 01/2015";
const YEAR_MIN_MESSAGE = "O ano não pode ser anterior a 2015";
const FROM_MIN_MESSAGE = "O mês inicial não pode ser anterior a 01/2015";
const TO_MIN_MESSAGE = "O mês final não pode ser anterior a 01/2015";
const FROM_AFTER_TO_MESSAGE = "O mês inicial não pode ser depois do mês final";
const FUTURE_MONTH_MESSAGE = "O mês não pode ser posterior ao mês corrente";
const FUTURE_YEAR_MESSAGE = "O ano não pode ser posterior ao ano corrente";
const FUTURE_RANGE_MESSAGE =
  "O intervalo não pode terminar depois do mês corrente";

// Reusável por `dashboard.ts` (RF-11) para validar `fromMonth`/`toMonth` etc.
// no mesmo formato aaaa-mm, sem redigitar o regex noutro arquivo.
export const yearMonthSchema = z
  .string()
  .regex(MONTH_PATTERN, MONTH_FORMAT_MESSAGE);

// `error` no nível do `z.string()`: parâmetro repetido na URL (`?month=a&month=b`)
// chega como lista, e sem ele o Zod responderia em inglês (lesson Zod v4).
export const dashboardPeriodQuerySchema = z
  .object({
    period: z
      .enum(dashboardPeriodKindValues, { error: PERIOD_INVALID_MESSAGE })
      .default("month"),
    month: z
      .string({ error: MONTH_FORMAT_MESSAGE })
      .regex(MONTH_PATTERN, MONTH_FORMAT_MESSAGE)
      .optional(),
    year: z
      .string({ error: YEAR_FORMAT_MESSAGE })
      .regex(YEAR_PATTERN, YEAR_FORMAT_MESSAGE)
      .optional(),
    from: z
      .string({ error: FROM_FORMAT_MESSAGE })
      .regex(MONTH_PATTERN, FROM_FORMAT_MESSAGE)
      .optional(),
    to: z
      .string({ error: TO_FORMAT_MESSAGE })
      .regex(MONTH_PATTERN, TO_FORMAT_MESSAGE)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.period !== "month" && value.month !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["month"],
        message: MONTH_ONLY_WITH_MONTH_PERIOD_MESSAGE,
      });
    }
    if (value.period !== "year" && value.year !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["year"],
        message: YEAR_ONLY_WITH_YEAR_PERIOD_MESSAGE,
      });
    }
    if (value.period !== "range" && value.from !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: FROM_ONLY_WITH_RANGE_PERIOD_MESSAGE,
      });
    }
    if (value.period !== "range" && value.to !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: TO_ONLY_WITH_RANGE_PERIOD_MESSAGE,
      });
    }

    if (value.period === "range") {
      if (value.from === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["from"],
          message: FROM_REQUIRED_MESSAGE,
        });
      }
      if (value.to === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message: TO_REQUIRED_MESSAGE,
        });
      }
    }

    if (value.month !== undefined && value.month < PERIOD_MIN_MONTH) {
      ctx.addIssue({
        code: "custom",
        path: ["month"],
        message: MONTH_MIN_MESSAGE,
      });
    }
    if (value.year !== undefined && value.year < PERIOD_MIN_YEAR) {
      ctx.addIssue({
        code: "custom",
        path: ["year"],
        message: YEAR_MIN_MESSAGE,
      });
    }
    if (value.from !== undefined && value.from < PERIOD_MIN_MONTH) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: FROM_MIN_MESSAGE,
      });
    }
    if (value.to !== undefined && value.to < PERIOD_MIN_MONTH) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: TO_MIN_MESSAGE,
      });
    }
    if (
      value.from !== undefined &&
      value.to !== undefined &&
      value.from > value.to
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: FROM_AFTER_TO_MESSAGE,
      });
    }
  });

export type DashboardPeriodQueryInput = z.input<
  typeof dashboardPeriodQuerySchema
>;
export type DashboardPeriodQuery = z.output<typeof dashboardPeriodQuerySchema>;

// ---------------------------------------------------------------------------
// Helpers de calendário puros sobre strings `yyyy-mm`/`yyyy-mm-dd` — sem
// `Date` com fuso (a mesma cautela de `sales.ts`/`time.ts`: só aritmética de
// calendário, nunca instante). Exportados porque a web precisa deles para
// montar URLs, setas do seletor e rótulos (plan.md).
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_PER_YEAR = 12;

const padNumber = (value: number, length: number): string =>
  String(value).padStart(length, "0");

const parseYearMonth = (yearMonth: string): { year: number; month: number } => {
  const match = MONTH_PATTERN.exec(yearMonth);
  if (match === null) {
    throw new Error(`Mês aaaa-mm inválido: ${yearMonth}`);
  }
  const [, yearStr, monthStr] = match;
  if (yearStr === undefined || monthStr === undefined) {
    throw new Error(`Mês aaaa-mm inválido: ${yearMonth}`);
  }
  return { year: Number(yearStr), month: Number(monthStr) };
};

const parseDate = (
  dateIso: string,
): { year: number; month: number; day: number } => {
  const match = DATE_PATTERN.exec(dateIso);
  if (match === null) {
    throw new Error(`Data aaaa-mm-dd inválida: ${dateIso}`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    throw new Error(`Data aaaa-mm-dd inválida: ${dateIso}`);
  }
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
};

/**
 * Mês `yyyy-mm` a que pertence a data `yyyy-mm-dd`.
 */
export function yearMonthOfDate(dateIso: string): string {
  const { year, month } = parseDate(dateIso);
  return `${padNumber(year, 4)}-${padNumber(month, 2)}`;
}

/**
 * Soma (ou subtrai) meses a um mês `yyyy-mm`, sem noção de dia — delega para
 * `addMonthsClamped` (sales.ts) ancorando no dia 1, que sempre existe em
 * qualquer mês (nenhum clamp jamais dispara aqui). Fonte única da aritmética
 * de mês: nunca duplicar o cálculo de índice de mês noutro arquivo.
 */
export function addMonthsToYearMonth(
  yearMonth: string,
  monthsToAdd: number,
): string {
  return addMonthsClamped(`${yearMonth}-01`, monthsToAdd).slice(0, 7);
}

/**
 * Último dia (`yyyy-mm-dd`) do mês `yyyy-mm`, com fevereiro bissexto correto
 * (truque do "dia 0 do mês seguinte" do `Date.UTC`, sem carregar tabela de
 * dias-por-mês nem regra de bissexto à parte).
 */
export function lastDayOfYearMonth(yearMonth: string): string {
  const { year, month } = parseYearMonth(yearMonth);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${padNumber(lastDay, 2)}`;
}

/**
 * Dia seguinte (`yyyy-mm-dd`) a uma data `yyyy-mm-dd`, cruzando mês/ano
 * corretamente.
 */
export function nextDayIso(dateIso: string): string {
  const { year, month, day } = parseDate(dateIso);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${padNumber(next.getUTCFullYear(), 4)}-${padNumber(next.getUTCMonth() + 1, 2)}-${padNumber(next.getUTCDate(), 2)}`;
}

/**
 * Quantidade de meses de `fromYearMonth` a `toYearMonth`, AMBOS inclusive
 * (`N` do RF-03: mesmo mês ⇒ 1).
 */
export function monthsBetweenYearMonths(
  fromYearMonth: string,
  toYearMonth: string,
): number {
  const from = parseYearMonth(fromYearMonth);
  const to = parseYearMonth(toYearMonth);
  const fromIndex = from.year * MONTHS_PER_YEAR + (from.month - 1);
  const toIndex = to.year * MONTHS_PER_YEAR + (to.month - 1);
  return toIndex - fromIndex + 1;
}

/**
 * Lista de `count` meses terminando (inclusive) em `toYearMonth`, do mais
 * antigo ao mais recente — usada pela série de 12 meses do painel (RF-11) e
 * pelo gráfico da web.
 */
export function monthsEndingAt(toYearMonth: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Quantidade de meses inválida: ${count}`);
  }
  return Array.from({ length: count }, (_unused, index) =>
    addMonthsToYearMonth(toYearMonth, index - (count - 1)),
  );
}

/**
 * Bounds `[startUtc, endUtc)` de um período LOCAL inclusivo (`startDate` até
 * `endDateInclusive`, ambos `yyyy-mm-dd`) — `endUtc` é meia-noite local do dia
 * SEGUINTE a `endDateInclusive`, via `appLocalDateTimeToUtc` (duas passadas,
 * cobre DST de antes de 2019 — ADR-0018). Repository usa como instantes
 * prontos, sem `AT TIME ZONE`/`CURRENT_DATE` no SQL.
 */
export function periodBoundsUtc(
  startDate: string,
  endDateInclusive: string,
): { startUtc: string; endUtc: string } {
  return {
    startUtc: appLocalDateTimeToUtc(startDate, "00:00"),
    endUtc: appLocalDateTimeToUtc(nextDayIso(endDateInclusive), "00:00"),
  };
}

// ---------------------------------------------------------------------------
// Resolução do período (RF-02/RF-03). O que depende do relógio ("hoje", logo
// "futuro") fica aqui — nunca no Zod. Resultado discriminado: quem chama
// (service da API) decide como virar erro de domínio (`InvalidDashboardPeriodError`,
// 422) — este módulo não lança nem conhece HTTP.
// ---------------------------------------------------------------------------

export type DashboardPeriodComparison = {
  fromMonth: string;
  toMonth: string;
  startDate: string;
  endDate: string;
};

export type ResolvedDashboardPeriod = {
  kind: DashboardPeriodKind;
  fromMonth: string;
  toMonth: string;
  startDate: string;
  endDate: string;
  inProgress: boolean;
  comparison: DashboardPeriodComparison | null;
};

export type ResolveDashboardPeriodResult =
  | { ok: true; period: ResolvedDashboardPeriod }
  | { ok: false; message: string };

type PeriodBoundsResult =
  | { ok: true; fromMonth: string; toMonth: string }
  | { ok: false; message: string };

const resolvePeriodBounds = (
  query: DashboardPeriodQuery,
  todayMonth: string,
  todayYear: string,
): PeriodBoundsResult => {
  if (query.period === "month") {
    const month = query.month ?? todayMonth;
    if (month > todayMonth) {
      return { ok: false, message: FUTURE_MONTH_MESSAGE };
    }
    return { ok: true, fromMonth: month, toMonth: month };
  }

  if (query.period === "year") {
    const year = query.year ?? todayYear;
    if (year > todayYear) {
      return { ok: false, message: FUTURE_YEAR_MESSAGE };
    }
    const toMonth = year === todayYear ? todayMonth : `${year}-12`;
    return { ok: true, fromMonth: `${year}-01`, toMonth };
  }

  if (query.period === "all") {
    return { ok: true, fromMonth: PERIOD_MIN_MONTH, toMonth: todayMonth };
  }

  // period === "range": o schema já garante from/to presentes, formatados e
  // from <= to — aqui só falta a checagem de futuro, que depende do relógio.
  const { from, to } = query;
  if (from === undefined || to === undefined) {
    throw new Error(
      "Período range sem from/to — deveria ter sido barrado pelo schema",
    );
  }
  if (to > todayMonth) {
    return { ok: false, message: FUTURE_RANGE_MESSAGE };
  }
  return { ok: true, fromMonth: from, toMonth: to };
};

// Deslocamento (em meses) da comparação — RF-03: `month`/`range N=1` ⇒ 1 mês;
// `year`/`range 2..12` ⇒ 12 meses; `range N>12`/`all` ⇒ sem comparação.
const ONE_MONTH_OFFSET = 1;
const TWELVE_MONTHS_OFFSET = 12;
const RANGE_COMPARISON_MAX_MONTHS = 12;

const comparisonOffsetMonths = (
  kind: DashboardPeriodKind,
  fromMonth: string,
  toMonth: string,
): number | null => {
  if (kind === "month") {
    return ONE_MONTH_OFFSET;
  }
  if (kind === "year") {
    return TWELVE_MONTHS_OFFSET;
  }
  if (kind === "all") {
    return null;
  }
  const monthsCount = monthsBetweenYearMonths(fromMonth, toMonth);
  if (monthsCount === 1) {
    return ONE_MONTH_OFFSET;
  }
  if (monthsCount <= RANGE_COMPARISON_MAX_MONTHS) {
    return TWELVE_MONTHS_OFFSET;
  }
  return null;
};

const resolveComparison = (
  kind: DashboardPeriodKind,
  fromMonth: string,
  toMonth: string,
  inProgress: boolean,
  todayIso: string,
): DashboardPeriodComparison | null => {
  const offset = comparisonOffsetMonths(kind, fromMonth, toMonth);
  if (offset === null) {
    return null;
  }

  const compFromMonth = addMonthsToYearMonth(fromMonth, -offset);
  const compToMonth = addMonthsToYearMonth(toMonth, -offset);
  // Em andamento: o fim da comparação é HOJE deslocado, com o dia limitado ao
  // último dia do mês de destino (31/03 ⇒ 28 ou 29/02) — exatamente o que
  // `addMonthsClamped` já faz. Fechado: fim = último dia do mês final
  // deslocado (o período comparado também está fechado).
  const compEndDate = inProgress
    ? addMonthsClamped(todayIso, -offset)
    : lastDayOfYearMonth(compToMonth);

  return {
    fromMonth: compFromMonth,
    toMonth: compToMonth,
    startDate: `${compFromMonth}-01`,
    endDate: compEndDate,
  };
};

/**
 * Resolve a query de período (RF-01) em bounds concretos (RF-02) e a
 * comparação justa (RF-03), dado o "hoje" local (`todayIso`, `yyyy-mm-dd`) —
 * nunca lê o relógio: quem chama passa o relógio injetado (ADR-0018). Mês/ano
 * futuro (a única regra que depende de "hoje") devolve `{ ok: false, message }`
 * em pt-BR; o service da API (fora de `packages/shared`) transforma isso no
 * erro de domínio `InvalidDashboardPeriodError` (422).
 */
export function resolveDashboardPeriod(
  query: DashboardPeriodQuery,
  todayIso: string,
): ResolveDashboardPeriodResult {
  const todayMonth = yearMonthOfDate(todayIso);
  const todayYear = todayMonth.slice(0, 4);

  const bounds = resolvePeriodBounds(query, todayMonth, todayYear);
  if (!bounds.ok) {
    return bounds;
  }
  const { fromMonth, toMonth } = bounds;

  const startDate = `${fromMonth}-01`;
  const inProgress = toMonth === todayMonth;
  const endDate = inProgress ? todayIso : lastDayOfYearMonth(toMonth);

  const comparison = resolveComparison(
    query.period,
    fromMonth,
    toMonth,
    inProgress,
    todayIso,
  );

  return {
    ok: true,
    period: {
      kind: query.period,
      fromMonth,
      toMonth,
      startDate,
      endDate,
      inProgress,
      comparison,
    },
  };
}
