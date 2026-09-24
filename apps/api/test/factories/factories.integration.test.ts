import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  appointments,
  clients,
  consultants,
  leads,
  monthlyGoals,
  products,
  receivables,
  sales,
  sessions,
} from "../../src/db/schema";
import { type PgTestContext, startPgContainer } from "../helpers/pg-container";
import {
  createAppointment,
  createClient,
  createConsultant,
  createConsultantSession,
  createLead,
  createMonthlyGoal,
  createProduct,
  createSale,
} from "./index";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

// Teste de fumaça das factories de `apps/api/test/factories/`: prova que cada
// uma semeia linhas que passam nos CHECKs reais do Postgres (a migração
// aplicada é a mesma de produção — sem mock de banco, testing.md) e que a
// validação de coerência de `createSale` funciona antes de chegar ao banco.
// Consumido pelos testes de integração dos Milestones 3/4 (plan.md, Task 2.3).
describe("test/factories (fumaça, integração)", () => {
  let ctx: PgTestContext;

  beforeAll(async () => {
    ctx = await startPgContainer();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterEach(async () => {
    await ctx.truncateAll();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  it("createConsultant + createConsultantSession semeiam consultora e sessão válidas", async () => {
    const consultant = await createConsultant(ctx.db, {
      name: "Consultora Fumaça",
    });
    const session = await createConsultantSession(ctx.db, consultant.id);

    const [consultantRow] = await ctx.db
      .select()
      .from(consultants)
      .where(eq(consultants.id, consultant.id));
    expect(consultantRow?.name).toBe("Consultora Fumaça");
    expect(consultantRow?.passwordHash).toContain("scrypt$");

    const [sessionRow] = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.consultantId, consultant.id));
    expect(sessionRow?.tokenHash).toHaveLength(64);
    expect(sessionRow?.tokenHash).not.toBe(session.token);
    expect(sessionRow?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("createClient / createProduct / createLead / createMonthlyGoal semeiam linhas coerentes com o schema", async () => {
    const consultant = await createConsultant(ctx.db);

    const client = await createClient(ctx.db, consultant.id, {
      birthday: "1988-02-29",
    });
    const [clientRow] = await ctx.db
      .select()
      .from(clients)
      .where(eq(clients.id, client.id));
    expect(clientRow?.consultantId).toBe(consultant.id);
    expect(clientRow?.birthday).toBe("1988-02-29");

    const product = await createProduct(ctx.db, consultant.id, {
      stockQty: 3,
      lowStockThreshold: 5,
    });
    const [productRow] = await ctx.db
      .select()
      .from(products)
      .where(eq(products.id, product.id));
    expect(productRow?.stockQty).toBe(3);
    expect(productRow?.lowStockThreshold).toBe(5);

    const lead = await createLead(ctx.db, {
      status: "contacted",
      createdAt: new Date("2026-01-10T08:00:00.000Z"),
    });
    const [leadRow] = await ctx.db
      .select()
      .from(leads)
      .where(eq(leads.id, lead.id));
    expect(leadRow?.status).toBe("contacted");
    expect(leadRow?.createdAt.toISOString()).toBe("2026-01-10T08:00:00.000Z");

    const goal = await createMonthlyGoal(
      ctx.db,
      consultant.id,
      "2026-09-01",
      150_000,
    );
    const [goalRow] = await ctx.db
      .select()
      .from(monthlyGoals)
      .where(eq(monthlyGoals.id, goal.id));
    expect(goalRow?.monthStart).toBe("2026-09-01");
    expect(goalRow?.goalCents).toBe(150_000);
  });

  it("createAppointment vincula compromisso à cliente ou ao lead", async () => {
    const consultant = await createConsultant(ctx.db);
    const client = await createClient(ctx.db, consultant.id);
    const lead = await createLead(ctx.db);

    const clientAppointment = await createAppointment(ctx.db, consultant.id, {
      startsAt: new Date("2026-09-24T13:00:00.000Z"),
      clientId: client.id,
      kind: "delivery",
    });
    const leadAppointment = await createAppointment(ctx.db, consultant.id, {
      startsAt: new Date("2026-09-24T15:00:00.000Z"),
      leadId: lead.id,
      status: "done",
      durationMinutes: 45,
    });

    const rows = await ctx.db
      .select()
      .from(appointments)
      .where(eq(appointments.consultantId, consultant.id));
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(clientAppointment.id)?.clientId).toBe(client.id);
    expect(byId.get(clientAppointment.id)?.kind).toBe("delivery");
    expect(byId.get(leadAppointment.id)?.leadId).toBe(lead.id);
    expect(byId.get(leadAppointment.id)?.status).toBe("done");
    expect(byId.get(leadAppointment.id)?.durationMinutes).toBe(45);
  });

  it("createSale — venda aberta não entregue", async () => {
    const consultant = await createConsultant(ctx.db);
    const sale = await createSale(ctx.db, consultant.id, {
      status: "open",
      soldAt: new Date("2026-09-10T15:00:00.000Z"),
      items: [
        {
          productName: "Batom Factory",
          qty: 2,
          unitPriceCents: 5_000,
          costCents: 2_000,
        },
      ],
      receivables: [{ amountCents: 10_000, dueKind: "on_delivery" }],
    });

    expect(sale.totalCents).toBe(10_000);

    const [row] = await ctx.db
      .select()
      .from(sales)
      .where(eq(sales.id, sale.id));
    expect(row?.status).toBe("open");
    expect(row?.deliveredAt).toBeNull();
    expect(row?.completedAt).toBeNull();
    expect(row?.canceledAt).toBeNull();
  });

  it("createSale — venda aberta entregue com parcela pendente", async () => {
    const consultant = await createConsultant(ctx.db);
    const soldAt = new Date("2026-08-01T12:00:00.000Z");
    const sale = await createSale(ctx.db, consultant.id, {
      status: "open",
      soldAt,
      delivered: true,
      items: [
        {
          productName: "Base Factory",
          qty: 1,
          unitPriceCents: 8_000,
          costCents: 3_000,
        },
      ],
      receivables: [
        {
          amountCents: 4_000,
          dueKind: "scheduled",
          dueDate: "2026-09-01",
          paidAt: soldAt,
        },
        { amountCents: 4_000, dueKind: "scheduled", dueDate: "2026-10-01" },
      ],
    });

    const rows = await ctx.db
      .select()
      .from(receivables)
      .where(eq(receivables.saleId, sale.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.paidAt !== null)).toHaveLength(1);
    expect(rows.filter((row) => row.paidAt === null)).toHaveLength(1);
  });

  it("createSale — venda concluída com cobrança paga", async () => {
    const consultant = await createConsultant(ctx.db);
    const soldAt = new Date("2026-07-01T12:00:00.000Z");
    const paidAt = new Date("2026-07-02T09:00:00.000Z");
    const sale = await createSale(ctx.db, consultant.id, {
      status: "completed",
      soldAt,
      delivered: soldAt,
      items: [
        {
          productName: "Perfume Factory",
          qty: 1,
          unitPriceCents: 12_000,
          costCents: 5_000,
        },
      ],
      receivables: [
        {
          amountCents: 12_000,
          dueKind: "scheduled",
          dueDate: "2026-07-05",
          paidAt,
        },
      ],
    });

    const [receivableRow] = await ctx.db
      .select()
      .from(receivables)
      .where(eq(receivables.saleId, sale.id));
    expect(receivableRow?.paidAt).not.toBeNull();
    expect(receivableRow?.voidedAt).toBeNull();
  });

  it("createSale — venda cancelada com cobrança anulada", async () => {
    const consultant = await createConsultant(ctx.db);
    const soldAt = new Date("2026-05-10T12:00:00.000Z");
    const voidedAt = new Date("2026-05-12T10:00:00.000Z");
    const sale = await createSale(ctx.db, consultant.id, {
      status: "canceled",
      soldAt,
      items: [
        {
          productName: "Rímel Factory",
          qty: 1,
          unitPriceCents: 3_000,
          costCents: 1_000,
        },
      ],
      receivables: [
        {
          amountCents: 3_000,
          dueKind: "scheduled",
          dueDate: "2026-06-01",
          voidedAt,
        },
      ],
    });

    const [receivableRow] = await ctx.db
      .select()
      .from(receivables)
      .where(eq(receivables.saleId, sale.id));
    expect(receivableRow?.voidedAt).not.toBeNull();
    expect(receivableRow?.paidAt).toBeNull();
  });

  it("createSale — venda retroativa de 2024 passa nos CHECKs temporais", async () => {
    const consultant = await createConsultant(ctx.db);
    const soldAt = new Date("2024-06-15T12:00:00.000Z");
    const sale = await createSale(ctx.db, consultant.id, {
      status: "completed",
      soldAt,
      delivered: soldAt,
      items: [
        {
          productName: "Produto Retroativo",
          qty: 1,
          unitPriceCents: 5_000,
          costCents: 2_000,
        },
      ],
      receivables: [
        {
          amountCents: 5_000,
          dueKind: "scheduled",
          dueDate: "2024-06-20",
          paidAt: soldAt,
        },
      ],
    });

    expect(sale.totalCents).toBe(5_000);
  });

  it("createSale — spec incoerente (soma das cobranças ≠ total) lança erro claro", async () => {
    const consultant = await createConsultant(ctx.db);
    await expect(
      createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-01-01T12:00:00.000Z"),
        items: [
          {
            productName: "X",
            qty: 1,
            unitPriceCents: 10_000,
            costCents: 1_000,
          },
        ],
        receivables: [{ amountCents: 5_000, dueKind: "on_delivery" }],
      }),
    ).rejects.toThrow(/soma das cobranças/);
  });

  it("createSale — completed sem entrega lança erro claro", async () => {
    const consultant = await createConsultant(ctx.db);
    await expect(
      createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: new Date("2026-01-01T12:00:00.000Z"),
        items: [
          { productName: "Y", qty: 1, unitPriceCents: 1_000, costCents: 500 },
        ],
        receivables: [
          {
            amountCents: 1_000,
            dueKind: "scheduled",
            dueDate: "2026-01-05",
            paidAt: new Date("2026-01-02T00:00:00.000Z"),
          },
        ],
      }),
    ).rejects.toThrow(/delivered/);
  });
});
