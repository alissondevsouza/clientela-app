import { describe, expect, it } from "vitest";
import { goalProgressPercent } from "./goal-progress";

describe("goalProgressPercent", () => {
  it("retorna 0% quando não há vendas no mês", () => {
    expect(goalProgressPercent(0, 100000)).toBe(0);
  });

  it("calcula o percentual parcial por divisão inteira (floor)", () => {
    expect(goalProgressPercent(75000, 100000)).toBe(75);
  });

  it("retorna exatamente 100% quando as vendas igualam a meta", () => {
    expect(goalProgressPercent(100000, 100000)).toBe(100);
  });

  it("não capa acima de 100% — retorna o percentual real", () => {
    expect(goalProgressPercent(150000, 100000)).toBe(150);
  });

  it("arredonda para baixo (floor) em divisões não exatas", () => {
    expect(goalProgressPercent(1, 3)).toBe(33);
  });

  it("retorna 0 defensivamente quando a meta é zero (guarda de divisão por zero)", () => {
    expect(goalProgressPercent(50000, 0)).toBe(0);
  });

  it("retorna 0 defensivamente quando a meta é negativa", () => {
    expect(goalProgressPercent(50000, -1)).toBe(0);
  });
});
