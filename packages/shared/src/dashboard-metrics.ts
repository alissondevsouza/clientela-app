// Derivados de exibição do painel (RF-06/RF-10) — só aritmética de inteiros,
// nunca float persistido. Módulo AUTOSSUFICIENTE (sem import de
// `dashboard-period.ts`): as duas tasks são paralelizáveis (tasks.md M1), e a
// aritmética de calendário aqui é mínima o bastante para não valer o
// acoplamento entre os dois arquivos.

const PERCENT_MULTIPLIER = 100;
const FEBRUARY = 2;
const LEAP_DAY = 29;
const DAY_28 = 28;

// ---------------------------------------------------------------------------
// Ticket médio, margem e variação (RF-06)
// ---------------------------------------------------------------------------

/**
 * Ticket médio = `floor(soldCents / soldCount)`; `null` quando não há venda
 * (divisão por zero não é "zero", é "sem dado").
 */
export function averageTicketCents(
  soldCents: number,
  soldCount: number,
): number | null {
  if (soldCount === 0) {
    return null;
  }
  return Math.floor(soldCents / soldCount);
}

// Arredondamento "meio para longe do zero" (12,5 ⇒ 13; −12,5 ⇒ −13) — SIMÉTRICO
// entre alta e queda, ao contrário de `Math.round` (que arredonda −12,5 para
// −12, plan.md). Implementado só com inteiros (numerador/denominador), nunca
// multiplicando floats — evita artefato de ponto flutuante em `x.5` exato
// (ex.: `12.5` representado como `12.499999999999998`). Precondição: o
// `denominator` chega sempre POSITIVO (os dois chamadores abaixo já barram
// denominador ≤ 0 antes de chamar).
const roundHalfAwayFromZeroRatio = (
  numerator: number,
  denominator: number,
): number => {
  const sign = numerator < 0 ? -1 : 1;
  const absNumerator = Math.abs(numerator);
  return (
    sign * Math.floor((absNumerator * 2 + denominator) / (denominator * 2))
  );
};

/**
 * Margem % = `profitCents × 100 / soldCents`, arredondada meio-para-longe-do-
 * -zero; `null` quando `soldCents = 0` (sem base de cálculo).
 */
export function marginPercent(
  profitCents: number,
  soldCents: number,
): number | null {
  if (soldCents === 0) {
    return null;
  }
  return roundHalfAwayFromZeroRatio(
    profitCents * PERCENT_MULTIPLIER,
    soldCents,
  );
}

/**
 * Variação % = `(atual − anterior) × 100 / anterior`, mesmo arredondamento;
 * `null` quando `anterior ≤ 0` (sem base — ver `classifyDelta` para a UI
 * diferenciar "sem base" de "sem movimento").
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) {
    return null;
  }
  return roundHalfAwayFromZeroRatio(
    (current - previous) * PERCENT_MULTIPLIER,
    previous,
  );
}

export type DeltaClassification =
  | "up"
  | "down"
  | "flat"
  | "no_base"
  | "no_activity";

const ZERO_PERCENT = 0;

/**
 * Classifica a variação entre `current` e `previous` para a UI (RF-06):
 * `previous ≤ 0` não tem base de comparação — `no_activity` SÓ quando os DOIS
 * são exatamente zero (nada aconteceu nos dois períodos); qualquer outro caso
 * com `previous ≤ 0` (anterior zero com atual ≠ 0, ou anterior negativo,
 * mesmo que igual ao atual) é `no_base`, porque não há base válida para
 * calcular percentual. Com base válida (`previous > 0`), classifica pelo
 * PERCENTUAL ARREDONDADO (`deltaPercent`, S7 rodada 2) — nunca pela diferença
 * bruta: uma alta/queda de menos de 0,5% arredonda para 0% na tela, e exibir
 * "▲ 0%"/"▼ 0%" (seta com zero) é enganoso; vira `flat` ("0% vs …").
 */
export function classifyDelta(
  current: number,
  previous: number,
): DeltaClassification {
  if (previous <= 0) {
    return previous === 0 && current === 0 ? "no_activity" : "no_base";
  }
  const percent = deltaPercent(current, previous) ?? ZERO_PERCENT;
  if (percent > ZERO_PERCENT) {
    return "up";
  }
  if (percent < ZERO_PERCENT) {
    return "down";
  }
  return "flat";
}

// ---------------------------------------------------------------------------
// Ritmo da meta (RF-10)
// ---------------------------------------------------------------------------

export type GoalPace =
  | { status: "no_goal" }
  | { status: "reached"; surplusCents: number }
  | { status: "pending"; remainingCents: number; perDayCents: number };

/**
 * Ritmo da meta do mês corrente: sem meta ⇒ `no_goal`; Vendido ≥ meta ⇒
 * `reached` com o excedente; senão ⇒ `pending` com quanto falta e quanto por
 * dia (`ceil(falta / diasRestantes)`, nunca menos que o necessário para bater
 * a meta no prazo). `daysRemaining` é sempre ≥ 1 no uso real (RF-10: "dias
 * restantes contando hoje" — `daysRemainingInMonth` abaixo nunca devolve
 * menos que 1 para o mês corrente); um valor ≤ 0 é erro de chamada.
 */
export function goalPace(input: {
  soldCents: number;
  goalCents: number | null;
  daysRemaining: number;
}): GoalPace {
  const { soldCents, goalCents, daysRemaining } = input;
  if (goalCents === null) {
    return { status: "no_goal" };
  }
  if (soldCents >= goalCents) {
    return { status: "reached", surplusCents: soldCents - goalCents };
  }
  if (daysRemaining <= 0) {
    throw new Error(
      `daysRemaining inválido para ritmo pendente: ${daysRemaining}`,
    );
  }
  const remainingCents = goalCents - soldCents;
  const perDayCents = Math.ceil(remainingCents / daysRemaining);
  return { status: "pending", remainingCents, perDayCents };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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
 * Dias restantes no mês de `todayIso`, CONTANDO hoje (RF-10: último dia do
 * mês ⇒ 1 dia restante, nunca 0).
 */
export function daysRemainingInMonth(todayIso: string): number {
  const { year, month, day } = parseDate(todayIso);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return lastDayOfMonth - day + 1;
}

// ---------------------------------------------------------------------------
// Janela de aniversário (RF-12): 29/02 é lembrado em 28/02 em ano NÃO
// bissexto — regra pedida explicitamente pelo humano (spec Glossário/RF-12).
// ---------------------------------------------------------------------------

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const padNumber = (value: number, length: number): string =>
  String(value).padStart(length, "0");

const monthDayOf = (month: number, day: number): string =>
  `${padNumber(month, 2)}-${padNumber(day, 2)}`;

const addDaysIso = (dateIso: string, days: number): string => {
  const { year, month, day } = parseDate(dateIso);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${padNumber(next.getUTCFullYear(), 4)}-${padNumber(next.getUTCMonth() + 1, 2)}-${padNumber(next.getUTCDate(), 2)}`;
};

export type BirthdayWindowEntry = { monthDay: string; rank: number };

/**
 * Janela de aniversário (RF-12) com o RANK (posição cronológica dentro da
 * janela, 0 = hoje) de cada `MM-DD` — usado para ORDENAR os aniversariantes
 * no banco ANTES do `LIMIT` (A1: aplicar o `LIMIT` antes da ordem certa
 * omitia aniversariantes de hoje quando havia mais de 20 na janela). Quando a
 * janela contém 28/02 de um ano NÃO bissexto, `"02-29"` entra com o MESMO
 * rank de `"02-28"` — nunca no fim da lista — é assim que uma cliente
 * nascida em 29/02 aparece na posição cronológica certa nesse ano.
 */
export function birthdayWindowRanked(
  todayIso: string,
  days: number,
): BirthdayWindowEntry[] {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`Janela de dias inválida: ${days}`);
  }
  const entries: BirthdayWindowEntry[] = [];
  let feb28Rank: number | null = null;
  for (let offset = 0; offset <= days; offset += 1) {
    const dateIso = addDaysIso(todayIso, offset);
    const { year, month, day } = parseDate(dateIso);
    entries.push({ monthDay: monthDayOf(month, day), rank: offset });
    if (month === FEBRUARY && day === DAY_28 && !isLeapYear(year)) {
      feb28Rank = offset;
    }
  }
  if (
    feb28Rank !== null &&
    !entries.some((entry) => entry.monthDay === "02-29")
  ) {
    entries.push({ monthDay: "02-29", rank: feb28Rank });
  }
  return entries;
}

/**
 * Lista de `MM-DD` da janela [hoje, hoje + days] (inclusive nas duas pontas —
 * `days = 7` ⇒ 8 datas), cruzando a virada do ano quando necessário. Quando a
 * janela contém 28/02 de um ano NÃO bissexto, acrescenta `"02-29"` à lista —
 * é assim que uma cliente nascida em 29/02 aparece nesse ano (RF-12). A ORDEM
 * cronológica está em `birthdayWindowRanked` (usada para o `ORDER BY` do
 * repository); esta função só serve para o filtro `IN`.
 */
export function birthdayWindow(todayIso: string, days: number): string[] {
  return birthdayWindowRanked(todayIso, days).map((entry) => entry.monthDay);
}

/**
 * Data `yyyy-mm-dd` dentro da janela [hoje, hoje + days] em que `birthdayIso`
 * (dia/mês, o ano é ignorado) "cai" este ano — aplicando a mesma regra de
 * 29/02 ⇒ 28/02 em ano não bissexto. `null` quando o aniversário não cai
 * dentro da janela.
 */
export function nextBirthdayInWindow(
  birthdayIso: string,
  todayIso: string,
  days: number,
): string | null {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`Janela de dias inválida: ${days}`);
  }
  const birthday = parseDate(birthdayIso);
  for (let offset = 0; offset <= days; offset += 1) {
    const dateIso = addDaysIso(todayIso, offset);
    const { year, month, day } = parseDate(dateIso);
    if (month === birthday.month && day === birthday.day) {
      return dateIso;
    }
    if (
      birthday.month === FEBRUARY &&
      birthday.day === LEAP_DAY &&
      month === FEBRUARY &&
      day === DAY_28 &&
      !isLeapYear(year)
    ) {
      return dateIso;
    }
  }
  return null;
}
