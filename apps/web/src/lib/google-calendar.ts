// Builder puro do link "Adicionar ao Google Agenda" (RF-21). Usa o parâmetro
// público `action=TEMPLATE` — sem OAuth, sem dependência nova, só monta a URL
// (fora de escopo: sincronia bidirecional, atualização de evento existente).

const GOOGLE_CALENDAR_BASE_URL = "https://calendar.google.com/calendar/render";

const MS_PER_MINUTE = 60_000;

export type BuildGoogleCalendarUrlInput = {
  title: string;
  details?: string | null;
  location?: string | null;
  startsAt: string;
  durationMinutes: number;
};

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

// `YYYYMMDDTHHMMSSZ` em UTC (formato básico exigido pelo `dates` do Google
// Agenda) — sempre a partir dos componentes UTC do `Date`, nunca do fuso local
// do processo/dispositivo.
const toUtcBasic = (instant: Date): string => {
  const year = instant.getUTCFullYear();
  const month = pad(instant.getUTCMonth() + 1);
  const day = pad(instant.getUTCDate());
  const hour = pad(instant.getUTCHours());
  const minute = pad(instant.getUTCMinutes());
  const second = pad(instant.getUTCSeconds());
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
};

type QueryEntry = [string, string | null | undefined];

// Monta a querystring com percent-encoding explícito (`encodeURIComponent`,
// não `URLSearchParams`/form-encoding, para nunca depender do "+" para
// espaço). Entradas nulas/ausentes/vazias são omitidas — nunca viram
// `&details=` inútil.
const encodeQuery = (entries: QueryEntry[]): string =>
  entries
    .filter(
      (entry): entry is [string, string] =>
        entry[1] !== null && entry[1] !== undefined && entry[1].length > 0,
    )
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

export function buildGoogleCalendarUrl({
  title,
  details,
  location,
  startsAt,
  durationMinutes,
}: BuildGoogleCalendarUrlInput): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * MS_PER_MINUTE);

  const query = encodeQuery([
    ["action", "TEMPLATE"],
    ["text", title],
    ["dates", `${toUtcBasic(start)}/${toUtcBasic(end)}`],
    ["details", details],
    ["location", location],
  ]);

  return `${GOOGLE_CALENDAR_BASE_URL}?${query}`;
}
