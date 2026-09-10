import { describe, expect, it } from "vitest";
import { dashboardSummarySchema, updateGoalSchema } from "./dashboard";

const validSummary = {
  monthSalesCents: 150_000,
  monthProfitCents: 45_000,
  monthSalesCount: 3,
  openSalesCents: 35_000,
  openSalesCount: 2,
  pendingReceivablesCents: 20_000,
  overdueReceivablesCents: 5_000,
  overdueReceivablesCount: 1,
  monthlyGoalCents: 200_000,
  monthLabel: "julho de 2026",
} as const;

const firstMessage = (
  result:
    | ReturnType<typeof dashboardSummarySchema.safeParse>
    | ReturnType<typeof updateGoalSchema.safeParse>,
): string => {
  if (result.success) {
    throw new Error("esperava falha de validação");
  }
  return result.error.issues[0]?.message ?? "";
};

describe("dashboardSummarySchema", () => {
  it("aceita um objeto válido com meta definida", () => {
    const result = dashboardSummarySchema.parse(validSummary);
    expect(result).toEqual(validSummary);
  });

  it("aceita monthProfitCents negativo (venda no prejuízo)", () => {
    const result = dashboardSummarySchema.parse({
      ...validSummary,
      monthProfitCents: -12_345,
    });
    expect(result.monthProfitCents).toBe(-12_345);
  });

  it("aceita monthlyGoalCents null (sem meta definida)", () => {
    const result = dashboardSummarySchema.parse({
      ...validSummary,
      monthlyGoalCents: null,
    });
    expect(result.monthlyGoalCents).toBeNull();
  });

  it("aceita totais e contagem de vendas abertas independentes do realizado", () => {
    const result = dashboardSummarySchema.parse({
      ...validSummary,
      openSalesCents: 42_500,
      openSalesCount: 4,
    });

    expect(result.openSalesCents).toBe(42_500);
    expect(result.openSalesCount).toBe(4);
  });

  it.each([
    ["openSalesCents", -1],
    ["openSalesCount", -1],
  ] as const)("rejeita %s negativo", (field, value) => {
    const result = dashboardSummarySchema.safeParse({
      ...validSummary,
      [field]: value,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita monthlyGoalCents 0 (meta deve ser > 0 quando presente)", () => {
    const result = dashboardSummarySchema.safeParse({
      ...validSummary,
      monthlyGoalCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita objeto com campo faltando", () => {
    const { monthSalesCents: _monthSalesCents, ...incomplete } = validSummary;
    const result = dashboardSummarySchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("rejeita monthLabel vazio", () => {
    const result = dashboardSummarySchema.safeParse({
      ...validSummary,
      monthLabel: "",
    });
    expect(result.success).toBe(false);
  });
});

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
