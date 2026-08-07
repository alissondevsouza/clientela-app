import { describe, expect, it } from "vitest";
import {
  appointmentConflictsQuerySchema,
  appointmentListItemSchema,
  appointmentSchema,
  appointmentsListQuerySchema,
  completeAppointmentSchema,
  createAppointmentSchema,
  linkAppointmentSaleSchema,
  resolveAppointmentPerson,
  updateAppointmentSchema,
} from "./appointments";

const CLIENT_ID = "018f8b3a-0000-7000-8000-000000000000";
const LEAD_ID = "018f8b3a-1111-7000-8000-000000000000";
const SALE_ID = "018f8b3a-2222-7000-8000-000000000000";

const validMinimal = {
  kind: "demo",
  startsAt: "2026-08-05T20:00:00.000Z",
  durationMinutes: 30,
} as const;

const firstMessage = (result: {
  success: boolean;
  error?: { issues: Array<{ message: string }> };
}): string => result.error?.issues[0]?.message ?? "";

describe("createAppointmentSchema", () => {
  it("aceita o mínimo válido (sem pessoa)", () => {
    const result = createAppointmentSchema.parse(validMinimal);
    expect(result.kind).toBe("demo");
    expect(result.clientId).toBeUndefined();
    expect(result.leadId).toBeUndefined();
  });

  it("aceita com clientId apenas", () => {
    const result = createAppointmentSchema.parse({
      ...validMinimal,
      clientId: CLIENT_ID,
    });
    expect(result.clientId).toBe(CLIENT_ID);
  });

  it("aceita com leadId apenas", () => {
    const result = createAppointmentSchema.parse({
      ...validMinimal,
      leadId: LEAD_ID,
    });
    expect(result.leadId).toBe(LEAD_ID);
  });

  it("rejeita clientId e leadId juntos com mensagem pt-BR", () => {
    const result = createAppointmentSchema.safeParse({
      ...validMinimal,
      clientId: CLIENT_ID,
      leadId: LEAD_ID,
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "Informe cliente ou lead, nunca os dois ao mesmo tempo",
    );
  });

  it("dá mensagem pt-BR quando 'kind' está ausente (invalid_type)", () => {
    const result = createAppointmentSchema.safeParse({
      startsAt: validMinimal.startsAt,
      durationMinutes: validMinimal.durationMinutes,
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = firstMessage(result);
    expect(message).toBe("Tipo de compromisso inválido");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });

  it("rejeita kind fora do enum (presente-inválido) com mensagem pt-BR", () => {
    const result = createAppointmentSchema.safeParse({
      ...validMinimal,
      kind: "banana",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(firstMessage(result)).toBe("Tipo de compromisso inválido");
  });

  it("rejeita durationMinutes 0, negativo e 1441", () => {
    for (const durationMinutes of [0, -1, 1441]) {
      const result = createAppointmentSchema.safeParse({
        ...validMinimal,
        durationMinutes,
      });
      expect(result.success).toBe(false);
    }
  });

  it("aceita durationMinutes nos limites 1 e 1440", () => {
    for (const durationMinutes of [1, 1440]) {
      const result = createAppointmentSchema.safeParse({
        ...validMinimal,
        durationMinutes,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita title acima de 120 caracteres", () => {
    const result = createAppointmentSchema.safeParse({
      ...validMinimal,
      title: "a".repeat(121),
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(firstMessage(result)).toBe(
      "O título deve ter no máximo 120 caracteres",
    );
  });

  it("rejeita location acima de 160 caracteres", () => {
    const result = createAppointmentSchema.safeParse({
      ...validMinimal,
      location: "a".repeat(161),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita notes acima de 1000 caracteres", () => {
    const result = createAppointmentSchema.safeParse({
      ...validMinimal,
      notes: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita startsAt inválido", () => {
    const result = createAppointmentSchema.safeParse({
      ...validMinimal,
      startsAt: "05/08/2026 20:00",
    });
    expect(result.success).toBe(false);
  });

  it("aceita startsAt no passado (RF-04: registro retroativo permitido)", () => {
    const result = createAppointmentSchema.safeParse({
      ...validMinimal,
      startsAt: "2020-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateAppointmentSchema", () => {
  it("rejeita body vazio com mensagem pt-BR", () => {
    const result = updateAppointmentSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(firstMessage(result)).toBe(
      "Informe ao menos um campo para atualizar",
    );
  });

  it("campo ausente não aparece no output (preserva o valor atual)", () => {
    const result = updateAppointmentSchema.parse({ location: "Sala 2" });
    expect(Object.keys(result)).toEqual(["location"]);
    expect("clientId" in result).toBe(false);
    expect("leadId" in result).toBe(false);
  });

  it("clientId: null explícito desvincula (chave presente com valor null)", () => {
    const result = updateAppointmentSchema.parse({ clientId: null });
    expect(result).toEqual({ clientId: null });
    expect(result.clientId).toBeNull();
  });

  it("leadId: null explícito desvincula só o lead, sem tocar clientId", () => {
    const result = updateAppointmentSchema.parse({ leadId: null });
    expect(Object.keys(result)).toEqual(["leadId"]);
    expect(result.leadId).toBeNull();
  });

  it("rejeita clientId e leadId juntos (mesmo em update parcial)", () => {
    const result = updateAppointmentSchema.safeParse({
      clientId: CLIENT_ID,
      leadId: LEAD_ID,
    });
    expect(result.success).toBe(false);
  });

  it("aceita apenas notes (caminho de edição em status terminal, validado no service)", () => {
    const result = updateAppointmentSchema.safeParse({ notes: "Foi bem" });
    expect(result.success).toBe(true);
  });
});

describe("completeAppointmentSchema", () => {
  it("aceita corpo vazio (sem saleId)", () => {
    const result = completeAppointmentSchema.parse({});
    expect(result.saleId).toBeUndefined();
  });

  it("aceita saleId uuid válido", () => {
    const result = completeAppointmentSchema.parse({ saleId: SALE_ID });
    expect(result.saleId).toBe(SALE_ID);
  });

  it("rejeita saleId: null explícito (não é aceito neste endpoint)", () => {
    const result = completeAppointmentSchema.safeParse({ saleId: null });
    expect(result.success).toBe(false);
  });

  it("rejeita saleId que não é uuid", () => {
    const result = completeAppointmentSchema.safeParse({ saleId: "abc" });
    expect(result.success).toBe(false);
  });
});

describe("linkAppointmentSaleSchema", () => {
  it("aceita saleId uuid (vincular)", () => {
    const result = linkAppointmentSaleSchema.parse({ saleId: SALE_ID });
    expect(result.saleId).toBe(SALE_ID);
  });

  it("aceita saleId: null (desvincular)", () => {
    const result = linkAppointmentSaleSchema.parse({ saleId: null });
    expect(result.saleId).toBeNull();
  });

  it("rejeita corpo sem saleId (chave obrigatória) com mensagem pt-BR", () => {
    const result = linkAppointmentSaleSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(firstMessage(result)).toBe("Venda inválida");
  });
});

describe("appointmentsListQuerySchema", () => {
  it("aplica default range=upcoming e paginação", () => {
    const result = appointmentsListQuerySchema.parse({});
    expect(result).toEqual({ page: 1, perPage: 20, range: "upcoming" });
  });

  it("rejeita range fora do enum ('past' não existe) com mensagem pt-BR", () => {
    const result = appointmentsListQuerySchema.safeParse({ range: "past" });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(firstMessage(result)).toBe("Recorte de agenda inválido");
  });

  it("aceita todos os recortes válidos", () => {
    for (const range of ["upcoming", "pending", "history", "all"] as const) {
      const result = appointmentsListQuerySchema.safeParse({ range });
      expect(result.success).toBe(true);
    }
    const dayResult = appointmentsListQuerySchema.safeParse({
      range: "day",
      date: "2026-08-05",
    });
    expect(dayResult.success).toBe(true);
  });

  it("range=day sem date ⇒ 422", () => {
    const result = appointmentsListQuerySchema.safeParse({ range: "day" });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(firstMessage(result)).toBe("Informe a data para o recorte do dia");
  });

  it("date informado com range diferente de day ⇒ 422", () => {
    const result = appointmentsListQuerySchema.safeParse({
      range: "upcoming",
      date: "2026-08-05",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(firstMessage(result)).toBe(
      "A data só é aceita junto do recorte do dia (range=day)",
    );
  });

  it("date informado sem range explícito (default upcoming) ⇒ 422", () => {
    const result = appointmentsListQuerySchema.safeParse({
      date: "2026-08-05",
    });
    expect(result.success).toBe(false);
  });

  it("perPage acima de 100 ⇒ 422", () => {
    const result = appointmentsListQuerySchema.safeParse({ perPage: 101 });
    expect(result.success).toBe(false);
  });

  it("filtros status/kind/clientId/leadId combinam com a paginação", () => {
    const result = appointmentsListQuerySchema.parse({
      status: "scheduled",
      kind: "demo",
      clientId: CLIENT_ID,
      leadId: LEAD_ID,
    });
    expect(result.status).toBe("scheduled");
    expect(result.kind).toBe("demo");
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.leadId).toBe(LEAD_ID);
  });
});

describe("appointmentConflictsQuerySchema", () => {
  it("coage durationMinutes vindo da querystring (string)", () => {
    const result = appointmentConflictsQuerySchema.parse({
      startsAt: "2026-08-05T20:00:00.000Z",
      durationMinutes: "30",
    });
    expect(result.durationMinutes).toBe(30);
  });

  it("aceita excludeId opcional", () => {
    const result = appointmentConflictsQuerySchema.parse({
      startsAt: "2026-08-05T20:00:00.000Z",
      durationMinutes: "30",
      excludeId: CLIENT_ID,
    });
    expect(result.excludeId).toBe(CLIENT_ID);
  });

  it("rejeita sem startsAt", () => {
    const result = appointmentConflictsQuerySchema.safeParse({
      durationMinutes: "30",
    });
    expect(result.success).toBe(false);
  });
});

const baseAppointmentResponse = {
  id: CLIENT_ID,
  clientId: null,
  clientName: null,
  clientWhatsapp: null,
  leadId: null,
  leadName: null,
  leadWhatsapp: null,
  saleId: null,
  saleTotalCents: null,
  kind: "demo",
  title: null,
  startsAt: "2026-08-05T20:00:00.000Z",
  durationMinutes: 30,
  status: "scheduled",
  location: null,
  notes: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
} as const;

describe("appointmentSchema / appointmentListItemSchema", () => {
  it("appointmentSchema aceita o compromisso completo (com notes)", () => {
    const result = appointmentSchema.parse(baseAppointmentResponse);
    expect(result.notes).toBeNull();
  });

  it("appointmentListItemSchema OMITE notes, clientWhatsapp e leadWhatsapp", () => {
    const shape = appointmentListItemSchema.shape;
    expect("notes" in shape).toBe(false);
    expect("clientWhatsapp" in shape).toBe(false);
    expect("leadWhatsapp" in shape).toBe(false);
    expect("clientName" in shape).toBe(true);
  });

  it("appointmentListItemSchema faz parse de um item sem os campos omitidos", () => {
    const { notes, clientWhatsapp, leadWhatsapp, ...listItem } =
      baseAppointmentResponse;
    const result = appointmentListItemSchema.parse(listItem);
    expect(result.id).toBe(CLIENT_ID);
  });
});

describe("resolveAppointmentPerson", () => {
  it("cliente tem precedência quando as duas FKs estão preenchidas", () => {
    const result = resolveAppointmentPerson({
      clientId: CLIENT_ID,
      clientName: "Maria",
      leadId: LEAD_ID,
      leadName: "Lead Maria",
    });
    expect(result).toEqual({ name: "Maria", kind: "client" });
  });

  it("lead quando não há cliente", () => {
    const result = resolveAppointmentPerson({
      clientId: null,
      clientName: null,
      leadId: LEAD_ID,
      leadName: "Lead Maria",
    });
    expect(result).toEqual({ name: "Lead Maria", kind: "lead" });
  });

  it("none quando não há cliente nem lead", () => {
    const result = resolveAppointmentPerson({
      clientId: null,
      clientName: null,
      leadId: null,
      leadName: null,
    });
    expect(result).toEqual({ name: null, kind: "none" });
  });
});
