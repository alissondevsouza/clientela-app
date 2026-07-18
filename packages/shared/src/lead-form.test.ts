import { describe, expect, it } from "vitest";
import { type LeadFormValues, leadFormSchema } from "./lead-form";
import type { LeadCaptureRequest } from "./leads";

const validInput = {
  name: "Maria Silva",
  whatsapp: "11912345678",
  interest: "Cuidados com a pele",
  consent: true as const,
  website: "",
};

describe("leadFormSchema", () => {
  it("rejeita consentimento não aceito com a mensagem LGPD", () => {
    const result = leadFormSchema.safeParse({ ...validInput, consent: false });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperado parse inválido");
    }
    const consentIssue = result.error.issues.find(
      (issue) => issue.path[0] === "consent",
    );
    expect(consentIssue?.message).toBe(
      "É necessário aceitar o uso dos seus dados para contato",
    );
  });

  it("aceita input com consent boolean (default do RHF)", () => {
    const result = leadFormSchema.safeParse({ ...validInput, consent: true });

    expect(result.success).toBe(true);
  });

  it("preserva o honeypot website no output do parse", () => {
    const result = leadFormSchema.safeParse({
      ...validInput,
      website: "http://spam.example",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("esperado parse válido");
    }
    expect(result.data.website).toBe("http://spam.example");
  });

  it("aplica default vazio ao website quando ausente", () => {
    const result = leadFormSchema.safeParse({
      name: "Maria Silva",
      whatsapp: "11912345678",
      consent: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("esperado parse válido");
    }
    expect(result.data.website).toBe("");
  });

  it("produz output atribuível a LeadCaptureRequest (consent literal true)", () => {
    const result = leadFormSchema.safeParse(validInput);
    if (!result.success) {
      throw new Error("esperado parse válido");
    }

    // Prova de tipo: o output do form schema é aceito onde o contrato da API
    // (LeadCaptureRequest) é esperado — sem cast.
    const asRequest: LeadCaptureRequest = result.data;
    const values: LeadFormValues = result.data;

    expect(asRequest.consent).toBe(true);
    expect(values.consent).toBe(true);
  });
});
