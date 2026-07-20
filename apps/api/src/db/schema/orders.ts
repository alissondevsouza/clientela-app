import { type OrderStatus, orderStatusValues } from "@clientela/shared";
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

const DEFAULT_ORDER_STATUS: OrderStatus = "draft";
const DEFAULT_TOTAL_CENTS = 0;

// Deriva os literais do enum de shared para o CHECK real (text({ enum }) só
// restringe o tipo no TS). sql.raw inline os literais (sem placeholders
// $1..$n) — são constantes internas do domínio, com escape defensivo de aspas
// (padrão sales_status_check/leads_status_check, lesson 2026-07-16).
const orderStatusCheckLiterals = sql.raw(
  orderStatusValues
    .map((value: OrderStatus) => `'${value.replace(/'/g, "''")}'`)
    .join(", "),
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Pedido pertence a uma consultora (multi-tenant-ready). onDelete cascade:
    // excluir a consultora leva o histórico dela — coerente com sales/products.
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id, { onDelete: "cascade" }),
    status: text("status", { enum: orderStatusValues })
      .notNull()
      .default(DEFAULT_ORDER_STATUS),
    // Dinheiro sempre em centavos (integer) — nunca float (database.md/api.md).
    // Sempre calculado no servidor a partir dos itens (RF-01); default 0 é a
    // rede de segurança do rascunho recém-criado sem itens.
    totalCents: integer("total_cents").notNull().default(DEFAULT_TOTAL_CENTS),
    // Timestamps de transição (RF-03): nullable — ausência = a transição
    // correspondente ainda não ocorreu. Só gravados pelos endpoints de
    // place/deliver/cancel.
    placedAt: timestamp("placed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECKs de invariante de domínio: total nunca negativo, status restrito
    // aos valores do vocabulário do shared. DDL literal via sql.raw para
    // migração determinística (sem placeholders) — lesson 2026-07-16.
    check(
      "orders_total_cents_check",
      sql`${table.totalCents} >= ${sql.raw("0")}`,
    ),
    check(
      "orders_status_check",
      sql`${table.status} IN (${orderStatusCheckLiterals})`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índice para as
    // listagens escopadas por consultora. Sem índice em `status`: nenhuma
    // tabela do projeto indexa status hoje (sales/leads não têm precedente) e
    // não há query que o justifique (database.md — índice sem query não entra).
    index("orders_consultant_id_idx").on(table.consultantId),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
