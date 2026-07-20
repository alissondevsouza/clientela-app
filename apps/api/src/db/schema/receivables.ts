import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sales } from "./sales";

export const receivables = pgTable(
  "receivables",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Recebível é agregado da venda. onDelete cascade: some com a venda. Escopo
    // por consultora vem do join com sales (sem consultantId aqui — plan.md).
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    // Dinheiro sempre em centavos (integer) — nunca float. Parcela sempre > 0
    // (o service garante total >= parcelas antes de dividir).
    amountCents: integer("amount_cents").notNull(),
    // Vencimento não tem hora nem fuso: coluna `date` em modo string evita o
    // shift de timezone do driver (armazena/devolve "yyyy-mm-dd" literal) —
    // coerente com clients.birthday.
    dueDate: date("due_date", { mode: "string" }).notNull(),
    // null = pendente; timestamp = data da baixa do pagamento.
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECK de invariante: valor da parcela sempre positivo. DDL literal via
    // sql.raw para migração determinística — lesson 2026-07-16.
    check(
      "receivables_amount_cents_check",
      sql`${table.amountCents} > ${sql.raw("0")}`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índice para carregar
    // os recebíveis de uma venda.
    index("receivables_sale_id_idx").on(table.saleId),
  ],
);

export type Receivable = typeof receivables.$inferSelect;
export type NewReceivable = typeof receivables.$inferInsert;
