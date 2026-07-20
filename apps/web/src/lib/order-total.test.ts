import { describe, expect, it } from "vitest";
import {
  orderEstimatedTotalCents,
  orderItemSubtotalCents,
  parseOrderQtyInput,
  resolveUnitCostCents,
} from "./order-total";

describe("parseOrderQtyInput", () => {
  it("aceita inteiro positivo", () => {
    expect(parseOrderQtyInput("3")).toBe(3);
    expect(parseOrderQtyInput(" 12 ")).toBe(12);
  });

  it("rejeita vazio, zero, negativo, decimal e não-numérico", () => {
    expect(parseOrderQtyInput("")).toBeNull();
    expect(parseOrderQtyInput("0")).toBeNull();
    expect(parseOrderQtyInput("-1")).toBeNull();
    expect(parseOrderQtyInput("2.5")).toBeNull();
    expect(parseOrderQtyInput("abc")).toBeNull();
  });
});

describe("resolveUnitCostCents", () => {
  it("usa o valor digitado quando presente", () => {
    expect(resolveUnitCostCents("12,34", 999)).toBe(1234);
  });

  it("usa o custo de fallback (do produto) quando o campo está vazio", () => {
    expect(resolveUnitCostCents("", 1500)).toBe(1500);
    expect(resolveUnitCostCents("   ", 1500)).toBe(1500);
  });

  it("vazio sem produto selecionado (fallback null) resolve para null", () => {
    expect(resolveUnitCostCents("", null)).toBeNull();
  });

  it("formato pt-BR inválido retorna null mesmo com fallback disponível", () => {
    expect(resolveUnitCostCents("12,345", 1500)).toBeNull();
  });
});

describe("orderItemSubtotalCents", () => {
  it("multiplica quantidade pelo custo unitário digitado", () => {
    expect(orderItemSubtotalCents("2", "10,00", null)).toBe(2000);
  });

  it("usa o custo do produto quando o campo de custo está vazio", () => {
    expect(orderItemSubtotalCents("3", "", 500)).toBe(1500);
  });

  it("retorna null quando a quantidade é inválida", () => {
    expect(orderItemSubtotalCents("0", "10,00", null)).toBeNull();
    expect(orderItemSubtotalCents("", "10,00", 100)).toBeNull();
  });

  it("retorna null quando não há custo disponível (vazio e sem fallback)", () => {
    expect(orderItemSubtotalCents("2", "", null)).toBeNull();
  });
});

describe("orderEstimatedTotalCents", () => {
  it("soma os subtotais válidos", () => {
    expect(
      orderEstimatedTotalCents([
        { qty: "2", unitCost: "10,00", fallbackCents: null },
        { qty: "1", unitCost: "", fallbackCents: 550 },
      ]),
    ).toBe(2550);
  });

  it("ignora linhas inválidas no total", () => {
    expect(
      orderEstimatedTotalCents([
        { qty: "2", unitCost: "10,00", fallbackCents: null },
        { qty: "0", unitCost: "5,00", fallbackCents: null },
        { qty: "1", unitCost: "", fallbackCents: null },
      ]),
    ).toBe(2000);
  });

  it("total vazio é zero", () => {
    expect(orderEstimatedTotalCents([])).toBe(0);
  });
});
