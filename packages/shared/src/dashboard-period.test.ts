import { describe, expect, it } from "vitest";
import {
  addMonthsToYearMonth,
  dashboardPeriodQuerySchema,
  lastDayOfYearMonth,
  monthsBetweenYearMonths,
  monthsEndingAt,
  nextDayIso,
  periodBoundsUtc,
  type ResolveDashboardPeriodResult,
  resolveDashboardPeriod,
  yearMonthOfDate,
} from "./dashboard-period";

const parseQuery = (query: Record<string, string>) =>
  dashboardPeriodQuerySchema.parse(query);

const firstMessage = (
  result: ReturnType<typeof dashboardPeriodQuerySchema.safeParse>,
): string => {
  if (result.success) {
    throw new Error("esperava falha de validação");
  }
  return result.error.issues[0]?.message ?? "";
};

const expectOk = (
  result: ResolveDashboardPeriodResult,
): Extract<ResolveDashboardPeriodResult, { ok: true }>["period"] => {
  if (!result.ok) {
    throw new Error(`esperava sucesso, veio erro: ${result.message}`);
  }
  return result.period;
};

const expectErr = (result: ResolveDashboardPeriodResult): string => {
  if (result.ok) {
    throw new Error("esperava erro, veio sucesso");
  }
  return result.message;
};

// ---------------------------------------------------------------------------
// RF-01 — dashboardPeriodQuerySchema
// ---------------------------------------------------------------------------

describe("dashboardPeriodQuerySchema", () => {
  it("period default é 'month' quando ausente", () => {
    const result = dashboardPeriodQuerySchema.parse({});
    expect(result).toEqual({ period: "month" });
  });

  it("aceita month no formato aaaa-mm com period=month", () => {
    const result = dashboardPeriodQuerySchema.parse({
      period: "month",
      month: "2026-09",
    });
    expect(result.month).toBe("2026-09");
  });

  it("aceita year no formato aaaa com period=year", () => {
    const result = dashboardPeriodQuerySchema.parse({
      period: "year",
      year: "2026",
    });
    expect(result.year).toBe("2026");
  });

  it("aceita from/to no formato aaaa-mm com period=range", () => {
    const result = dashboardPeriodQuerySchema.parse({
      period: "range",
      from: "2026-01",
      to: "2026-03",
    });
    expect(result.from).toBe("2026-01");
    expect(result.to).toBe("2026-03");
  });

  it("period=all não exige nenhum parâmetro", () => {
    const result = dashboardPeriodQuerySchema.parse({ period: "all" });
    expect(result).toEqual({ period: "all" });
  });

  it("ignora chaves desconhecidas", () => {
    const result = dashboardPeriodQuerySchema.parse({
      period: "month",
      unknownParam: "whatever",
    } as unknown as Record<string, string>);
    expect(result).toEqual({ period: "month" });
  });

  it.each([
    ["year", { month: "2026-09" }, "month"],
    ["month", { year: "2026" }, "year"],
    ["month", { from: "2026-01" }, "from"],
    ["month", { to: "2026-01" }, "to"],
    ["all", { month: "2026-09" }, "month"],
    ["all", { year: "2026" }, "year"],
    ["range", { month: "2026-09" }, "month"],
    ["range", { year: "2026" }, "year"],
  ] as const)(
    "rejeita %s + %s (parâmetro alheio ao period)",
    (period, extra, invalidKey) => {
      const result = dashboardPeriodQuerySchema.safeParse({
        period,
        ...extra,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((issue) => issue.path[0]);
        expect(paths).toContain(invalidKey);
      }
    },
  );

  it("range exige from e to (campo ausente ⇒ erro pt-BR)", () => {
    const onlyFrom = dashboardPeriodQuerySchema.safeParse({
      period: "range",
      from: "2026-01",
    });
    expect(onlyFrom.success).toBe(false);
    expect(firstMessage(onlyFrom)).toBe(
      "Informe o mês final do intervalo (to)",
    );

    const neither = dashboardPeriodQuerySchema.safeParse({ period: "range" });
    expect(neither.success).toBe(false);
    const messages = neither.success
      ? []
      : neither.error.issues.map((issue) => issue.message);
    expect(messages).toContain("Informe o mês inicial do intervalo (from)");
    expect(messages).toContain("Informe o mês final do intervalo (to)");
  });

  it.each([
    ["2026-9", "month"],
    ["26-09", "month"],
    ["2026-13", "month"],
    ["2026-00", "month"],
  ] as const)("rejeita mês em formato inválido (%s)", (value, field) => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "month",
      [field]: value,
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Informe o mês no formato aaaa-mm");
  });

  it("rejeita ano em formato inválido", () => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "year",
      year: "26",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Informe o ano no formato aaaa");
  });

  it("rejeita mês anterior ao piso 2015-01", () => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "month",
      month: "2014-12",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("O mês não pode ser anterior a 01/2015");
  });

  it("rejeita ano anterior ao piso 2015", () => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "year",
      year: "2014",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("O ano não pode ser anterior a 2015");
  });

  it("rejeita from anterior ao piso 2015-01", () => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "range",
      from: "2014-06",
      to: "2015-06",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "O mês inicial não pode ser anterior a 01/2015",
    );
  });

  it("rejeita from > to no range", () => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "range",
      from: "2026-08",
      to: "2026-01",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "O mês inicial não pode ser depois do mês final",
    );
  });

  it("aceita from === to no range (intervalo de 1 mês)", () => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "range",
      from: "2026-08",
      to: "2026-08",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita period inválido com mensagem pt-BR", () => {
    const result = dashboardPeriodQuerySchema.safeParse({
      period: "quarter",
    });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Período inválido");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });
});

// ---------------------------------------------------------------------------
// RF-02/RF-03 — resolveDashboardPeriod
// ---------------------------------------------------------------------------

describe("resolveDashboardPeriod — kind month", () => {
  it("mês corrente (sem month) ⇒ inProgress com endDate = hoje, comparação 1 mês atrás", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({}), "2026-09-23"),
    );
    expect(period).toEqual({
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
    });
  });

  it("mês passado ⇒ não em andamento, endDate = último dia do mês", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({ month: "2026-07" }), "2026-09-23"),
    );
    expect(period.inProgress).toBe(false);
    expect(period.endDate).toBe("2026-07-31");
    expect(period.comparison).toEqual({
      fromMonth: "2026-06",
      toMonth: "2026-06",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });

  it("31/03 em andamento ⇒ comparação até 28/02 (não bissexto)", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({ month: "2026-03" }), "2026-03-31"),
    );
    expect(period.comparison?.endDate).toBe("2026-02-28");
  });

  it("31/03 em andamento, ano bissexto ⇒ comparação até 29/02", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({ month: "2028-03" }), "2028-03-31"),
    );
    expect(period.comparison?.endDate).toBe("2028-02-29");
  });

  it("mês futuro ⇒ erro pt-BR", () => {
    const message = expectErr(
      resolveDashboardPeriod(parseQuery({ month: "2026-10" }), "2026-09-23"),
    );
    expect(message).toBe("O mês não pode ser posterior ao mês corrente");
  });

  it("mês igual ao mês corrente informado explicitamente não é futuro", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({ month: "2026-09" }), "2026-09-23"),
    );
    expect(period.inProgress).toBe(true);
  });
});

describe("resolveDashboardPeriod — kind year", () => {
  it("ano corrente ⇒ limitado ao mês corrente, comparação 12 meses atrás", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({ period: "year" }), "2026-09-23"),
    );
    expect(period.fromMonth).toBe("2026-01");
    expect(period.toMonth).toBe("2026-09");
    expect(period.endDate).toBe("2026-09-23");
    expect(period.inProgress).toBe(true);
    expect(period.comparison).toEqual({
      fromMonth: "2025-01",
      toMonth: "2025-09",
      startDate: "2025-01-01",
      endDate: "2025-09-23",
    });
  });

  it("15/01 do ano corrente ⇒ comparação 1–15/01 do ano anterior (não dezembro)", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({ period: "year" }), "2026-01-15"),
    );
    expect(period.fromMonth).toBe("2026-01");
    expect(period.toMonth).toBe("2026-01");
    expect(period.comparison).toEqual({
      fromMonth: "2025-01",
      toMonth: "2025-01",
      startDate: "2025-01-01",
      endDate: "2025-01-15",
    });
  });

  it("ano passado ⇒ ano inteiro, sem estar em andamento", () => {
    const period = expectOk(
      resolveDashboardPeriod(
        parseQuery({ period: "year", year: "2024" }),
        "2026-09-23",
      ),
    );
    expect(period.fromMonth).toBe("2024-01");
    expect(period.toMonth).toBe("2024-12");
    expect(period.inProgress).toBe(false);
    expect(period.endDate).toBe("2024-12-31");
    expect(period.comparison).toEqual({
      fromMonth: "2023-01",
      toMonth: "2023-12",
      startDate: "2023-01-01",
      endDate: "2023-12-31",
    });
  });

  it("ano futuro ⇒ erro pt-BR", () => {
    const message = expectErr(
      resolveDashboardPeriod(
        parseQuery({ period: "year", year: "2027" }),
        "2026-09-23",
      ),
    );
    expect(message).toBe("O ano não pode ser posterior ao ano corrente");
  });
});

describe("resolveDashboardPeriod — kind all", () => {
  it("começa em 2015-01 e vai até o mês corrente, sem comparação", () => {
    const period = expectOk(
      resolveDashboardPeriod(parseQuery({ period: "all" }), "2026-09-23"),
    );
    expect(period.fromMonth).toBe("2015-01");
    expect(period.toMonth).toBe("2026-09");
    expect(period.startDate).toBe("2015-01-01");
    expect(period.endDate).toBe("2026-09-23");
    expect(period.inProgress).toBe(true);
    expect(period.comparison).toBeNull();
  });
});

describe("resolveDashboardPeriod — kind range", () => {
  it("N=1 ⇒ comparação de 1 mês atrás (mesma regra do kind month)", () => {
    const period = expectOk(
      resolveDashboardPeriod(
        parseQuery({ period: "range", from: "2026-08", to: "2026-08" }),
        "2026-09-23",
      ),
    );
    expect(period.comparison).toEqual({
      fromMonth: "2026-07",
      toMonth: "2026-07",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("N=3 (2..12) ⇒ os mesmos 3 meses do ano anterior", () => {
    const period = expectOk(
      resolveDashboardPeriod(
        parseQuery({ period: "range", from: "2026-06", to: "2026-08" }),
        "2026-09-23",
      ),
    );
    expect(period.comparison).toEqual({
      fromMonth: "2025-06",
      toMonth: "2025-08",
      startDate: "2025-06-01",
      endDate: "2025-08-31",
    });
  });

  it("N=12 ⇒ ainda 12 meses de deslocamento", () => {
    const period = expectOk(
      resolveDashboardPeriod(
        parseQuery({ period: "range", from: "2025-09", to: "2026-08" }),
        "2026-09-23",
      ),
    );
    expect(monthsBetweenYearMonths("2025-09", "2026-08")).toBe(12);
    expect(period.comparison?.fromMonth).toBe("2024-09");
    expect(period.comparison?.toMonth).toBe("2025-08");
  });

  it("N=13 (> 12) ⇒ sem comparação", () => {
    const period = expectOk(
      resolveDashboardPeriod(
        parseQuery({ period: "range", from: "2025-08", to: "2026-08" }),
        "2026-09-23",
      ),
    );
    expect(monthsBetweenYearMonths("2025-08", "2026-08")).toBe(13);
    expect(period.comparison).toBeNull();
  });

  it("range em andamento (to = mês corrente) ⇒ endDate = hoje", () => {
    const period = expectOk(
      resolveDashboardPeriod(
        parseQuery({ period: "range", from: "2026-07", to: "2026-09" }),
        "2026-09-23",
      ),
    );
    expect(period.inProgress).toBe(true);
    expect(period.endDate).toBe("2026-09-23");
  });

  it("range terminando no futuro ⇒ erro pt-BR", () => {
    const message = expectErr(
      resolveDashboardPeriod(
        parseQuery({ period: "range", from: "2026-08", to: "2026-10" }),
        "2026-09-23",
      ),
    );
    expect(message).toBe(
      "O intervalo não pode terminar depois do mês corrente",
    );
  });

  it("comparação que começa antes de 2015-01 é válida (não barrada)", () => {
    const period = expectOk(
      resolveDashboardPeriod(
        parseQuery({ period: "range", from: "2015-01", to: "2015-01" }),
        "2026-09-23",
      ),
    );
    expect(period.comparison).toEqual({
      fromMonth: "2014-12",
      toMonth: "2014-12",
      startDate: "2014-12-01",
      endDate: "2014-12-31",
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers de calendário exportados
// ---------------------------------------------------------------------------

describe("addMonthsToYearMonth", () => {
  it("soma meses cruzando o ano", () => {
    expect(addMonthsToYearMonth("2026-11", 3)).toBe("2027-02");
  });

  it("subtrai meses cruzando o ano", () => {
    expect(addMonthsToYearMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("lastDayOfYearMonth", () => {
  it("mês de 31 dias", () => {
    expect(lastDayOfYearMonth("2026-01")).toBe("2026-01-31");
  });

  it("fevereiro não bissexto", () => {
    expect(lastDayOfYearMonth("2026-02")).toBe("2026-02-28");
  });

  it("fevereiro bissexto", () => {
    expect(lastDayOfYearMonth("2028-02")).toBe("2028-02-29");
  });
});

describe("nextDayIso", () => {
  it("dia seguinte dentro do mês", () => {
    expect(nextDayIso("2026-09-23")).toBe("2026-09-24");
  });

  it("cruza mês", () => {
    expect(nextDayIso("2026-09-30")).toBe("2026-10-01");
  });

  it("cruza ano", () => {
    expect(nextDayIso("2026-12-31")).toBe("2027-01-01");
  });
});

describe("yearMonthOfDate", () => {
  it("extrai o mês de uma data", () => {
    expect(yearMonthOfDate("2026-09-23")).toBe("2026-09");
  });
});

describe("monthsBetweenYearMonths", () => {
  it("mesmo mês ⇒ 1", () => {
    expect(monthsBetweenYearMonths("2026-08", "2026-08")).toBe(1);
  });

  it("intervalo de 3 meses ⇒ 3", () => {
    expect(monthsBetweenYearMonths("2026-06", "2026-08")).toBe(3);
  });

  it("cruzando o ano", () => {
    expect(monthsBetweenYearMonths("2025-12", "2026-02")).toBe(3);
  });
});

describe("monthsEndingAt", () => {
  it("12 meses terminando em setembro/2026, do mais antigo ao mais recente", () => {
    const months = monthsEndingAt("2026-09", 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months[11]).toBe("2026-09");
  });
});

describe("periodBoundsUtc", () => {
  it("endUtc é meia-noite local do dia SEGUINTE ao endDate", () => {
    const bounds = periodBoundsUtc("2026-09-01", "2026-09-23");
    expect(bounds.startUtc).toBe("2026-09-01T03:00:00.000Z");
    expect(bounds.endUtc).toBe("2026-09-24T03:00:00.000Z");
  });

  it("novembro/2018 — DST começou em 04/11/2018 (offset muda de -03:00 para -02:00 dentro do mês)", () => {
    const bounds = periodBoundsUtc("2018-11-01", "2018-11-30");
    // 01/11 ainda é offset -03:00 (antes da virada de DST em 04/11)
    expect(bounds.startUtc).toBe("2018-11-01T03:00:00.000Z");
    // dia seguinte ao fim do mês (01/12) já é offset -02:00 (dentro do DST)
    expect(bounds.endUtc).toBe("2018-12-01T02:00:00.000Z");
  });

  it("fevereiro/2019 — DST terminou em 17/02/2019 (offset muda de -02:00 para -03:00 dentro do mês)", () => {
    const bounds = periodBoundsUtc("2019-02-01", "2019-02-28");
    // 01/02 ainda está dentro do DST (offset -02:00)
    expect(bounds.startUtc).toBe("2019-02-01T02:00:00.000Z");
    // dia seguinte ao fim do mês (01/03) já é offset -03:00 (DST encerrado)
    expect(bounds.endUtc).toBe("2019-03-01T03:00:00.000Z");
  });
});

describe("dashboardPeriodQuerySchema — parâmetro repetido na URL (S2, QA rodada 3)", () => {
  it.each([
    [
      { period: "month", month: ["2026-01", "2026-02"] },
      "Informe o mês no formato aaaa-mm",
    ],
    [
      { period: "year", year: ["2025", "2026"] },
      "Informe o ano no formato aaaa",
    ],
    [
      { period: "range", from: ["2026-01", "2026-02"], to: "2026-03" },
      "Informe o mês inicial no formato aaaa-mm",
    ],
    [
      { period: "range", from: "2026-01", to: ["2026-02", "2026-03"] },
      "Informe o mês final no formato aaaa-mm",
    ],
  ])(
    "valor em lista (%o) é rejeitado com mensagem pt-BR",
    (input, expected) => {
      const result = dashboardPeriodQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
      const message = result.success
        ? ""
        : (result.error.issues[0]?.message ?? "");
      expect(message).toBe(expected);
      expect(message).not.toMatch(/invalid input|expected|received/i);
    },
  );
});
