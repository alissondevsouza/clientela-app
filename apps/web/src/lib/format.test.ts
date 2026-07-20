import { describe, expect, it } from "vitest";
import {
  centsToReaisInput,
  formatBRL,
  formatDateBr,
  parseBRLToCents,
} from "./format";

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

describe("centsToReaisInput", () => {
  it.each([
    [5990, "59,90"],
    [0, "0,00"],
    [100, "1,00"],
    [1234, "12,34"],
    [123456, "1234,56"],
    [5, "0,05"],
  ])("converte %d centavos na string editável %s", (cents, expected) => {
    expect(centsToReaisInput(cents)).toBe(expected);
  });
});

describe("parseBRLToCents", () => {
  // Tabela FIXA do spec (RF-07) — comportamento canônico, não derivar do código.
  it.each([
    ["12,34", 1234],
    ["12,3", 1230],
    ["12", 1200],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["R$ 12,34", 1234],
  ])("converte %s em %d centavos", (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected);
  });

  it.each([
    ["12,345"], // 3 casas decimais
    ["12.34"], // grupo de milhar inválido (não são 3 dígitos)
    [""], // vazio
    ["   "], // só espaços
    ["-12,34"], // negativo
    ["-12"], // negativo sem decimais
    ["+12,34"], // sinal positivo explícito
    ["R$"], // só o símbolo
    [",50"], // parte inteira vazia
    ["1,2,3"], // vírgula extra na parte inteira
    ["12,3.4"], // ponto na parte decimal
    ["1234,567"], // 3 casas com parte inteira longa
    ["abc"], // não numérico
    ["1.23"], // grupo de milhar com 2 dígitos
    ["1.2345"], // grupo de milhar com 4 dígitos
  ])("rejeita %s retornando null", (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it("aceita múltiplos grupos de milhar", () => {
    expect(parseBRLToCents("1.234.567,89")).toBe(123456789);
  });

  it("converte valor com apenas centavos", () => {
    expect(parseBRLToCents("0,99")).toBe(99);
  });

  it("aceita zeros à esquerda na parte inteira", () => {
    expect(parseBRLToCents("00,5")).toBe(50);
  });

  it("preenche uma casa decimal para dois dígitos", () => {
    expect(parseBRLToCents("7,5")).toBe(750);
  });

  it("ignora o símbolo e espaços internos ao redor do valor", () => {
    expect(parseBRLToCents("  R$ 1.299,00  ")).toBe(129900);
  });
});
