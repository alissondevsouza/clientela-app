import type {
  Product,
  ProductsSummary,
  UpdateProduct,
} from "@clientela/shared";
import {
  and,
  asc,
  count,
  eq,
  ilike,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client";
import { products, saleItems, sales } from "../../db/schema";
import { ProductReservedError } from "./products.errors";
import type {
  InsertProduct,
  ListProductsParams,
  ProductsRepositoryPort,
  ProductUpdateResolver,
} from "./products.service";

export type ProductsRepository = ReturnType<typeof createProductsRepository>;

type ProductRow = typeof products.$inferSelect;

// Reserva é derivada, nunca persistida: considera só itens ainda vinculados a
// vendas abertas e não entregues da mesma consultora.
const reservedQtyExpression = sql<string>`COALESCE((
  SELECT SUM("sale_items"."qty"::bigint)
  FROM "sale_items"
  INNER JOIN "sales" ON "sales"."id" = "sale_items"."sale_id"
  WHERE "sale_items"."product_id" = "products"."id"
    AND "sales"."consultant_id" = "products"."consultant_id"
    AND "sales"."status" = 'open'
    AND "sales"."delivered_at" IS NULL
), 0)`;

const availableQtyExpression = sql<number>`${products.stockQty} - ${reservedQtyExpression}`;

const productProjection = {
  id: products.id,
  consultantId: products.consultantId,
  name: products.name,
  brandCode: products.brandCode,
  costCents: products.costCents,
  purchaseDiscountBps: products.purchaseDiscountBps,
  priceCents: products.priceCents,
  stockQty: products.stockQty,
  lowStockThreshold: products.lowStockThreshold,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  reservedQty: reservedQtyExpression,
};

// Escapa os curingas de LIKE/ILIKE (`\`, `%`, `_`) para que a busca trate o
// termo como literal — não repetir o BUG-001 (um `%` na busca traria tudo).
// Todos os curingas são cobertos por uma única classe `[\\%_]` num replace de
// passada única — não há ordem entre eles: cada caractere casado é prefixado com
// `\` independentemente. Exportado para teste de unidade dedicado (RF-03).
// Postgres usa `\` como escape default de LIKE/ILIKE — coerente com o prefixo.
export const escapeLikeTerm = (term: string): string =>
  term.replace(/[\\%_]/g, (char) => `\\${char}`);

// Converte para número um valor monetário agregado (SUM em centavos) que chega
// como string/number do driver. Dinheiro exige exatidão: acima de
// `Number.MAX_SAFE_INTEGER` a conversão para `number` perde precisão
// SILENCIOSAMENTE, então em vez de devolver um valor de dinheiro errado
// lançamos — o erro sobe ao error-handler central (500). Última linha de defesa
// da invariante "dinheiro exato" (ALERTA-1); cenário só atingível com estoque ×
// preço irrealistas, mas nunca aceitável perder centavos.
export const toSafeInteger = (
  value: string | number,
  field: string,
): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `Agregado de ${field} excede a precisão inteira segura (${value})`,
    );
  }
  return parsed;
};

// Molda a linha do banco no contrato de resposta (Product). Estoque baixo é
// derivado da disponibilidade; `consultantId` fica de fora do contrato público.
const toProduct = (row: ProductRow, reservedQty: string | number): Product => {
  const normalizedReservedQty = toSafeInteger(reservedQty, "reservedQty");
  const availableQty = row.stockQty - normalizedReservedQty;

  return {
    id: row.id,
    name: row.name,
    brandCode: row.brandCode,
    costCents: row.costCents,
    purchaseDiscountBps: row.purchaseDiscountBps,
    priceCents: row.priceCents,
    stockQty: row.stockQty,
    reservedQty: normalizedReservedQty,
    availableQty,
    lowStockThreshold: row.lowStockThreshold,
    lowStock: availableQty <= row.lowStockThreshold,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

// Condição de busca: `ILIKE %termo%` em name OU brand_code (case-insensitive),
// com o termo escapado (curingas tratados como literais).
const buildSearchCondition = (search: string): SQL | undefined => {
  const term = `%${escapeLikeTerm(search)}%`;
  return or(ilike(products.name, term), ilike(products.brandCode, term));
};

// Filtro de estoque baixo: mesma comparação que gera `lowStock` no mapper.
const lowStockCondition = (): SQL =>
  lte(availableQtyExpression, products.lowStockThreshold);

// Única camada que toca o banco (api.md/database.md). TODA query filtra por
// `consultant_id` (escopo por consultora — RF-03); os retornos são moldados na
// porta que o service espera.
export const createProductsRepository = (
  db: Database,
): ProductsRepositoryPort => {
  const insert = async (product: InsertProduct): Promise<Product> => {
    const [row] = await db.insert(products).values(product).returning();

    if (!row) {
      throw new Error("Falha ao persistir produto: insert não retornou linha");
    }

    return toProduct(row, 0);
  };

  const findById = async (
    consultantId: string,
    id: string,
  ): Promise<Product | undefined> => {
    const [row] = await db
      .select(productProjection)
      .from(products)
      .where(and(eq(products.consultantId, consultantId), eq(products.id, id)))
      .limit(1);

    return row ? toProduct(row, row.reservedQty) : undefined;
  };

  const update = async (
    consultantId: string,
    id: string,
    patch: UpdateProduct,
    resolve: ProductUpdateResolver,
  ): Promise<Product | undefined> => {
    return db.transaction(async (tx) => {
      const [currentRow] = await tx
        .select(productProjection)
        .from(products)
        .where(
          and(eq(products.consultantId, consultantId), eq(products.id, id)),
        )
        .limit(1)
        .for("update");

      if (!currentRow) {
        return undefined;
      }

      const resolvedPatch = resolve(
        toProduct(currentRow, currentRow.reservedQty),
        patch,
      );
      const [updatedRow] = await tx
        .update(products)
        .set(resolvedPatch)
        .where(
          and(eq(products.consultantId, consultantId), eq(products.id, id)),
        )
        .returning();

      if (!updatedRow) {
        throw new Error(
          "Falha ao persistir produto: update não retornou linha",
        );
      }

      return toProduct(updatedRow, currentRow.reservedQty);
    });
  };

  const remove = async (consultantId: string, id: string): Promise<boolean> => {
    return db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(eq(products.consultantId, consultantId), eq(products.id, id)),
        )
        .for("update");
      if (!product) return false;
      const [reservation] = await tx
        .select({ id: saleItems.id })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(
          and(
            eq(saleItems.productId, id),
            eq(sales.consultantId, consultantId),
            eq(sales.status, "open"),
            isNull(sales.deliveredAt),
          ),
        )
        .limit(1);
      if (reservation) throw new ProductReservedError();
      const deleted = await tx
        .delete(products)
        .where(eq(products.id, id))
        .returning({ id: products.id });
      return deleted.length > 0;
    });
  };

  const list = async (
    consultantId: string,
    { page, perPage, search, lowStock }: ListProductsParams,
  ): Promise<{ rows: Product[]; total: number }> => {
    const conditions: SQL[] = [eq(products.consultantId, consultantId)];
    const searchCondition = search ? buildSearchCondition(search) : undefined;
    if (searchCondition) {
      conditions.push(searchCondition);
    }
    if (lowStock) {
      conditions.push(lowStockCondition());
    }
    const where = and(...conditions);
    const offset = (page - 1) * perPage;

    const rows = await db
      .select(productProjection)
      .from(products)
      .where(where)
      // Ordenação estável: name asc com o id como desempate determinístico.
      .orderBy(asc(products.name), asc(products.id))
      .limit(perPage)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(products)
      .where(where);

    return {
      rows: rows.map((row) => toProduct(row, row.reservedQty)),
      total: totalRow?.value ?? 0,
    };
  };

  // Agregado da consultora em uma única query. Cast `::bigint` na multiplicação
  // por linha evita overflow de integer antes do SUM (cost/price até 1e8 ×
  // estoque até 1e6 estoura integer). `COALESCE` devolve 0 sem produtos. SUM de
  // bigint e COUNT chegam como string pelo driver — convertidos para número.
  const summary = async (consultantId: string): Promise<ProductsSummary> => {
    const [row] = await db
      .select({
        stockCostCents: sql<string>`COALESCE(SUM(${products.costCents}::bigint * ${products.stockQty}), 0)`,
        stockPriceCents: sql<string>`COALESCE(SUM(${products.priceCents}::bigint * ${products.stockQty}), 0)`,
        lowStockCount: sql<string>`COUNT(*) FILTER (WHERE ${availableQtyExpression} <= ${products.lowStockThreshold})`,
      })
      .from(products)
      .where(eq(products.consultantId, consultantId));

    return {
      stockCostCents: toSafeInteger(row?.stockCostCents ?? 0, "stockCostCents"),
      stockPriceCents: toSafeInteger(
        row?.stockPriceCents ?? 0,
        "stockPriceCents",
      ),
      lowStockCount: toSafeInteger(row?.lowStockCount ?? 0, "lowStockCount"),
    };
  };

  return { insert, findById, update, delete: remove, list, summary };
};
