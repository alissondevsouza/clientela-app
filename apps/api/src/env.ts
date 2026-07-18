import { z } from "zod";

const DEFAULT_PORT = 3001;

const POSTGRES_URL_SCHEME = /^postgres(ql)?:\/\//;

const envSchema = z.object({
  DATABASE_URL: z
    .url("DATABASE_URL deve ser uma URL de conexão válida")
    // Refine sobre o esquema: mensagem estática, nunca ecoa o valor (security.md).
    .refine(
      (url) => POSTGRES_URL_SCHEME.test(url),
      "DATABASE_URL deve usar o esquema postgres:// ou postgresql://",
    ),
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
});

export type Env = z.infer<typeof envSchema>;

// Falha explícita no boot: lista apenas os NOMES das variáveis inválidas —
// nunca os valores (security.md: segredos não vazam em log/erro).
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const invalidKeys = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((key) => key.length > 0);
    const uniqueKeys = [...new Set(invalidKeys)].join(", ");
    throw new Error(
      `Configuração de ambiente inválida. Verifique: ${uniqueKeys}`,
    );
  }

  return result.data;
};
