import { describe, expect, it } from "vitest";
import {
  installmentAmountPreviewCents,
  lineSubtotalCents,
  parseQtyInput,
  totalCents,
} from "./sale-total";

describe("parseQtyInput", () => {
  it("aceita inteiro positivo", () => {
    expect(parseQtyInput("3")).toBe(3);
    expect(parseQtyInput(" 12 ")).toBe(12);
  });

  it("rejeita vazio, zero, negativo, decimal e não-numérico", () => {
    expect(parseQtyInput("")).toBeNull();
    expect(parseQtyInput("   ")).toBeNull();
    expect(parseQtyInput("0")).toBeNull();
    expect(parseQtyInput("-1")).toBeNull();
    expect(parseQtyInput("2.5")).toBeNull();
    expect(parseQtyInput("abc")).toBeNull();
  });
});

describe("lineSubtotalCents", () => {
  it("multiplica preço (reais → centavos) pela quantidade", () => {
    expect(lineSubtotalCents("59,90", "2")).toBe(11980);
    expect(lineSubtotalCents("R$ 1.234,56", "1")).toBe(123456);
  });

  it("retorna null quando o preço é inválido", () => {
    expect(lineSubtotalCents("12,345", "1")).toBeNull();
    expect(lineSubtotalCents("", "1")).toBeNull();
  });

  it("retorna null quando a quantidade é inválida", () => {
    expect(lineSubtotalCents("10,00", "0")).toBeNull();
    expect(lineSubtotalCents("10,00", "")).toBeNull();
  });
});

describe("totalCents", () => {
  it("soma os subtotais válidos", () => {
    expect(
      totalCents([
        { price: "10,00", qty: "2" },
        { price: "5,50", qty: "3" },
      ]),
    ).toBe(3650);
  });

  it("ignora linhas inválidas no total", () => {
    expect(
      totalCents([
        { price: "10,00", qty: "2" },
        { price: "12,345", qty: "1" },
        { price: "5,00", qty: "" },
      ]),
    ).toBe(2000);
  });

  it("total vazio é zero", () => {
    expect(totalCents([])).toBe(0);
  });
});

describe("installmentAmountPreviewCents", () => {
  it("retorna a primeira/maior parcela com resto", () => {
    expect(installmentAmountPreviewCents(10000, 3)).toBe(3334);
  });

  it("parcela única é o total", () => {
    expect(installmentAmountPreviewCents(10000, 1)).toBe(10000);
  });

  it("retorna null quando o total é menor que o número de parcelas", () => {
    expect(installmentAmountPreviewCents(2, 3)).toBeNull();
  });

  it("retorna null para número de parcelas inválido", () => {
    expect(installmentAmountPreviewCents(10000, 0)).toBeNull();
    expect(installmentAmountPreviewCents(10000, 1.5)).toBeNull();
  });
});
