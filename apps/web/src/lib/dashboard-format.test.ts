import { describe, expect, it } from "vitest";
import {
  formatDeltaText,
  formatMargin,
  formatTicket,
} from "./dashboard-format";

// O Intl.NumberFormat pt-BR separa "R$" do valor com espaço não separável
// (U+00A0), não espaço comum (mesma convenção de format.test.ts).
const NBSP = " ";

describe("formatDeltaText", () => {
  it("alta: seta para cima com o percentual", () => {
    expect(
      formatDeltaText({
        current: 112_00,
        previous: 100_00,
        shortLabel: "agosto",
      }),
    ).toEqual({ text: "▲ 12% vs agosto", direction: "up" });
  });

  it("queda: seta para baixo com o percentual (sempre positivo)", () => {
    expect(
      formatDeltaText({
        current: 92_00,
        previous: 100_00,
        shortLabel: "agosto",
      }),
    ).toEqual({ text: "▼ 8% vs agosto", direction: "down" });
  });

  it("igual: 0% sem seta", () => {
    expect(
      formatDeltaText({
        current: 100_00,
        previous: 100_00,
        shortLabel: "agosto",
      }),
    ).toEqual({ text: "0% vs agosto", direction: "flat" });
  });

  // S7 (rodada 2): alta/queda cujo percentual arredondado é 0% (< 0,5%) nunca
  // mostra seta com zero — vira "flat" ("0% vs …"), igual ao empate exato.
  it("alta com percentual arredondado 0% (< 0,5%): 0% sem seta, direção 'flat'", () => {
    expect(
      formatDeltaText({
        current: 10_020,
        previous: 10_000,
        shortLabel: "agosto",
      }),
    ).toEqual({ text: "0% vs agosto", direction: "flat" });
  });

  it("queda com percentual arredondado 0% (< 0,5%): 0% sem seta, direção 'flat'", () => {
    expect(
      formatDeltaText({
        current: 9_980,
        previous: 10_000,
        shortLabel: "agosto",
      }),
    ).toEqual({ text: "0% vs agosto", direction: "flat" });
  });

  it("sem base de comparação: anterior zero, atual diferente de zero", () => {
    expect(
      formatDeltaText({ current: 50_00, previous: 0, shortLabel: "agosto" }),
    ).toEqual({ text: "sem base de comparação", direction: "no_base" });
  });

  it("sem base de comparação: anterior negativo", () => {
    expect(
      formatDeltaText({ current: 50_00, previous: -10, shortLabel: "agosto" }),
    ).toEqual({ text: "sem base de comparação", direction: "no_base" });
  });

  it("sem movimento: os dois períodos exatamente zero", () => {
    expect(
      formatDeltaText({ current: 0, previous: 0, shortLabel: "agosto" }),
    ).toEqual({ text: "sem movimento", direction: "no_activity" });
  });
});

describe("formatMargin", () => {
  it("margem positiva", () => {
    expect(formatMargin(200_00, 600_00)).toBe("33%");
  });

  it("margem negativa mostra o sinal", () => {
    expect(formatMargin(-100_00, 1_000_00)).toBe("-10%");
  });

  it("sem base (vendido zero) ⇒ travessão", () => {
    expect(formatMargin(0, 0)).toBe("—");
  });
});

describe("formatTicket", () => {
  it("ticket médio formatado em reais (10.000,00 / 4 = 2.500,00)", () => {
    expect(formatTicket(10_000_00, 4)).toBe(`R$${NBSP}2.500,00`);
  });

  it("sem venda (soldCount zero) ⇒ travessão", () => {
    expect(formatTicket(0, 0)).toBe("—");
  });
});
