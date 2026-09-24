import { resolveDashboardPeriod } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  buildDashboardPeriodHref,
  buildPeriodNavigation,
  buildPeriodPresets,
  formatComparisonLabel,
  formatComparisonShortLabel,
  formatPeriodLabel,
  parseDashboardPeriodSearchParams,
} from "./dashboard-period-params";

const TODAY = "2026-09-23";

// Constrói um `ResolvedDashboardPeriod` real (nunca um fixture escrito à mão —
// evita rótulos testados contra dados que a própria função de resolução
// jamais produziria).
const resolve = (query: Parameters<typeof resolveDashboardPeriod>[0]) => {
  const result = resolveDashboardPeriod(query, TODAY);
  if (!result.ok) {
    throw new Error(`Período inválido no fixture do teste: ${result.message}`);
  }
  return result.period;
};

describe("parseDashboardPeriodSearchParams", () => {
  it("sem parâmetros ⇒ mês corrente", () => {
    expect(parseDashboardPeriodSearchParams({}, TODAY)).toEqual({
      period: "month",
    });
  });

  it("mês válido no passado é preservado", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "month", month: "2026-08" },
        TODAY,
      ),
    ).toEqual({ period: "month", month: "2026-08" });
  });

  it("mês em formato inválido cai no mês corrente", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "month", month: "2026-13" },
        TODAY,
      ),
    ).toEqual({ period: "month" });
  });

  it("parâmetro em array cai no mês corrente", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "month", month: ["2026-08", "2026-07"] },
        TODAY,
      ),
    ).toEqual({ period: "month" });
    expect(
      parseDashboardPeriodSearchParams({ period: ["month", "year"] }, TODAY),
    ).toEqual({ period: "month" });
  });

  it("mês futuro é limitado ao mês corrente (mantém period=month)", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "month", month: "2027-01" },
        TODAY,
      ),
    ).toEqual({ period: "month", month: "2026-09" });
  });

  it("mês anterior a 2015-01 é limitado a 2015-01", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "month", month: "2014-05" },
        TODAY,
      ),
    ).toEqual({ period: "month", month: "2015-01" });
  });

  it("ano válido no passado é preservado", () => {
    expect(
      parseDashboardPeriodSearchParams({ period: "year", year: "2024" }, TODAY),
    ).toEqual({ period: "year", year: "2024" });
  });

  it("ano futuro é limitado ao ano corrente", () => {
    expect(
      parseDashboardPeriodSearchParams({ period: "year", year: "2030" }, TODAY),
    ).toEqual({ period: "year", year: "2026" });
  });

  it("ano em formato inválido cai no mês corrente", () => {
    expect(
      parseDashboardPeriodSearchParams({ period: "year", year: "abcd" }, TODAY),
    ).toEqual({ period: "month" });
  });

  it("period=all ignora parâmetros alheios", () => {
    expect(
      parseDashboardPeriodSearchParams({ period: "all", month: "lixo" }, TODAY),
    ).toEqual({ period: "all" });
  });

  it("period desconhecido cai no mês corrente", () => {
    expect(
      parseDashboardPeriodSearchParams({ period: "century" }, TODAY),
    ).toEqual({ period: "month" });
  });

  it("range válido é preservado", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "range", from: "2026-01", to: "2026-03" },
        TODAY,
      ),
    ).toEqual({ period: "range", from: "2026-01", to: "2026-03" });
  });

  it("range com from > to tem as datas trocadas (nunca cai em erro)", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "range", from: "2026-03", to: "2026-01" },
        TODAY,
      ),
    ).toEqual({ period: "range", from: "2026-01", to: "2026-03" });
  });

  it("range sem 'to' cai no mês corrente", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "range", from: "2026-01" },
        TODAY,
      ),
    ).toEqual({ period: "month" });
  });

  it("range com mês anterior a 2015-01 é limitado a 2015-01", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "range", from: "2010-01", to: "2010-06" },
        TODAY,
      ),
    ).toEqual({ period: "range", from: "2015-01", to: "2015-01" });
  });

  it("range com mês futuro é limitado ao corrente", () => {
    expect(
      parseDashboardPeriodSearchParams(
        { period: "range", from: "2026-08", to: "2027-05" },
        TODAY,
      ),
    ).toEqual({ period: "range", from: "2026-08", to: "2026-09" });
  });
});

describe("buildDashboardPeriodHref", () => {
  it("mês corrente sem month explícito vira a home nua", () => {
    expect(buildDashboardPeriodHref({ period: "month" })).toBe("/crm");
  });

  it("mês explícito inclui period e month", () => {
    expect(
      buildDashboardPeriodHref({ period: "month", month: "2026-08" }),
    ).toBe("/crm?period=month&month=2026-08");
  });

  it("ano sem valor explícito inclui só period", () => {
    expect(buildDashboardPeriodHref({ period: "year" })).toBe(
      "/crm?period=year",
    );
  });

  it("ano explícito inclui period e year", () => {
    expect(buildDashboardPeriodHref({ period: "year", year: "2024" })).toBe(
      "/crm?period=year&year=2024",
    );
  });

  it("tudo inclui só period", () => {
    expect(buildDashboardPeriodHref({ period: "all" })).toBe("/crm?period=all");
  });

  it("range inclui period, from e to", () => {
    expect(
      buildDashboardPeriodHref({
        period: "range",
        from: "2026-01",
        to: "2026-03",
      }),
    ).toBe("/crm?period=range&from=2026-01&to=2026-03");
  });
});

describe("buildPeriodPresets", () => {
  it("mês corrente ativa 'Este mês' com href da home nua", () => {
    const presets = buildPeriodPresets({ period: "month" }, TODAY);
    const thisMonth = presets.find((preset) => preset.key === "thisMonth");
    expect(thisMonth).toEqual({
      key: "thisMonth",
      label: "Este mês",
      href: "/crm",
      active: true,
    });
    expect(
      presets.filter((preset) => preset.key !== "thisMonth" && preset.active),
    ).toHaveLength(0);
  });

  it("mês passado ativa 'Mês passado'", () => {
    const presets = buildPeriodPresets(
      { period: "month", month: "2026-08" },
      TODAY,
    );
    const lastMonth = presets.find((preset) => preset.key === "lastMonth");
    expect(lastMonth?.active).toBe(true);
    expect(lastMonth?.href).toBe("/crm?period=month&month=2026-08");
  });

  it("ano corrente ativa 'Este ano'", () => {
    const presets = buildPeriodPresets({ period: "year" }, TODAY);
    expect(presets.find((preset) => preset.key === "thisYear")?.active).toBe(
      true,
    );
  });

  it("'Tudo' ativo com period=all", () => {
    const presets = buildPeriodPresets({ period: "all" }, TODAY);
    expect(presets.find((preset) => preset.key === "all")?.active).toBe(true);
  });

  it("'Personalizado' não tem href e ativa com period=range", () => {
    const presets = buildPeriodPresets(
      { period: "range", from: "2026-01", to: "2026-03" },
      TODAY,
    );
    const custom = presets.find((preset) => preset.key === "custom");
    expect(custom).toEqual({
      key: "custom",
      label: "Personalizado",
      href: null,
      active: true,
    });
  });
});

describe("buildPeriodNavigation", () => {
  it("mês: seguinte desabilitada no mês corrente", () => {
    const period = resolve({ period: "month" });
    expect(buildPeriodNavigation(period, TODAY)).toEqual({
      previousHref: "/crm?period=month&month=2026-08",
      nextHref: null,
    });
  });

  it("mês: anterior habilitada fora do mês corrente", () => {
    const period = resolve({ period: "month", month: "2026-08" });
    expect(buildPeriodNavigation(period, TODAY)).toEqual({
      previousHref: "/crm?period=month&month=2026-07",
      nextHref: "/crm?period=month&month=2026-09",
    });
  });

  it("mês: anterior desabilitada em 2015-01", () => {
    const period = resolve({ period: "month", month: "2015-01" });
    expect(buildPeriodNavigation(period, TODAY).previousHref).toBeNull();
  });

  it("ano: seguinte desabilitada no ano corrente", () => {
    const period = resolve({ period: "year" });
    expect(buildPeriodNavigation(period, TODAY)).toEqual({
      previousHref: "/crm?period=year&year=2025",
      nextHref: null,
    });
  });

  it("ano: anterior desabilitada em 2015", () => {
    const period = resolve({ period: "year", year: "2015" });
    expect(buildPeriodNavigation(period, TODAY).previousHref).toBeNull();
  });

  it("range e all não têm setas", () => {
    const range = resolve({ period: "range", from: "2026-01", to: "2026-03" });
    expect(buildPeriodNavigation(range, TODAY)).toEqual({
      previousHref: null,
      nextHref: null,
    });
    const all = resolve({ period: "all" });
    expect(buildPeriodNavigation(all, TODAY)).toEqual({
      previousHref: null,
      nextHref: null,
    });
  });
});

describe("formatPeriodLabel", () => {
  it("mês em andamento", () => {
    const period = resolve({ period: "month" });
    expect(formatPeriodLabel(period)).toBe("setembro de 2026 (até dia 23)");
  });

  it("mês fechado", () => {
    const period = resolve({ period: "month", month: "2026-08" });
    expect(formatPeriodLabel(period)).toBe("agosto de 2026");
  });

  it("ano corrente em andamento", () => {
    const period = resolve({ period: "year" });
    expect(formatPeriodLabel(period)).toBe("2026 (até 23 de setembro)");
  });

  it("ano fechado", () => {
    const period = resolve({ period: "year", year: "2024" });
    expect(formatPeriodLabel(period)).toBe("2024");
  });

  it("intervalo de meses", () => {
    const period = resolve({ period: "range", from: "2026-01", to: "2026-03" });
    expect(formatPeriodLabel(period)).toBe("jan/2026 – mar/2026");
  });

  it("todo o período", () => {
    const period = resolve({ period: "all" });
    expect(formatPeriodLabel(period)).toBe("Todo o período");
  });

  it("intervalo de meses em andamento mostra o trecho parcial (A2)", () => {
    const period = resolve({ period: "range", from: "2026-07", to: "2026-09" });
    expect(formatPeriodLabel(period)).toBe("jul/2026 – set/2026 (até dia 23)");
  });

  it("intervalo de um único mês usa o mesmo rótulo de 'month' (A2)", () => {
    const period = resolve({ period: "range", from: "2026-09", to: "2026-09" });
    expect(formatPeriodLabel(period)).toBe("setembro de 2026 (até dia 23)");
  });

  it("intervalo de um único mês fechado usa o mesmo rótulo de 'month'", () => {
    const period = resolve({ period: "range", from: "2026-08", to: "2026-08" });
    expect(formatPeriodLabel(period)).toBe("agosto de 2026");
  });
});

describe("formatComparisonLabel", () => {
  it("mês em andamento, mesmo ano", () => {
    const period = resolve({ period: "month" });
    expect(formatComparisonLabel(period)).toBe("comparado com 1–23 de agosto");
  });

  it("mês fechado", () => {
    const period = resolve({ period: "month", month: "2026-08" });
    expect(formatComparisonLabel(period)).toBe("comparado com julho de 2026");
  });

  it("ano corrente em andamento", () => {
    const period = resolve({ period: "year" });
    expect(formatComparisonLabel(period)).toBe(
      "comparado com 1º de janeiro a 23 de setembro de 2025",
    );
  });

  it("ano fechado", () => {
    const period = resolve({ period: "year", year: "2024" });
    expect(formatComparisonLabel(period)).toBe("comparado com 2023");
  });

  it("intervalo de meses", () => {
    const period = resolve({ period: "range", from: "2026-01", to: "2026-03" });
    expect(formatComparisonLabel(period)).toBe(
      "comparado com jan/2025 – mar/2025",
    );
  });

  it("sem comparação (todo o período) ⇒ null", () => {
    const period = resolve({ period: "all" });
    expect(formatComparisonLabel(period)).toBeNull();
  });

  it("intervalo de meses em andamento mostra o trecho parcial (A2)", () => {
    const period = resolve({ period: "range", from: "2026-07", to: "2026-09" });
    expect(formatComparisonLabel(period)).toBe(
      "comparado com jul/2025 – set/2025 (até 23 de setembro)",
    );
  });

  it("intervalo de um único mês usa o mesmo rótulo de 'month' (A2)", () => {
    const period = resolve({ period: "range", from: "2026-09", to: "2026-09" });
    expect(formatComparisonLabel(period)).toBe("comparado com 1–23 de agosto");
  });

  it("intervalo de um único mês fechado usa o mesmo rótulo de 'month'", () => {
    const period = resolve({ period: "range", from: "2026-08", to: "2026-08" });
    expect(formatComparisonLabel(period)).toBe("comparado com julho de 2026");
  });
});

describe("formatComparisonLabel — mês em andamento com virada de ano", () => {
  it("comparado com 1–15 de dezembro de 2025", () => {
    const result = resolveDashboardPeriod({ period: "month" }, "2026-01-15");
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(formatComparisonLabel(result.period)).toBe(
      "comparado com 1–15 de dezembro de 2025",
    );
  });
});

describe("formatComparisonShortLabel", () => {
  it("mês: só o nome do mês", () => {
    const period = resolve({ period: "month" });
    expect(formatComparisonShortLabel(period)).toBe("agosto");
  });

  it("ano: só o ano", () => {
    const period = resolve({ period: "year", year: "2024" });
    expect(formatComparisonShortLabel(period)).toBe("2023");
  });

  it("intervalo: meses abreviados com o ano", () => {
    const period = resolve({ period: "range", from: "2026-01", to: "2026-03" });
    expect(formatComparisonShortLabel(period)).toBe("jan–mar/2025");
  });

  it("sem comparação ⇒ null", () => {
    const period = resolve({ period: "all" });
    expect(formatComparisonShortLabel(period)).toBeNull();
  });

  it("intervalo de um único mês usa o mesmo rótulo de 'month' (A2)", () => {
    const period = resolve({ period: "range", from: "2026-09", to: "2026-09" });
    expect(formatComparisonShortLabel(period)).toBe("agosto");
  });
});
