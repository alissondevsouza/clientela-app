import { readFile } from "node:fs/promises";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { describe, expect, it } from "vitest";
import { createDb } from "./client";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
const POSTGRES_IMAGE = "postgres:18-alpine";
const MIGRATION_STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const PRE_EXPANSION_MIGRATIONS = [
  "0000_new_gideon.sql",
  "0001_third_trauma.sql",
  "0002_clear_yellowjacket.sql",
  "0003_married_blue_shield.sql",
  "0004_sturdy_thundra.sql",
  "0005_motionless_doctor_octopus.sql",
  "0006_ambiguous_luminals.sql",
  "0007_rare_solo.sql",
  "0008_volatile_joseph.sql",
  "0009_dizzy_polaris.sql",
  "0010_green_leo.sql",
] as const;
const EXPANSION_MIGRATION = "0011_lively_morg.sql";
const BACKFILL_MIGRATION = "0012_sales_lifecycle_backfill.sql";
const CONTRACTION_MIGRATION = "0013_optimal_midnight.sql";
const RETROACTIVE_DATES_MIGRATION = "0014_brief_lifeguard.sql";

type PgClient = ReturnType<typeof createDb>["sql"];

type LegacySale = {
  id: string;
  paymentMethod: "cash" | "pix" | "card" | "credit";
  status: "completed" | "canceled";
  totalCents: number;
  soldAt: string;
  createdAt: string;
  updatedAt: string;
};

const migrationUrl = (name: string): URL =>
  new URL(`../../drizzle/${name}`, import.meta.url);

const applyMigration = async (sql: PgClient, name: string): Promise<void> => {
  const contents = await readFile(migrationUrl(name), "utf8");
  const statements = contents
    .split(MIGRATION_STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await sql.unsafe(statement);
  }
};

const startLegacyDatabase = async (): Promise<{
  container: StartedPostgreSqlContainer;
  sql: PgClient;
  consultantId: string;
}> => {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const sql = createDb(container.getConnectionUri()).sql;

  for (const migration of PRE_EXPANSION_MIGRATIONS) {
    await applyMigration(sql, migration);
  }

  const [consultant] = await sql<{ id: string }[]>`
    INSERT INTO consultants (name, email, password_hash, whatsapp)
    VALUES ('Consultora Migração', 'crm-12-migration@example.com', 'hash-fake', '11999999999')
    RETURNING id
  `;
  if (!consultant) {
    throw new Error("Falha ao criar consultora da migração.");
  }

  return { container, sql, consultantId: consultant.id };
};

const insertLegacySale = async (
  sql: PgClient,
  consultantId: string,
  sale: Omit<LegacySale, "id">,
): Promise<LegacySale> => {
  const [inserted] = await sql<LegacySale[]>`
    INSERT INTO sales (
      consultant_id, client_name, total_cents, payment_method, status,
      sold_at, created_at, updated_at
    ) VALUES (
      ${consultantId}, 'Cliente legado', ${sale.totalCents}, ${sale.paymentMethod}, ${sale.status},
      ${sale.soldAt}::timestamptz, ${sale.createdAt}::timestamptz, ${sale.updatedAt}::timestamptz
    )
    RETURNING
      id,
      payment_method AS "paymentMethod",
      status,
      total_cents AS "totalCents",
      sold_at::text AS "soldAt",
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt"
  `;
  if (!inserted) {
    throw new Error("Falha ao criar venda legada.");
  }
  return inserted;
};

const insertLegacyReceivable = async (
  sql: PgClient,
  saleId: string,
  values: {
    amountCents: number;
    dueDate?: string;
    paidAt?: string | null;
    createdAt: string;
    updatedAt: string;
  },
): Promise<void> => {
  await sql`
    INSERT INTO receivables (sale_id, amount_cents, due_date, paid_at, created_at, updated_at)
    VALUES (
      ${saleId}, ${values.amountCents}, ${values.dueDate ?? "2026-06-10"},
      ${values.paidAt ?? null}::timestamptz, ${values.createdAt}::timestamptz, ${values.updatedAt}::timestamptz
    )
  `;
};

const stopDatabase = async (
  sql: PgClient | undefined,
  container: StartedPostgreSqlContainer | undefined,
): Promise<void> => {
  try {
    await sql?.end();
  } finally {
    await container?.stop();
  }
};

describe("backfill CRM-12/13 0010 → 0011 → 0012 → 0013 → 0014 (integração)", () => {
  it(
    "transforma todas as classes legadas sem alterar snapshots, estoque ou valores",
    async () => {
      let container: StartedPostgreSqlContainer | undefined;
      let sql: PgClient | undefined;
      try {
        const database = await startLegacyDatabase();
        container = database.container;
        sql = database.sql;
        const createdAt = "2026-06-01T12:00:00.000Z";
        const soldAt = "2026-06-02T12:00:00.000Z";
        const updatedAt = "2026-06-03T12:00:00.000Z";
        const paidAt = "2026-06-04T12:00:00.000Z";

        const immediatePaid = await insertLegacySale(
          sql,
          database.consultantId,
          {
            paymentMethod: "cash",
            status: "completed",
            totalCents: 1000,
            createdAt,
            soldAt,
            updatedAt,
          },
        );
        const immediateZero = await insertLegacySale(
          sql,
          database.consultantId,
          {
            paymentMethod: "pix",
            status: "completed",
            totalCents: 0,
            createdAt,
            soldAt,
            updatedAt,
          },
        );
        const [legacyProduct] = await sql<{ id: string }[]>`
          INSERT INTO products (
            consultant_id, name, cost_cents, price_cents, stock_qty, low_stock_threshold
          ) VALUES (${database.consultantId}, 'Produto preservado', 400, 1000, 7, 2)
          RETURNING id
        `;
        if (!legacyProduct) {
          throw new Error("Falha ao criar produto legado.");
        }
        await sql`
          INSERT INTO sale_items (
            sale_id, product_id, product_name, qty, unit_price_cents, cost_cents
          ) VALUES (${immediatePaid.id}, ${legacyProduct.id}, 'Snapshot preservado', 2, 1000, 400)
        `;
        const creditPaid = await insertLegacySale(sql, database.consultantId, {
          paymentMethod: "credit",
          status: "completed",
          totalCents: 1000,
          createdAt,
          soldAt,
          updatedAt,
        });
        await insertLegacyReceivable(sql, creditPaid.id, {
          amountCents: 500,
          paidAt: "2026-06-03T12:00:00.000Z",
          createdAt: soldAt,
          updatedAt: "2026-06-03T12:00:00.000Z",
        });
        await insertLegacyReceivable(sql, creditPaid.id, {
          amountCents: 500,
          paidAt,
          createdAt: soldAt,
          updatedAt: paidAt,
        });
        const creditPending = await insertLegacySale(
          sql,
          database.consultantId,
          {
            paymentMethod: "credit",
            status: "completed",
            totalCents: 1000,
            createdAt,
            soldAt,
            updatedAt,
          },
        );
        await insertLegacyReceivable(sql, creditPending.id, {
          amountCents: 500,
          paidAt: soldAt,
          createdAt: soldAt,
          updatedAt: soldAt,
        });
        await insertLegacyReceivable(sql, creditPending.id, {
          amountCents: 500,
          paidAt: null,
          createdAt: soldAt,
          updatedAt,
        });
        const creditZero = await insertLegacySale(sql, database.consultantId, {
          paymentMethod: "credit",
          status: "completed",
          totalCents: 0,
          createdAt,
          soldAt,
          updatedAt,
        });
        const canceledImmediate = await insertLegacySale(
          sql,
          database.consultantId,
          {
            paymentMethod: "card",
            status: "canceled",
            totalCents: 1000,
            createdAt,
            soldAt,
            updatedAt,
          },
        );
        const canceledCredit = await insertLegacySale(
          sql,
          database.consultantId,
          {
            paymentMethod: "credit",
            status: "canceled",
            totalCents: 1000,
            createdAt,
            soldAt,
            updatedAt,
          },
        );
        const canceledZero = await insertLegacySale(
          sql,
          database.consultantId,
          {
            paymentMethod: "credit",
            status: "canceled",
            totalCents: 0,
            createdAt,
            soldAt,
            updatedAt,
          },
        );

        await applyMigration(sql, EXPANSION_MIGRATION);
        await applyMigration(sql, BACKFILL_MIGRATION);
        await applyMigration(sql, CONTRACTION_MIGRATION);
        await applyMigration(sql, RETROACTIVE_DATES_MIGRATION);

        const sales = await sql<
          {
            id: string;
            status: string;
            paymentCondition: string;
            installments: number;
            paymentPlanKnown: boolean;
            totalCents: number;
            soldAt: string;
            createdAt: string;
            deliveredAt: string;
            completedAt: string | null;
            canceledAt: string | null;
            updatedAt: string;
          }[]
        >`
          SELECT id, status, payment_condition AS "paymentCondition", installments,
            payment_plan_known AS "paymentPlanKnown",
            total_cents AS "totalCents",
            to_char(sold_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "soldAt",
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            to_char(delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "deliveredAt",
            to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "completedAt",
            to_char(canceled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "canceledAt",
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
          FROM sales ORDER BY id
        `;
        expect(sales).toHaveLength(8);

        const byId = new Map(sales.map((sale) => [sale.id, sale]));
        expect(byId.get(immediatePaid.id)).toMatchObject({
          status: "completed",
          paymentCondition: "received",
          installments: 1,
          paymentPlanKnown: true,
          totalCents: 1000,
          soldAt,
          createdAt,
          completedAt: soldAt,
        });
        expect(byId.get(immediateZero.id)).toMatchObject({
          status: "completed",
          paymentCondition: "received",
          installments: 1,
          paymentPlanKnown: true,
          completedAt: soldAt,
        });
        expect(byId.get(creditPaid.id)).toMatchObject({
          status: "completed",
          paymentCondition: "installments",
          installments: 2,
          paymentPlanKnown: true,
          completedAt: paidAt,
          updatedAt: paidAt,
        });
        expect(byId.get(creditPending.id)).toMatchObject({
          status: "open",
          paymentCondition: "installments",
          installments: 2,
          paymentPlanKnown: true,
          completedAt: null,
          canceledAt: null,
        });
        expect(byId.get(creditZero.id)).toMatchObject({
          status: "completed",
          paymentCondition: "installments",
          installments: 1,
          paymentPlanKnown: false,
          completedAt: soldAt,
        });
        expect(byId.get(canceledImmediate.id)).toMatchObject({
          status: "canceled",
          paymentCondition: "received",
          installments: 1,
          paymentPlanKnown: true,
          completedAt: null,
          canceledAt: updatedAt,
        });
        expect(byId.get(canceledCredit.id)).toMatchObject({
          status: "canceled",
          paymentCondition: "installments",
          installments: 1,
          paymentPlanKnown: false,
          completedAt: null,
          canceledAt: updatedAt,
        });
        expect(byId.get(canceledZero.id)).toMatchObject({
          status: "canceled",
          paymentCondition: "installments",
          installments: 1,
          paymentPlanKnown: false,
          completedAt: null,
          canceledAt: updatedAt,
        });

        const receivables = await sql<
          {
            saleId: string;
            amountCents: number;
            dueDate: string | null;
            dueKind: string;
            paidAt: string | null;
            voidedAt: string | null;
            createdAt: string;
            updatedAt: string;
          }[]
        >`
          SELECT sale_id AS "saleId", amount_cents AS "amountCents", due_date::text AS "dueDate",
            due_kind AS "dueKind",
            to_char(paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "paidAt",
            to_char(voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "voidedAt",
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
          FROM receivables ORDER BY sale_id, amount_cents
        `;
        expect(
          receivables.filter((row) => row.saleId === immediatePaid.id),
        ).toEqual([
          {
            saleId: immediatePaid.id,
            amountCents: 1000,
            dueDate: "2026-06-02",
            dueKind: "scheduled",
            paidAt: soldAt,
            voidedAt: null,
            createdAt: soldAt,
            updatedAt: soldAt,
          },
        ]);
        expect(
          receivables.filter((row) => row.saleId === canceledImmediate.id),
        ).toEqual([
          {
            saleId: canceledImmediate.id,
            amountCents: 1000,
            dueDate: "2026-06-02",
            dueKind: "scheduled",
            paidAt: null,
            voidedAt: updatedAt,
            createdAt: soldAt,
            updatedAt,
          },
        ]);
        expect(
          receivables.filter((row) => row.saleId === canceledCredit.id),
        ).toEqual([
          {
            saleId: canceledCredit.id,
            amountCents: 1000,
            dueDate: null,
            dueKind: "unknown",
            paidAt: null,
            voidedAt: updatedAt,
            createdAt: soldAt,
            updatedAt,
          },
        ]);
        expect(
          receivables.filter(
            (row) =>
              row.saleId === immediateZero.id ||
              row.saleId === creditZero.id ||
              row.saleId === canceledZero.id,
          ),
        ).toHaveLength(0);
        const [preservedItem] = await sql<
          {
            productName: string;
            qty: number;
            unitPriceCents: number;
            costCents: number;
          }[]
        >`
          SELECT product_name AS "productName", qty, unit_price_cents AS "unitPriceCents", cost_cents AS "costCents"
          FROM sale_items WHERE sale_id = ${immediatePaid.id}
        `;
        const [preservedProduct] = await sql<{ stockQty: number }[]>`
          SELECT stock_qty AS "stockQty" FROM products WHERE id = ${legacyProduct.id}
        `;
        expect(preservedItem).toEqual({
          productName: "Snapshot preservado",
          qty: 2,
          unitPriceCents: 1000,
          costCents: 400,
        });
        expect(preservedProduct).toEqual({ stockQty: 7 });
        expect(
          receivables
            .filter(
              (row) =>
                row.saleId === creditPaid.id || row.saleId === creditPending.id,
            )
            .every(
              (row) => row.dueKind === "scheduled" && row.voidedAt === null,
            ),
        ).toBe(true);

        await sql`
          UPDATE sales
          SET sold_at = created_at - interval '1 second'
          WHERE id = ${immediatePaid.id}
        `;
        await sql`
          UPDATE receivables
          SET paid_at = created_at - interval '1 second'
          WHERE sale_id = ${immediatePaid.id}
        `;

        const [retroactiveValues] = await sql<
          { saleSoldAt: string; receivablePaidAt: string }[]
        >`
          SELECT
            to_char(sales.sold_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "saleSoldAt",
            to_char(receivables.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "receivablePaidAt"
          FROM sales
          INNER JOIN receivables ON receivables.sale_id = sales.id
          WHERE sales.id = ${immediatePaid.id}
        `;
        expect(retroactiveValues).toEqual({
          saleSoldAt: "2026-06-01T11:59:59.000Z",
          receivablePaidAt: "2026-06-02T11:59:59.000Z",
        });
      } finally {
        await stopDatabase(sql, container);
      }
    },
    CONTAINER_STARTUP_TIMEOUT_MS,
  );

  const anomalyCases = [
    [
      "sold_at antes de created_at",
      "sales",
      "sold_at = created_at - interval '1 second'",
      "sales.sold_at",
    ],
    [
      "updated_at antes de created_at",
      "sales",
      "updated_at = created_at - interval '1 second'",
      "sales.updated_at",
    ],
    [
      "updated_at antes de sold_at",
      "sales",
      "updated_at = sold_at - interval '1 second'",
      "sales.updated_at",
    ],
    [
      "created_at de recebível antes da venda",
      "receivables",
      "created_at = '2026-06-01T12:00:00Z'",
      "receivables.created_at precede sales.created_at",
    ],
    [
      "created_at de recebível antes da venda realizada",
      "receivables",
      "created_at = '2026-06-02T12:00:00Z'",
      "receivables.created_at precede sales.sold_at",
    ],
    [
      "updated_at de recebível antes de created_at",
      "receivables",
      "updated_at = created_at - interval '1 second'",
      "receivables.updated_at",
    ],
    [
      "paid_at antes de sold_at",
      "receivables",
      "paid_at = '2026-06-02T12:00:00Z'",
      "receivables.paid_at precede sales.sold_at",
    ],
    [
      "paid_at antes de created_at",
      "receivables",
      "paid_at = created_at - interval '1 second'",
      "receivables.paid_at precede receivables.created_at",
    ],
    [
      "paid_at depois de updated_at",
      "receivables",
      "paid_at = updated_at + interval '1 second'",
      "receivables.paid_at exceeds",
    ],
  ] as const;

  for (const [title, table, mutation, error] of anomalyCases) {
    it(
      `falha fechada quando ${title}`,
      async () => {
        let container: StartedPostgreSqlContainer | undefined;
        let sql: PgClient | undefined;
        try {
          const database = await startLegacyDatabase();
          container = database.container;
          sql = database.sql;
          const sale = await insertLegacySale(sql, database.consultantId, {
            paymentMethod: "credit",
            status: "completed",
            totalCents: 1000,
            createdAt: "2026-06-02T12:00:00Z",
            soldAt: "2026-06-03T12:00:00Z",
            updatedAt: "2026-06-05T12:00:00Z",
          });
          await insertLegacyReceivable(sql, sale.id, {
            amountCents: 1000,
            paidAt: "2026-06-05T12:00:00Z",
            createdAt: "2026-06-04T12:00:00Z",
            updatedAt: "2026-06-06T12:00:00Z",
          });
          await sql.unsafe(`UPDATE ${table} SET ${mutation}`);
          await applyMigration(sql, EXPANSION_MIGRATION);
          await expect(applyMigration(sql, BACKFILL_MIGRATION)).rejects.toThrow(
            error,
          );
        } finally {
          await stopDatabase(sql, container);
        }
      },
      CONTAINER_STARTUP_TIMEOUT_MS,
    );
  }

  const financialAnomalyCases = [
    [
      "há recebível em pagamento imediato",
      "cash",
      "completed",
      1000,
      [1000],
      [null],
      "unexpected receivable",
    ],
    [
      "crédito ativo tem soma divergente",
      "credit",
      "completed",
      1000,
      [999],
      [null],
      "unreconcilable",
    ],
    [
      "crédito ativo tem mais de 24 parcelas",
      "credit",
      "completed",
      2500,
      Array.from({ length: 25 }, () => 100),
      Array.from({ length: 25 }, () => null),
      "unreconcilable",
    ],
    [
      "venda cancelada tem parcela paga",
      "credit",
      "canceled",
      1000,
      [1000],
      ["2026-06-04T12:00:00Z"],
      "canceled sale has paid receivable",
    ],
  ] as const;

  for (const [
    title,
    paymentMethod,
    status,
    totalCents,
    amounts,
    paidAts,
    error,
  ] of financialAnomalyCases) {
    it(
      `falha fechada quando ${title}`,
      async () => {
        let container: StartedPostgreSqlContainer | undefined;
        let sql: PgClient | undefined;
        try {
          const database = await startLegacyDatabase();
          container = database.container;
          sql = database.sql;
          const sale = await insertLegacySale(sql, database.consultantId, {
            paymentMethod,
            status,
            totalCents,
            createdAt: "2026-06-02T12:00:00Z",
            soldAt: "2026-06-03T12:00:00Z",
            updatedAt: "2026-06-04T12:00:00Z",
          });
          for (const [index, amountCents] of amounts.entries()) {
            await insertLegacyReceivable(sql, sale.id, {
              amountCents,
              paidAt: paidAts[index] ?? null,
              createdAt: "2026-06-03T12:00:00Z",
              updatedAt: "2026-06-04T12:00:00Z",
            });
          }
          await applyMigration(sql, EXPANSION_MIGRATION);
          await expect(applyMigration(sql, BACKFILL_MIGRATION)).rejects.toThrow(
            error,
          );
        } finally {
          await stopDatabase(sql, container);
        }
      },
      CONTAINER_STARTUP_TIMEOUT_MS,
    );
  }
});
