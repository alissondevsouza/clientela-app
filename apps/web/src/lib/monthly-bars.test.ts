import { resolveDashboardPeriod } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  buildMonthlyBars,
  isSeriesEmpty,
  type MonthlySeriesItem,
  tooltipAnchor,
  yearOf,
} from "./monthly-bars";

const TODAY = "2026-09-23";

// O Intl.NumberFormat pt-BR separa "R$" do valor com espaço não separável
// (U+00A0), não espaço comum (mesma convenção de format.test.ts).
const NBSP = " ";

const resolvePeriod = (query: Parameters<typeof resolveDashboardPeriod>[0]) => {
  const result = resolveDashboardPeriod(query, TODAY);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.period;
};

const seriesItem = (
  month: string,
  soldCents: number,
  profitCents: number,
): MonthlySeriesItem => ({ month, soldCents, profitCents });

describe("buildMonthlyBars (RF-23)", () => {
  it("altura relativa ao maior Vendido da série (máximo 100, zero sem barra)", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [
      seriesItem("2026-07", 0, 0),
      seriesItem("2026-08", 50_000_00, 10_000_00),
      seriesItem("2026-09", 100_000_00, 20_000_00),
    ];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.heightPercent).toBe(0);
    expect(bars[1]?.heightPercent).toBe(50);
    expect(bars[2]?.heightPercent).toBe(100);
  });

  it("lucro relativo ao MESMO teto do Vendido", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [seriesItem("2026-09", 100_000_00, 25_000_00)];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.profitHeightPercent).toBe(25);
    expect(bars[0]?.profitNegative).toBe(false);
  });

  it("lucro negativo vira altura 0 com a flag profitNegative", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [seriesItem("2026-09", 100_000_00, -5_000_00)];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.profitHeightPercent).toBe(0);
    expect(bars[0]?.profitNegative).toBe(true);
  });

  it("destaca só os meses dentro do período selecionado", () => {
    const period = resolvePeriod({
      period: "range",
      from: "2026-01",
      to: "2026-03",
    });
    const series = [
      seriesItem("2025-12", 10_000_00, 1_000_00),
      seriesItem("2026-01", 10_000_00, 1_000_00),
      seriesItem("2026-02", 10_000_00, 1_000_00),
      seriesItem("2026-03", 10_000_00, 1_000_00),
      seriesItem("2026-04", 10_000_00, 1_000_00),
    ];

    const bars = buildMonthlyBars(series, period);

    expect(bars.map((bar) => bar.highlighted)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it("barra de mês anterior a 2015-01 não é link", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [seriesItem("2014-12", 10_000_00, 1_000_00)];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.href).toBeNull();
  });

  it("barra de mês válido linka para aquele mês isolado", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [seriesItem("2026-08", 10_000_00, 1_000_00)];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.href).toBe("/crm?period=month&month=2026-08");
  });

  it("rótulo acessível por extenso (Vendido e Lucro)", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [seriesItem("2026-09", 123_400, 40_000)];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.ariaLabel).toBe(
      `setembro de 2026: vendido R$${NBSP}1.234,00, lucro R$${NBSP}400,00`,
    );
  });

  it("rótulo acessível traz '(prejuízo)' quando o lucro é negativo (A5: a palavra some da tela, mas não da versão acessível)", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [seriesItem("2026-09", 123_400, -4_000)];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.ariaLabel).toBe(
      `setembro de 2026: vendido R$${NBSP}1.234,00, lucro -R$${NBSP}40,00 (prejuízo)`,
    );
  });

  it("shortLabel é a abreviação de 3 letras do mês", () => {
    const period = resolvePeriod({ period: "month" });
    const series = [seriesItem("2026-09", 10_000_00, 1_000_00)];

    const bars = buildMonthlyBars(series, period);

    expect(bars[0]?.shortLabel).toBe("set");
  });
});

describe("yearOf (S3: ano por extenso na tabela sr-only, a série cruza dois anos)", () => {
  it("extrai o ano de um mês yyyy-mm", () => {
    expect(yearOf("2025-10")).toBe("2025");
    expect(yearOf("2026-09")).toBe("2026");
  });
});

describe("isSeriesEmpty", () => {
  it("verdadeiro quando toda a série está zerada", () => {
    expect(
      isSeriesEmpty([seriesItem("2026-08", 0, 0), seriesItem("2026-09", 0, 0)]),
    ).toBe(true);
  });

  it("falso quando ao menos um mês teve Vendido", () => {
    expect(
      isSeriesEmpty([seriesItem("2026-08", 0, 0), seriesItem("2026-09", 1, 0)]),
    ).toBe(false);
  });

  it("série vazia (sem meses) conta como vazia", () => {
    expect(isSeriesEmpty([])).toBe(true);
  });
});

describe("tooltipAnchor (S1, QA rodada 3: tooltip nunca sai da área do gráfico)", () => {
  const COLUMNS = 12;

  it.each([0, 1, 2, 5])(
    "coluna %i da metade esquerda abre para a direita",
    (index) => {
      expect(tooltipAnchor(index, COLUMNS)).toBe("start");
    },
  );

  it.each([6, 9, 10, 11])(
    "coluna %i da metade direita abre para a esquerda",
    (index) => {
      expect(tooltipAnchor(index, COLUMNS)).toBe("end");
    },
  );
});
