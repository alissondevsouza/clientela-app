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
import { clients } from "./clients";
import { orders } from "./orders";
import { products } from "./products";

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Item pertence a um pedido. onDelete cascade: os itens são agregados do
    // pedido e somem com ele (não há exclusão física de pedido em rota —
    // FK declarada por consistência, espelha sale_items.sale_id).
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Produto do item. Nullable + onDelete set null: excluir o produto
    // preserva o item do pedido (RF-05/ADR-0013); `productName`/
    // `unitCostCents` são o snapshot no momento da inclusão.
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    // Snapshot do nome do produto no momento da inclusão — histórico legível
    // mesmo após a exclusão do produto.
    productName: text("product_name").notNull(),
    qty: integer("qty").notNull(),
    // Dinheiro sempre em centavos (integer) — nunca float. Snapshot do custo
    // unitário no momento da inclusão (RF-01/RF-05).
    unitCostCents: integer("unit_cost_cents").notNull(),
    // Vínculo opcional de encomenda: "esse item é da cliente X". Nullable +
    // onDelete set null: excluir a cliente (direito ao apagamento,
    // security.md) remove o vínculo por completo — item volta a aparecer
    // como reposição. Sem snapshot de nome (diferente de productName): não é
    // registro financeiro, o nome atual é derivado por join na leitura.
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECKs de invariante: quantidade positiva e custo não-negativo. DDL
    // literal via sql.raw para migração determinística — lesson 2026-07-16.
    check("order_items_qty_check", sql`${table.qty} >= ${sql.raw("1")}`),
    check(
      "order_items_unit_cost_cents_check",
      sql`${table.unitCostCents} >= ${sql.raw("0")}`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índices para
    // carregar os itens de um pedido e o lookup pelo produto vinculado.
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),
    index("order_items_client_id_idx").on(table.clientId),
  ],
);

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
