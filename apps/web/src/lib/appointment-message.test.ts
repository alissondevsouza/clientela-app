import { describe, expect, it } from "vitest";
import {
  type AppointmentMessageInput,
  buildConfirmationWhatsAppUrl,
} from "./appointment-message";

const CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const LEAD_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e60";

const baseAppointment: AppointmentMessageInput = {
  clientId: null,
  clientName: null,
  clientWhatsapp: null,
  leadId: null,
  leadName: null,
  leadWhatsapp: null,
  startsAt: "2026-08-05T23:30:00.000Z",
};

describe("buildConfirmationWhatsAppUrl", () => {
  it("monta a mensagem e a URL wa.me para o cliente vinculado (data/hora no fuso de referência)", () => {
    const appointment: AppointmentMessageInput = {
      ...baseAppointment,
      clientId: CLIENT_ID,
      clientName: "Maria Silva",
      clientWhatsapp: "5511912345678",
    };

    const url = buildConfirmationWhatsAppUrl(appointment);

    expect(url).not.toBeNull();
    const parsed = new URL(url as string);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      "https://wa.me/5511912345678",
    );
    expect(parsed.searchParams.get("text")).toBe(
      "Olá, Maria Silva! Passando para confirmar nosso compromisso no dia 05/08 às 20:30. Podemos manter o horário?",
    );
  });

  it("monta a mensagem e a URL wa.me para o lead vinculado quando não há cliente", () => {
    const appointment: AppointmentMessageInput = {
      ...baseAppointment,
      leadId: LEAD_ID,
      leadName: "Joana Souza",
      leadWhatsapp: "11987654321",
      startsAt: "2026-08-06T02:00:00.000Z",
    };

    const url = buildConfirmationWhatsAppUrl(appointment);

    expect(url).not.toBeNull();
    const parsed = new URL(url as string);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      "https://wa.me/5511987654321",
    );
    expect(parsed.searchParams.get("text")).toBe(
      "Olá, Joana Souza! Passando para confirmar nosso compromisso no dia 05/08 às 23:00. Podemos manter o horário?",
    );
  });

  it("cliente tem precedência sobre lead quando ambos estão preenchidos", () => {
    const appointment: AppointmentMessageInput = {
      ...baseAppointment,
      clientId: CLIENT_ID,
      clientName: "Maria Silva",
      clientWhatsapp: "5511912345678",
      leadId: LEAD_ID,
      leadName: "Joana Souza",
      leadWhatsapp: "11987654321",
    };

    const url = buildConfirmationWhatsAppUrl(appointment);

    expect(url).not.toBeNull();
    expect(url).toContain("wa.me/5511912345678");
    expect(url).toContain("Maria%20Silva");
  });

  it("devolve null quando não há pessoa vinculada", () => {
    const url = buildConfirmationWhatsAppUrl(baseAppointment);

    expect(url).toBeNull();
  });

  it("devolve null quando a pessoa vinculada não tem WhatsApp", () => {
    const appointment: AppointmentMessageInput = {
      ...baseAppointment,
      clientId: CLIENT_ID,
      clientName: "Maria Silva",
      clientWhatsapp: null,
    };

    const url = buildConfirmationWhatsAppUrl(appointment);

    expect(url).toBeNull();
  });

  it("devolve null (sem lançar) quando o WhatsApp é inválido", () => {
    const appointment: AppointmentMessageInput = {
      ...baseAppointment,
      clientId: CLIENT_ID,
      clientName: "Maria Silva",
      clientWhatsapp: "123",
    };

    expect(() => buildConfirmationWhatsAppUrl(appointment)).not.toThrow();
    expect(buildConfirmationWhatsAppUrl(appointment)).toBeNull();
  });

  it("percent-encoda nome com acento e espaço no texto da URL", () => {
    const appointment: AppointmentMessageInput = {
      ...baseAppointment,
      clientId: CLIENT_ID,
      clientName: "José Ápice",
      clientWhatsapp: "5511912345678",
    };

    const url = buildConfirmationWhatsAppUrl(appointment);

    expect(url).not.toBeNull();
    expect(url).toContain("Jos%C3%A9%20%C3%81pice");
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain("José Ápice");
  });
});
