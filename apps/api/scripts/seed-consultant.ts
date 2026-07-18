import { z } from "zod";
import { createDb } from "../src/db/client";
import { consultants } from "../src/db/schema";

// Seed idempotente da usuária única do CRM (RF-02). Não roda no boot da API
// (ADR-0008): é um job standalone executado manualmente/no deploy com as
// `SEED_CONSULTANT_*` no ambiente. Rodar 2x resulta em 1 linha (upsert por
// e-mail). A senha nunca é logada nem persistida em claro (security.md/LGPD).

const MIN_PASSWORD_LENGTH = 8;

const POSTGRES_URL_SCHEME = /^postgres(ql)?:\/\//;

const seedEnvSchema = z.object({
  SEED_CONSULTANT_NAME: z.string().trim().min(1),
  SEED_CONSULTANT_EMAIL: z.email(),
  SEED_CONSULTANT_PASSWORD: z.string().min(MIN_PASSWORD_LENGTH),
  SEED_CONSULTANT_WHATSAPP: z.string().trim().min(1),
  DATABASE_URL: z
    .url()
    // Refine sobre o esquema: mensagem estática, nunca ecoa o valor.
    .refine((url) => POSTGRES_URL_SCHEME.test(url)),
});

type SeedEnv = z.infer<typeof seedEnvSchema>;

// Falha explícita: lista apenas os NOMES das variáveis inválidas/ausentes —
// nunca os valores (security.md: senha/connection string não vazam em erro/log).
const loadSeedEnv = (source: NodeJS.ProcessEnv = process.env): SeedEnv => {
  const result = seedEnvSchema.safeParse(source);

  if (!result.success) {
    const invalidKeys = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((key) => key.length > 0);
    const uniqueKeys = [...new Set(invalidKeys)].join(", ");
    throw new Error(`Configuração do seed inválida. Verifique: ${uniqueKeys}`);
  }

  return result.data;
};

const seed = async (): Promise<void> => {
  const env = loadSeedEnv();
  const { db, sql } = createDb(env.DATABASE_URL);

  try {
    const passwordHash = await Bun.password.hash(env.SEED_CONSULTANT_PASSWORD, {
      algorithm: "argon2id",
    });

    // Upsert pelo índice único de e-mail: cria ou atualiza name/whatsapp/hash.
    // Idempotente — o e-mail é a chave de identidade da usuária única.
    const [row] = await db
      .insert(consultants)
      .values({
        name: env.SEED_CONSULTANT_NAME,
        email: env.SEED_CONSULTANT_EMAIL,
        passwordHash,
        whatsapp: env.SEED_CONSULTANT_WHATSAPP,
      })
      .onConflictDoUpdate({
        target: consultants.email,
        set: {
          name: env.SEED_CONSULTANT_NAME,
          whatsapp: env.SEED_CONSULTANT_WHATSAPP,
          passwordHash,
        },
      })
      .returning({ id: consultants.id });

    if (!row) {
      throw new Error("Seed não retornou o id da consultora.");
    }

    // Log apenas de status + ID (LGPD/security.md: nunca nome/e-mail/senha/hash).
    console.log(`Seed da consultora concluído. id=${row.id}`);
  } finally {
    await sql.end();
  }
};

seed().catch((error: unknown) => {
  // Mensagem sem segredos: erros de env já vêm só com nomes; erros de banco do
  // postgres-js não carregam a senha da connection string.
  const message = error instanceof Error ? error.message : "erro desconhecido";
  console.error(`Falha no seed da consultora: ${message}`);
  process.exit(1);
});
