import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl } from "./google-calendar";

describe("buildGoogleCalendarUrl", () => {
  it("monta a URL TEMPLATE com dates em UTC YYYYMMDDTHHMMSSZ", () => {
    const url = buildGoogleCalendarUrl({
      title: "Análise de pele",
      startsAt: "2026-08-05T13:00:00.000Z",
      durationMinutes: 60,
    });

    expect(url).toBe(
      "https://calendar.google.com/calendar/render?action=TEMPLATE&text=An%C3%A1lise%20de%20pele&dates=20260805T130000Z%2F20260805T140000Z",
    );
  });

  it("calcula o fim pela duração, com virada de dia", () => {
    const url = buildGoogleCalendarUrl({
      title: "Follow-up",
      startsAt: "2026-08-05T23:30:00.000Z",
      durationMinutes: 45,
    });

    expect(url).toContain("dates=20260805T233000Z%2F20260806T001500Z");
  });

  it("calcula o fim pela duração, com virada de mês", () => {
    const url = buildGoogleCalendarUrl({
      title: "Entrega",
      startsAt: "2026-08-31T23:00:00.000Z",
      durationMinutes: 120,
    });

    expect(url).toContain("dates=20260831T230000Z%2F20260901T010000Z");
  });

  it("percent-encoda título, local e descrição com acentos, espaços e &", () => {
    const url = buildGoogleCalendarUrl({
      title: "Sessão & degustação",
      details: "Levar catálogo, blush & batom",
      location: "Av. São João, 100",
      startsAt: "2026-08-05T13:00:00.000Z",
      durationMinutes: 30,
    });

    expect(url).toContain("text=Sess%C3%A3o%20%26%20degusta%C3%A7%C3%A3o");
    expect(url).toContain(
      "details=Levar%20cat%C3%A1logo%2C%20blush%20%26%20batom",
    );
    expect(url).toContain("location=Av.%20S%C3%A3o%20Jo%C3%A3o%2C%20100");
  });

  it("omite details e location quando ausentes (sem parâmetro vazio)", () => {
    const url = buildGoogleCalendarUrl({
      title: "Demo",
      startsAt: "2026-08-05T13:00:00.000Z",
      durationMinutes: 30,
    });

    expect(url).not.toContain("details=");
    expect(url).not.toContain("location=");
  });

  it("omite details e location quando null ou string vazia", () => {
    const url = buildGoogleCalendarUrl({
      title: "Demo",
      details: null,
      location: "",
      startsAt: "2026-08-05T13:00:00.000Z",
      durationMinutes: 30,
    });

    expect(url).not.toContain("details=");
    expect(url).not.toContain("location=");
  });

  it("sempre inclui action=TEMPLATE e text mesmo sem detalhes opcionais", () => {
    const url = buildGoogleCalendarUrl({
      title: "Demo",
      startsAt: "2026-08-05T13:00:00.000Z",
      durationMinutes: 30,
    });

    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(
      true,
    );
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Demo");
  });
});
