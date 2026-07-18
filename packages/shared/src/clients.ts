import { z } from "zod";
import { paginationQuerySchema } from "./pagination";
import { whatsappSchema } from "./whatsapp-validation";

const NAME_MIN_LENGTH = 2;
const SKIN_TONE_MAX_LENGTH = 60;
const NOTES_MAX_LENGTH = 2000;
const SEARCH_MAX_LENGTH = 100;

const NAME_INVALID_MESSAGE = "Informe o nome da cliente (mínimo 2 caracteres)";
const BIRTHDAY_INVALID_MESSAGE = "Informe uma data de nascimento válida";
const BIRTHDAY_FUTURE_MESSAGE = "A data de nascimento não pode ser futura";
const SKIN_TONE_MAX_MESSAGE = "O tom de pele deve ter no máximo 60 caracteres";
const NOTES_MAX_MESSAGE = "As observações devem ter no máximo 2000 caracteres";
const SEARCH_MAX_MESSAGE = "A busca deve ter no máximo 100 caracteres";
const UPDATE_EMPTY_MESSAGE = "Informe ao menos um campo para atualizar";

// Data corrente (yyyy-mm-dd, UTC) para a checagem "sem futuro". Comparação de
// strings ISO é válida porque o formato é zero-padded e lexicograficamente
// ordenável — evita construir Date e lidar com fuso.
const todayIso = () => new Date().toISOString().slice(0, 10);

// `birthday` ISO `yyyy-mm-dd` opcional/nullable (ausência = não informado) que
// rejeita data futura. O refine roda só quando há string (nullable/optional
// contornam), então `null`/ausente passam direto.
const birthdaySchema = z.iso
  .date(BIRTHDAY_INVALID_MESSAGE)
  .refine((value) => value <= todayIso(), BIRTHDAY_FUTURE_MESSAGE)
  .nullable()
  .optional();

// Contrato de criação de cliente. `name` com `error` no nível do tipo cobre o
// campo ausente em pt-BR (lesson Zod v4); `whatsapp` reusa a regra única.
export const createClientSchema = z.object({
  name: z
    .string({ error: NAME_INVALID_MESSAGE })
    .trim()
    .min(NAME_MIN_LENGTH, NAME_INVALID_MESSAGE),
  whatsapp: whatsappSchema,
  birthday: birthdaySchema,
  skinTone: z
    .string()
    .trim()
    .max(SKIN_TONE_MAX_LENGTH, SKIN_TONE_MAX_MESSAGE)
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(NOTES_MAX_LENGTH, NOTES_MAX_MESSAGE)
    .nullable()
    .optional(),
});

export type CreateClientInput = z.input<typeof createClientSchema>;
export type CreateClient = z.output<typeof createClientSchema>;

// PATCH parcial: todo campo é opcional; os nullable aceitam `null` explícito
// para LIMPAR o valor, enquanto a AUSÊNCIA da chave significa "não alterar"
// (Zod v4 não injeta chaves ausentes no output — verificado). O refine barra o
// body vazio (422): pelo menos um campo tem de estar presente.
export const updateClientSchema = createClientSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: UPDATE_EMPTY_MESSAGE,
  });

export type UpdateClientInput = z.input<typeof updateClientSchema>;
export type UpdateClient = z.output<typeof updateClientSchema>;

// Contrato de resposta (fronteira de saída da API → front). Datas em ISO;
// campos nullable refletem a nulabilidade do banco.
export const clientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  whatsapp: z.string(),
  birthday: z.iso.date().nullable(),
  skinTone: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Client = z.infer<typeof clientSchema>;

// Query da listagem: paginação padrão + `search` livre limitado a 100 chars.
export const clientsListQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH, SEARCH_MAX_MESSAGE)
    .optional(),
});

export type ClientsListQueryInput = z.input<typeof clientsListQuerySchema>;
export type ClientsListQuery = z.output<typeof clientsListQuerySchema>;
