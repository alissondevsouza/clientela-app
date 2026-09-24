import { resolveDashboardPeriod } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  type MonthlyBarValueInput,
  monthsWithVisibleValue,
} from "./monthly-bars-value-label";

const TODAY = "2026-09-23";

const resolvePeriod = (query: Parameters<typeof resolveDashboardPeriod>[0]) => {
  const result = resolveDashboardPeriod(query, TODAY);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.period;
};

const bar = (
  month: string,
  soldCents: number,
  highlighted = false,
): MonthlyBarValueInput => ({ month, soldCents, highlighted });

describe("monthsWithVisibleValue (RF-23, A1 rodada 2 — no máximo um rótulo)", () => {
  it("mês único: mostra o valor do mês selecionado", () => {
    const period = resolvePeriod({ period: "month", month: "2026-08" });
    const bars = [
      bar("2026-07", 3_000_00, true),
      bar("2026-08", 5_000_00, true),
      bar("2026-09", 1_000_00),
    ];

    expect(monthsWithVisibleValue(bars, period)).toEqual(new Set(["2026-08"]));
  });

  it("mês único com Vendido zero: nenhum rótulo", () => {
    const period = resolvePeriod({ period: "month", month: "2026-08" });
    const bars = [
      bar("2026-07", 3_000_00, true),
      bar("2026-08", 0, true),
      bar("2026-09", 1_000_00),
    ];

    expect(monthsWithVisibleValue(bars, period)).toEqual(new Set());
  });

  it("vários meses: mostra o mês de maior Vendido DENTRO do período destacado, mesmo no meio da série", () => {
    const period = resolvePeriod({ period: "year" });
    const bars = [
      bar("2026-01", 12_000_00, false),
      bar("2026-05", 30_000_00, true),
      bar("2026-08", 5_000_00, true),
      bar("2026-09", 4_000_00, true),
    ];

    expect(monthsWithVisibleValue(bars, period)).toEqual(new Set(["2026-05"]));
  });

  it("vários meses: ignora o maior Vendido fora do período destacado", () => {
    const period = resolvePeriod({ period: "year" });
    const bars = [
      bar("2026-01", 50_000_00, false),
      bar("2026-08", 5_000_00, true),
      bar("2026-09", 4_000_00, true),
    ];

    expect(monthsWithVisibleValue(bars, period)).toEqual(new Set(["2026-08"]));
  });

  it("empate no maior Vendido dentro do período: mostra só o mais recente", () => {
    const period = resolvePeriod({ period: "year" });
    const bars = [
      bar("2026-07", 10_000_00, true),
      bar("2026-08", 10_000_00, true),
      bar("2026-09", 9_980_00, true),
    ];

    expect(monthsWithVisibleValue(bars, period)).toEqual(new Set(["2026-08"]));
  });

  it("série (destacada) zerada: nenhum rótulo", () => {
    const period = resolvePeriod({ period: "year" });
    const bars = [
      bar("2026-07", 0, true),
      bar("2026-08", 0, true),
      bar("2026-09", 0, true),
    ];

    expect(monthsWithVisibleValue(bars, period)).toEqual(new Set());
  });

  it("nenhuma barra: conjunto vazio", () => {
    const period = resolvePeriod({ period: "all" });

    expect(monthsWithVisibleValue([], period)).toEqual(new Set());
  });
});
