import {
  type PaymentMethod,
  paymentMethodValues,
  type SaleStatus,
  saleStatusValues,
} from "@clientela/shared";
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
import { consultants } from "./consultants";

const DEFAULT_SALE_STATUS: SaleStatus = "completed";

// Deriva os literais dos enums de shared para o CHECK real (text({ enum }) só
// restringe o tipo no TS). sql.raw inline os literais (sem placeholders
// $1..$n) — são constantes internas do domínio, com escape defensivo de aspas.
const paymentMethodCheckLiterals = sql.raw(
  paymentMethodValues
    .map((value: PaymentMethod) => `'${value.replace(/'/g, "''")}'`)
    .join(", "),
);

const saleStatusCheckLiterals = sql.raw(
  saleStatusValues
    .map((value: SaleStatus) => `'${value.replace(/'/g, "''")}'`)
    .join(", "),
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Venda pertence a uma consultora (multi-tenant-ready). onDelete cascade:
    // excluir a consultora leva o histórico dela — coerente com clients/products.
    // A invariante "venda não se apaga" é regra de operação, não de exclusão da
    // conta (RF-01/spec).
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id, { onDelete: "cascade" }),
    // Cliente da venda. Nullable + onDelete set null: excluir a cliente (LGPD)
    // preserva a venda sem o vínculo pessoal; `clientName` mantém o histórico
    // legível via snapshot.
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    // Snapshot do nome da cliente no momento da venda: sobrevive à exclusão do
    // cadastro (registro financeiro é obrigação legítima — ver Restrições/spec).
    clientName: text("client_name").notNull(),
    // Dinheiro sempre em centavos (integer) — nunca float (database.md/api.md).
    totalCents: integer("total_cents").notNull(),
    paymentMethod: text("payment_method", {
      enum: paymentMethodValues,
    }).notNull(),
    status: text("status", { enum: saleStatusValues })
      .notNull()
      .default(DEFAULT_SALE_STATUS),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECK de invariante de domínio: total nunca negativo. DDL literal via
    // sql.raw para migração determinística (sem placeholders) — lesson 2026-07-16.
    check(
      "sales_total_cents_check",
      sql`${table.totalCents} >= ${sql.raw("0")}`,
    ),
    // CHECKs de enum derivados de shared (sem drift entre TS e SQL) — padrão
    // leads_status_check.
    check(
      "sales_payment_method_check",
      sql`${table.paymentMethod} IN (${paymentMethodCheckLiterals})`,
    ),
    check(
      "sales_status_check",
      sql`${table.status} IN (${saleStatusCheckLiterals})`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índices para as
    // listagens escopadas por consultora e o lookup pela cliente vinculada.
    index("sales_consultant_id_idx").on(table.consultantId),
    index("sales_client_id_idx").on(table.clientId),
  ],
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
