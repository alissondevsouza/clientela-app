import { describe, expect, it } from "vitest";
import { createRateLimiter, resolveClientIp } from "./rate-limit";

const MAX = 3;
const WINDOW_MS = 60_000;

const createFakeClock = (start = 0) => {
  let current = start;
  return {
    now: (): number => current,
    advance: (ms: number): void => {
      current += ms;
    },
  };
};

describe("createRateLimiter", () => {
  it("libera até o limite e bloqueia a requisição excedente na janela", () => {
    const clock = createFakeClock();
    const limiter = createRateLimiter({
      max: MAX,
      windowMs: WINDOW_MS,
      clock: clock.now,
    });

    const results = [
      limiter.check("ip-a"),
      limiter.check("ip-a"),
      limiter.check("ip-a"),
      limiter.check("ip-a"),
    ];

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });

  it("mantém contadores independentes por chave", () => {
    const clock = createFakeClock();
    const limiter = createRateLimiter({
      max: MAX,
      windowMs: WINDOW_MS,
      clock: clock.now,
    });

    limiter.check("ip-a");
    limiter.check("ip-a");
    limiter.check("ip-a");

    expect(limiter.check("ip-a").allowed).toBe(false);
    expect(limiter.check("ip-b").allowed).toBe(true);
  });

  it("libera novamente após a janela expirar", () => {
    const clock = createFakeClock();
    const limiter = createRateLimiter({
      max: MAX,
      windowMs: WINDOW_MS,
      clock: clock.now,
    });

    limiter.check("ip-a");
    limiter.check("ip-a");
    limiter.check("ip-a");
    expect(limiter.check("ip-a").allowed).toBe(false);

    clock.advance(WINDOW_MS);

    expect(limiter.check("ip-a").allowed).toBe(true);
  });

  it("não expira dentro da mesma janela (limite inferior)", () => {
    const clock = createFakeClock();
    const limiter = createRateLimiter({
      max: MAX,
      windowMs: WINDOW_MS,
      clock: clock.now,
    });

    limiter.check("ip-a");
    limiter.check("ip-a");
    clock.advance(WINDOW_MS - 1);
    limiter.check("ip-a");

    expect(limiter.check("ip-a").allowed).toBe(false);
  });
});

describe("resolveClientIp", () => {
  it("usa o último valor de x-forwarded-for (anexado pelo proxy confiável)", () => {
    expect(resolveClientIp("203.0.113.7, 10.0.0.1", "10.0.0.9")).toBe(
      "10.0.0.1",
    );
  });

  it("ignora valores forjados no início do x-forwarded-for", () => {
    // Cliente forja `1.1.1.1`; Caddy dá append do IP real ao final. O último
    // valor é o confiável — usar o primeiro permitiria bypass do rate limit.
    expect(resolveClientIp("1.1.1.1, 203.0.113.7", "10.0.0.9")).toBe(
      "203.0.113.7",
    );
  });

  it("recorre ao IP do socket quando não há forwarded-for", () => {
    expect(resolveClientIp(null, "198.51.100.4")).toBe("198.51.100.4");
  });

  it("recorre ao socket quando forwarded-for é vazio", () => {
    expect(resolveClientIp("", "198.51.100.4")).toBe("198.51.100.4");
  });

  it("usa 'unknown' quando não há IP resolvível (fail-closed)", () => {
    expect(resolveClientIp(null, null)).toBe("unknown");
  });
});
