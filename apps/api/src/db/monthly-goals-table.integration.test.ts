import { MONEY_MAX_CENTS } from "@clientela/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { consultants, monthlyGoals } from "./schema";

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

describe("tabela monthly_goals (integração)", () => {
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

  it("insere meta aplicando defaults do banco (uuid v7, timestamps)", async () => {
    const consultant = await insertConsultant(ctx, "insert@example.com");

    const [inserted] = await ctx.db
      .insert(monthlyGoals)
      .values({
        consultantId: consultant.id,
        monthStart: "2026-09-01",
        goalCents: 500_000,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toMatch(UUID_V7_REGEX);
    expect(inserted?.consultantId).toBe(consultant.id);
    expect(inserted?.monthStart).toBe("2026-09-01");
    expect(inserted?.goalCents).toBe(500_000);
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);
  });

  it("aceita goal_cents nulo (remoção explícita da meta a partir do mês)", async () => {
    const consultant = await insertConsultant(ctx, "null-goal@example.com");

    const [inserted] = await ctx.db
      .insert(monthlyGoals)
      .values({
        consultantId: consultant.id,
        monthStart: "2026-11-01",
        goalCents: null,
      })
      .returning();

    expect(inserted?.goalCents).toBeNull();
  });

  it("rejeita insert sem consultant_id (NOT NULL)", async () => {
    await expect(
      ctx.sql`INSERT INTO monthly_goals (month_start, goal_cents) VALUES ('2026-09-01', 100)`,
    ).rejects.toThrow();
  });

  it("rejeita consultant_id inexistente (FK)", async () => {
    const orphanId = "00000000-0000-7000-8000-000000000000";

    await expect(
      ctx.db.insert(monthlyGoals).values({
        consultantId: orphanId,
        monthStart: "2026-09-01",
        goalCents: 100,
      }),
    ).rejects.toThrow();
  });

  it.each(["2026-09-02", "2026-09-15", "2026-09-30"])(
    "rejeita month_start que não é dia 1 (CHECK monthly_goals_month_start_day_check): %s",
    async (monthStart) => {
      const consultant = await insertConsultant(
        ctx,
        `day-check-${monthStart}@example.com`,
      );

      await expect(
        ctx.db.insert(monthlyGoals).values({
          consultantId: consultant.id,
          monthStart,
          goalCents: 100,
        }),
      ).rejects.toThrow();
    },
  );

  it("aceita month_start no dia 1 de qualquer mês", async () => {
    const consultant = await insertConsultant(ctx, "day-one@example.com");

    const [inserted] = await ctx.db
      .insert(monthlyGoals)
      .values({
        consultantId: consultant.id,
        monthStart: "2026-02-01",
        goalCents: 100,
      })
      .returning();

    expect(inserted?.monthStart).toBe("2026-02-01");
  });

  it.each([0, -1])(
    "rejeita goal_cents não positivo (CHECK monthly_goals_goal_cents_check): %i",
    async (goalCents) => {
      const consultant = await insertConsultant(
        ctx,
        `goal-check-${goalCents}@example.com`,
      );

      await expect(
        ctx.db.insert(monthlyGoals).values({
          consultantId: consultant.id,
          monthStart: "2026-09-01",
          goalCents,
        }),
      ).rejects.toThrow();
    },
  );

  it("rejeita goal_cents acima do teto monetário do projeto", async () => {
    const consultant = await insertConsultant(ctx, "goal-ceiling@example.com");

    await expect(
      ctx.db.insert(monthlyGoals).values({
        consultantId: consultant.id,
        monthStart: "2026-09-01",
        goalCents: MONEY_MAX_CENTS + 1,
      }),
    ).rejects.toThrow();
  });

  it("aceita goal_cents no teto monetário do projeto", async () => {
    const consultant = await insertConsultant(
      ctx,
      "goal-ceiling-accept@example.com",
    );

    const [inserted] = await ctx.db
      .insert(monthlyGoals)
      .values({
        consultantId: consultant.id,
        monthStart: "2026-09-01",
        goalCents: MONEY_MAX_CENTS,
      })
      .returning();

    expect(inserted?.goalCents).toBe(MONEY_MAX_CENTS);
  });

  it("rejeita segunda linha para a mesma consultora e mês (UNIQUE consultant_id, month_start)", async () => {
    const consultant = await insertConsultant(ctx, "unique@example.com");

    await ctx.db.insert(monthlyGoals).values({
      consultantId: consultant.id,
      monthStart: "2026-09-01",
      goalCents: 100,
    });

    await expect(
      ctx.db.insert(monthlyGoals).values({
        consultantId: consultant.id,
        monthStart: "2026-09-01",
        goalCents: 200,
      }),
    ).rejects.toThrow();
  });

  it("permite a mesma consultora ter metas em meses diferentes", async () => {
    const consultant = await insertConsultant(ctx, "multi-month@example.com");

    await ctx.db.insert(monthlyGoals).values([
      { consultantId: consultant.id, monthStart: "2026-09-01", goalCents: 100 },
      { consultantId: consultant.id, monthStart: "2026-10-01", goalCents: 200 },
    ]);

    const rows = await ctx.db
      .select()
      .from(monthlyGoals)
      .where(eq(monthlyGoals.consultantId, consultant.id));

    expect(rows).toHaveLength(2);
  });

  it("permite consultoras diferentes com o mesmo mês (unicidade é por par)", async () => {
    const consultantA = await insertConsultant(ctx, "pair-a@example.com");
    const consultantB = await insertConsultant(ctx, "pair-b@example.com");

    await ctx.db.insert(monthlyGoals).values([
      {
        consultantId: consultantA.id,
        monthStart: "2026-09-01",
        goalCents: 100,
      },
      {
        consultantId: consultantB.id,
        monthStart: "2026-09-01",
        goalCents: 200,
      },
    ]);

    const rows = await ctx.db.select().from(monthlyGoals);

    expect(rows).toHaveLength(2);
  });

  it("remove metas ao excluir a consultora (FK ON DELETE CASCADE)", async () => {
    const consultant = await insertConsultant(ctx, "cascade@example.com");

    await ctx.db.insert(monthlyGoals).values({
      consultantId: consultant.id,
      monthStart: "2026-09-01",
      goalCents: 100,
    });

    await ctx.db.delete(consultants).where(eq(consultants.id, consultant.id));

    const remaining = await ctx.db
      .select()
      .from(monthlyGoals)
      .where(eq(monthlyGoals.consultantId, consultant.id));

    expect(remaining).toHaveLength(0);
  });

  it("mantém a UNIQUE (consultant_id, month_start) como índice cobrindo a FK", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'monthly_goals'
        AND indexname = 'monthly_goals_consultant_id_month_start_key'
    `;

    expect(rows).toHaveLength(1);
  });

  it("cria o índice sales_consultant_sold_at_idx em sales (consultant_id, sold_at)", async () => {
    const rows = await ctx.sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'sales'
        AND indexname = 'sales_consultant_sold_at_idx'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain("consultant_id");
    expect(rows[0]?.indexdef).toContain("sold_at");
  });
});
