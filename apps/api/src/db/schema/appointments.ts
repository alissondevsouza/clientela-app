import {
  type AppointmentKind,
  type AppointmentStatus,
  appointmentKindValues,
  appointmentStatusValues,
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
import { leads } from "./leads";
import { sales } from "./sales";

const DEFAULT_APPOINTMENT_STATUS: AppointmentStatus = "scheduled";
const DURATION_MIN_MINUTES = 1;
const DURATION_MAX_MINUTES = 1440;

// Deriva os literais do enum de shared para o CHECK real (text({ enum }) só
// restringe o tipo no TS). sql.raw inline os literais (sem placeholders
// $1..$n) — são constantes internas do domínio, com escape defensivo de aspas
// (padrão orders_status_check/leads_status_check, lesson 2026-07-16).
const appointmentKindCheckLiterals = sql.raw(
  appointmentKindValues
    .map((value: AppointmentKind) => `'${value.replace(/'/g, "''")}'`)
    .join(", "),
);

const appointmentStatusCheckLiterals = sql.raw(
  appointmentStatusValues
    .map((value: AppointmentStatus) => `'${value.replace(/'/g, "''")}'`)
    .join(", "),
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    // Compromisso pertence a uma consultora. onDelete cascade: excluir a
    // consultora leva a agenda dela — coerente com clients/sales (RF-01).
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id, { onDelete: "cascade" }),
    // Vínculo de pessoa (RF-01/RF-02): nullable + onDelete set null. O banco
    // TOLERA client_id e lead_id preenchidos ao mesmo tempo (estado
    // pós-conversão de lead, RF-12) — a exclusividade é regra de contrato
    // (Zod), nunca CHECK (plan.md). Sem snapshot de nome/whatsapp (ADR-0016):
    // derivados por join na leitura.
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    leadId: uuid("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    // Venda gerada pelo encontro (RF-10). onDelete set null: excluir a venda
    // preserva o compromisso, apenas desvincula.
    saleId: uuid("sale_id").references(() => sales.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: appointmentKindValues }).notNull(),
    title: text("title"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status", { enum: appointmentStatusValues })
      .notNull()
      .default(DEFAULT_APPOINTMENT_STATUS),
    location: text("location"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // CHECKs de invariante de domínio: duração entre 1 e 1440 minutos, kind e
    // status restritos aos valores do vocabulário do shared. DDL literal via
    // sql.raw para migração determinística (sem placeholders) — lesson
    // 2026-07-16.
    check(
      "appointments_duration_minutes_check",
      sql`${table.durationMinutes} >= ${sql.raw(String(DURATION_MIN_MINUTES))} AND ${table.durationMinutes} <= ${sql.raw(String(DURATION_MAX_MINUTES))}`,
    ),
    check(
      "appointments_kind_check",
      sql`${table.kind} IN (${appointmentKindCheckLiterals})`,
    ),
    check(
      "appointments_status_check",
      sql`${table.status} IN (${appointmentStatusCheckLiterals})`,
    ),
    // Postgres não indexa FK automaticamente (database.md). Exatamente quatro
    // índices (RF-01): o composto (consultant_id, starts_at) cobre, por
    // prefixo, toda query escopada por consultora — por isso NÃO há índice
    // simples de consultant_id. Os demais suportam os lookups por pessoa/venda
    // vinculada.
    index("appointments_consultant_id_starts_at_idx").on(
      table.consultantId,
      table.startsAt,
    ),
    index("appointments_client_id_idx").on(table.clientId),
    index("appointments_lead_id_idx").on(table.leadId),
    index("appointments_sale_id_idx").on(table.saleId),
  ],
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
