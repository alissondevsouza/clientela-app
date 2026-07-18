// Rate limiter de janela fixa por chave (IP), em memória — instância única
// (ADR-0003) dispensa Redis. Clock injetado torna o teste determinístico
// (testing.md), sem depender de relógio real.

export const RATE_LIMIT_MAX_REQUESTS = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;

// Clock em epoch milissegundos (Date.now no runtime; fake no teste).
export type RateLimitClock = () => number;

export type RateLimiterConfig = {
  max: number;
  windowMs: number;
  clock: RateLimitClock;
};

export type RateLimitResult = {
  allowed: boolean;
};

export type RateLimiter = ReturnType<typeof createRateLimiter>;

type WindowEntry = {
  count: number;
  windowStart: number;
};

export const createRateLimiter = ({
  max,
  windowMs,
  clock,
}: RateLimiterConfig) => {
  const windows = new Map<string, WindowEntry>();

  const evictExpired = (now: number): void => {
    for (const [key, entry] of windows) {
      if (now - entry.windowStart >= windowMs) {
        windows.delete(key);
      }
    }
  };

  const check = (key: string): RateLimitResult => {
    const now = clock();
    evictExpired(now);

    const current = windows.get(key);
    if (!current) {
      windows.set(key, { count: 1, windowStart: now });
      return { allowed: true };
    }

    const nextCount = current.count + 1;
    windows.set(key, { count: nextCount, windowStart: current.windowStart });
    return { allowed: nextCount <= max };
  };

  return { check };
};

const FORWARDED_FOR_SEPARATOR = ",";
const UNKNOWN_CLIENT_IP = "unknown";

// Resolve o IP do cliente: ÚLTIMO valor de `x-forwarded-for` — é o único
// anexado pelo proxy confiável (Caddy dá append, não overwrite; valores
// anteriores são forjáveis pelo cliente e permitiriam bypass do limite via
// spoof). Fallback para o IP do socket. Sem IP resolvível → chave única
// `"unknown"` (fail-closed: ausência de IP não desliga o limite — security.md).
export const resolveClientIp = (
  forwardedFor: string | null,
  socketAddress: string | null,
): string => {
  if (forwardedFor) {
    const parts = forwardedFor.split(FORWARDED_FOR_SEPARATOR);
    const last = parts.at(-1);
    const trimmed = last?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (socketAddress) {
    return socketAddress;
  }

  return UNKNOWN_CLIENT_IP;
};
