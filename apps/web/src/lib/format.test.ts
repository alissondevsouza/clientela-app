import { describe, expect, it } from "vitest";
import { formatBRL, formatDateBr } from "./format";

// O Intl.NumberFormat pt-BR separa o símbolo "R$" do valor com espaço não
// separável (U+00A0), não espaço comum. Os esperados usam o escape de propósito.
const NBSP = "\u00A0";

describe("formatBRL", () => {
  it("formata centavos com casas decimais", () => {
    expect(formatBRL(3550)).toBe(`R$${NBSP}35,50`);
  });

  it("formata zero", () => {
    expect(formatBRL(0)).toBe(`R$${NBSP}0,00`);
  });

  it("formata milhares com separador de milhar", () => {
    expect(formatBRL(129900)).toBe(`R$${NBSP}1.299,00`);
  });
});

describe("formatDateBr", () => {
  it("reordena uma data ISO yyyy-mm-dd para dd/mm/aaaa", () => {
    expect(formatDateBr("1990-05-10")).toBe("10/05/1990");
  });

  it("preserva o dia sem recuar por fuso (não passa por Date)", () => {
    expect(formatDateBr("2024-01-01")).toBe("01/01/2024");
  });

  it("retorna a própria string quando o formato é inesperado", () => {
    expect(formatDateBr("10/05/1990")).toBe("10/05/1990");
  });

  it("retorna a própria string para entrada vazia", () => {
    expect(formatDateBr("")).toBe("");
  });

  it("retorna a própria string para datetime ISO completo", () => {
    expect(formatDateBr("1990-05-10T00:00:00Z")).toBe("1990-05-10T00:00:00Z");
  });
});
