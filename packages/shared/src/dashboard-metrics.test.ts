import { describe, expect, it } from "vitest";
import {
  averageTicketCents,
  birthdayWindow,
  birthdayWindowRanked,
  classifyDelta,
  daysRemainingInMonth,
  deltaPercent,
  goalPace,
  marginPercent,
  nextBirthdayInWindow,
} from "./dashboard-metrics";

// ---------------------------------------------------------------------------
// RF-06 — averageTicketCents / marginPercent / deltaPercent / classifyDelta
// ---------------------------------------------------------------------------

describe("averageTicketCents", () => {
  it("floor(soldCents / soldCount)", () => {
    expect(averageTicketCents(1050, 3)).toBe(350);
    expect(averageTicketCents(1000, 3)).toBe(333);
  });

  it("null quando soldCount = 0", () => {
    expect(averageTicketCents(0, 0)).toBeNull();
  });
});

describe("marginPercent", () => {
  it("null quando soldCents = 0", () => {
    expect(marginPercent(500, 0)).toBeNull();
  });

  it("arredonda 12,5 para 13 (meio para longe do zero)", () => {
    expect(marginPercent(1250, 10_000)).toBe(13);
  });

  it("arredonda -12,5 para -13 (simétrico à alta)", () => {
    expect(marginPercent(-1250, 10_000)).toBe(-13);
  });

  it("lucro negativo dá margem negativa sem quebrar", () => {
    expect(marginPercent(-2000, 10_000)).toBe(-20);
  });

  it("margem exata sem arredondamento", () => {
    expect(marginPercent(3000, 10_000)).toBe(30);
  });
});

describe("deltaPercent", () => {
  it("null quando anterior = 0", () => {
    expect(deltaPercent(500, 0)).toBeNull();
  });

  it("null quando ambos são 0", () => {
    expect(deltaPercent(0, 0)).toBeNull();
  });

  it("null quando anterior é negativo", () => {
    expect(deltaPercent(500, -100)).toBeNull();
  });

  it("queda: 50 vs 100 ⇒ -50%", () => {
    expect(deltaPercent(50, 100)).toBe(-50);
  });

  it("alta: 150 vs 100 ⇒ +50%", () => {
    expect(deltaPercent(150, 100)).toBe(50);
  });

  it("meio exato arredonda para longe do zero", () => {
    // (125 - 100) * 100 / 100 = 25% (sem meio); testa um caso de x,5 real
    expect(deltaPercent(1125, 1000)).toBe(13); // 12,5% ⇒ 13
    expect(deltaPercent(875, 1000)).toBe(-13); // -12,5% ⇒ -13
  });
});

describe("classifyDelta", () => {
  it("ambos 0 ⇒ no_activity (sem movimento)", () => {
    expect(classifyDelta(0, 0)).toBe("no_activity");
  });

  it("anterior 0, atual ≠ 0 ⇒ no_base (sem base de comparação)", () => {
    expect(classifyDelta(500, 0)).toBe("no_base");
  });

  it("anterior negativo ⇒ no_base, mesmo com atual 0", () => {
    expect(classifyDelta(0, -100)).toBe("no_base");
  });

  it("anterior negativo com atual positivo ⇒ no_base", () => {
    expect(classifyDelta(500, -100)).toBe("no_base");
  });

  it("atual maior que anterior ⇒ up", () => {
    expect(classifyDelta(150, 100)).toBe("up");
  });

  it("atual menor que anterior ⇒ down", () => {
    expect(classifyDelta(50, 100)).toBe("down");
  });

  it("atual igual ao anterior (ambos > 0) ⇒ flat", () => {
    expect(classifyDelta(100, 100)).toBe("flat");
  });

  // S7 (rodada 2): variação positiva/negativa cujo PERCENTUAL ARREDONDADO é
  // 0 (< 0,5%) precisa virar `flat`, nunca `up`/`down` — senão a UI mostra
  // "▲ 0%"/"▼ 0%" (seta com zero), enganoso.
  it("alta cujo percentual arredondado é 0% (< 0,5%) ⇒ flat, nunca 'up'", () => {
    // (10_020 - 10_000) * 100 / 10_000 = 0,2% ⇒ arredonda para 0.
    expect(classifyDelta(10_020, 10_000)).toBe("flat");
  });

  it("queda cujo percentual arredondado é 0% (< 0,5%) ⇒ flat, nunca 'down'", () => {
    expect(classifyDelta(9_980, 10_000)).toBe("flat");
  });

  it("alta cujo percentual arredondado é exatamente 1% permanece 'up'", () => {
    // (10_050 - 10_000) * 100 / 10_000 = 0,5% ⇒ arredonda para 1 (meio para longe do zero).
    expect(classifyDelta(10_050, 10_000)).toBe("up");
  });
});

// ---------------------------------------------------------------------------
// RF-10 — goalPace / daysRemainingInMonth
// ---------------------------------------------------------------------------

describe("goalPace", () => {
  it("sem meta ⇒ no_goal", () => {
    expect(
      goalPace({ soldCents: 5000, goalCents: null, daysRemaining: 10 }),
    ).toEqual({
      status: "no_goal",
    });
  });

  it("meta batida ⇒ reached com o excedente", () => {
    expect(
      goalPace({ soldCents: 12_000, goalCents: 10_000, daysRemaining: 5 }),
    ).toEqual({ status: "reached", surplusCents: 2_000 });
  });

  it("meta batida exatamente ⇒ reached com excedente 0", () => {
    expect(
      goalPace({ soldCents: 10_000, goalCents: 10_000, daysRemaining: 5 }),
    ).toEqual({ status: "reached", surplusCents: 0 });
  });

  it("faltando valor ⇒ pending com falta e por dia (ceil)", () => {
    expect(
      goalPace({ soldCents: 4_000, goalCents: 10_000, daysRemaining: 5 }),
    ).toEqual({ status: "pending", remainingCents: 6_000, perDayCents: 1_200 });
  });

  it("por dia arredonda para cima (ceil) quando não divide exato", () => {
    expect(
      goalPace({ soldCents: 4_000, goalCents: 10_000, daysRemaining: 7 }),
    ).toEqual({
      status: "pending",
      remainingCents: 6_000,
      perDayCents: Math.ceil(6_000 / 7),
    });
  });

  it("último dia do mês (1 dia restante) ⇒ por dia = a falta inteira", () => {
    expect(
      goalPace({ soldCents: 4_000, goalCents: 10_000, daysRemaining: 1 }),
    ).toEqual({ status: "pending", remainingCents: 6_000, perDayCents: 6_000 });
  });
});

describe("daysRemainingInMonth", () => {
  it("último dia do mês ⇒ 1 (conta hoje)", () => {
    expect(daysRemainingInMonth("2026-09-30")).toBe(1);
  });

  it("meio do mês", () => {
    expect(daysRemainingInMonth("2026-09-23")).toBe(8);
  });

  it("primeiro dia do mês ⇒ todos os dias do mês", () => {
    expect(daysRemainingInMonth("2026-09-01")).toBe(30);
  });

  it("fevereiro bissexto", () => {
    expect(daysRemainingInMonth("2028-02-01")).toBe(29);
  });
});

// ---------------------------------------------------------------------------
// RF-12 — birthdayWindow / nextBirthdayInWindow
// ---------------------------------------------------------------------------

describe("birthdayWindow", () => {
  it("8 datas para days=7 (inclusive nas duas pontas)", () => {
    const window = birthdayWindow("2026-09-23", 7);
    expect(window).toHaveLength(8);
    expect(window[0]).toBe("09-23");
    expect(window[7]).toBe("09-30");
  });

  it("atravessa a virada do ano (27/12 até 03/01)", () => {
    const window = birthdayWindow("2026-12-27", 7);
    expect(window).toEqual([
      "12-27",
      "12-28",
      "12-29",
      "12-30",
      "12-31",
      "01-01",
      "01-02",
      "01-03",
    ]);
  });

  it("inclui 02-29 quando a janela contém 28/02 de ano NÃO bissexto", () => {
    const window = birthdayWindow("2026-02-25", 7);
    expect(window).toContain("02-28");
    expect(window).toContain("02-29");
  });

  it("não duplica 02-29 quando o ano é bissexto (já está na janela naturalmente)", () => {
    const window = birthdayWindow("2028-02-25", 7);
    const occurrences = window.filter((day) => day === "02-29").length;
    expect(occurrences).toBe(1);
  });

  it("não inclui 02-29 quando a janela não toca fevereiro", () => {
    const window = birthdayWindow("2026-05-01", 7);
    expect(window).not.toContain("02-29");
  });
});

describe("birthdayWindowRanked (A1: rank cronológico para o ORDER BY antes do LIMIT)", () => {
  it("rank sequencial (0 = hoje) para os dias naturais da janela", () => {
    const entries = birthdayWindowRanked("2026-09-23", 7);
    expect(entries).toEqual([
      { monthDay: "09-23", rank: 0 },
      { monthDay: "09-24", rank: 1 },
      { monthDay: "09-25", rank: 2 },
      { monthDay: "09-26", rank: 3 },
      { monthDay: "09-27", rank: 4 },
      { monthDay: "09-28", rank: 5 },
      { monthDay: "09-29", rank: 6 },
      { monthDay: "09-30", rank: 7 },
    ]);
  });

  it("02-29 entra com o MESMO rank de 02-28 em ano não bissexto (nunca no fim da lista)", () => {
    const entries = birthdayWindowRanked("2026-02-25", 7);
    const feb28 = entries.find((entry) => entry.monthDay === "02-28");
    const feb29 = entries.find((entry) => entry.monthDay === "02-29");

    expect(feb28).toBeDefined();
    expect(feb29).toEqual({ monthDay: "02-29", rank: feb28?.rank });
  });

  it("não duplica 02-29 em ano bissexto (mantém o rank natural do próprio dia)", () => {
    const entries = birthdayWindowRanked("2028-02-25", 7);
    const feb29Entries = entries.filter((entry) => entry.monthDay === "02-29");

    expect(feb29Entries).toHaveLength(1);
  });

  it("os monthDay batem 1:1 com birthdayWindow (mesma lista, com rank agregado)", () => {
    const ranked = birthdayWindowRanked("2026-02-25", 7);
    const plain = birthdayWindow("2026-02-25", 7);

    expect(ranked.map((entry) => entry.monthDay)).toEqual(plain);
  });
});

describe("nextBirthdayInWindow", () => {
  it("aniversário dentro da janela devolve a data deste ano", () => {
    expect(nextBirthdayInWindow("1990-09-25", "2026-09-23", 7)).toBe(
      "2026-09-25",
    );
  });

  it("aniversário fora da janela devolve null", () => {
    expect(nextBirthdayInWindow("1990-10-25", "2026-09-23", 7)).toBeNull();
  });

  it("hoje é o aniversário ⇒ dentro da janela (offset 0)", () => {
    expect(nextBirthdayInWindow("1990-09-23", "2026-09-23", 7)).toBe(
      "2026-09-23",
    );
  });

  it("29/02 em ano NÃO bissexto ⇒ 28/02 dentro da janela", () => {
    expect(nextBirthdayInWindow("1996-02-29", "2026-02-25", 7)).toBe(
      "2026-02-28",
    );
  });

  it("29/02 em ano bissexto ⇒ a própria data 29/02", () => {
    expect(nextBirthdayInWindow("1996-02-29", "2028-02-25", 7)).toBe(
      "2028-02-29",
    );
  });

  it("atravessa a virada do ano", () => {
    expect(nextBirthdayInWindow("1990-01-02", "2026-12-27", 7)).toBe(
      "2027-01-02",
    );
  });
});
