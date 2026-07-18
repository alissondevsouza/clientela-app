import { fileURLToPath } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../../src/db/client";

const POSTGRES_IMAGE = "postgres:18-alpine";
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

// Migrações do drizzle vivem no schema `drizzle`; limpamos apenas `public`,
// então a tabela de controle nunca é truncada.
const APPLICATION_SCHEMA = "public";

const DOCKER_UNAVAILABLE_MESSAGE =
  "Não foi possível iniciar o Postgres de teste via Testcontainers. " +
  "Verifique se o Docker está instalado e em execução (o daemon precisa estar " +
  "acessível para os testes de integração).";

type PgClient = ReturnType<typeof createDb>["sql"];

export type PgTestContext = {
  db: Database;
  sql: PgClient;
  // Limpa o estado entre casos de teste (TRUNCATE de todas as tabelas de
  // domínio), preservando o schema e as migrações aplicadas.
  truncateAll: () => Promise<void>;
  stop: () => Promise<void>;
};

const createTruncateAll = (sql: PgClient) => async (): Promise<void> => {
  // Nomes vêm do catálogo do Postgres (não de input externo); ainda assim são
  // sempre quoteados. Restringir a `public` exclui `drizzle.__drizzle_migrations`.
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = ${APPLICATION_SCHEMA}
  `;

  if (tables.length === 0) {
    return;
  }

  const targets = tables
    .map((row) => `"${APPLICATION_SCHEMA}"."${row.tablename}"`)
    .join(", ");

  await sql.unsafe(`TRUNCATE TABLE ${targets} RESTART IDENTITY CASCADE`);
};

// Sobe Postgres real e aplica as migrações versionadas (as mesmas que vão para
// produção). Em falha (Docker ausente, migração quebrada) faz teardown do que
// subiu e lança um erro compreensível, sem propagar stack cru de conexão.
export const startPgContainer = async (): Promise<PgTestContext> => {
  let container: StartedPostgreSqlContainer | undefined;
  let client: PgClient | undefined;

  try {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    const { db, sql } = createDb(container.getConnectionUri());
    client = sql;

    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const startedContainer = container;
    const stop = async (): Promise<void> => {
      await sql.end();
      await startedContainer.stop();
    };

    return { db, sql, truncateAll: createTruncateAll(sql), stop };
  } catch (cause) {
    // Teardown do que chegou a subir. Erros de limpeza são ignorados de
    // propósito para não mascarar a causa original, preservada em `cause`.
    if (client) {
      await client.end().catch(() => undefined);
    }
    if (container) {
      await container.stop().catch(() => undefined);
    }
    throw new Error(DOCKER_UNAVAILABLE_MESSAGE, { cause });
  }
};
