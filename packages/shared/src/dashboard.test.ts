import { describe, expect, it } from "vitest";
import {
  dashboardPerformanceSchema,
  dashboardTodaySchema,
  updateGoalResponseSchema,
  updateGoalSchema,
} from "./dashboard";
import {
  dashboardPeriodQuerySchema,
  resolveDashboardPeriod,
} from "./dashboard-period";

const firstMessage = (
  result: ReturnType<typeof updateGoalSchema.safeParse>,
): string => {
  if (result.success) {
    throw new Error("esperava falha de validação");
  }
  return result.error.issues[0]?.message ?? "";
};

describe("updateGoalSchema", () => {
  it("aceita meta válida em centavos", () => {
    const result = updateGoalSchema.parse({ monthlyGoalCents: 150_000 });
    expect(result.monthlyGoalCents).toBe(150_000);
  });

  it("aceita null para remover a meta", () => {
    const result = updateGoalSchema.parse({ monthlyGoalCents: null });
    expect(result.monthlyGoalCents).toBeNull();
  });

  it("rejeita 0 com mensagem pt-BR", () => {
    const result = updateGoalSchema.safeParse({ monthlyGoalCents: 0 });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("A meta deve ser maior que zero");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });

  it("rejeita valor negativo com mensagem pt-BR", () => {
    const result = updateGoalSchema.safeParse({ monthlyGoalCents: -500 });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("A meta deve ser maior que zero");
  });

  it("rejeita valor acima do teto com mensagem pt-BR", () => {
    const result = updateGoalSchema.safeParse({
      monthlyGoalCents: 100_000_001,
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "A meta deve ser no máximo R$ 1.000.000,00",
    );
  });

  it("rejeita valor não-inteiro com mensagem pt-BR", () => {
    const result = updateGoalSchema.safeParse({ monthlyGoalCents: 12.34 });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "Informe a meta em centavos (número inteiro) ou remova a meta",
    );
  });

  it("rejeita campo ausente com mensagem pt-BR clara", () => {
    const result = updateGoalSchema.safeParse({});
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe(
      "Informe a meta em centavos (número inteiro) ou remova a meta",
    );
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });
});

describe("updateGoalResponseSchema", () => {
  it("aceita { month, monthlyGoalCents } (RF-09)", () => {
    const result = updateGoalResponseSchema.parse({
      month: "2026-09",
      monthlyGoalCents: 300_000,
    });
    expect(result).toEqual({ month: "2026-09", monthlyGoalCents: 300_000 });
  });

  it("aceita monthlyGoalCents null (meta removida)", () => {
    const result = updateGoalResponseSchema.parse({
      month: "2026-09",
      monthlyGoalCents: null,
    });
    expect(result.monthlyGoalCents).toBeNull();
  });

  it("rejeita month fora do formato aaaa-mm", () => {
    const result = updateGoalResponseSchema.safeParse({
      month: "2026-9",
      monthlyGoalCents: null,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dashboardPerformanceSchema (RF-11)
// ---------------------------------------------------------------------------

// Período de teste construído com a função REAL de `dashboard-period.ts` —
// prova que os dois contratos concordam (comentário em `dashboard.ts`), em
// vez de um objeto literal que poderia divergir silenciosamente do formato
// real de `ResolvedDashboardPeriod`.
const resolvedMonthPeriod = (() => {
  const query = dashboardPeriodQuerySchema.parse({ month: "2026-09" });
  const result = resolveDashboardPeriod(query, "2026-09-23");
  if (!result.ok) {
    throw new Error("período de teste deveria ser válido");
  }
  return result.period;
})();

const validMetrics = {
  soldCents: 150_000,
  soldCount: 5,
  profitCents: 45_000,
  receivedCents: 120_000,
  clientsCount: 4,
};

const validSeries = Array.from({ length: 12 }, (_unused, index) => ({
  month: `2026-${String(index + 1).padStart(2, "0")}`,
  soldCents: 1_000 * (index + 1),
  profitCents: 100 * (index + 1),
}));

const validGoal = {
  month: "2026-09",
  goalCents: 300_000,
  source: "explicit" as const,
  inheritedFromMonth: null,
  editable: true,
  daysRemaining: 8,
};

const validPerformance = {
  period: resolvedMonthPeriod,
  current: validMetrics,
  previous: validMetrics,
  series: validSeries,
  topProducts: [
    {
      productId: "11111111-1111-4111-8111-111111111111",
      name: "Batom Vermelho",
      qty: 10,
      soldCents: 50_000,
    },
    {
      productId: null,
      name: "Produto excluído (snapshot)",
      qty: 3,
      soldCents: 9_000,
    },
  ],
  topClients: [
    {
      clientId: "22222222-2222-4222-8222-222222222222",
      name: "Maria Silva",
      salesCount: 4,
      soldCents: 80_000,
    },
  ],
  goal: validGoal,
};

describe("dashboardPerformanceSchema", () => {
  it("aceita um payload completo válido", () => {
    const result = dashboardPerformanceSchema.parse(validPerformance);
    expect(result.current).toEqual(validMetrics);
    expect(result.series).toHaveLength(12);
  });

  it("aceita profitCents negativo (período no prejuízo)", () => {
    const result = dashboardPerformanceSchema.parse({
      ...validPerformance,
      current: { ...validMetrics, profitCents: -12_345 },
    });
    expect(result.current.profitCents).toBe(-12_345);
  });

  it("aceita previous null (sem comparação, ex.: kind=all)", () => {
    const result = dashboardPerformanceSchema.parse({
      ...validPerformance,
      previous: null,
    });
    expect(result.previous).toBeNull();
  });

  it("aceita goal null (kind ≠ month)", () => {
    const result = dashboardPerformanceSchema.parse({
      ...validPerformance,
      goal: null,
    });
    expect(result.goal).toBeNull();
  });

  it("rejeita series com tamanho diferente de 12", () => {
    const result = dashboardPerformanceSchema.safeParse({
      ...validPerformance,
      series: validSeries.slice(0, 11),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita series com 13 itens", () => {
    const result = dashboardPerformanceSchema.safeParse({
      ...validPerformance,
      series: [...validSeries, validSeries[0]],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita topProducts com mais de 5 itens", () => {
    const sixProducts = Array.from({ length: 6 }, (_unused, index) => ({
      productId: null,
      name: `Produto ${index}`,
      qty: 1,
      soldCents: 100,
    }));
    const result = dashboardPerformanceSchema.safeParse({
      ...validPerformance,
      topProducts: sixProducts,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita topClients com clientId nulo (venda anônima não é ranking de cliente)", () => {
    const result = dashboardPerformanceSchema.safeParse({
      ...validPerformance,
      topClients: [{ ...validPerformance.topClients[0], clientId: null }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita objeto com campo faltando", () => {
    const { goal: _goal, ...incomplete } = validPerformance;
    const result = dashboardPerformanceSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dashboardTodaySchema (RF-12)
// ---------------------------------------------------------------------------

const validCollectionsGroupByClient = {
  clientId: "33333333-3333-4333-8333-333333333333",
  saleId: null,
  name: "Ana Souza",
  whatsapp: "5511999990000",
  amountCents: 5_000,
  installmentsCount: 2,
  oldestDueDate: "2026-09-10",
  overdue: true,
};

const validCollectionsGroupBySale = {
  clientId: null,
  saleId: "44444444-4444-4444-8444-444444444444",
  name: "Venda balcão",
  whatsapp: null,
  amountCents: 3_000,
  installmentsCount: 1,
  oldestDueDate: "2026-09-23",
  overdue: false,
};

const validToday = {
  today: "2026-09-23",
  collections: {
    overdueCount: 2,
    overdueCents: 5_000,
    dueTodayCount: 1,
    dueTodayCents: 3_000,
    next7Count: 3,
    next7Cents: 9_000,
    groupsTotal: 2,
    groups: [validCollectionsGroupByClient, validCollectionsGroupBySale],
  },
  appointments: {
    total: 1,
    items: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        kind: "demo" as const,
        title: "Sessão demonstrativa",
        startsAt: "2026-09-23T14:00:00.000Z",
        clientId: "33333333-3333-4333-8333-333333333333",
        clientName: "Ana Souza",
        clientWhatsapp: "5511999990000",
        leadId: null,
        leadName: null,
        leadWhatsapp: null,
      },
    ],
  },
  deliveries: {
    total: 1,
    totalCents: 12_000,
    items: [
      {
        saleId: "66666666-6666-4666-8666-666666666666",
        clientName: "Bia Lima",
        totalCents: 12_000,
        soldAt: "2026-09-20T13:00:00.000Z",
      },
    ],
  },
  newLeads: {
    total: 1,
    items: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Carla Nunes",
        whatsapp: "5511988887777",
        interest: "Base líquida",
        createdAt: "2026-09-23T10:00:00.000Z",
      },
    ],
  },
  restock: {
    shortCount: 1,
    missingQtyTotal: 2,
    items: [
      {
        productId: "88888888-8888-4888-8888-888888888888",
        name: "Máscara de Cílios",
        availableQty: -2,
        missingQty: 2,
      },
    ],
  },
  birthdays: [
    {
      clientId: "99999999-9999-4999-8999-999999999999",
      name: "Duda Ramos",
      whatsapp: "5511977776666",
      birthday: "1990-09-25",
      nextOn: "2026-09-25",
    },
  ],
};

describe("dashboardTodaySchema", () => {
  it("aceita um payload completo válido", () => {
    const result = dashboardTodaySchema.parse(validToday);
    expect(result.today).toBe("2026-09-23");
    expect(result.collections.groups).toHaveLength(2);
  });

  it("aceita restock e newLeads vazios (nada a fazer)", () => {
    const result = dashboardTodaySchema.parse({
      ...validToday,
      restock: { shortCount: 0, missingQtyTotal: 0, items: [] },
      newLeads: { total: 0, items: [] },
    });
    expect(result.restock.shortCount).toBe(0);
    expect(result.restock.missingQtyTotal).toBe(0);
    expect(result.newLeads.items).toEqual([]);
  });

  it("aceita missingQtyTotal maior que a soma dos itens exibidos (mais de 5 produtos em falta)", () => {
    const result = dashboardTodaySchema.parse({
      ...validToday,
      restock: { ...validToday.restock, shortCount: 7, missingQtyTotal: 42 },
    });
    expect(result.restock.missingQtyTotal).toBe(42);
  });

  it("rejeita grupo de cobrança com clientId e saleId ao mesmo tempo", () => {
    const result = dashboardTodaySchema.safeParse({
      ...validToday,
      collections: {
        ...validToday.collections,
        groups: [
          {
            ...validCollectionsGroupByClient,
            saleId: "44444444-4444-4444-8444-444444444444",
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita grupo de cobrança sem clientId nem saleId", () => {
    const result = dashboardTodaySchema.safeParse({
      ...validToday,
      collections: {
        ...validToday.collections,
        groups: [
          { ...validCollectionsGroupByClient, clientId: null, saleId: null },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita restock com availableQty não negativo (encomenda sem estoque exige disponível < 0)", () => {
    const result = dashboardTodaySchema.safeParse({
      ...validToday,
      restock: {
        shortCount: 1,
        missingQtyTotal: 2,
        items: [{ ...validToday.restock.items[0], availableQty: 0 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita birthdays com mais de 20 itens", () => {
    const manyBirthdays = Array.from({ length: 21 }, (_unused, index) => ({
      ...validToday.birthdays[0],
      clientId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
    }));
    const result = dashboardTodaySchema.safeParse({
      ...validToday,
      birthdays: manyBirthdays,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita objeto com campo faltando", () => {
    const { birthdays: _birthdays, ...incomplete } = validToday;
    const result = dashboardTodaySchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
