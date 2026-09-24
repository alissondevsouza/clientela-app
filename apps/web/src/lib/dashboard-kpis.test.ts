import type { DashboardPerformance } from "@clientela/shared";
import { resolveDashboardPeriod } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { buildPerformanceKpis, hasNoMovement } from "./dashboard-kpis";

const TODAY = "2026-09-23";

// O Intl.NumberFormat pt-BR separa "R$" do valor com espaço não separável
// (U+00A0), não espaço comum (mesma convenção de format.test.ts).
const NBSP = "\u00A0";

const resolvePeriod = (query: Parameters<typeof resolveDashboardPeriod>[0]) => {
  const result = resolveDashboardPeriod(query, TODAY);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.period;
};

const basePerformance = (
  overrides: Partial<DashboardPerformance>,
): DashboardPerformance => ({
  period: resolvePeriod({ period: "month" }),
  current: {
    soldCents: 0,
    soldCount: 0,
    profitCents: 0,
    receivedCents: 0,
    clientsCount: 0,
  },
  previous: null,
  series: [],
  topProducts: [],
  topClients: [],
  goal: null,
  ...overrides,
});

describe("buildPerformanceKpis (RF-22)", () => {
  it("monta os 4 cartões na ordem Vendido/Recebido/Lucro/Ticket", () => {
    const performance = basePerformance({
      current: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 60_000_00,
        clientsCount: 3,
      },
      previous: {
        soldCents: 80_000_00,
        soldCount: 2,
        profitCents: 20_000_00,
        receivedCents: 50_000_00,
        clientsCount: 2,
      },
    });

    const kpis = buildPerformanceKpis(performance);

    expect(kpis.map((kpi) => kpi.key)).toEqual([
      "sold",
      "received",
      "profit",
      "ticket",
    ]);
  });

  it("Vendido: valor, nº de vendas e href do drill-down", () => {
    const performance = basePerformance({
      current: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 60_000_00,
        clientsCount: 3,
      },
    });

    const [sold] = buildPerformanceKpis(performance);

    expect(sold?.value).toBe(`R$${NBSP}100.000,00`);
    expect(sold?.secondaryLine).toBe("4 vendas");
    expect(sold?.href).toContain("status=sold");
  });

  it("1 venda usa singular na linha secundária do Vendido", () => {
    const performance = basePerformance({
      current: {
        soldCents: 10_000_00,
        soldCount: 1,
        profitCents: 2_000_00,
        receivedCents: 0,
        clientsCount: 1,
      },
    });

    const [sold] = buildPerformanceKpis(performance);

    expect(sold?.secondaryLine).toBe("1 venda");
  });

  it("Recebido: valor e href para cobranças pagas no período, sem linha secundária", () => {
    const performance = basePerformance({
      current: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 60_000_00,
        clientsCount: 3,
      },
    });

    const [, received] = buildPerformanceKpis(performance);

    expect(received?.value).toBe(`R$${NBSP}60.000,00`);
    expect(received?.secondaryLine).toBeNull();
    expect(received?.href).toContain("paidFrom");
  });

  it("Lucro estimado: valor com sinal e margem na linha secundária", () => {
    const performance = basePerformance({
      current: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: -5_000_00,
        receivedCents: 0,
        clientsCount: 3,
      },
    });

    const [, , profit] = buildPerformanceKpis(performance);

    expect(profit?.value).toBe(`-R$${NBSP}5.000,00`);
    expect(profit?.secondaryLine).toBe("margem -5%");
    expect(profit?.href).toContain("status=sold");
  });

  it("Ticket médio: valor, clientes atendidas e href", () => {
    const performance = basePerformance({
      current: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 0,
        clientsCount: 3,
      },
    });

    const [, , , ticket] = buildPerformanceKpis(performance);

    expect(ticket?.value).toBe(`R$${NBSP}25.000,00`);
    expect(ticket?.secondaryLine).toBe("3 clientes atendidas");
  });

  it("1 cliente atendida usa singular", () => {
    const performance = basePerformance({
      current: {
        soldCents: 10_000_00,
        soldCount: 1,
        profitCents: 1_000_00,
        receivedCents: 0,
        clientsCount: 1,
      },
    });

    const [, , , ticket] = buildPerformanceKpis(performance);

    expect(ticket?.secondaryLine).toBe("1 cliente atendida");
  });

  it("sem `previous` (período all): nenhum cartão tem variação", () => {
    const performance = basePerformance({
      period: resolvePeriod({ period: "all" }),
      current: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 60_000_00,
        clientsCount: 3,
      },
      previous: null,
    });

    const kpis = buildPerformanceKpis(performance);

    expect(kpis.every((kpi) => kpi.delta === null)).toBe(true);
  });

  it("com `previous`: cada cartão tem a variação do próprio campo", () => {
    const performance = basePerformance({
      current: {
        soldCents: 120_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 60_000_00,
        clientsCount: 3,
      },
      previous: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 60_000_00,
        clientsCount: 3,
      },
    });

    const [sold] = buildPerformanceKpis(performance);

    expect(sold?.delta?.direction).toBe("up");
    expect(sold?.delta?.text).toContain("vs agosto");
  });

  it("ticket sem venda no período atual não calcula variação (não força 0)", () => {
    const performance = basePerformance({
      current: {
        soldCents: 0,
        soldCount: 0,
        profitCents: 0,
        receivedCents: 0,
        clientsCount: 0,
      },
      previous: {
        soldCents: 100_000_00,
        soldCount: 4,
        profitCents: 25_000_00,
        receivedCents: 60_000_00,
        clientsCount: 3,
      },
    });

    const [, , , ticket] = buildPerformanceKpis(performance);

    expect(ticket?.value).toBe("—");
    expect(ticket?.delta).toBeNull();
  });
});

describe("hasNoMovement (RF-22)", () => {
  it("verdadeiro quando não há venda nem recebimento no período", () => {
    expect(
      hasNoMovement({
        soldCents: 0,
        soldCount: 0,
        profitCents: 0,
        receivedCents: 0,
        clientsCount: 0,
      }),
    ).toBe(true);
  });

  it("falso quando há Vendido no período", () => {
    expect(
      hasNoMovement({
        soldCents: 1000,
        soldCount: 1,
        profitCents: 100,
        receivedCents: 0,
        clientsCount: 1,
      }),
    ).toBe(false);
  });

  it("falso quando há Recebido mesmo sem Vendido no período", () => {
    expect(
      hasNoMovement({
        soldCents: 0,
        soldCount: 0,
        profitCents: 0,
        receivedCents: 1000,
        clientsCount: 0,
      }),
    ).toBe(false);
  });
});
