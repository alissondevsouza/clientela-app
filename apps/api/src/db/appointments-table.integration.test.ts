import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { appointments, clients, consultants, leads, sales } from "./schema";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const insertConsultant = async (ctx: PgTestContext, email: string) => {
  const [inserted] = await ctx.db
    .insert(consultants)
    .values({
      name: "Consultora Teste",
      email,
      passwordHash: "hash-fake",
      whatsapp: "11987654321",
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir consultora de apoio no teste.");
  }

  return inserted;
};

const insertClient = async (ctx: PgTestContext, consultantId: string) => {
  const [inserted] = await ctx.db
    .insert(clients)
    .values({
      consultantId,
      name: "Cliente Teste",
      whatsapp: "11912345678",
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir cliente de apoio no teste.");
  }

  return inserted;
};

const insertLead = async (ctx: PgTestContext) => {
  const [inserted] = await ctx.db
    .insert(leads)
    .values({
      name: "Lead Teste",
      whatsapp: "11955554444",
      consentAt: new Date(),
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir lead de apoio no teste.");
  }

  return inserted;
};

const insertSale = async (ctx: PgTestContext, consultantId: string) => {
  const [inserted] = await ctx.db
    .insert(sales)
    .values({
      consultantId,
      clientName: "Cliente Snapshot",
      totalCents: 3990,
      paymentMethod: "cash",
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir venda de apoio no teste.");
  }

  return inserted;
};

type AppointmentOverrides = {
  clientId?: string | null;
  leadId?: string | null;
  saleId?: string | null;
  startsAt?: Date;
  durationMinutes?: number;
};

const insertAppointment = async (
  ctx: PgTestContext,
  consultantId: string,
  overrides: AppointmentOverrides = {},
) => {
  const [inserted] = await ctx.db
    .insert(appointments)
    .values({
      consultantId,
      clientId: overrides.clientId ?? null,
      leadId: overrides.leadId ?? null,
      saleId: overrides.saleId ?? null,
      kind: "demo",
      startsAt: overrides.startsAt ?? new Date("2026-08-10T14:00:00.000Z"),
      durationMinutes: overrides.durationMinutes ?? 60,
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir compromisso de apoio no teste.");
  }

  return inserted;
};

describe("tabela appointments (integração)", () => {
  let ctx: PgTestContext;

  beforeAll(async () => {
    ctx = await startPgContainer();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await ctx?.stop();
  });

  beforeEach(async () => {
    await ctx.truncateAll();
  });

  it("insere compromisso aplicando defaults do banco (id uuid v7, status scheduled, timestamps)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "appointment-insert@example.com",
    );

    const inserted = await insertAppointment(ctx, consultant.id);

    expect(inserted).toBeDefined();
    expect(inserted.id).toMatch(UUID_V7_REGEX);
    expect(inserted.consultantId).toBe(consultant.id);
    expect(inserted.status).toBe("scheduled");
    expect(inserted.clientId).toBeNull();
    expect(inserted.leadId).toBeNull();
    expect(inserted.saleId).toBeNull();
    expect(inserted.createdAt).toBeInstanceOf(Date);
    expect(inserted.updatedAt).toBeInstanceOf(Date);
  });

  it.each([0, -1, 1441])(
    "rejeita duration_minutes = %i (CHECK appointments_duration_minutes_check)",
    async (durationMinutes) => {
      const consultant = await insertConsultant(
        ctx,
        `appointment-duration-${durationMinutes}@example.com`,
      );

      await expect(
        insertAppointment(ctx, consultant.id, { durationMinutes }),
      ).rejects.toThrow();
    },
  );

  it.each([1, 1440])(
    "aceita duration_minutes = %i (limites do CHECK)",
    async (durationMinutes) => {
      const consultant = await insertConsultant(
        ctx,
        `appointment-duration-ok-${durationMinutes}@example.com`,
      );

      const inserted = await insertAppointment(ctx, consultant.id, {
        durationMinutes,
      });

      expect(inserted.durationMinutes).toBe(durationMinutes);
    },
  );

  it("rejeita kind fora do enum (CHECK appointments_kind_check)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "appointment-kind@example.com",
    );

    await expect(
      ctx.sql`
        INSERT INTO appointments (consultant_id, kind, starts_at, duration_minutes)
        VALUES (${consultant.id}, 'invalido', now(), 60)
      `,
    ).rejects.toThrow();
  });

  it("rejeita status fora do enum (CHECK appointments_status_check)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "appointment-status@example.com",
    );

    await expect(
      ctx.sql`
        INSERT INTO appointments (consultant_id, kind, starts_at, duration_minutes, status)
        VALUES (${consultant.id}, 'demo', now(), 60, 'invalido')
      `,
    ).rejects.toThrow();
  });

  it("remove o compromisso ao excluir a consultora (FK ON DELETE CASCADE)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "appointment-cascade@example.com",
    );
    const inserted = await insertAppointment(ctx, consultant.id);

    await ctx.db.delete(consultants).where(eq(consultants.id, consultant.id));

    const remaining = await ctx.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, inserted.id));

    expect(remaining).toHaveLength(0);
  });

  it("preserva o compromisso e zera client_id ao excluir a cliente (FK ON DELETE SET NULL)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "appointment-client-setnull@example.com",
    );
    const client = await insertClient(ctx, consultant.id);
    const lead = await insertLead(ctx);
    const sale = await insertSale(ctx, consultant.id);
    const inserted = await insertAppointment(ctx, consultant.id, {
      clientId: client.id,
      leadId: lead.id,
      saleId: sale.id,
    });

    await ctx.db.delete(clients).where(eq(clients.id, client.id));

    const [row] = await ctx.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, inserted.id));

    expect(row).toBeDefined();
    expect(row?.clientId).toBeNull();
    // Só o vínculo excluído cai — os demais permanecem intactos.
    expect(row?.leadId).toBe(lead.id);
    expect(row?.saleId).toBe(sale.id);
  });

  it("preserva o compromisso e zera lead_id ao excluir o lead (FK ON DELETE SET NULL)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "appointment-lead-setnull@example.com",
    );
    const client = await insertClient(ctx, consultant.id);
    const lead = await insertLead(ctx);
    const sale = await insertSale(ctx, consultant.id);
    const inserted = await insertAppointment(ctx, consultant.id, {
      clientId: client.id,
      leadId: lead.id,
      saleId: sale.id,
    });

    await ctx.db.delete(leads).where(eq(leads.id, lead.id));

    const [row] = await ctx.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, inserted.id));

    expect(row).toBeDefined();
    expect(row?.leadId).toBeNull();
    expect(row?.clientId).toBe(client.id);
    expect(row?.saleId).toBe(sale.id);
  });

  it("preserva o compromisso e zera sale_id ao excluir a venda (FK ON DELETE SET NULL)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "appointment-sale-setnull@example.com",
    );
    const client = await insertClient(ctx, consultant.id);
    const lead = await insertLead(ctx);
    const sale = await insertSale(ctx, consultant.id);
    const inserted = await insertAppointment(ctx, consultant.id, {
      clientId: client.id,
      leadId: lead.id,
      saleId: sale.id,
    });

    await ctx.db.delete(sales).where(eq(sales.id, sale.id));

    const [row] = await ctx.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, inserted.id));

    expect(row).toBeDefined();
    expect(row?.saleId).toBeNull();
    expect(row?.clientId).toBe(client.id);
    expect(row?.leadId).toBe(lead.id);
  });

  it("mantém exatamente os quatro índices previstos (RF-01)", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'appointments'
        AND indexname != 'appointments_pkey'
    `;

    const indexNames = rows.map((row) => row.indexname).sort();

    expect(indexNames).toEqual(
      [
        "appointments_client_id_idx",
        "appointments_consultant_id_starts_at_idx",
        "appointments_lead_id_idx",
        "appointments_sale_id_idx",
      ].sort(),
    );
  });
});
