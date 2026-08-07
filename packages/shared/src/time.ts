// Fuso de referência da aplicação (ADR-0018). Fonte ÚNICA do literal — nenhum
// outro módulo (API, web) deve escrever "America/Sao_Paulo" diretamente.
export const APP_TIME_ZONE = "America/Sao_Paulo";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME_HM_PATTERN = /^(\d{2}):(\d{2})$/;

const MS_PER_DAY = 86_400_000;
const NEXT7_MAX_DAYS = 7;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

// Formatter reusado (custo de construção do Intl.DateTimeFormat não é trivial).
// `hourCycle: "h23"` evita 24:00/meia-noite ambígua no formato 12h.
const zonedPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Extrai os componentes de data/hora de um instante NO fuso `APP_TIME_ZONE`,
// via `Intl.DateTimeFormat` — nunca depende do fuso do processo/dispositivo
// (proibido: `Date#getHours()` etc., que leem o fuso local do runtime).
const zonedParts = (instant: Date): ZonedParts => {
  const parts = zonedPartsFormatter.formatToParts(instant);
  const map: Partial<Record<string, string>> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
};

// Offset (ms) tal que `local = utc + offset`, calculado NO instante dado —
// nunca um valor fixo (o Brasil teve horário de verão até 2019; a mesma data
// de calendário pode ter offsets diferentes conforme o ano — ver teste de
// janeiro/2018 em `time.test.ts`).
const offsetMsAt = (instant: Date): number => {
  const { year, month, day, hour, minute, second } = zonedParts(instant);
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return localAsUtcMs - instant.getTime();
};

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

const parseIsoDate = (
  dateIso: string,
): { year: number; month: number; day: number } => {
  const match = ISO_DATE_PATTERN.exec(dateIso);
  if (match === null) {
    throw new Error(`Data ISO inválida: ${dateIso}`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    throw new Error(`Data ISO inválida: ${dateIso}`);
  }
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
};

const parseTimeHm = (timeHm: string): { hour: number; minute: number } => {
  const match = ISO_TIME_HM_PATTERN.exec(timeHm);
  if (match === null) {
    throw new Error(`Hora local inválida: ${timeHm}`);
  }
  const [, hourStr, minuteStr] = match;
  if (hourStr === undefined || minuteStr === undefined) {
    throw new Error(`Hora local inválida: ${timeHm}`);
  }
  return { hour: Number(hourStr), minute: Number(minuteStr) };
};

/**
 * Dia local (`yyyy-mm-dd`) de um instante ISO, no fuso `APP_TIME_ZONE`.
 * `2026-08-05T23:30:00Z` (20:30 BRT) ⇒ `"2026-08-05"`.
 */
export function appLocalDateIso(isoInstant: string): string {
  const instant = new Date(isoInstant);
  const { year, month, day } = zonedParts(instant);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * Hora local (`HH:mm`) de um instante ISO, no fuso `APP_TIME_ZONE`.
 */
export function appLocalTimeHm(isoInstant: string): string {
  const instant = new Date(isoInstant);
  const { hour, minute } = zonedParts(instant);
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * Compõe data local (`yyyy-mm-dd`) + hora local (`HH:mm`) em instante UTC
 * (ISO), resolvendo o offset de `APP_TIME_ZONE` por DUAS passadas (técnica
 * fixada no plan.md de `specs/crm-appointments`): (1) monta um instante
 * candidato assumindo UTC; (2) lê o offset real daquele instante via
 * `Intl.DateTimeFormat`, corrige, e reconfere lendo o offset do instante já
 * corrigido (cobre a virada de offset perto de uma transição de DST).
 *
 * Hora local ambígua (repetida no fim do DST) resolve para o PRIMEIRO offset
 * encontrado; hora inexistente (pulada no início do DST) desloca para frente
 * o tamanho do salto — ambos efeitos colaterais naturais do algoritmo de duas
 * passadas, não tratados como caso especial à parte.
 *
 * NUNCA usar `new Date("yyyy-mm-ddTHH:mm")` (fuso do dispositivo) nem um
 * offset fixo como `-03:00` (quebra para datas com DST, ex. antes de 2019).
 */
export function appLocalDateTimeToUtc(dateIso: string, timeHm: string): string {
  const { year, month, day } = parseIsoDate(dateIso);
  const { hour, minute } = parseTimeHm(timeHm);

  // Passo 1: instante candidato tratando os números locais como se fossem UTC.
  const naiveMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Passo 2: offset no candidato, corrige, e RECONFERE no instante corrigido.
  const firstPassOffsetMs = offsetMsAt(new Date(naiveMs));
  const correctedMs = naiveMs - firstPassOffsetMs;
  const secondPassOffsetMs = offsetMsAt(new Date(correctedMs));
  const finalMs = naiveMs - secondPassOffsetMs;

  return new Date(finalMs).toISOString();
}

const nextDateIso = (dateIso: string): string => {
  const { year, month, day } = parseIsoDate(dateIso);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

/**
 * Bounds `[startUtc, endUtc)` do dia local `dateIso`, no fuso `APP_TIME_ZONE`
 * — usados pelo repository como instantes prontos (sem `AT TIME ZONE`/
 * `CURRENT_DATE` no SQL, ADR-0018), mantendo a comparação sargável.
 */
export function appLocalDayRangeUtc(dateIso: string): {
  startUtc: string;
  endUtc: string;
} {
  return {
    startUtc: appLocalDateTimeToUtc(dateIso, "00:00"),
    endUtc: appLocalDateTimeToUtc(nextDateIso(dateIso), "00:00"),
  };
}

const daysBetweenIso = (fromIso: string, toIso: string): number => {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / MS_PER_DAY);
};

export type AppointmentDayBucket = "past" | "today" | "next7" | "later";

/**
 * Classifica `localDateIso` em relação a `todayLocalDateIso` para o
 * agrupamento da tela de agenda (RF-17): `next7` cobre de amanhã até o 7º dia
 * (inclusive); daí em diante é `later`.
 */
export function appointmentDayBucket(
  localDateIso: string,
  todayLocalDateIso: string,
): AppointmentDayBucket {
  const diffDays = daysBetweenIso(todayLocalDateIso, localDateIso);
  if (diffDays < 0) {
    return "past";
  }
  if (diffDays === 0) {
    return "today";
  }
  if (diffDays <= NEXT7_MAX_DAYS) {
    return "next7";
  }
  return "later";
}
