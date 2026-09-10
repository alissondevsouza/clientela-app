import type { DashboardSummary } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  type DashboardApiDeps,
  getDashboardSummary,
  updateGoal,
} from "./dashboard-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";

const sampleSummary: DashboardSummary = {
  monthSalesCents: 250000,
  monthProfitCents: 90000,
  monthSalesCount: 5,
  openSalesCents: 0,
  openSalesCount: 0,
  pendingReceivablesCents: 30000,
  overdueReceivablesCents: 5000,
  overdueReceivablesCount: 1,
  monthlyGoalCents: 150000,
  monthLabel: "Julho de 2026",
};

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

// Fetch fake que registra a chamada e delega a resposta a um responder
// (testing.md: fake explícito injetado, sem vi.mock).
const stubFetch = (
  responder: () => Response,
): { fetchImpl: FetchImpl; calls: FetchCall[] } => {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchImpl = async (input, init) => {
    calls.push({ url: String(input), init });
    return responder();
  };
  return { fetchImpl, calls };
};

const headerValue = (
  init: RequestInit | undefined,
  key: string,
): string | null => {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    return null;
  }
  return headers[key] ?? null;
};

const depsWith = (fetchImpl: FetchImpl): DashboardApiDeps => ({
  fetchImpl,
  apiUrl: API_URL,
  token: TOKEN,
});

const errorEnvelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message } });

describe("getDashboardSummary", () => {
  it("faz GET /dashboard/summary com Bearer e retorna o agregado parseado", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleSummary), { status: 200 }),
    );

    const result = await getDashboardSummary(depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, summary: sampleSummary });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/dashboard/summary");
  });

  it("aceita monthProfitCents negativo (venda no prejuízo) sem falhar o parse", async () => {
    const negativeProfit: DashboardSummary = {
      ...sampleSummary,
      monthProfitCents: -500,
    };
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify(negativeProfit), { status: 200 }),
    );

    const result = await getDashboardSummary(depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, summary: negativeProfit });
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), {
          status: 500,
        }),
    );

    const result = await getDashboardSummary(depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "falhou" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await getDashboardSummary(depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await getDashboardSummary(depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("updateGoal", () => {
  it("faz PUT /dashboard/goal com Bearer, JSON e corpo validado; retorna o novo valor", async () => {
    const { fetchImpl, calls } = stubFetch(
      () =>
        new Response(JSON.stringify({ monthlyGoalCents: 150000 }), {
          status: 200,
        }),
    );

    const result = await updateGoal(150000, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, monthlyGoalCents: 150000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/dashboard/goal");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      monthlyGoalCents: 150000,
    });
  });

  it("envia null para remover a meta", async () => {
    const { fetchImpl, calls } = stubFetch(
      () =>
        new Response(JSON.stringify({ monthlyGoalCents: null }), {
          status: 200,
        }),
    );

    const result = await updateGoal(null, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, monthlyGoalCents: null });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      monthlyGoalCents: null,
    });
  });

  it("não envia requisição quando o input é inválido (0 é rejeitado pelo schema)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () =>
        new Response(JSON.stringify({ monthlyGoalCents: 0 }), {
          status: 200,
        }),
    );

    const result = await updateGoal(0, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("mapeia erro 422 da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Meta inválida"), {
          status: 422,
        }),
    );

    const result = await updateGoal(150000, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Meta inválida" });
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await updateGoal(150000, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});
