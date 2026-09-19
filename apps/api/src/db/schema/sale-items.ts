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
import { products } from "./products";
import { sales } from "./sales";

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Item pertence a uma venda. onDelete cascade: os itens são agregados da
    // venda e somem com ela. Caminho real desde o Milestone 4: `DELETE
    // /sales/:id` (sales.repository.ts `remove`) reverte o estoque quando
    // aplicável e então apaga a venda dentro da mesma transação — a cascata do
    // banco cobre `sale_items` (e `receivables`), não o estoque.
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    // Produto do item. Nullable + onDelete set null: excluir o produto (LGPD/
    // gestão) preserva o item; `productName`/`unitPriceCents` são o snapshot.
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    // Snapshot do nome do produto no momento da venda — histórico legível mesmo
    // após a exclusão do produto.
    productName: text("product_name").notNull(),
    qty: integer("qty").notNull(),
    // Dinheiro sempre em centavos (integer) — nunca float. Snapshot do preço
    // unitário praticado na venda.
    unitPriceCents: integer("unit_price_cents").notNull(),
    // Snapshot do CUSTO do produto no momento da venda (CRM-07/lucro estimado):
    // imuniza o lucro contra mudanças de custo do produto depois da venda (mesmo
    // racional do preço). `default 0` é rede de segurança só para linhas
    // pré-existentes na migração (sem produção) — createSale sempre grava o valor
    // real (nunca depende do default).
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECKs de invariante: quantidade positiva e preço não-negativo. DDL literal
    // via sql.raw para migração determinística — lesson 2026-07-16.
    check("sale_items_qty_check", sql`${table.qty} > ${sql.raw("0")}`),
    check(
      "sale_items_unit_price_cents_check",
      sql`${table.unitPriceCents} >= ${sql.raw("0")}`,
    ),
    check(
      "sale_items_cost_cents_check",
      sql`${table.costCents} >= ${sql.raw("0")}`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índices para carregar
    // os itens de uma venda e o lookup pelo produto vinculado.
    index("sale_items_sale_id_idx").on(table.saleId),
    index("sale_items_product_id_idx").on(table.productId),
  ],
);

export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;
