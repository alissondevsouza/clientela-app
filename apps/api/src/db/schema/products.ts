import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { consultants } from "./consultants";

const DEFAULT_STOCK_QTY = 0;
const DEFAULT_LOW_STOCK_THRESHOLD = 1;

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Produto pertence a uma consultora (multi-tenant-ready). onDelete cascade:
    // excluir a consultora leva o catálogo dela — coerente com clients/leads.
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Código Mary Kay do produto; nem todo item tem código cadastrado.
    brandCode: text("brand_code"),
    // Dinheiro sempre em centavos (integer) — nunca float (database.md/api.md).
    costCents: integer("cost_cents").notNull(),
    priceCents: integer("price_cents").notNull(),
    stockQty: integer("stock_qty").notNull().default(DEFAULT_STOCK_QTY),
    lowStockThreshold: integer("low_stock_threshold")
      .notNull()
      .default(DEFAULT_LOW_STOCK_THRESHOLD),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECKs de invariantes de domínio: dinheiro e quantidades nunca negativos.
    // DDL literal via sql.raw para gerar migração determinística (sem
    // placeholders $1..$n) — lesson 2026-07-16.
    check(
      "products_cost_cents_check",
      sql`${table.costCents} >= ${sql.raw("0")}`,
    ),
    check(
      "products_price_cents_check",
      sql`${table.priceCents} >= ${sql.raw("0")}`,
    ),
    check(
      "products_stock_qty_check",
      sql`${table.stockQty} >= ${sql.raw("0")}`,
    ),
    check(
      "products_low_stock_threshold_check",
      sql`${table.lowStockThreshold} >= ${sql.raw("0")}`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índice para as
    // listagens/lookups de produtos sempre escopadas por consultantId.
    index("products_consultant_id_idx").on(table.consultantId),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
