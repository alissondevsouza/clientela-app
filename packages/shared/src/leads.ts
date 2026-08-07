import { z } from "zod";
import { paginationQuerySchema } from "./pagination";
import { whatsappSchema } from "./whatsapp-validation";

const INTEREST_MAX_LENGTH = 500;
const SEARCH_MAX_LENGTH = 100;

const STATUS_INVALID_MESSAGE = "Status de lead inválido";
const STATUS_UPDATE_INVALID_MESSAGE =
  "Status inválido: use novo, contatado ou descartado";
const SEARCH_MAX_MESSAGE = "A busca deve ter no máximo 100 caracteres";

// Fonte única dos status do funil de lead (core.md: literal único). O schema
// Drizzle importa daqui (o web precisa do enum para filtro/labels e não pode
// importar de `db/`). `converted` só é atingível via conversão (POST convert),
// nunca por PATCH de status — daí o subconjunto `LEAD_STATUS_UPDATE_VALUES`.
export const leadStatusValues = [
  "new",
  "contacted",
  "converted",
  "discarded",
] as const;

export type LeadStatus = (typeof leadStatusValues)[number];

// Status settáveis via PATCH: exclui `converted` (invariante do vínculo
// Lead 1—0..1 Client — converter é operação atômica própria).
export const leadStatusUpdateValues = [
  "new",
  "contacted",
  "discarded",
] as const;

export type LeadStatusUpdate = (typeof leadStatusUpdateValues)[number];

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

// Contrato de criação de lead pelo CRM (RF-24 de `crm-appointments`, ADR-0020):
// reusa os campos e mensagens pt-BR de `createLeadSchema` (nome + WhatsApp),
// mas sem `interest` (fora do cadastro rápido) e sem `consent` — o fundamento
// do consentimento aqui é declarado pela consultora na captura do dado, não um
// checkbox da própria pessoa (ADR-0020). Sem o honeypot `website` de
// `leadCaptureRequestSchema`: essa defesa é para tráfego anônimo, sem sentido
// atrás de autenticação.
export const createLeadCrmSchema = createLeadSchema.omit({
  interest: true,
  consent: true,
});

export type CreateLeadCrmInput = z.input<typeof createLeadCrmSchema>;
export type CreateLeadCrm = z.output<typeof createLeadCrmSchema>;

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

// Contrato de resposta do lead no CRM (fronteira de saída da API → front).
// `clientId` nullable reflete o vínculo opcional com a cliente (RF-01: lead
// convertido cuja cliente foi excluída fica com `client_id` NULL). Datas em ISO.
export const crmLeadSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  whatsapp: z.string(),
  interest: z.string().nullable(),
  source: z.string(),
  status: z.enum(leadStatusValues, { error: STATUS_INVALID_MESSAGE }),
  clientId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type CrmLead = z.infer<typeof crmLeadSchema>;

// Query da listagem autenticada: paginação padrão + filtro `?status=` opcional
// pelo enum (valor inválido rejeitado em pt-BR) + `search` livre por nome ou
// WhatsApp (RF-14 de `crm-appointments`), espelhando `clientsListQuerySchema`
// (mesmo tamanho máximo e mesma semântica de trim/vazio) — alimenta o seletor
// de lead do formulário de compromisso sem paginar às cegas.
export const leadsListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(leadStatusValues, { error: STATUS_INVALID_MESSAGE })
    .optional(),
  search: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH, SEARCH_MAX_MESSAGE)
    .optional(),
});

export type LeadsListQueryInput = z.input<typeof leadsListQuerySchema>;
export type LeadsListQuery = z.output<typeof leadsListQuerySchema>;

// PATCH de status: só `new`/`contacted`/`discarded` — `converted` não é
// settável (invariante do vínculo). `error` no nível do enum cobre tanto valor
// inválido quanto campo ausente em pt-BR (lesson Zod v4: sem isso, `{}` cai no
// `invalid_type` com mensagem default em inglês).
export const updateLeadStatusSchema = z.object({
  status: z.enum(leadStatusUpdateValues, {
    error: STATUS_UPDATE_INVALID_MESSAGE,
  }),
});

export type UpdateLeadStatusInput = z.input<typeof updateLeadStatusSchema>;
export type UpdateLeadStatus = z.output<typeof updateLeadStatusSchema>;
