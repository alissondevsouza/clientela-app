import { readFile } from "node:fs/promises";
import { MONEY_MAX_CENTS } from "@clientela/shared";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { createDb } from "./client";
import { consultants, products } from "./schema";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
const POSTGRES_IMAGE = "postgres:18-alpine";
const MIGRATION_STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const PRE_DISCOUNT_MIGRATION_URLS = [
  new URL("../../drizzle/0000_new_gideon.sql", import.meta.url),
  new URL("../../drizzle/0001_third_trauma.sql", import.meta.url),
  new URL("../../drizzle/0002_clear_yellowjacket.sql", import.meta.url),
  new URL("../../drizzle/0003_married_blue_shield.sql", import.meta.url),
  new URL("../../drizzle/0004_sturdy_thundra.sql", import.meta.url),
  new URL("../../drizzle/0005_motionless_doctor_octopus.sql", import.meta.url),
  new URL("../../drizzle/0006_ambiguous_luminals.sql", import.meta.url),
  new URL("../../drizzle/0007_rare_solo.sql", import.meta.url),
  new URL("../../drizzle/0008_volatile_joseph.sql", import.meta.url),
  new URL("../../drizzle/0009_dizzy_polaris.sql", import.meta.url),
] as const;
const DISCOUNT_MIGRATION_URL = new URL(
  "../../drizzle/0010_green_leo.sql",
  import.meta.url,
);
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PgClient = ReturnType<typeof createDb>["sql"];

const applyMigrationFile = async (
  sql: PgClient,
  migrationUrl: URL,
): Promise<void> => {
  const migrationSql = await readFile(migrationUrl, "utf8");
  const statements = migrationSql
    .split(MIGRATION_STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await sql.unsafe(statement);
  }
};

type LegacyProductRow = {
  id: string;
  consultantId: string;
  name: string;
  brandCode: string | null;
  costCents: number;
  priceCents: number;
  stockQty: number;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
};

describe("migração 0010 de products (integração)", () => {
  it(
    "preserva todos os campos da linha criada em 0009 e adiciona taxa nula",
    async () => {
      let container: StartedPostgreSqlContainer | undefined;
      let sql: PgClient | undefined;

      try {
        container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
        const connection = createDb(container.getConnectionUri());
        sql = connection.sql;

        for (const migrationUrl of PRE_DISCOUNT_MIGRATION_URLS) {
          await applyMigrationFile(sql, migrationUrl);
        }

        const [consultant] = await sql<{ id: string }[]>`
          INSERT INTO consultants (name, email, password_hash, whatsapp)
          VALUES (
            'Consultora Migração',
            'migration-legacy@example.com',
            'hash-fake',
            '11987654321'
          )
          RETURNING id
        `;
        if (!consultant) {
          throw new Error("Falha ao inserir consultora pré-migração.");
        }

        const [beforeMigration] = await sql<LegacyProductRow[]>`
          INSERT INTO products (
            consultant_id,
            name,
            brand_code,
            cost_cents,
            price_cents,
            stock_qty,
            low_stock_threshold
          )
          VALUES (
            ${consultant.id},
            'Produto Legado Pré-0010',
            'LEGACY-0010',
            4321,
            9990,
            7,
            2
          )
          RETURNING
            id,
            consultant_id AS "consultantId",
            name,
            brand_code AS "brandCode",
            cost_cents AS "costCents",
            price_cents AS "priceCents",
            stock_qty AS "stockQty",
            low_stock_threshold AS "lowStockThreshold",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `;
        if (!beforeMigration) {
          throw new Error("Falha ao inserir produto pré-migração.");
        }

        await applyMigrationFile(sql, DISCOUNT_MIGRATION_URL);

        const [afterMigration] = await sql<
          (LegacyProductRow & { purchaseDiscountBps: number | null })[]
        >`
          SELECT
            id,
            consultant_id AS "consultantId",
            name,
            brand_code AS "brandCode",
            cost_cents AS "costCents",
            purchase_discount_bps AS "purchaseDiscountBps",
            price_cents AS "priceCents",
            stock_qty AS "stockQty",
            low_stock_threshold AS "lowStockThreshold",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM products
          WHERE id = ${beforeMigration.id}
        `;

        expect(afterMigration).toEqual({
          ...beforeMigration,
          purchaseDiscountBps: null,
        });
      } finally {
        try {
          if (sql) {
            await sql.end();
          }
        } finally {
          if (container) {
            await container.stop();
          }
        }
      }
    },
    CONTAINER_STARTUP_TIMEOUT_MS,
  );
});

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
    expect(inserted?.purchaseDiscountBps).toBeNull();
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

  it("mantém purchase_discount_bps nullable e os CHECKs nomeados", async () => {
    const columns = await ctx.sql<
      {
        columnName: string;
        dataType: string;
        isNullable: string;
        columnDefault: string | null;
      }[]
    >`
      SELECT
        column_name AS "columnName",
        data_type AS "dataType",
        is_nullable AS "isNullable",
        column_default AS "columnDefault"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name = 'purchase_discount_bps'
    `;
    const constraints = await ctx.sql<{ constraintName: string }[]>`
      SELECT conname AS "constraintName"
      FROM pg_constraint
      WHERE conrelid = 'public.products'::regclass
        AND conname IN (
          'products_purchase_discount_bps_range_check',
          'products_discount_cost_consistency_check'
        )
      ORDER BY conname
    `;

    expect(columns).toEqual([
      {
        columnName: "purchase_discount_bps",
        dataType: "integer",
        isNullable: "YES",
        columnDefault: null,
      },
    ]);
    expect(constraints).toEqual([
      { constraintName: "products_discount_cost_consistency_check" },
      { constraintName: "products_purchase_discount_bps_range_check" },
    ]);
  });

  it.each([-1, 10_001])(
    "rejeita purchase_discount_bps fora da faixa: %i",
    async (purchaseDiscountBps) => {
      const consultant = await insertConsultant(
        ctx,
        `discount-range-${purchaseDiscountBps}@example.com`,
      );

      await expect(
        ctx.db.insert(products).values({
          consultantId: consultant.id,
          name: "Desconto Inválido",
          costCents: 0,
          purchaseDiscountBps,
          priceCents: 0,
        }),
      ).rejects.toThrow();
    },
  );

  it("aceita as bordas 0 e 10000 de purchase_discount_bps", async () => {
    const consultant = await insertConsultant(
      ctx,
      "discount-limits@example.com",
    );

    const inserted = await ctx.db
      .insert(products)
      .values([
        {
          consultantId: consultant.id,
          name: "Sem Desconto",
          costCents: 1000,
          purchaseDiscountBps: 0,
          priceCents: 1000,
        },
        {
          consultantId: consultant.id,
          name: "Desconto Integral",
          costCents: 0,
          purchaseDiscountBps: 10_000,
          priceCents: 1000,
        },
      ])
      .returning({ purchaseDiscountBps: products.purchaseDiscountBps });

    expect(inserted).toEqual([
      { purchaseDiscountBps: 0 },
      { purchaseDiscountBps: 10_000 },
    ]);
  });

  it("rejeita custo divergente da taxa de desconto", async () => {
    const consultant = await insertConsultant(
      ctx,
      "discount-consistency@example.com",
    );

    await expect(
      ctx.db.insert(products).values({
        consultantId: consultant.id,
        name: "Custo Divergente",
        costCents: 6493,
        purchaseDiscountBps: 3500,
        priceCents: 9990,
      }),
    ).rejects.toThrow();
  });

  it("arredonda meio centavo para cima na consistência do custo", async () => {
    const consultant = await insertConsultant(
      ctx,
      "discount-rounding@example.com",
    );

    const [inserted] = await ctx.db
      .insert(products)
      .values({
        consultantId: consultant.id,
        name: "Custo Arredondado",
        costCents: 6494,
        purchaseDiscountBps: 3500,
        priceCents: 9990,
      })
      .returning();

    expect(inserted?.costCents).toBe(6494);
    expect(inserted?.purchaseDiscountBps).toBe(3500);
  });

  it("calcula a consistência no teto monetário sem overflow de integer", async () => {
    const consultant = await insertConsultant(
      ctx,
      "discount-bigint@example.com",
    );

    const [inserted] = await ctx.db
      .insert(products)
      .values({
        consultantId: consultant.id,
        name: "Custo no Teto",
        costCents: MONEY_MAX_CENTS,
        purchaseDiscountBps: 0,
        priceCents: MONEY_MAX_CENTS,
      })
      .returning();

    expect(inserted?.costCents).toBe(MONEY_MAX_CENTS);
  });

  it("mantém custo manual com taxa nula no schema final", async () => {
    const consultant = await insertConsultant(ctx, "legacy-cost@example.com");

    const [inserted] = await ctx.db
      .insert(products)
      .values({
        consultantId: consultant.id,
        name: "Custo Manual Legado",
        costCents: 1234,
        priceCents: 9990,
      })
      .returning();

    expect(inserted?.costCents).toBe(1234);
    expect(inserted?.priceCents).toBe(9990);
    expect(inserted?.purchaseDiscountBps).toBeNull();
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
