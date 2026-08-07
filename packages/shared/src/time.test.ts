import { afterEach, describe, expect, it } from "vitest";
import {
  APP_TIME_ZONE,
  appLocalDateIso,
  appLocalDateTimeToUtc,
  appLocalDayRangeUtc,
  appLocalTimeHm,
  appointmentDayBucket,
} from "./time";

describe("APP_TIME_ZONE", () => {
  it("é America/Sao_Paulo (ADR-0018)", () => {
    expect(APP_TIME_ZONE).toBe("America/Sao_Paulo");
  });
});

describe("appLocalDateIso", () => {
  it("20:30 BRT (2026-08-05T23:30:00Z) cai no dia 2026-08-05, não 06", () => {
    expect(appLocalDateIso("2026-08-05T23:30:00Z")).toBe("2026-08-05");
  });

  it("23:00 BRT do dia anterior (2026-08-06T02:00:00Z) ainda é 2026-08-05", () => {
    expect(appLocalDateIso("2026-08-06T02:00:00Z")).toBe("2026-08-05");
  });

  it("meia-noite local exata pertence ao novo dia", () => {
    // 2026-08-05T00:00:00-03:00 = 2026-08-05T03:00:00Z
    expect(appLocalDateIso("2026-08-05T03:00:00.000Z")).toBe("2026-08-05");
    // um ms antes ainda é o dia anterior
    expect(appLocalDateIso("2026-08-05T02:59:59.999Z")).toBe("2026-08-04");
  });
});

describe("appLocalTimeHm", () => {
  it("extrai HH:mm no fuso local", () => {
    expect(appLocalTimeHm("2026-08-05T23:30:00Z")).toBe("20:30");
    expect(appLocalTimeHm("2026-08-06T02:00:00Z")).toBe("23:00");
  });
});

describe("appLocalDateTimeToUtc", () => {
  it("compõe 05/08 às 20:00 (BRT, sem DST em 2026) em 23:00 UTC", () => {
    expect(appLocalDateTimeToUtc("2026-08-05", "20:00")).toBe(
      "2026-08-05T23:00:00.000Z",
    );
  });

  it("meia-noite local", () => {
    expect(appLocalDateTimeToUtc("2026-08-05", "00:00")).toBe(
      "2026-08-05T03:00:00.000Z",
    );
  });

  it("prova que o offset NÃO é fixo: janeiro de 2018 (Brasil em horário de verão, offset -02:00)", () => {
    // Brasil teve DST de 2017-10-15 a 2018-02-18; 15/jan/2018 cai dentro do
    // período — offset -02:00, não -03:00. Se a implementação usasse offset
    // fixo, o resultado seria 15:00Z (errado); o correto é 14:00Z.
    expect(appLocalDateTimeToUtc("2018-01-15", "12:00")).toBe(
      "2018-01-15T14:00:00.000Z",
    );
  });

  it("ida e volta: compor → ler devolve os valores originais", () => {
    const cases: Array<[string, string]> = [
      ["2026-08-05", "20:00"],
      ["2026-01-01", "00:00"],
      ["2026-12-31", "23:59"],
      ["2018-01-15", "12:00"],
    ];
    for (const [dateIso, timeHm] of cases) {
      const instant = appLocalDateTimeToUtc(dateIso, timeHm);
      expect(appLocalDateIso(instant)).toBe(dateIso);
      expect(appLocalTimeHm(instant)).toBe(timeHm);
    }
  });

  describe("independência do fuso do processo (TZ forçado)", () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    });

    it("resultado não muda com TZ do processo = UTC", () => {
      process.env.TZ = "UTC";
      expect(appLocalDateTimeToUtc("2026-08-05", "20:00")).toBe(
        "2026-08-05T23:00:00.000Z",
      );
      expect(appLocalDateIso("2026-08-05T23:30:00Z")).toBe("2026-08-05");
    });

    it("resultado não muda com TZ do processo = Asia/Tokyo", () => {
      process.env.TZ = "Asia/Tokyo";
      expect(appLocalDateTimeToUtc("2026-08-05", "20:00")).toBe(
        "2026-08-05T23:00:00.000Z",
      );
      expect(appLocalDateIso("2026-08-05T23:30:00Z")).toBe("2026-08-05");
    });
  });
});

describe("appLocalDayRangeUtc", () => {
  it("devolve bounds [startUtc, endUtc) do dia local", () => {
    const { startUtc, endUtc } = appLocalDayRangeUtc("2026-08-05");
    expect(startUtc).toBe("2026-08-05T03:00:00.000Z");
    expect(endUtc).toBe("2026-08-06T03:00:00.000Z");
  });

  it("um compromisso às 20:30 BRT de 05/08 cai dentro dos bounds do dia 05/08", () => {
    const { startUtc, endUtc } = appLocalDayRangeUtc("2026-08-05");
    const startsAt = "2026-08-05T23:30:00.000Z";
    expect(startsAt >= startUtc && startsAt < endUtc).toBe(true);
  });

  it("cruza virada de ano corretamente", () => {
    const { startUtc, endUtc } = appLocalDayRangeUtc("2025-12-31");
    expect(startUtc).toBe("2025-12-31T03:00:00.000Z");
    expect(endUtc).toBe("2026-01-01T03:00:00.000Z");
  });
});

describe("appointmentDayBucket", () => {
  const TODAY = "2026-08-05";

  it("data anterior a hoje é 'past'", () => {
    expect(appointmentDayBucket("2026-08-04", TODAY)).toBe("past");
  });

  it("a própria data de hoje é 'today'", () => {
    expect(appointmentDayBucket(TODAY, TODAY)).toBe("today");
  });

  it("amanhã (1º dia) é 'next7'", () => {
    expect(appointmentDayBucket("2026-08-06", TODAY)).toBe("next7");
  });

  it("virada do 7º dia: exatamente +7 ainda é 'next7', +8 já é 'later'", () => {
    expect(appointmentDayBucket("2026-08-12", TODAY)).toBe("next7"); // +7
    expect(appointmentDayBucket("2026-08-13", TODAY)).toBe("later"); // +8
  });
});
