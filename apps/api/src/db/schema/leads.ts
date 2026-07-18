import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const leadStatusValues = [
  "new",
  "contacted",
  "converted",
  "discarded",
] as const;

export type LeadStatus = (typeof leadStatusValues)[number];

const DEFAULT_LEAD_STATUS: LeadStatus = "new";
const DEFAULT_LEAD_SOURCE = "landing";

const statusCheckLiterals = sql.raw(
  leadStatusValues.map((value) => `'${value.replace(/'/g, "''")}'`).join(", "),
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    name: text("name").notNull(),
    whatsapp: text("whatsapp").notNull(),
    interest: text("interest"),
    source: text("source").notNull().default(DEFAULT_LEAD_SOURCE),
    status: text("status", { enum: leadStatusValues })
      .notNull()
      .default(DEFAULT_LEAD_STATUS),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // text({ enum }) só restringe o tipo no TS; o CHECK real precisa ser explícito.
    // Deriva os literais de leadStatusValues para não haver drift entre TS e SQL.
    // sql.raw inline os literais (evita placeholders $1..$n); os valores são
    // constantes internas do domínio, com escape defensivo de aspas simples.
    check(
      "leads_status_check",
      sql`${table.status} IN (${statusCheckLiterals})`,
    ),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
