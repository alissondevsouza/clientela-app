import {
  type DashboardPerformance,
  type DashboardToday,
  monthsEndingAt,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  type DashboardApiDeps,
  getDashboardPerformance,
  getDashboardToday,
  updateGoal,
} from "./dashboard-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";
const CLIENT_ID = "018f9c2e-1111-7b3d-9e21-0a1b2c3d4e5f";
const PRODUCT_ID = "018f9c2e-3333-7b3d-9e21-0a1b2c3d4e5f";

// Série de 12 meses zerados terminando em setembro/2026 (`dashboardPerformanceSchema`
// exige exatamente 12 itens) — só o suficiente para o shape ser válido.
const sampleSeries = monthsEndingAt("2026-09", 12).map((month) => ({
  month,
  soldCents: 0,
  profitCents: 0,
}));

const samplePerformance: DashboardPerformance = {
  period: {
    kind: "month",
    fromMonth: "2026-09",
    toMonth: "2026-09",
    startDate: "2026-09-01",
    endDate: "2026-09-23",
    inProgress: true,
    comparison: {
      fromMonth: "2026-08",
      toMonth: "2026-08",
      startDate: "2026-08-01",
      endDate: "2026-08-23",
    },
  },
  current: {
    soldCents: 250000,
    soldCount: 5,
    profitCents: 90000,
    receivedCents: 100000,
    clientsCount: 3,
  },
  previous: {
    soldCents: 200000,
    soldCount: 4,
    profitCents: 70000,
    receivedCents: 80000,
    clientsCount: 2,
  },
  series: sampleSeries,
  topProducts: [
    {
      productId: PRODUCT_ID,
      name: "Batom Matte Vermelho",
      qty: 3,
      soldCents: 15000,
    },
  ],
  topClients: [
    {
      clientId: CLIENT_ID,
      name: "Maria Silva",
      salesCount: 2,
      soldCents: 50000,
    },
  ],
  goal: {
    month: "2026-09",
    goalCents: 150000,
    source: "explicit",
    inheritedFromMonth: null,
    editable: true,
    daysRemaining: 7,
  },
};

const sampleToday: DashboardToday = {
  today: "2026-09-23",
  collections: {
    overdueCount: 1,
    overdueCents: 5000,
    dueTodayCount: 0,
    dueTodayCents: 0,
    next7Count: 0,
    next7Cents: 0,
    groupsTotal: 1,
    groups: [
      {
        clientId: CLIENT_ID,
        saleId: null,
        name: "Maria Silva",
        whatsapp: "+5511987654321",
        amountCents: 5000,
        installmentsCount: 1,
        oldestDueDate: "2026-09-20",
        overdue: true,
      },
    ],
  },
  appointments: { total: 0, items: [] },
  deliveries: { total: 0, totalCents: 0, items: [] },
  newLeads: { total: 0, items: [] },
  restock: { shortCount: 0, missingQtyTotal: 0, items: [] },
  birthdays: [],
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

describe("getDashboardPerformance", () => {
  it("faz GET /dashboard/performance com period=month e month, e retorna o desempenho parseado", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(samplePerformance), { status: 200 }),
    );

    const result = await getDashboardPerformance(
      { period: "month", month: "2026-09" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, performance: samplePerformance });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      "http://localhost:3001/dashboard/performance?period=month&month=2026-09",
    );
  });

  it("monta a URL só com os parâmetros do period=range (from/to, sem month/year)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(samplePerformance), { status: 200 }),
    );

    await getDashboardPerformance(
      { period: "range", from: "2026-01", to: "2026-03" },
      depsWith(fetchImpl),
    );

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/dashboard/performance?period=range&from=2026-01&to=2026-03",
    );
  });

  it("monta a URL só com period para period=all (sem month/year/from/to)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(samplePerformance), { status: 200 }),
    );

    await getDashboardPerformance({ period: "all" }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/dashboard/performance?period=all",
    );
  });

  it("mapeia erro 422 da API para mensagem pt-BR do envelope (período futuro)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "VALIDATION_ERROR",
            "O mês não pode ser posterior ao mês corrente",
          ),
          { status: 422 },
        ),
    );

    const result = await getDashboardPerformance(
      { period: "month", month: "2099-01" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: false,
      message: "O mês não pode ser posterior ao mês corrente",
    });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await getDashboardPerformance(
      { period: "month" },
      depsWith(fetchImpl),
    );

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

    const result = await getDashboardPerformance(
      { period: "month" },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getDashboardToday", () => {
  it("faz GET /dashboard/today com Bearer e retorna a central do dia parseada", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleToday), { status: 200 }),
    );

    const result = await getDashboardToday(depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, today: sampleToday });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/dashboard/today");
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), {
          status: 500,
        }),
    );

    const result = await getDashboardToday(depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "falhou" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await getDashboardToday(depsWith(fetchImpl));

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

    const result = await getDashboardToday(depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("updateGoal", () => {
  it("faz PUT /dashboard/goal com Bearer, JSON e corpo validado; retorna o mês gravado e o novo valor", async () => {
    const { fetchImpl, calls } = stubFetch(
      () =>
        new Response(
          JSON.stringify({ month: "2026-09", monthlyGoalCents: 150000 }),
          { status: 200 },
        ),
    );

    const result = await updateGoal(150000, depsWith(fetchImpl));

    expect(result).toEqual({
      ok: true,
      month: "2026-09",
      monthlyGoalCents: 150000,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/dashboard/goal");
    // O corpo enviado continua só `monthlyGoalCents` (RF-09: o mês é decidido
    // pelo servidor, nunca pelo cliente).
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      monthlyGoalCents: 150000,
    });
  });

  it("envia null para remover a meta", async () => {
    const { fetchImpl, calls } = stubFetch(
      () =>
        new Response(
          JSON.stringify({ month: "2026-09", monthlyGoalCents: null }),
          { status: 200 },
        ),
    );

    const result = await updateGoal(null, depsWith(fetchImpl));

    expect(result).toEqual({
      ok: true,
      month: "2026-09",
      monthlyGoalCents: null,
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      monthlyGoalCents: null,
    });
  });

  it("retorna ok:false quando a resposta 200 não traz o mês (shape antigo)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(JSON.stringify({ monthlyGoalCents: 150000 }), {
          status: 200,
        }),
    );

    const result = await updateGoal(150000, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
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
