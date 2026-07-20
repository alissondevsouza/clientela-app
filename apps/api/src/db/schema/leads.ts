import { type LeadStatus, leadStatusValues } from "@clientela/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";

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
    // Vínculo com a cliente criada na conversão do lead. Nullable: lead ainda não
    // convertido (sem cliente) e também lead convertido cuja cliente foi excluída
    // depois (LGPD apaga a cliente; o lead é histórico de captação e sobrevive —
    // onDelete set null desfaz só o vínculo). Ver RF-01/spec.
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
    // text({ enum }) só restringe o tipo no TS; o CHECK real precisa ser explícito.
    // Deriva os literais de leadStatusValues para não haver drift entre TS e SQL.
    // sql.raw inline os literais (evita placeholders $1..$n); os valores são
    // constantes internas do domínio, com escape defensivo de aspas simples.
    check(
      "leads_status_check",
      sql`${table.status} IN (${statusCheckLiterals})`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índice para o lookup
    // de leads pela cliente vinculada.
    index("leads_client_id_idx").on(table.clientId),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
