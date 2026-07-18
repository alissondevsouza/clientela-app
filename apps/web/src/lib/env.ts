import { z } from "zod";
import { MAX_PHONE_DIGITS, MIN_PHONE_DIGITS } from "./whatsapp";

// Mensagem default nomeada (pt-BR): usada quando WHATSAPP_DEFAULT_MESSAGE não é definida.
export const DEFAULT_WHATSAPP_MESSAGE =
  "Olá! Vi seu site e quero saber mais sobre os produtos.";

const NON_DIGIT = /\D/g;

// Valida o telefone com a mesma regra de dígitos do builder (E.164: 10–15).
// Mensagem estática: nunca ecoa o valor recebido (security.md).
const phoneHasValidDigitCount = (phone: string): boolean => {
  const digits = phone.replace(NON_DIGIT, "").length;
  return digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS;
};

const envSchema = z.object({
  WHATSAPP_PHONE: z
    .string("WHATSAPP_PHONE é obrigatória")
    .refine(
      phoneHasValidDigitCount,
      `WHATSAPP_PHONE deve ter de ${MIN_PHONE_DIGITS} a ${MAX_PHONE_DIGITS} dígitos, incluindo o código do país`,
    ),
  WHATSAPP_DEFAULT_MESSAGE: z.string().default(DEFAULT_WHATSAPP_MESSAGE),
  // URL base da API consumida pela Server Action de captura de lead (LP-06).
  // Obrigatória: sem default silencioso que apontaria para o lugar errado em
  // produção (LP-11 configura explícito). Lida em build (SSG) e em runtime.
  API_URL: z.url({
    protocol: /^https?$/,
    error: "API_URL deve ser uma URL http(s) válida",
  }),
  // URL pública do site, usada como metadataBase (canonical, Open Graph) e nos
  // arquivos de sitemap/robots (LP-07). Obrigatória: sem default silencioso que
  // geraria canonical/OG apontando para o lugar errado em produção. Dev:
  // http://localhost:3000. O domínio real é configurado no LP-10/12.
  SITE_URL: z.url({
    protocol: /^https?$/,
    error: "SITE_URL deve ser uma URL http(s) válida",
  }),
});

export type WebEnv = z.infer<typeof envSchema>;

// Falha explícita: lista apenas os NOMES das variáveis inválidas —
// nunca os valores (security.md: dados de config não vazam em log/erro).
export const loadWebEnv = (
  source: Record<string, string | undefined> = process.env,
): WebEnv => {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const invalidKeys = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((key) => key.length > 0);
    const uniqueKeys = [...new Set(invalidKeys)].join(", ");
    throw new Error(
      `Configuração de ambiente do web inválida. Verifique: ${uniqueKeys}`,
    );
  }

  return result.data;
};
