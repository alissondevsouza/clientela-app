import { describe, expect, it } from "vitest";
import { goalOriginText, goalPaceText, monthFullLabel } from "./goal-view";

// O Intl.NumberFormat pt-BR separa "R$" do valor com espaço não separável
// (U+00A0), não espaço comum (mesma convenção de format.test.ts).
const NBSP = "\u00A0";

describe("monthFullLabel", () => {
  it("mês por extenso com ano (RF-10/RF-24)", () => {
    expect(monthFullLabel("2026-08")).toBe("agosto de 2026");
  });
});

describe("goalOriginText (RF-10/RF-24)", () => {
  it("meta explícita do mês CORRENTE", () => {
    expect(goalOriginText("explicit", null, "2026-09", true)).toBe(
      "Definida para este mês",
    );
  });

  // S2 (rodada 2): "Definida para este mês" num mês PASSADO é enganoso — usa
  // o mês por extenso, igual ao restante da tela (visão de julho/2026).
  it("meta explícita de um mês PASSADO usa o mês por extenso, nunca 'este mês'", () => {
    expect(goalOriginText("explicit", null, "2026-07", false)).toBe(
      "Definida para julho de 2026",
    );
  });

  it("meta herdada de um mês anterior", () => {
    expect(goalOriginText("inherited", "2026-08", "2026-09", true)).toBe(
      "Mesma meta de agosto de 2026",
    );
  });

  it("meta herdada sem mês de origem é contrato quebrado (lança)", () => {
    expect(() => goalOriginText("inherited", null, "2026-09", true)).toThrow();
  });

  it("origem 'none' nunca deveria chegar aqui (lança)", () => {
    expect(() => goalOriginText("none", null, "2026-09", true)).toThrow();
  });
});

describe("goalPaceText (RF-10)", () => {
  it("ritmo pendente: falta valor, dias restantes plural, por dia", () => {
    expect(
      goalPaceText({
        soldCents: 100_000,
        goalCents: 200_000,
        daysRemaining: 5,
      }),
    ).toBe(`Faltam R$${NBSP}1.000,00 em 5 dias — R$${NBSP}200,00 por dia`);
  });

  it("ritmo pendente com 1 dia restante usa singular", () => {
    expect(
      goalPaceText({
        soldCents: 190_000,
        goalCents: 200_000,
        daysRemaining: 1,
      }),
    ).toBe(`Faltam R$${NBSP}100,00 em 1 dia — R$${NBSP}100,00 por dia`);
  });

  it("meta batida mostra o excedente", () => {
    expect(
      goalPaceText({
        soldCents: 250_000,
        goalCents: 200_000,
        daysRemaining: 5,
      }),
    ).toBe(`Meta batida! R$${NBSP}500,00 acima`);
  });

  it("meta exatamente batida (Vendido = meta) mostra excedente zero", () => {
    expect(
      goalPaceText({
        soldCents: 200_000,
        goalCents: 200_000,
        daysRemaining: 5,
      }),
    ).toBe(`Meta batida! R$${NBSP}0,00 acima`);
  });
});
