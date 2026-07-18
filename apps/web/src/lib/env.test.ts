import { describe, expect, it } from "vitest";
import { DEFAULT_WHATSAPP_MESSAGE, loadWebEnv } from "./env";

const VALID_PHONE = "5511912345678";
const VALID_API_URL = "http://localhost:3001";
const VALID_SITE_URL = "http://localhost:3000";

const validSource = {
  WHATSAPP_PHONE: VALID_PHONE,
  API_URL: VALID_API_URL,
  SITE_URL: VALID_SITE_URL,
};

describe("loadWebEnv", () => {
  it("aceita env válida e mantém a mensagem informada", () => {
    const env = loadWebEnv({
      ...validSource,
      WHATSAPP_DEFAULT_MESSAGE: "Olá, tudo bem?",
    });

    expect(env.WHATSAPP_PHONE).toBe(VALID_PHONE);
    expect(env.WHATSAPP_DEFAULT_MESSAGE).toBe("Olá, tudo bem?");
    expect(env.API_URL).toBe(VALID_API_URL);
  });

  it("aplica o default da mensagem quando WHATSAPP_DEFAULT_MESSAGE ausente", () => {
    const env = loadWebEnv(validSource);

    expect(env.WHATSAPP_DEFAULT_MESSAGE).toBe(DEFAULT_WHATSAPP_MESSAGE);
  });

  it("aceita telefone com símbolos (validação por dígitos)", () => {
    const env = loadWebEnv({
      ...validSource,
      WHATSAPP_PHONE: "+55 (11) 91234-5678",
    });

    expect(env.WHATSAPP_PHONE).toBe("+55 (11) 91234-5678");
  });

  it("aceita API_URL https", () => {
    const env = loadWebEnv({
      ...validSource,
      API_URL: "https://api.clientela.app",
    });

    expect(env.API_URL).toBe("https://api.clientela.app");
  });

  it("aceita SITE_URL https", () => {
    const env = loadWebEnv({
      ...validSource,
      SITE_URL: "https://clientela.app",
    });

    expect(env.SITE_URL).toBe("https://clientela.app");
  });

  it("rejeita WHATSAPP_PHONE ausente citando a variável", () => {
    expect(() => loadWebEnv({ API_URL: VALID_API_URL })).toThrow(
      /WHATSAPP_PHONE/,
    );
  });

  it("rejeita WHATSAPP_PHONE com poucos dígitos citando a variável", () => {
    expect(() =>
      loadWebEnv({ ...validSource, WHATSAPP_PHONE: "5511" }),
    ).toThrow(/WHATSAPP_PHONE/);
  });

  it("rejeita API_URL ausente citando a variável", () => {
    expect(() => loadWebEnv({ WHATSAPP_PHONE: VALID_PHONE })).toThrow(
      /API_URL/,
    );
  });

  it("rejeita API_URL que não é http(s) citando a variável", () => {
    expect(() =>
      loadWebEnv({ ...validSource, API_URL: "ftp://api.example" }),
    ).toThrow(/API_URL/);
  });

  it("rejeita API_URL malformada citando a variável", () => {
    expect(() => loadWebEnv({ ...validSource, API_URL: "not a url" })).toThrow(
      /API_URL/,
    );
  });

  it("rejeita SITE_URL ausente citando a variável", () => {
    expect(() =>
      loadWebEnv({ WHATSAPP_PHONE: VALID_PHONE, API_URL: VALID_API_URL }),
    ).toThrow(/SITE_URL/);
  });

  it("rejeita SITE_URL que não é http(s) citando a variável", () => {
    expect(() =>
      loadWebEnv({ ...validSource, SITE_URL: "ftp://clientela.app" }),
    ).toThrow(/SITE_URL/);
  });

  it("não vaza o valor inválido na mensagem de erro", () => {
    const invalido = "123";
    let message = "";
    try {
      loadWebEnv({ ...validSource, WHATSAPP_PHONE: invalido });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/WHATSAPP_PHONE/);
    expect(message).not.toContain(invalido);
  });
});
