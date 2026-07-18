import { describe, expect, it } from "vitest";
import { createLeadSchema, leadCaptureRequestSchema } from "./leads";

describe("createLeadSchema", () => {
  it("aceita lead válido e normaliza o whatsapp para dígitos", () => {
    const result = createLeadSchema.parse({
      name: "Maria Silva",
      whatsapp: "(11) 98765-4321",
      interest: "Base líquida",
      consent: true,
    });
    expect(result.whatsapp).toBe("11987654321");
  });

  it("rejeita sem consentimento LGPD", () => {
    const result = createLeadSchema.safeParse({
      name: "Maria Silva",
      whatsapp: "11987654321",
      consent: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita whatsapp sem DDD (curto demais)", () => {
    const result = createLeadSchema.safeParse({
      name: "Maria Silva",
      whatsapp: "8765-4321",
      consent: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    const result = createLeadSchema.safeParse({
      name: " ",
      whatsapp: "11987654321",
      consent: true,
    });
    expect(result.success).toBe(false);
  });

  it("dá mensagem pt-BR quando o nome está ausente (invalid_type)", () => {
    const result = createLeadSchema.safeParse({
      whatsapp: "11987654321",
      consent: true,
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Informe seu nome completo");
    expect(message).not.toMatch(/invalid input|expected string|received/i);
  });

  it("dá mensagem pt-BR quando o whatsapp está ausente (invalid_type)", () => {
    const result = createLeadSchema.safeParse({
      name: "Maria Silva",
      consent: true,
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Informe um WhatsApp válido com DDD");
    expect(message).not.toMatch(/invalid input|expected string|received/i);
  });

  it("normaliza interest vazio ('') para ausente (coluna nullable fica NULL)", () => {
    const result = createLeadSchema.parse({
      name: "Maria Silva",
      whatsapp: "11987654321",
      interest: "",
      consent: true,
    });
    expect(result.interest).toBeUndefined();
  });

  it("normaliza interest só com espaços para ausente", () => {
    const result = createLeadSchema.parse({
      name: "Maria Silva",
      whatsapp: "11987654321",
      interest: "   ",
      consent: true,
    });
    expect(result.interest).toBeUndefined();
  });
});

describe("leadCaptureRequestSchema", () => {
  const validBase = {
    name: "Maria Silva",
    whatsapp: "(11) 98765-4321",
    consent: true,
  } as const;

  it("aceita request sem o campo honeypot (website ausente)", () => {
    const result = leadCaptureRequestSchema.parse(validBase);
    expect(result.website).toBeUndefined();
    expect(result.whatsapp).toBe("11987654321");
  });

  it("aceita website como string vazia (campo hidden do formulário)", () => {
    const result = leadCaptureRequestSchema.parse({
      ...validBase,
      website: "",
    });
    expect(result.website).toBe("");
  });

  it("preserva website preenchido sem interpretar (detecção fica no service)", () => {
    const result = leadCaptureRequestSchema.parse({
      ...validBase,
      website: "http://spam.example",
    });
    expect(result.website).toBe("http://spam.example");
  });

  it("mantém as validações de negócio de createLeadSchema", () => {
    const result = leadCaptureRequestSchema.safeParse({
      name: "Maria Silva",
      whatsapp: "8765-4321",
      consent: true,
    });
    expect(result.success).toBe(false);
  });
});
