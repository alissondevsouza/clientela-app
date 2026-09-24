import { describe, expect, it } from "vitest";
import {
  birthdayDayLabel,
  formatDayMonthBr,
  sectionCountSuffix,
} from "./dashboard-today-format";

describe("formatDayMonthBr", () => {
  it("formata dd/mm sem ano", () => {
    expect(formatDayMonthBr("2026-09-05")).toBe("05/09");
  });

  it("entrada fora do formato ISO volta como está (fail-safe)", () => {
    expect(formatDayMonthBr("not-a-date")).toBe("not-a-date");
  });
});

describe("birthdayDayLabel", () => {
  it("nextOn igual a hoje ⇒ 'hoje'", () => {
    expect(birthdayDayLabel("2026-09-23", "2026-09-23")).toBe("hoje");
  });

  it("nextOn diferente de hoje ⇒ dd/mm", () => {
    expect(birthdayDayLabel("2026-09-27", "2026-09-23")).toBe("27/09");
  });

  it("janela atravessando o ano (27/12 avaliada em 30/12) ⇒ dd/mm do nextOn", () => {
    expect(birthdayDayLabel("2027-01-03", "2026-12-30")).toBe("03/01");
  });
});

describe("sectionCountSuffix (A2: contagem no cabeçalho de cada seção do Hoje)", () => {
  it("contagem positiva ⇒ ' · N'", () => {
    expect(sectionCountSuffix(7)).toBe(" · 7");
    expect(sectionCountSuffix(1)).toBe(" · 1");
  });

  it("zero ou negativo ⇒ string vazia (fail-safe; seção sem itens não é renderizada)", () => {
    expect(sectionCountSuffix(0)).toBe("");
    expect(sectionCountSuffix(-1)).toBe("");
  });
});
