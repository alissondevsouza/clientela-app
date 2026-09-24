import {
  birthdayWindowRanked,
  dashboardPeriodQuerySchema,
  daysRemainingInMonth,
  lastDayOfYearMonth,
  monthsEndingAt,
  nextBirthdayInWindow,
  periodBoundsUtc,
  resolveDashboardPeriod,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { InvalidDashboardPeriodError } from "./dashboard.errors";
import {
  createDashboardService,
  type DashboardPerformanceData,
  type DashboardPerformanceQueryInput,
  type DashboardPerformanceRepositoryPort,
  type DashboardTodayData,
  type DashboardTodayQueryInput,
  type DashboardTodayRepositoryPort,
  type EffectiveGoalRow,
} from "./dashboard.service";

const CONSULTANT_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";

const FIXED_METRICS = {
  soldCents: 10_000,
  soldCount: 2,
  profitCents: 3_000,
  receivedCents: 8_000,
  clientsCount: 2,
};

const FIXED_PERFORMANCE_DATA: DashboardPerformanceData = {
  current: FIXED_METRICS,
  previous: { ...FIXED_METRICS, soldCents: 5_000 },
  series: monthsEndingAt("2026-09", 12).map((month) => ({
    month,
    soldCents: 0,
    profitCents: 0,
  })),
  topProducts: [],
  topClients: [],
  goal: null,
};

const EMPTY_TODAY_DATA: Omit<DashboardTodayData, "birthdays"> = {
  collections: {
    overdueCount: 0,
    overdueCents: 0,
    dueTodayCount: 0,
    dueTodayCents: 0,
    next7Count: 0,
    next7Cents: 0,
    groupsTotal: 0,
    groups: [],
  },
  appointments: { total: 0, items: [] },
  deliveries: { total: 0, totalCents: 0, items: [] },
  newLeads: { total: 0, items: [] },
  restock: { shortCount: 0, missingQtyTotal: 0, items: [] },
};

type FakePerformanceOptions = {
  performanceResult?: DashboardPerformanceData;
  upsertGoalImpl?: (
    consultantId: string,
    monthStart: string,
    goalCents: number | null,
  ) => Promise<number | null>;
};

const createFakePerformanceRepository = (
  options: FakePerformanceOptions = {},
) => {
  const calls: {
    performance: {
      consultantId: string;
      input: DashboardPerformanceQueryInput;
    }[];
    upsertGoal: {
      consultantId: string;
      monthStart: string;
      goalCents: number | null;
    }[];
  } = { performance: [], upsertGoal: [] };

  const repository: DashboardPerformanceRepositoryPort = {
    performance: async (consultantId, input) => {
      calls.performance.push({ consultantId, input });
      return options.performanceResult ?? FIXED_PERFORMANCE_DATA;
    },
    upsertGoal: async (consultantId, monthStart, goalCents) => {
      calls.upsertGoal.push({ consultantId, monthStart, goalCents });
      if (options.upsertGoalImpl) {
        return options.upsertGoalImpl(consultantId, monthStart, goalCents);
      }
      return goalCents;
    },
  };

  return { repository, calls };
};

type FakeTodayOptions = {
  todayResult?: DashboardTodayData;
};

const createFakeTodayRepository = (options: FakeTodayOptions = {}) => {
  const calls: { consultantId: string; input: DashboardTodayQueryInput }[] = [];

  const repository: DashboardTodayRepositoryPort = {
    today: async (consultantId, input) => {
      calls.push({ consultantId, input });
      return options.todayResult ?? { ...EMPTY_TODAY_DATA, birthdays: [] };
    },
  };

  return { repository, calls };
};

const buildService = (
  options: {
    performanceOptions?: FakePerformanceOptions;
    todayOptions?: FakeTodayOptions;
    clock?: () => Date;
  } = {},
) => {
  const { repository: performanceRepository, calls: performanceCalls } =
    createFakePerformanceRepository(options.performanceOptions);
  const { repository: todayRepository, calls: todayCalls } =
    createFakeTodayRepository(options.todayOptions);
  const clock = options.clock ?? (() => new Date());

  return {
    service: createDashboardService({
      performanceRepository,
      todayRepository,
      clock,
    }),
    performanceCalls,
    todayCalls,
  };
};

// 2026-10-01T02:30:00Z = 2026-09-30T23:30 em America/Sao_Paulo (UTC-3): a
// borda do mês local está a 23h30 do dia 30 de setembro — o critério exato
// pedido no prompt da task (Task 4.3).
const CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL = () =>
  new Date("2026-10-01T02:30:00.000Z");

describe("dashboardService.getPerformance", () => {
  it("resolve o período padrão (mês corrente pelo relógio local) e passa os bounds corretos ao repository", async () => {
    const { service, performanceCalls } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    expect(performance.period.kind).toBe("month");
    expect(performance.period.fromMonth).toBe("2026-09");
    expect(performance.period.toMonth).toBe("2026-09");
    expect(performance.period.startDate).toBe("2026-09-01");
    expect(performance.period.endDate).toBe("2026-09-30");
    expect(performance.period.inProgress).toBe(true);

    expect(performanceCalls.performance).toHaveLength(1);
    const [call] = performanceCalls.performance;
    if (!call) {
      throw new Error("performance não foi chamado");
    }
    const { consultantId, input } = call;
    expect(consultantId).toBe(CONSULTANT_A);
    expect(input.current).toEqual(periodBoundsUtc("2026-09-01", "2026-09-30"));
    expect(input.topLimit).toBe(5);
  });

  it("calcula a comparação (RF-03) com os mesmos bounds resolvidos por resolveDashboardPeriod", async () => {
    const { service, performanceCalls } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    const resolved = resolveDashboardPeriod(
      dashboardPeriodQuerySchema.parse({}),
      "2026-09-30",
    );
    if (!resolved.ok || resolved.period.comparison === null) {
      throw new Error("período de teste deveria ter comparação");
    }
    const expectedPrevious = periodBoundsUtc(
      resolved.period.comparison.startDate,
      resolved.period.comparison.endDate,
    );

    expect(performanceCalls.performance[0]?.input.previous).toEqual(
      expectedPrevious,
    );
  });

  it("monta a série de 12 meses terminando em toMonth com bounds de mês inteiro local", async () => {
    const { service, performanceCalls } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    const expectedMonths = monthsEndingAt("2026-09", 12).map((month) => ({
      month,
      ...periodBoundsUtc(`${month}-01`, lastDayOfYearMonth(month)),
    }));

    expect(performanceCalls.performance[0]?.input.series).toEqual(
      expectedMonths,
    );
  });

  it("mês futuro lança InvalidDashboardPeriodError (nunca 500 cru)", async () => {
    const { service } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    await expect(
      service.getPerformance(
        CONSULTANT_A,
        dashboardPeriodQuerySchema.parse({ period: "month", month: "2026-10" }),
      ),
    ).rejects.toThrow(InvalidDashboardPeriodError);
  });

  it("ano futuro lança InvalidDashboardPeriodError com a mensagem pt-BR de resolveDashboardPeriod", async () => {
    const { service } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    await expect(
      service.getPerformance(
        CONSULTANT_A,
        dashboardPeriodQuerySchema.parse({ period: "year", year: "2027" }),
      ),
    ).rejects.toThrow(/ano corrente/);
  });

  it("meta explicit: linha do próprio mês, editable no mês corrente, daysRemaining do relógio", async () => {
    const explicitGoal: EffectiveGoalRow = {
      goalCents: 100_000,
      monthStart: "2026-09-01",
    };
    const { service } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
      performanceOptions: {
        performanceResult: { ...FIXED_PERFORMANCE_DATA, goal: explicitGoal },
      },
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    expect(performance.goal).toEqual({
      month: "2026-09",
      goalCents: 100_000,
      source: "explicit",
      inheritedFromMonth: null,
      editable: true,
      daysRemaining: daysRemainingInMonth("2026-09-30"),
    });
  });

  it("meta inherited: linha de um mês anterior sem linha própria no mês consultado", async () => {
    const inheritedGoal: EffectiveGoalRow = {
      goalCents: 80_000,
      monthStart: "2026-07-01",
    };
    const { service } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
      performanceOptions: {
        performanceResult: { ...FIXED_PERFORMANCE_DATA, goal: inheritedGoal },
      },
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    expect(performance.goal?.source).toBe("inherited");
    expect(performance.goal?.inheritedFromMonth).toBe("2026-07");
    expect(performance.goal?.goalCents).toBe(80_000);
  });

  it("meta none: nenhuma linha <= mês consultado", async () => {
    const { service } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
      performanceOptions: {
        performanceResult: { ...FIXED_PERFORMANCE_DATA, goal: null },
      },
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    expect(performance.goal).toEqual({
      month: "2026-09",
      goalCents: null,
      source: "none",
      inheritedFromMonth: null,
      editable: true,
      daysRemaining: daysRemainingInMonth("2026-09-30"),
    });
  });

  it("meta removida explicitamente: linha do próprio mês com goal_cents NULL vira source 'none' (A6)", async () => {
    const removedGoal: EffectiveGoalRow = {
      goalCents: null,
      monthStart: "2026-09-01",
    };
    const { service } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
      performanceOptions: {
        performanceResult: { ...FIXED_PERFORMANCE_DATA, goal: removedGoal },
      },
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    expect(performance.goal).toEqual({
      month: "2026-09",
      goalCents: null,
      source: "none",
      inheritedFromMonth: null,
      editable: true,
      daysRemaining: daysRemainingInMonth("2026-09-30"),
    });
  });

  it("meta removida num mês anterior herdaria 'inherited', mas vira 'none' porque a linha efetiva tem goal_cents NULL (A6)", async () => {
    const removedGoal: EffectiveGoalRow = {
      goalCents: null,
      monthStart: "2026-07-01",
    };
    const { service } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
      performanceOptions: {
        performanceResult: { ...FIXED_PERFORMANCE_DATA, goal: removedGoal },
      },
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({}),
    );

    expect(performance.goal?.source).toBe("none");
    expect(performance.goal?.goalCents).toBeNull();
    expect(performance.goal?.inheritedFromMonth).toBeNull();
  });

  it("mês passado (kind=month, não corrente): não editável e sem ritmo (daysRemaining=0)", async () => {
    const explicitGoal: EffectiveGoalRow = {
      goalCents: 60_000,
      monthStart: "2026-08-01",
    };
    const { service, performanceCalls } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
      performanceOptions: {
        performanceResult: { ...FIXED_PERFORMANCE_DATA, goal: explicitGoal },
      },
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({ period: "month", month: "2026-08" }),
    );

    expect(performance.goal?.editable).toBe(false);
    expect(performance.goal?.daysRemaining).toBe(0);
    expect(performanceCalls.performance[0]?.input.goalMonthStart).toBe(
      "2026-08-01",
    );
  });

  it("kind diferente de month: goal nulo na resposta e repository não consulta meta", async () => {
    const { service, performanceCalls } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    const performance = await service.getPerformance(
      CONSULTANT_A,
      dashboardPeriodQuerySchema.parse({ period: "year" }),
    );

    expect(performance.goal).toBeNull();
    expect(performanceCalls.performance[0]?.input.goalMonthStart).toBeNull();
  });
});

// 2026-09-20T15:00:00Z = 2026-09-20T12:00 em America/Sao_Paulo (sem cruzar
// virada de dia) — datas previsíveis para os bounds/janela do Hoje.
const CLOCK_MID_SEPTEMBER_LOCAL = () => new Date("2026-09-20T15:00:00.000Z");
const TODAY_ISO_MID_SEPTEMBER = "2026-09-20";

describe("dashboardService.getToday", () => {
  it("resolve hoje/bounds do dia/janela de 7 dias e repassa ao repository", async () => {
    const { service, todayCalls } = buildService({
      clock: CLOCK_MID_SEPTEMBER_LOCAL,
      todayOptions: { todayResult: { ...EMPTY_TODAY_DATA, birthdays: [] } },
    });

    const today = await service.getToday(CONSULTANT_A);

    expect(today.today).toBe(TODAY_ISO_MID_SEPTEMBER);
    expect(todayCalls).toHaveLength(1);
    const [call] = todayCalls;
    if (!call) {
      throw new Error("today não foi chamado");
    }
    const { consultantId, input } = call;
    expect(consultantId).toBe(CONSULTANT_A);
    expect(input.todayIso).toBe(TODAY_ISO_MID_SEPTEMBER);
    expect(input.next7EndIso).toBe("2026-09-27");
    expect(input.birthdayEntries).toEqual(
      birthdayWindowRanked(TODAY_ISO_MID_SEPTEMBER, 7),
    );
  });

  it("calcula nextOn de cada aniversariante e ordena por nextOn/nome", async () => {
    const { service } = buildService({
      clock: CLOCK_MID_SEPTEMBER_LOCAL,
      todayOptions: {
        todayResult: {
          ...EMPTY_TODAY_DATA,
          birthdays: [
            {
              clientId: "11111111-1111-7111-8111-111111111111",
              name: "Zeca",
              whatsapp: "11900000000",
              birthday: "1990-09-22",
            },
            {
              clientId: "22222222-2222-7222-8222-222222222222",
              name: "Ana",
              whatsapp: "11900000001",
              birthday: "1985-09-22",
            },
            {
              clientId: "33333333-3333-7333-8333-333333333333",
              name: "Bia",
              whatsapp: "11900000002",
              birthday: "1992-09-21",
            },
          ],
        },
      },
    });

    const today = await service.getToday(CONSULTANT_A);

    expect(today.birthdays.map((row) => row.name)).toEqual([
      "Bia",
      "Ana",
      "Zeca",
    ]);
    expect(today.birthdays[0]?.nextOn).toBe(
      nextBirthdayInWindow("1992-09-21", TODAY_ISO_MID_SEPTEMBER, 7),
    );
  });

  it("lança quando um aniversariante devolvido pelo repository está fora da janela calculada (invariante)", async () => {
    const { service } = buildService({
      clock: CLOCK_MID_SEPTEMBER_LOCAL,
      todayOptions: {
        todayResult: {
          ...EMPTY_TODAY_DATA,
          birthdays: [
            {
              clientId: "44444444-4444-7444-8444-444444444444",
              name: "Fora da janela",
              whatsapp: "11900000003",
              birthday: "1990-01-01",
            },
          ],
        },
      },
    });

    await expect(service.getToday(CONSULTANT_A)).rejects.toThrow(
      /fora da janela/,
    );
  });
});

describe("dashboardService.updateMonthlyGoal", () => {
  it("grava a meta do mês local corrente (borda de 23h30 locais)", async () => {
    const { service, performanceCalls } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    const result = await service.updateMonthlyGoal(CONSULTANT_A, 120_000);

    expect(performanceCalls.upsertGoal).toEqual([
      {
        consultantId: CONSULTANT_A,
        monthStart: "2026-09-01",
        goalCents: 120_000,
      },
    ]);
    expect(result).toEqual({ month: "2026-09", monthlyGoalCents: 120_000 });
  });

  it("null remove a meta a partir do mês corrente", async () => {
    const { service, performanceCalls } = buildService({
      clock: CLOCK_LAST_DAY_OF_SEPTEMBER_LOCAL,
    });

    const result = await service.updateMonthlyGoal(CONSULTANT_A, null);

    expect(performanceCalls.upsertGoal).toEqual([
      { consultantId: CONSULTANT_A, monthStart: "2026-09-01", goalCents: null },
    ]);
    expect(result).toEqual({ month: "2026-09", monthlyGoalCents: null });
  });
});
