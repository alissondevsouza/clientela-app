import { and, asc, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import {
  receivableOverdueCondition,
  receivableOverdueExpression,
} from "./derived-expressions";
import { consultants, receivables, sales } from "./schema";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

// `todayIso` fixo: nunca o relógio real (testing.md — determinismo). Simula o
// dia local calculado pelo service com o relógio injetado (ADR-0018).
const TODAY_ISO = "2026-09-15";
const YESTERDAY_ISO = "2026-09-14";
// Instante único usado para created_at/updated_at/paid_at/voided_at nos casos
// que os fixam — satisfaz a matriz temporal de receivables trivialmente
// (todos iguais) sem depender de Date.now() (sem timing flaky).
const FIXED_INSTANT = new Date("2026-09-10T12:00:00.000Z");

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

const insertSale = async (ctx: PgTestContext, consultantId: string) => {
  const [inserted] = await ctx.db
    .insert(sales)
    .values({
      consultantId,
      clientName: "Cliente Snapshot",
      totalCents: 3990,
      paymentMethod: "credit",
      paymentCondition: "installments",
      installments: 2,
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir venda de apoio no teste.");
  }

  return inserted;
};

type ReceivableOverrides = {
  dueDate?: string | null;
  dueKind?: "scheduled" | "on_delivery" | "unknown";
  paidAt?: Date | null;
  voidedAt?: Date | null;
};

const insertReceivable = async (
  ctx: PgTestContext,
  saleId: string,
  overrides: ReceivableOverrides = {},
) => {
  const dueDate = Object.hasOwn(overrides, "dueDate")
    ? (overrides.dueDate ?? null)
    : YESTERDAY_ISO;
  const [inserted] = await ctx.db
    .insert(receivables)
    .values({
      saleId,
      amountCents: 1000,
      dueDate,
      dueKind: overrides.dueKind ?? "scheduled",
      paidAt: overrides.paidAt ?? null,
      voidedAt: overrides.voidedAt ?? null,
      createdAt: FIXED_INSTANT,
      updatedAt: FIXED_INSTANT,
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir recebível de apoio no teste.");
  }

  return inserted;
};

describe("derived-expressions (integração)", () => {
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

  it("marca vencida a parcela pendente com due_date anterior a todayIso", async () => {
    const consultant = await insertConsultant(ctx, "overdue-past@example.com");
    const sale = await insertSale(ctx, consultant.id);
    const receivable = await insertReceivable(ctx, sale.id, {
      dueDate: YESTERDAY_ISO,
    });

    const [row] = await ctx.db
      .select({ overdue: receivableOverdueExpression(TODAY_ISO) })
      .from(receivables)
      .where(eq(receivables.id, receivable.id));

    expect(row?.overdue).toBe(true);
  });

  it("não marca vencida a parcela pendente com due_date igual a todayIso", async () => {
    const consultant = await insertConsultant(ctx, "overdue-today@example.com");
    const sale = await insertSale(ctx, consultant.id);
    const receivable = await insertReceivable(ctx, sale.id, {
      dueDate: TODAY_ISO,
    });

    const [row] = await ctx.db
      .select({ overdue: receivableOverdueExpression(TODAY_ISO) })
      .from(receivables)
      .where(eq(receivables.id, receivable.id));

    expect(row?.overdue).toBe(false);
  });

  it("não marca vencida a parcela paga, mesmo com due_date no passado", async () => {
    const consultant = await insertConsultant(ctx, "overdue-paid@example.com");
    const sale = await insertSale(ctx, consultant.id);
    const receivable = await insertReceivable(ctx, sale.id, {
      dueDate: YESTERDAY_ISO,
      paidAt: FIXED_INSTANT,
    });

    const [row] = await ctx.db
      .select({ overdue: receivableOverdueExpression(TODAY_ISO) })
      .from(receivables)
      .where(eq(receivables.id, receivable.id));

    expect(row?.overdue).toBe(false);
  });

  it("não marca vencida a parcela anulada, mesmo com due_date no passado", async () => {
    const consultant = await insertConsultant(
      ctx,
      "overdue-voided@example.com",
    );
    const sale = await insertSale(ctx, consultant.id);
    const receivable = await insertReceivable(ctx, sale.id, {
      dueDate: YESTERDAY_ISO,
      voidedAt: FIXED_INSTANT,
    });

    const [row] = await ctx.db
      .select({ overdue: receivableOverdueExpression(TODAY_ISO) })
      .from(receivables)
      .where(eq(receivables.id, receivable.id));

    expect(row?.overdue).toBe(false);
  });

  it("não marca vencida a parcela sem due_date (on_delivery)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "overdue-on-delivery@example.com",
    );
    const sale = await insertSale(ctx, consultant.id);
    const receivable = await insertReceivable(ctx, sale.id, {
      dueDate: null,
      dueKind: "on_delivery",
    });

    const [row] = await ctx.db
      .select({ overdue: receivableOverdueExpression(TODAY_ISO) })
      .from(receivables)
      .where(eq(receivables.id, receivable.id));

    expect(row?.overdue).toBe(false);
  });

  it("receivableOverdueCondition conta só a vencida em WHERE/FILTER", async () => {
    const consultant = await insertConsultant(ctx, "overdue-count@example.com");
    const sale = await insertSale(ctx, consultant.id);
    await insertReceivable(ctx, sale.id, { dueDate: YESTERDAY_ISO }); // vencida
    await insertReceivable(ctx, sale.id, { dueDate: TODAY_ISO }); // não vencida
    await insertReceivable(ctx, sale.id, {
      dueDate: YESTERDAY_ISO,
      paidAt: FIXED_INSTANT,
    }); // paga
    await insertReceivable(ctx, sale.id, {
      dueDate: YESTERDAY_ISO,
      voidedAt: FIXED_INSTANT,
    }); // anulada
    await insertReceivable(ctx, sale.id, {
      dueDate: null,
      dueKind: "on_delivery",
    }); // sem vencimento

    const [row] = await ctx.db
      .select({ value: count() })
      .from(receivables)
      .where(
        and(
          eq(receivables.saleId, sale.id),
          receivableOverdueCondition(TODAY_ISO),
        ),
      );

    expect(row?.value).toBe(1);
  });

  it("ordena por due_date sem quebrar quando a expressão é projetada junto", async () => {
    const consultant = await insertConsultant(ctx, "overdue-order@example.com");
    const sale = await insertSale(ctx, consultant.id);
    await insertReceivable(ctx, sale.id, { dueDate: TODAY_ISO });
    await insertReceivable(ctx, sale.id, { dueDate: YESTERDAY_ISO });

    const rows = await ctx.db
      .select({
        dueDate: receivables.dueDate,
        overdue: receivableOverdueExpression(TODAY_ISO),
      })
      .from(receivables)
      .where(eq(receivables.saleId, sale.id))
      .orderBy(asc(receivables.dueDate));

    expect(rows).toEqual([
      { dueDate: YESTERDAY_ISO, overdue: true },
      { dueDate: TODAY_ISO, overdue: false },
    ]);
  });
});
