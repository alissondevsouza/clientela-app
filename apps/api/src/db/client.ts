import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

// Única fonte de conexão da API (api.md: injeção explícita).
// Devolve também o cliente `sql` para permitir encerrar a conexão no teardown.
export const createDb = (databaseUrl: string) => {
  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });
  return { db, sql };
};
