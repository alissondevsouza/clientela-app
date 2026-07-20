import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import {
  clients,
  consultants,
  products,
  receivables,
  saleItems,
  sales,
} from "./schema";

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

const insertProduct = async (ctx: PgTestContext, consultantId: string) => {
  const [inserted] = await ctx.db
    .insert(products)
    .values({
      consultantId,
      name: "Batom Matte",
      costCents: 1500,
      priceCents: 3990,
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir produto de apoio no teste.");
  }

  return inserted;
};

type SaleOverrides = {
  clientId?: string | null;
  clientName?: string;
  totalCents?: number;
  paymentMethod?: "cash" | "pix" | "card" | "credit";
};

const insertSale = async (
  ctx: PgTestContext,
  consultantId: string,
  overrides: SaleOverrides = {},
) => {
  const [inserted] = await ctx.db
    .insert(sales)
    .values({
      consultantId,
      clientId: overrides.clientId ?? null,
      clientName: overrides.clientName ?? "Cliente Snapshot",
      totalCents: overrides.totalCents ?? 3990,
      paymentMethod: overrides.paymentMethod ?? "cash",
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir venda de apoio no teste.");
  }

  return inserted;
};

describe("tabelas de vendas (integração)", () => {
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

  it("insere venda aplicando defaults do banco (status completed, sold_at, timestamps)", async () => {
    const consultant = await insertConsultant(ctx, "sale-insert@example.com");
    const client = await insertClient(ctx, consultant.id);

    const [inserted] = await ctx.db
      .insert(sales)
      .values({
        consultantId: consultant.id,
        clientId: client.id,
        clientName: "Cliente Feliz",
        totalCents: 3990,
        paymentMethod: "pix",
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toMatch(UUID_V7_REGEX);
    expect(inserted?.consultantId).toBe(consultant.id);
    expect(inserted?.clientId).toBe(client.id);
    expect(inserted?.clientName).toBe("Cliente Feliz");
    expect(inserted?.totalCents).toBe(3990);
    expect(inserted?.paymentMethod).toBe("pix");
    // Default do banco: venda nasce concluída (invariante 5 do domínio).
    expect(inserted?.status).toBe("completed");
    expect(inserted?.soldAt).toBeInstanceOf(Date);
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);
  });

  it("aceita venda sem cliente (client_id nullable) com client_name snapshot", async () => {
    const consultant = await insertConsultant(ctx, "sale-noclient@example.com");

    const sale = await insertSale(ctx, consultant.id, {
      clientId: null,
      clientName: "Cliente Avulsa",
    });

    expect(sale.clientId).toBeNull();
    expect(sale.clientName).toBe("Cliente Avulsa");
  });

  it("rejeita total_cents negativo (CHECK sales_total_cents_check)", async () => {
    const consultant = await insertConsultant(ctx, "sale-total@example.com");

    await expect(
      insertSale(ctx, consultant.id, { totalCents: -1 }),
    ).rejects.toThrow();
  });

  it("rejeita payment_method fora do enum (CHECK sales_payment_method_check)", async () => {
    const consultant = await insertConsultant(ctx, "sale-pm@example.com");

    await expect(
      ctx.sql`
        INSERT INTO sales (consultant_id, client_name, total_cents, payment_method)
        VALUES (${consultant.id}, 'Cliente', 1000, 'boleto')
      `,
    ).rejects.toThrow();
  });

  it("rejeita status fora do enum (CHECK sales_status_check)", async () => {
    const consultant = await insertConsultant(ctx, "sale-status@example.com");

    await expect(
      ctx.sql`
        INSERT INTO sales (consultant_id, client_name, total_cents, payment_method, status)
        VALUES (${consultant.id}, 'Cliente', 1000, 'cash', 'refunded')
      `,
    ).rejects.toThrow();
  });

  it("desvincula a venda ao excluir a cliente (FK ON DELETE SET NULL), preservando o snapshot", async () => {
    const consultant = await insertConsultant(ctx, "sale-setnull@example.com");
    const client = await insertClient(ctx, consultant.id);
    const sale = await insertSale(ctx, consultant.id, {
      clientId: client.id,
      clientName: "Nome Preservado",
    });

    await ctx.db.delete(clients).where(eq(clients.id, client.id));

    const [row] = await ctx.db
      .select()
      .from(sales)
      .where(eq(sales.id, sale.id));

    // Venda intacta: só o vínculo pessoal cai; o snapshot mantém o histórico.
    expect(row).toBeDefined();
    expect(row?.clientId).toBeNull();
    expect(row?.clientName).toBe("Nome Preservado");
  });

  it("remove vendas ao excluir a consultora (FK ON DELETE CASCADE)", async () => {
    const consultant = await insertConsultant(ctx, "sale-cascade@example.com");
    await insertSale(ctx, consultant.id);

    await ctx.db.delete(consultants).where(eq(consultants.id, consultant.id));

    const remaining = await ctx.db
      .select()
      .from(sales)
      .where(eq(sales.consultantId, consultant.id));

    expect(remaining).toHaveLength(0);
  });

  it("mantém índices explícitos nas FKs de sales", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'sales'
        AND indexname IN ('sales_consultant_id_idx', 'sales_client_id_idx')
    `;

    expect(rows).toHaveLength(2);
  });

  it("insere item de venda com snapshot de produto e defaults", async () => {
    const consultant = await insertConsultant(ctx, "item-insert@example.com");
    const product = await insertProduct(ctx, consultant.id);
    const sale = await insertSale(ctx, consultant.id);

    const [inserted] = await ctx.db
      .insert(saleItems)
      .values({
        saleId: sale.id,
        productId: product.id,
        productName: "Batom Matte",
        qty: 2,
        unitPriceCents: 3990,
      })
      .returning();

    expect(inserted?.id).toMatch(UUID_V7_REGEX);
    expect(inserted?.saleId).toBe(sale.id);
    expect(inserted?.productId).toBe(product.id);
    expect(inserted?.productName).toBe("Batom Matte");
    expect(inserted?.qty).toBe(2);
    expect(inserted?.unitPriceCents).toBe(3990);
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);
  });

  it("rejeita qty zero em sale_items (CHECK sale_items_qty_check)", async () => {
    const consultant = await insertConsultant(ctx, "item-qty@example.com");
    const product = await insertProduct(ctx, consultant.id);
    const sale = await insertSale(ctx, consultant.id);

    await expect(
      ctx.db.insert(saleItems).values({
        saleId: sale.id,
        productId: product.id,
        productName: "Batom Matte",
        qty: 0,
        unitPriceCents: 3990,
      }),
    ).rejects.toThrow();
  });

  it("rejeita unit_price_cents negativo em sale_items (CHECK sale_items_unit_price_cents_check)", async () => {
    const consultant = await insertConsultant(ctx, "item-price@example.com");
    const product = await insertProduct(ctx, consultant.id);
    const sale = await insertSale(ctx, consultant.id);

    await expect(
      ctx.db.insert(saleItems).values({
        saleId: sale.id,
        productId: product.id,
        productName: "Batom Matte",
        qty: 1,
        unitPriceCents: -1,
      }),
    ).rejects.toThrow();
  });

  it("desvincula o item ao excluir o produto (FK ON DELETE SET NULL), preservando o snapshot", async () => {
    const consultant = await insertConsultant(ctx, "item-setnull@example.com");
    const product = await insertProduct(ctx, consultant.id);
    const sale = await insertSale(ctx, consultant.id);

    const [item] = await ctx.db
      .insert(saleItems)
      .values({
        saleId: sale.id,
        productId: product.id,
        productName: "Batom Matte",
        qty: 1,
        unitPriceCents: 3990,
      })
      .returning();

    if (!item) {
      throw new Error("Falha ao inserir item de venda no teste.");
    }

    await ctx.db.delete(products).where(eq(products.id, product.id));

    const [row] = await ctx.db
      .select()
      .from(saleItems)
      .where(eq(saleItems.id, item.id));

    // Item intacto: só o vínculo com o produto cai; o snapshot preserva nome/preço.
    expect(row).toBeDefined();
    expect(row?.productId).toBeNull();
    expect(row?.productName).toBe("Batom Matte");
    expect(row?.unitPriceCents).toBe(3990);
  });

  it("remove itens e recebíveis ao excluir a venda (FK ON DELETE CASCADE)", async () => {
    const consultant = await insertConsultant(ctx, "cascade-sale@example.com");
    const product = await insertProduct(ctx, consultant.id);
    const sale = await insertSale(ctx, consultant.id, {
      paymentMethod: "credit",
    });

    await ctx.db.insert(saleItems).values({
      saleId: sale.id,
      productId: product.id,
      productName: "Batom Matte",
      qty: 1,
      unitPriceCents: 3990,
    });
    await ctx.db.insert(receivables).values({
      saleId: sale.id,
      amountCents: 3990,
      dueDate: "2026-08-18",
    });

    await ctx.db.delete(sales).where(eq(sales.id, sale.id));

    const remainingItems = await ctx.db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, sale.id));
    const remainingReceivables = await ctx.db
      .select()
      .from(receivables)
      .where(eq(receivables.saleId, sale.id));

    expect(remainingItems).toHaveLength(0);
    expect(remainingReceivables).toHaveLength(0);
  });

  it("mantém índices explícitos nas FKs de sale_items", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'sale_items'
        AND indexname IN ('sale_items_sale_id_idx', 'sale_items_product_id_idx')
    `;

    expect(rows).toHaveLength(2);
  });

  it("insere recebível com due_date em modo string e paid_at nulo (pendente)", async () => {
    const consultant = await insertConsultant(ctx, "recv-insert@example.com");
    const sale = await insertSale(ctx, consultant.id, {
      paymentMethod: "credit",
    });

    const [inserted] = await ctx.db
      .insert(receivables)
      .values({
        saleId: sale.id,
        amountCents: 3990,
        dueDate: "2026-08-18",
      })
      .returning();

    expect(inserted?.id).toMatch(UUID_V7_REGEX);
    expect(inserted?.saleId).toBe(sale.id);
    expect(inserted?.amountCents).toBe(3990);
    // Coluna `date` em modo string: volta exatamente como entrou, sem shift.
    expect(inserted?.dueDate).toBe("2026-08-18");
    expect(inserted?.paidAt).toBeNull();
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);
  });

  it("rejeita amount_cents zero em receivables (CHECK receivables_amount_cents_check)", async () => {
    const consultant = await insertConsultant(ctx, "recv-amount@example.com");
    const sale = await insertSale(ctx, consultant.id, {
      paymentMethod: "credit",
    });

    await expect(
      ctx.db.insert(receivables).values({
        saleId: sale.id,
        amountCents: 0,
        dueDate: "2026-08-18",
      }),
    ).rejects.toThrow();
  });

  it("mantém índice explícito na FK sale_id de receivables", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'receivables'
        AND indexname = 'receivables_sale_id_idx'
    `;

    expect(rows).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // CRM-07 (RF-01) — snapshot de custo em sale_items e meta mensal em consultants
  // -------------------------------------------------------------------------
  describe("cost_cents (sale_items) e monthly_goal_cents (consultants) — CRM-07", () => {
    it("cost_cents assume default 0 quando omitido (rede de segurança de migração, não comportamento do createSale)", async () => {
      const consultant = await insertConsultant(
        ctx,
        "item-cost-default@example.com",
      );
      const product = await insertProduct(ctx, consultant.id);
      const sale = await insertSale(ctx, consultant.id);

      const [inserted] = await ctx.db
        .insert(saleItems)
        .values({
          saleId: sale.id,
          productId: product.id,
          productName: "Batom Matte",
          qty: 1,
          unitPriceCents: 3990,
        })
        .returning();

      expect(inserted?.costCents).toBe(0);
    });

    it("insere item com cost_cents explícito (snapshot do custo do produto)", async () => {
      const consultant = await insertConsultant(
        ctx,
        "item-cost-explicit@example.com",
      );
      const product = await insertProduct(ctx, consultant.id);
      const sale = await insertSale(ctx, consultant.id);

      const [inserted] = await ctx.db
        .insert(saleItems)
        .values({
          saleId: sale.id,
          productId: product.id,
          productName: "Batom Matte",
          qty: 1,
          unitPriceCents: 3990,
          costCents: 1500,
        })
        .returning();

      expect(inserted?.costCents).toBe(1500);
    });

    it("rejeita cost_cents negativo em sale_items (CHECK sale_items_cost_cents_check)", async () => {
      const consultant = await insertConsultant(
        ctx,
        "item-cost-negative@example.com",
      );
      const product = await insertProduct(ctx, consultant.id);
      const sale = await insertSale(ctx, consultant.id);

      await expect(
        ctx.db.insert(saleItems).values({
          saleId: sale.id,
          productId: product.id,
          productName: "Batom Matte",
          qty: 1,
          unitPriceCents: 3990,
          costCents: -1,
        }),
      ).rejects.toThrow();
    });

    it("consultants aceita monthly_goal_cents ausente (null = sem meta)", async () => {
      const consultant = await insertConsultant(
        ctx,
        "consultant-goal-null@example.com",
      );

      const [row] = await ctx.db
        .select()
        .from(consultants)
        .where(eq(consultants.id, consultant.id));

      expect(row?.monthlyGoalCents).toBeNull();
    });

    it("consultants aceita monthly_goal_cents positivo", async () => {
      const [inserted] = await ctx.db
        .insert(consultants)
        .values({
          name: "Consultora Meta",
          email: "consultant-goal-positive@example.com",
          passwordHash: "hash-fake",
          whatsapp: "11987654321",
          monthlyGoalCents: 150_000,
        })
        .returning();

      expect(inserted?.monthlyGoalCents).toBe(150_000);
    });

    it("rejeita monthly_goal_cents = 0 em consultants (CHECK consultants_monthly_goal_cents_check)", async () => {
      await expect(
        ctx.db.insert(consultants).values({
          name: "Consultora Meta Zero",
          email: "consultant-goal-zero@example.com",
          passwordHash: "hash-fake",
          whatsapp: "11987654321",
          monthlyGoalCents: 0,
        }),
      ).rejects.toThrow();
    });

    it("rejeita monthly_goal_cents negativo em consultants (CHECK consultants_monthly_goal_cents_check)", async () => {
      await expect(
        ctx.db.insert(consultants).values({
          name: "Consultora Meta Negativa",
          email: "consultant-goal-negative@example.com",
          passwordHash: "hash-fake",
          whatsapp: "11987654321",
          monthlyGoalCents: -1,
        }),
      ).rejects.toThrow();
    });
  });
});
