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
// Migrações no formato anterior à tabela monthly_goals (0000..0014) — as
// mesmas que já existiam antes desta feature.
const PRE_MONTHLY_GOALS_MIGRATIONS = [
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
  "0011_lively_morg.sql",
  "0012_sales_lifecycle_backfill.sql",
  "0013_optimal_midnight.sql",
  "0014_brief_lifeguard.sql",
] as const;
const EXPANSION_MIGRATION = "0015_known_triathlon.sql";
const BACKFILL_MIGRATION = "0016_monthly_goals_backfill.sql";

type PgClient = ReturnType<typeof createDb>["sql"];

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
}> => {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const sql = createDb(container.getConnectionUri()).sql;

  for (const migration of PRE_MONTHLY_GOALS_MIGRATIONS) {
    await applyMigration(sql, migration);
  }

  return { container, sql };
};

const insertConsultant = async (
  sql: PgClient,
  values: { email: string; monthlyGoalCents: number | null },
): Promise<string> => {
  const [consultant] = await sql<{ id: string }[]>`
    INSERT INTO consultants (name, email, password_hash, whatsapp, monthly_goal_cents)
    VALUES ('Consultora Migração', ${values.email}, 'hash-fake', '11999999999', ${values.monthlyGoalCents})
    RETURNING id
  `;
  if (!consultant) {
    throw new Error("Falha ao criar consultora da migração.");
  }
  return consultant.id;
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

describe("backfill CRM-14 0014 → 0015 → 0016 (integração)", () => {
  it(
    "cria uma linha em monthly_goals só para a consultora com meta preenchida, no mês local da execução",
    async () => {
      let container: StartedPostgreSqlContainer | undefined;
      let sql: PgClient | undefined;
      try {
        const database = await startLegacyDatabase();
        container = database.container;
        sql = database.sql;

        const withGoalId = await insertConsultant(sql, {
          email: "com-meta@example.com",
          monthlyGoalCents: 500_000,
        });
        const withoutGoalId = await insertConsultant(sql, {
          email: "sem-meta@example.com",
          monthlyGoalCents: null,
        });

        await applyMigration(sql, EXPANSION_MIGRATION);
        await applyMigration(sql, BACKFILL_MIGRATION);

        // O mês esperado vem do now() do MESMO container (não do relógio do
        // processo de teste) — evita falso negativo na virada do mês.
        const [expectedMonthRow] = await sql<{ expectedMonth: string }[]>`
          SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS "expectedMonth"
        `;
        if (!expectedMonthRow) {
          throw new Error("Falha ao calcular o mês esperado do container.");
        }
        const { expectedMonth } = expectedMonthRow;

        const rows = await sql<
          { consultantId: string; monthStart: string; goalCents: number }[]
        >`
          SELECT consultant_id AS "consultantId", month_start::text AS "monthStart", goal_cents AS "goalCents"
          FROM monthly_goals
          ORDER BY consultant_id
        `;

        expect(rows).toEqual([
          {
            consultantId: withGoalId,
            monthStart: expectedMonth,
            goalCents: 500_000,
          },
        ]);

        const withoutGoalRows = rows.filter(
          (row) => row.consultantId === withoutGoalId,
        );
        expect(withoutGoalRows).toHaveLength(0);
      } finally {
        await stopDatabase(sql, container);
      }
    },
    CONTAINER_STARTUP_TIMEOUT_MS,
  );

  it(
    "aplicar o backfill duas vezes não duplica a linha (ON CONFLICT DO NOTHING)",
    async () => {
      let container: StartedPostgreSqlContainer | undefined;
      let sql: PgClient | undefined;
      try {
        const database = await startLegacyDatabase();
        container = database.container;
        sql = database.sql;

        const consultantId = await insertConsultant(sql, {
          email: "repeticao@example.com",
          monthlyGoalCents: 300_000,
        });

        await applyMigration(sql, EXPANSION_MIGRATION);
        await applyMigration(sql, BACKFILL_MIGRATION);
        await applyMigration(sql, BACKFILL_MIGRATION);

        const rows = await sql<{ consultantId: string; goalCents: number }[]>`
          SELECT consultant_id AS "consultantId", goal_cents AS "goalCents"
          FROM monthly_goals
          WHERE consultant_id = ${consultantId}
        `;

        expect(rows).toEqual([{ consultantId, goalCents: 300_000 }]);
      } finally {
        await stopDatabase(sql, container);
      }
    },
    CONTAINER_STARTUP_TIMEOUT_MS,
  );
});
