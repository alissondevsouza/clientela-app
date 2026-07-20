import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const consultants = pgTable(
  "consultants",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    whatsapp: text("whatsapp").notNull(),
    // Meta mensal de vendas (CRM-07), em centavos. Nullable: null = sem meta
    // definida (o painel mostra CTA "Definir meta" em vez de progresso).
    monthlyGoalCents: integer("monthly_goal_cents"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECK > 0 quando presente: 0 não faz sentido de produto (divisão por zero
    // no progresso) — null é o "sem meta", não 0. DDL literal via sql.raw para
    // migração determinística (lesson 2026-07-16).
    check(
      "consultants_monthly_goal_cents_check",
      sql`${table.monthlyGoalCents} IS NULL OR ${table.monthlyGoalCents} > ${sql.raw("0")}`,
    ),
  ],
);

export type Consultant = typeof consultants.$inferSelect;
export type NewConsultant = typeof consultants.$inferInsert;
