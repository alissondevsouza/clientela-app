import {
  type CardType,
  cardTypeValues,
  type PaymentCondition,
  type PaymentMethod,
  paymentConditionValues,
  paymentMethodValues,
  type SaleStatus,
  saleStatusValues,
} from "@clientela/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
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

const DEFAULT_SALE_STATUS: SaleStatus = "open";
const DEFAULT_PAYMENT_CONDITION: PaymentCondition = "received";
const DEFAULT_INSTALLMENTS = 1;

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

const paymentConditionCheckLiterals = sql.raw(
  paymentConditionValues
    .map((value: PaymentCondition) => `'${value.replace(/'/g, "''")}'`)
    .join(", "),
);

const cardTypeCheckLiterals = sql.raw(
  cardTypeValues
    .map((value: CardType) => `'${value.replace(/'/g, "''")}'`)
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
    paymentCondition: text("payment_condition", {
      enum: paymentConditionValues,
    })
      .$type<PaymentCondition>()
      .notNull()
      .default(DEFAULT_PAYMENT_CONDITION),
    cardType: text("card_type", {
      enum: cardTypeValues,
    }).$type<CardType>(),
    installments: integer("installments")
      .notNull()
      .default(DEFAULT_INSTALLMENTS),
    paymentPlanKnown: boolean("payment_plan_known").notNull().default(true),
    status: text("status", { enum: saleStatusValues })
      .notNull()
      .default(DEFAULT_SALE_STATUS),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
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
    check(
      "sales_payment_condition_check",
      sql`${table.paymentCondition} IN (${paymentConditionCheckLiterals})`,
    ),
    check(
      "sales_card_type_check",
      sql`${table.cardType} IS NULL OR ${table.cardType} IN (${cardTypeCheckLiterals})`,
    ),
    check(
      "sales_installments_check",
      sql`${table.installments} BETWEEN ${sql.raw("1")} AND ${sql.raw("24")}`,
    ),
    check(
      "sales_payment_matrix_check",
      sql`(
        (${table.paymentMethod} IN ('cash', 'pix')
          AND ${table.cardType} IS NULL
          AND (
            (${table.paymentCondition} IN ('received', 'on_delivery') AND ${table.installments} = 1)
            OR (${table.paymentMethod} = 'pix' AND ${table.paymentCondition} = 'installments' AND ${table.installments} BETWEEN 2 AND 24)
          )
        )
        OR (${table.paymentMethod} = 'card' AND (
          (${table.cardType} IS NULL AND ${table.paymentCondition} = 'received' AND ${table.installments} = 1)
          OR (${table.cardType} = 'debit' AND ${table.paymentCondition} IN ('received', 'on_delivery') AND ${table.installments} = 1)
          OR (${table.cardType} = 'credit' AND (
            (${table.paymentCondition} IN ('received', 'on_delivery') AND ${table.installments} BETWEEN 1 AND 24)
            OR (${table.paymentCondition} = 'installments' AND ${table.installments} BETWEEN 2 AND 24)
          ))
        ))
        OR (${table.paymentMethod} = 'credit'
          AND ${table.cardType} IS NULL
          AND ${table.paymentCondition} = 'installments'
          AND ${table.installments} BETWEEN 1 AND 24)
      )`,
    ),
    // Não restringe created_at <= sold_at: venda retroativa é criada hoje com
    // sold_at no passado (RF-02/plan.md). O guard de coerência que sobra é
    // sold_at <= updated_at — o banco não pode barrar data futura (CHECK não
    // chama now()); isso é responsabilidade do service (relógio do Postgres).
    check(
      "sales_temporal_matrix_check",
      sql`${table.createdAt} <= ${table.updatedAt}
        AND ${table.soldAt} <= ${table.updatedAt}
        AND (${table.deliveredAt} IS NULL OR (${table.soldAt} <= ${table.deliveredAt} AND ${table.deliveredAt} <= ${table.updatedAt}))
        AND (${table.completedAt} IS NULL OR (${table.deliveredAt} IS NOT NULL AND ${table.deliveredAt} <= ${table.completedAt} AND ${table.completedAt} <= ${table.updatedAt}))
        AND (${table.canceledAt} IS NULL OR (${table.soldAt} <= ${table.canceledAt} AND ${table.canceledAt} <= ${table.updatedAt} AND (${table.deliveredAt} IS NULL OR ${table.deliveredAt} <= ${table.canceledAt})))
        AND (
          (${table.status} = 'open' AND ${table.completedAt} IS NULL AND ${table.canceledAt} IS NULL)
          OR (${table.status} = 'completed' AND ${table.deliveredAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.canceledAt} IS NULL)
          OR (${table.status} = 'canceled' AND ${table.completedAt} IS NULL AND ${table.canceledAt} IS NOT NULL)
        )`,
    ),
    // Postgres não indexa FK automaticamente (database.md): índices para as
    // listagens escopadas por consultora e o lookup pela cliente vinculada.
    index("sales_consultant_id_idx").on(table.consultantId),
    index("sales_client_id_idx").on(table.clientId),
  ],
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
