import { sql } from "drizzle-orm";
import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { consultants } from "./consultants";

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Cliente pertence a uma consultora (domínio multi-tenant-ready).
    // onDelete cascade: excluir a consultora leva os dados pessoais das clientes
    // dela — coerente com LGPD (dado pessoal não sobrevive ao dono) e evita
    // órfãos sem consultora. Exclusão de consultora é operação rara e explícita.
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    whatsapp: text("whatsapp").notNull(),
    // Aniversário não tem hora nem fuso: coluna `date` em modo string evita o
    // shift de timezone do driver (armazena/devolve "yyyy-mm-dd" literal).
    birthday: date("birthday", { mode: "string" }),
    skinTone: text("skin_tone"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Postgres não indexa FK automaticamente (database.md): índice explícito para
  // as listagens/lookups de clientes sempre escopadas por consultantId.
  (table) => [index("clients_consultant_id_idx").on(table.consultantId)],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
