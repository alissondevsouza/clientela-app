import { describe, expect, it } from "vitest";
import {
  createLeadCrmSchema,
  createLeadSchema,
  crmLeadSchema,
  leadCaptureRequestSchema,
  leadsListQuerySchema,
  updateLeadStatusSchema,
} from "./leads";

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

describe("createLeadCrmSchema (RF-24, crm-appointments)", () => {
  it("aceita nome e whatsapp válidos, normalizando o whatsapp para dígitos", () => {
    const result = createLeadCrmSchema.parse({
      name: "Maria Silva",
      whatsapp: "(11) 98765-4321",
    });
    expect(result).toEqual({ name: "Maria Silva", whatsapp: "11987654321" });
  });

  it("não exige nem aceita campo de consentimento", () => {
    expect("consent" in createLeadCrmSchema.shape).toBe(false);
  });

  it("não exige nem aceita o honeypot da captura pública", () => {
    expect("website" in createLeadCrmSchema.shape).toBe(false);
  });

  it("não exige nem aceita interesse", () => {
    expect("interest" in createLeadCrmSchema.shape).toBe(false);
  });

  it("rejeita whatsapp inválido com a mesma mensagem pt-BR de createLeadSchema", () => {
    const result = createLeadCrmSchema.safeParse({
      name: "Maria Silva",
      whatsapp: "8765-4321",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "Informe um WhatsApp válido com DDD",
    );
  });

  it("rejeita nome ausente com a mesma mensagem pt-BR de createLeadSchema", () => {
    const result = createLeadCrmSchema.safeParse({
      whatsapp: "11987654321",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe("Informe seu nome completo");
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

describe("crmLeadSchema", () => {
  const validLead = {
    id: "018f8b3a-0000-7000-8000-000000000000",
    name: "Maria Silva",
    whatsapp: "11987654321",
    interest: "Base líquida",
    source: "landing",
    status: "new",
    clientId: null,
    createdAt: "2026-07-18T12:00:00.000Z",
  } as const;

  it("aceita lead com clientId null (não convertido)", () => {
    const result = crmLeadSchema.parse(validLead);
    expect(result.clientId).toBeNull();
    expect(result.status).toBe("new");
  });

  it("aceita lead convertido com clientId uuid preenchido", () => {
    const result = crmLeadSchema.parse({
      ...validLead,
      status: "converted",
      clientId: "018f8b3a-1111-7000-8000-000000000000",
    });
    expect(result.clientId).toBe("018f8b3a-1111-7000-8000-000000000000");
  });

  it("aceita interest null", () => {
    const result = crmLeadSchema.parse({ ...validLead, interest: null });
    expect(result.interest).toBeNull();
  });

  it("rejeita status fora do enum", () => {
    const result = crmLeadSchema.safeParse({ ...validLead, status: "unknown" });
    expect(result.success).toBe(false);
  });
});

describe("leadsListQuerySchema", () => {
  it("aplica defaults de paginação sem filtro de status", () => {
    const result = leadsListQuerySchema.parse({});
    expect(result).toEqual({ page: 1, perPage: 20 });
  });

  it("aceita filtro de status válido do enum", () => {
    const result = leadsListQuerySchema.parse({ status: "contacted" });
    expect(result.status).toBe("contacted");
  });

  it("rejeita status inválido com mensagem pt-BR", () => {
    const result = leadsListQuerySchema.safeParse({ status: "banana" });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Status de lead inválido");
    expect(message).not.toMatch(/invalid|expected|received|enum/i);
  });

  it("aceita search presente e combina com status/paginação (RF-14)", () => {
    const result = leadsListQuerySchema.parse({
      search: "Maria",
      status: "new",
      page: 2,
      perPage: 10,
    });
    expect(result).toEqual({
      search: "Maria",
      status: "new",
      page: 2,
      perPage: 10,
    });
  });

  it("search ausente continua válido (chamadas existentes sem o parâmetro)", () => {
    const result = leadsListQuerySchema.parse({});
    expect(result).toEqual({ page: 1, perPage: 20 });
    expect("search" in result).toBe(false);
  });

  it("aceita search vazio (a interpretação de vazio é do service, não do schema)", () => {
    const result = leadsListQuerySchema.parse({ search: "" });
    expect(result.search).toBe("");
  });

  it("rejeita search acima de 100 caracteres com mensagem pt-BR", () => {
    const result = leadsListQuerySchema.safeParse({
      search: "a".repeat(101),
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("A busca deve ter no máximo 100 caracteres");
  });
});

describe("updateLeadStatusSchema", () => {
  it("aceita new, contacted e discarded", () => {
    for (const status of ["new", "contacted", "discarded"] as const) {
      const result = updateLeadStatusSchema.parse({ status });
      expect(result.status).toBe(status);
    }
  });

  it("rejeita 'converted' (não settável via PATCH) com mensagem pt-BR", () => {
    const result = updateLeadStatusSchema.safeParse({ status: "converted" });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Status inválido: use novo, contatado ou descartado");
    expect(message).not.toMatch(/invalid|expected|received|enum/i);
  });

  it("rejeita status ausente ({}) com mensagem pt-BR (lesson Zod v4)", () => {
    const result = updateLeadStatusSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Status inválido: use novo, contatado ou descartado");
    expect(message).not.toMatch(/invalid|expected|received|enum/i);
  });
});
