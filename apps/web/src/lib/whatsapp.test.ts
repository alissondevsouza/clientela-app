import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, toWaPhone } from "./whatsapp";

describe("buildWhatsAppUrl", () => {
  it("normaliza telefone com +, espaços, hífens e parênteses para dígitos", () => {
    const url = buildWhatsAppUrl({ phone: "+55 (11) 91234-5678" });

    expect(url).toBe("https://wa.me/5511912345678");
  });

  it("urlencoda mensagem com espaços e acentos", () => {
    const url = buildWhatsAppUrl({
      phone: "5511912345678",
      message: "Olá! Quero saber mais",
    });

    expect(url).toBe(
      "https://wa.me/5511912345678?text=Ol%C3%A1!%20Quero%20saber%20mais",
    );
  });

  it("urlencoda mensagem com emoji", () => {
    const url = buildWhatsAppUrl({
      phone: "5511912345678",
      message: "Oi 😀",
    });

    expect(url).toBe("https://wa.me/5511912345678?text=Oi%20%F0%9F%98%80");
  });

  it("não inclui ?text quando não há mensagem", () => {
    const url = buildWhatsAppUrl({ phone: "5511912345678" });

    expect(url).toBe("https://wa.me/5511912345678");
  });

  it("não inclui ?text quando a mensagem é string vazia", () => {
    const url = buildWhatsAppUrl({ phone: "5511912345678", message: "" });

    expect(url).toBe("https://wa.me/5511912345678");
  });

  it("aceita o mínimo de 10 dígitos", () => {
    const url = buildWhatsAppUrl({ phone: "1234567890" });

    expect(url).toBe("https://wa.me/1234567890");
  });

  it("aceita o máximo de 15 dígitos", () => {
    const url = buildWhatsAppUrl({ phone: "123456789012345" });

    expect(url).toBe("https://wa.me/123456789012345");
  });

  it("lança erro claro para telefone com menos de 10 dígitos", () => {
    expect(() => buildWhatsAppUrl({ phone: "5511" })).toThrow(
      /Número de WhatsApp inválido/,
    );
  });

  it("lança erro claro para telefone com mais de 15 dígitos", () => {
    expect(() => buildWhatsAppUrl({ phone: "1234567890123456" })).toThrow(
      /Número de WhatsApp inválido/,
    );
  });

  it("lança erro para entrada sem dígitos", () => {
    expect(() => buildWhatsAppUrl({ phone: "abc-def" })).toThrow(
      /Número de WhatsApp inválido/,
    );
  });
});

describe("toWaPhone", () => {
  it("prefixa 55 em número local de 11 dígitos (celular com DDD)", () => {
    expect(toWaPhone("11912345678")).toBe("5511912345678");
  });

  it("prefixa 55 em número local de 10 dígitos (fixo com DDD)", () => {
    expect(toWaPhone("1132345678")).toBe("551132345678");
  });

  it("passa direto número de 13 dígitos já iniciando em 55", () => {
    expect(toWaPhone("5511912345678")).toBe("5511912345678");
  });

  it("passa direto número de 12 dígitos já iniciando em 55", () => {
    expect(toWaPhone("551132345678")).toBe("551132345678");
  });

  it("retorna como está número de 12 dígitos que não inicia em 55", () => {
    expect(toWaPhone("111912345678")).toBe("111912345678");
  });

  it("retorna como está entrada curta demais (fallthrough)", () => {
    expect(toWaPhone("1234")).toBe("1234");
  });

  it("retorna como está entrada longa demais (fallthrough)", () => {
    expect(toWaPhone("12345678901234")).toBe("12345678901234");
  });

  it("compõe com buildWhatsAppUrl para número local de 11 dígitos", () => {
    expect(buildWhatsAppUrl({ phone: toWaPhone("11912345678") })).toBe(
      "https://wa.me/5511912345678",
    );
  });
});
