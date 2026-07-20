import { describe, expect, it } from "vitest";
import {
  createDashboardService,
  type DashboardRepositoryPort,
  type DashboardSummaryData,
} from "./dashboard.service";

const CONSULTANT_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";

const FIXED_SUMMARY_DATA: DashboardSummaryData = {
  monthSalesCents: 15_000,
  monthProfitCents: 4_200,
  monthSalesCount: 3,
  pendingReceivablesCents: 9_000,
  overdueReceivablesCents: 2_000,
  overdueReceivablesCount: 1,
  monthlyGoalCents: 20_000,
};

type FakeOptions = {
  summaryResult?: DashboardSummaryData;
  updateGoalImpl?: (
    consultantId: string,
    monthlyGoalCents: number | null,
  ) => Promise<number | null>;
};

const createFakeRepository = (options: FakeOptions = {}) => {
  const calls: {
    summary: string[];
    updateGoal: { consultantId: string; monthlyGoalCents: number | null }[];
  } = { summary: [], updateGoal: [] };

  const repository: DashboardRepositoryPort = {
    summary: async (consultantId: string) => {
      calls.summary.push(consultantId);
      return options.summaryResult ?? FIXED_SUMMARY_DATA;
    },
    updateGoal: async (consultantId: string, monthlyGoalCents) => {
      calls.updateGoal.push({ consultantId, monthlyGoalCents });
      if (options.updateGoalImpl) {
        return options.updateGoalImpl(consultantId, monthlyGoalCents);
      }
      return monthlyGoalCents;
    },
  };

  return { repository, calls };
};

const buildService = (options: FakeOptions = {}, clock = () => new Date()) => {
  const { repository, calls } = createFakeRepository(options);
  return { service: createDashboardService({ repository, clock }), calls };
};

describe("dashboardService.getSummary", () => {
  it("repassa os agregados do repository e monta o monthLabel em pt-BR a partir do relógio injetado", async () => {
    const { service, calls } = buildService(
      { summaryResult: FIXED_SUMMARY_DATA },
      () => new Date("2026-07-19T12:00:00.000Z"),
    );

    const summary = await service.getSummary(CONSULTANT_A);

    expect(calls.summary).toEqual([CONSULTANT_A]);
    expect(summary).toEqual({
      ...FIXED_SUMMARY_DATA,
      monthLabel: "julho de 2026",
    });
  });

  it("monta o monthLabel de outro mês/ano corretamente (dezembro)", async () => {
    const { service } = buildService(
      { summaryResult: FIXED_SUMMARY_DATA },
      () => new Date("2025-12-05T00:00:00.000Z"),
    );

    const summary = await service.getSummary(CONSULTANT_A);

    expect(summary.monthLabel).toBe("dezembro de 2025");
  });

  it("repassa monthProfitCents negativo sem alterar (venda no prejuízo)", async () => {
    const { service } = buildService({
      summaryResult: { ...FIXED_SUMMARY_DATA, monthProfitCents: -500 },
    });

    const summary = await service.getSummary(CONSULTANT_A);

    expect(summary.monthProfitCents).toBe(-500);
  });

  it("repassa monthlyGoalCents null sem meta definida", async () => {
    const { service } = buildService({
      summaryResult: { ...FIXED_SUMMARY_DATA, monthlyGoalCents: null },
    });

    const summary = await service.getSummary(CONSULTANT_A);

    expect(summary.monthlyGoalCents).toBeNull();
  });
});

describe("dashboardService.updateGoal", () => {
  it("repassa o valor informado ao repository e devolve o valor gravado", async () => {
    const { service, calls } = buildService();

    const result = await service.updateGoal(CONSULTANT_A, {
      monthlyGoalCents: 50_000,
    });

    expect(calls.updateGoal).toEqual([
      { consultantId: CONSULTANT_A, monthlyGoalCents: 50_000 },
    ]);
    expect(result).toBe(50_000);
  });

  it("repassa null (remoção da meta) ao repository", async () => {
    const { service, calls } = buildService();

    const result = await service.updateGoal(CONSULTANT_A, {
      monthlyGoalCents: null,
    });

    expect(calls.updateGoal).toEqual([
      { consultantId: CONSULTANT_A, monthlyGoalCents: null },
    ]);
    expect(result).toBeNull();
  });
});
