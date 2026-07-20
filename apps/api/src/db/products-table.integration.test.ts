import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { consultants, products } from "./schema";

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

describe("tabela products (integração)", () => {
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

  it("insere produto aplicando defaults do banco (stock 0, threshold 1)", async () => {
    const consultant = await insertConsultant(ctx, "insert@example.com");

    const [inserted] = await ctx.db
      .insert(products)
      .values({
        consultantId: consultant.id,
        name: "Batom Matte",
        brandCode: "MK-1234",
        costCents: 1500,
        priceCents: 3990,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toMatch(UUID_V7_REGEX);
    expect(inserted?.consultantId).toBe(consultant.id);
    expect(inserted?.name).toBe("Batom Matte");
    expect(inserted?.brandCode).toBe("MK-1234");
    expect(inserted?.costCents).toBe(1500);
    expect(inserted?.priceCents).toBe(3990);
    // Defaults do banco: estoque começa em 0 e limiar de alerta em 1.
    expect(inserted?.stockQty).toBe(0);
    expect(inserted?.lowStockThreshold).toBe(1);
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);
  });

  it("aceita brand_code nulo (campo opcional)", async () => {
    const consultant = await insertConsultant(ctx, "nullable@example.com");

    const [inserted] = await ctx.db
      .insert(products)
      .values({
        consultantId: consultant.id,
        name: "Sem Código",
        costCents: 0,
        priceCents: 0,
      })
      .returning();

    expect(inserted?.brandCode).toBeNull();
  });

  it("rejeita cost_cents negativo (CHECK products_cost_cents_check)", async () => {
    const consultant = await insertConsultant(ctx, "costcheck@example.com");

    await expect(
      ctx.db.insert(products).values({
        consultantId: consultant.id,
        name: "Custo Inválido",
        costCents: -1,
        priceCents: 0,
      }),
    ).rejects.toThrow();
  });

  it("rejeita price_cents negativo (CHECK products_price_cents_check)", async () => {
    const consultant = await insertConsultant(ctx, "pricecheck@example.com");

    await expect(
      ctx.db.insert(products).values({
        consultantId: consultant.id,
        name: "Preço Inválido",
        costCents: 0,
        priceCents: -1,
      }),
    ).rejects.toThrow();
  });

  it("rejeita stock_qty negativo (CHECK products_stock_qty_check)", async () => {
    const consultant = await insertConsultant(ctx, "stockcheck@example.com");

    await expect(
      ctx.db.insert(products).values({
        consultantId: consultant.id,
        name: "Estoque Inválido",
        costCents: 0,
        priceCents: 0,
        stockQty: -1,
      }),
    ).rejects.toThrow();
  });

  it("rejeita low_stock_threshold negativo (CHECK products_low_stock_threshold_check)", async () => {
    const consultant = await insertConsultant(
      ctx,
      "thresholdcheck@example.com",
    );

    await expect(
      ctx.db.insert(products).values({
        consultantId: consultant.id,
        name: "Limiar Inválido",
        costCents: 0,
        priceCents: 0,
        lowStockThreshold: -1,
      }),
    ).rejects.toThrow();
  });

  it("rejeita insert sem consultant_id (NOT NULL)", async () => {
    await expect(
      ctx.sql`INSERT INTO products (name, cost_cents, price_cents) VALUES ('Órfão', 100, 200)`,
    ).rejects.toThrow();
  });

  it("rejeita consultant_id inexistente (FK)", async () => {
    const orphanId = "00000000-0000-7000-8000-000000000000";

    await expect(
      ctx.db.insert(products).values({
        consultantId: orphanId,
        name: "Sem Dono",
        costCents: 100,
        priceCents: 200,
      }),
    ).rejects.toThrow();
  });

  it("remove produtos ao excluir a consultora (FK ON DELETE CASCADE)", async () => {
    const consultant = await insertConsultant(ctx, "cascade@example.com");

    await ctx.db.insert(products).values({
      consultantId: consultant.id,
      name: "Produto da Consultora",
      costCents: 100,
      priceCents: 200,
    });

    await ctx.db.delete(consultants).where(eq(consultants.id, consultant.id));

    const remaining = await ctx.db
      .select()
      .from(products)
      .where(eq(products.consultantId, consultant.id));

    expect(remaining).toHaveLength(0);
  });

  it("mantém índice explícito na FK consultant_id", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'products'
        AND indexname = 'products_consultant_id_idx'
    `;

    expect(rows).toHaveLength(1);
  });
});
