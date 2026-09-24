import type { Database } from "../../src/db/client";
import { products } from "../../src/db/schema";

const DEFAULT_COST_CENTS = 4_000;
const DEFAULT_PRICE_CENTS = 9_990;
const DEFAULT_STOCK_QTY = 10;
const DEFAULT_LOW_STOCK_THRESHOLD = 1;

export type ProductOverrides = Partial<{
  name: string;
  brandCode: string | null;
  costCents: number;
  // Ao sobrescrever, `costCents` deve continuar coerente com a fórmula de
  // `products_discount_cost_consistency_check` (products.ts) — a factory NÃO
  // recalcula custo a partir do desconto (mantém a mesma responsabilidade do
  // service, que já é o dono dessa conta).
  purchaseDiscountBps: number | null;
  priceCents: number;
  stockQty: number;
  lowStockThreshold: number;
}>;

export const createProduct = async (
  db: Database,
  consultantId: string,
  overrides: ProductOverrides = {},
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(products)
    .values({
      consultantId,
      name: overrides.name ?? "Produto Factory",
      brandCode: overrides.brandCode ?? null,
      costCents: overrides.costCents ?? DEFAULT_COST_CENTS,
      purchaseDiscountBps: overrides.purchaseDiscountBps ?? null,
      priceCents: overrides.priceCents ?? DEFAULT_PRICE_CENTS,
      stockQty: overrides.stockQty ?? DEFAULT_STOCK_QTY,
      lowStockThreshold:
        overrides.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
    })
    .returning({ id: products.id });

  if (!row) {
    throw new Error("factory createProduct: falha ao inserir o produto");
  }

  return { id: row.id };
};
