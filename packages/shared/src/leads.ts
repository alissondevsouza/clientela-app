import { z } from "zod";
import { whatsappSchema } from "./whatsapp-validation";

const INTEREST_MAX_LENGTH = 500;

export const createLeadSchema = z.object({
  // `error` no nível do `z.string()` cobre também o `invalid_type` de campo
  // ausente (body sem `name`), garantindo mensagem pt-BR — a mensagem de
  // `min(2)` só vale para valor presente-porém-curto (security.md/RF-02).
  name: z
    .string({ error: "Informe seu nome completo" })
    .trim()
    .min(2, "Informe seu nome completo"),
  whatsapp: whatsappSchema,
  // Campo hidden do formulário submete `""` quando não preenchido: normaliza
  // vazio para ausente para que a coluna nullable fique NULL (não string vazia),
  // eliminando a ambiguidade "ausente" vs "vazio" no banco.
  interest: z
    .string()
    .trim()
    .max(
      INTEREST_MAX_LENGTH,
      `O interesse deve ter no máximo ${INTEREST_MAX_LENGTH} caracteres`,
    )
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  consent: z.literal(true, {
    error: "É necessário aceitar o uso dos seus dados para contato",
  }),
});

export type CreateLeadInput = z.input<typeof createLeadSchema>;
export type CreateLead = z.output<typeof createLeadSchema>;

// Contrato HTTP público da captura de lead: reusa `createLeadSchema` (fonte de
// verdade do formulário) e acrescenta o honeypot `website`. Campo opcional e
// livre: a detecção de bot (não-vazio) é regra de negócio do service, não do
// schema — aqui só o carregamos pela fronteira sem interpretar.
export const leadCaptureRequestSchema = createLeadSchema.extend({
  website: z.string().optional(),
});

export type LeadCaptureRequestInput = z.input<typeof leadCaptureRequestSchema>;
export type LeadCaptureRequest = z.output<typeof leadCaptureRequestSchema>;

// Resposta de sucesso da captura: apenas o id, nunca ecoa dado pessoal.
export type LeadCaptureResponse = { id: string };
