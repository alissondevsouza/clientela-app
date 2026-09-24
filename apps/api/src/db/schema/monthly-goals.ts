import { MONEY_MAX_CENTS } from "@clientela/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { consultants } from "./consultants";

const MONEY_MAX_CENTS_SQL = sql.raw(String(MONEY_MAX_CENTS));

export const monthlyGoals = pgTable(
  "monthly_goals",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Meta pertence a uma consultora (multi-tenant-ready). onDelete cascade:
    // excluir a consultora leva o histórico de metas dela — coerente com
    // clients/products/sales.
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id, { onDelete: "cascade" }),
    // Sempre o dia 1 do mês (CHECK abaixo) — representa o mês local, não um
    // instante. `date` (sem fuso) porque a granularidade é o mês da
    // consultora, calculada em TS a partir de APP_TIME_ZONE (ADR-0018).
    monthStart: date("month_start", { mode: "string" }).notNull(),
    // Dinheiro sempre em centavos (integer) — nunca float (database.md).
    // Nullable com significado explícito (RF-07): NULL = "sem meta a partir
    // deste mês" (remoção). A meta efetiva de um mês M é o goal_cents da
    // linha de maior month_start <= M; ausência de linha <= M = sem meta.
    goalCents: integer("goal_cents"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECKs de invariantes de domínio. DDL literal via sql.raw para migração
    // determinística (sem placeholders $1..$n) — lesson 2026-07-16.
    check(
      "monthly_goals_month_start_day_check",
      sql`EXTRACT(DAY FROM ${table.monthStart}) = ${sql.raw("1")}`,
    ),
    check(
      "monthly_goals_goal_cents_check",
      sql`${table.goalCents} IS NULL OR (${table.goalCents} > ${sql.raw("0")} AND ${table.goalCents} <= ${MONEY_MAX_CENTS_SQL})`,
    ),
    // Unicidade (consultora, mês) — RF-07. Postgres não indexa FK
    // automaticamente (database.md); esta constraint única, com
    // consultant_id na frente, cobre também o lookup por FK.
    unique("monthly_goals_consultant_id_month_start_key").on(
      table.consultantId,
      table.monthStart,
    ),
  ],
);

export type MonthlyGoal = typeof monthlyGoals.$inferSelect;
export type NewMonthlyGoal = typeof monthlyGoals.$inferInsert;
