import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

// ---------------------------------------------------------------------------
// Enums + labels pt-BR (fonte única shared ← db; o schema Drizzle importa
// daqui, e o web precisa dos labels/enums sem tocar em `db/`). Padrão de
// `leadStatus`/`orderStatus`.
// ---------------------------------------------------------------------------

export const appointmentKindValues = [
  "skin_analysis",
  "demo",
  "delivery",
  "follow_up",
  "other",
] as const;

export type AppointmentKind = (typeof appointmentKindValues)[number];

export const APPOINTMENT_KIND_LABELS: Record<AppointmentKind, string> = {
  skin_analysis: "Análise de pele",
  demo: "Sessão demonstrativa",
  delivery: "Entrega de produto",
  follow_up: "Follow-up",
  other: "Outro",
};

// Compromisso não se apaga sozinho — transições por endpoint explícito
// (ADR-0015). Sem soft delete: `DELETE` (RF-09) é remoção física, separada de
// `canceled` (fato do relacionamento).
export const appointmentStatusValues = [
  "scheduled",
  "done",
  "no_show",
  "canceled",
] as const;

export type AppointmentStatus = (typeof appointmentStatusValues)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  done: "Realizado",
  no_show: "Não compareceu",
  canceled: "Cancelado",
};

// Recortes de listagem (RF-05). Não existe "past" — o particionamento correto
// entre "ainda por resolver" e "com desfecho" é `pending`/`history`.
export const appointmentRangeValues = [
  "upcoming",
  "pending",
  "history",
  "day",
  "all",
] as const;

export type AppointmentRange = (typeof appointmentRangeValues)[number];

// ---------------------------------------------------------------------------
// Mensagens pt-BR (constantes nomeadas — core.md)
// ---------------------------------------------------------------------------

const TITLE_MAX_LENGTH = 120;
const LOCATION_MAX_LENGTH = 160;
const NOTES_MAX_LENGTH = 1000;
const DURATION_MIN_MINUTES = 1;
const DURATION_MAX_MINUTES = 1440;
const CONFLICTS_MAX_ITEMS = 20;

const CLIENT_ID_INVALID_MESSAGE = "Cliente inválida";
const LEAD_ID_INVALID_MESSAGE = "Lead inválido";
const SALE_ID_INVALID_MESSAGE = "Venda inválida";
const APPOINTMENT_ID_INVALID_MESSAGE = "Compromisso inválido";
const KIND_INVALID_MESSAGE = "Tipo de compromisso inválido";
const STATUS_INVALID_MESSAGE = "Status de compromisso inválido";
const RANGE_INVALID_MESSAGE = "Recorte de agenda inválido";
const STARTS_AT_INVALID_MESSAGE = "Informe a data e hora do compromisso";
const DURATION_TYPE_MESSAGE = "Informe a duração em minutos (número inteiro)";
const DURATION_MIN_MESSAGE = "A duração deve ser de no mínimo 1 minuto";
const DURATION_MAX_MESSAGE = "A duração deve ser de no máximo 1440 minutos";
const TITLE_MAX_MESSAGE = "O título deve ter no máximo 120 caracteres";
const LOCATION_MAX_MESSAGE = "O local deve ter no máximo 160 caracteres";
const NOTES_MAX_MESSAGE = "As observações devem ter no máximo 1000 caracteres";
const UPDATE_EMPTY_MESSAGE = "Informe ao menos um campo para atualizar";
const PERSON_BOTH_INVALID_MESSAGE =
  "Informe cliente ou lead, nunca os dois ao mesmo tempo";
const DATE_INVALID_MESSAGE = "Informe uma data válida (aaaa-mm-dd)";
const DATE_REQUIRED_MESSAGE = "Informe a data para o recorte do dia";
const DATE_ONLY_WITH_DAY_MESSAGE =
  "A data só é aceita junto do recorte do dia (range=day)";

// ---------------------------------------------------------------------------
// Regra de exclusividade cliente×lead (RF-02): compromisso pode ter cliente,
// lead ou nenhum dos dois — nunca os dois ao mesmo tempo NO CONTRATO. O banco
// tolera as duas FKs preenchidas (estado pós-conversão de lead, RF-12); a
// regra vive só aqui, nunca em CHECK (plan.md).
// ---------------------------------------------------------------------------

export type PersonFields = {
  clientId?: string | null;
  leadId?: string | null;
};

// Exportado (não só usado internamente pelos schemas de criação/edição)
// porque o form do web (`appointment-form.tsx`) reaplica a MESMA validação
// para a mensagem de exclusividade aparecer em pt-BR sob o campo, em vez de
// só falhar no servidor com mensagem genérica (achado da revisão de
// crm-appointments — nunca duplicar a regra, sempre importar daqui).
export const personExclusivityRefinement = (
  value: PersonFields,
  ctx: z.RefinementCtx,
): void => {
  if (value.clientId != null && value.leadId != null) {
    ctx.addIssue({
      code: "custom",
      path: ["clientId"],
      message: PERSON_BOTH_INVALID_MESSAGE,
    });
    ctx.addIssue({
      code: "custom",
      path: ["leadId"],
      message: PERSON_BOTH_INVALID_MESSAGE,
    });
  }
};

// Campos comuns de criação/edição, SEM o refine de exclusividade (aplicado
// separadamente em cada schema derivado, para poder usar `.partial()` no
// update sem perder o refine).
const appointmentFieldsSchema = z.object({
  clientId: z.uuid({ error: CLIENT_ID_INVALID_MESSAGE }).nullable().optional(),
  leadId: z.uuid({ error: LEAD_ID_INVALID_MESSAGE }).nullable().optional(),
  kind: z.enum(appointmentKindValues, { error: KIND_INVALID_MESSAGE }),
  title: z
    .string()
    .trim()
    .max(TITLE_MAX_LENGTH, TITLE_MAX_MESSAGE)
    .nullable()
    .optional(),
  startsAt: z.iso.datetime({ error: STARTS_AT_INVALID_MESSAGE }),
  durationMinutes: z
    .number({ error: DURATION_TYPE_MESSAGE })
    .int(DURATION_TYPE_MESSAGE)
    .min(DURATION_MIN_MINUTES, DURATION_MIN_MESSAGE)
    .max(DURATION_MAX_MINUTES, DURATION_MAX_MESSAGE),
  location: z
    .string()
    .trim()
    .max(LOCATION_MAX_LENGTH, LOCATION_MAX_MESSAGE)
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(NOTES_MAX_LENGTH, NOTES_MAX_MESSAGE)
    .nullable()
    .optional(),
});

// Contrato de criação (RF-01, RF-02, RF-04). Compromisso no passado é
// permitido (RF-04) — sem validação de `startsAt >= hoje`.
export const createAppointmentSchema = appointmentFieldsSchema.superRefine(
  personExclusivityRefinement,
);

export type CreateAppointmentInput = z.input<typeof createAppointmentSchema>;
export type CreateAppointment = z.output<typeof createAppointmentSchema>;

// Contrato de edição (RF-07): todo campo é OPCIONAL — ausente preserva o valor
// atual (crucial para `clientId`/`leadId` depois da conversão de lead, RF-12);
// `null` explícito nos nuláveis desvincula/limpa. Body vazio ⇒ 422 (nada a
// fazer). O guard de status terminal ("só `notes`" em `done`/`no_show`/
// `canceled`) é regra de SERVICE (depende do estado atual no banco), não do
// contrato — o Zod não conhece o status vigente do recurso.
export const updateAppointmentSchema = appointmentFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: UPDATE_EMPTY_MESSAGE,
  })
  .superRefine(personExclusivityRefinement);

export type UpdateAppointmentInput = z.input<typeof updateAppointmentSchema>;
export type UpdateAppointment = z.output<typeof updateAppointmentSchema>;

// `POST /appointments/:id/done` (RF-08): corpo OPCIONAL; `saleId` aceita só
// uuid — `null` não é aceito aqui (para desvincular uma venda já vinculada,
// use `PUT /:id/sale`, RF-10). Corpo ausente (`{}`/sem body) é válido.
export const completeAppointmentSchema = z.object({
  saleId: z.uuid({ error: SALE_ID_INVALID_MESSAGE }).optional(),
});

export type CompleteAppointmentInput = z.input<
  typeof completeAppointmentSchema
>;
export type CompleteAppointment = z.output<typeof completeAppointmentSchema>;

// `PUT /appointments/:id/sale` (RF-10): `saleId` é OBRIGATÓRIO no payload —
// mas aceita `null` para desvincular. Sem default: enviar `{}` é erro (não dá
// para saber se a intenção era vincular ou desvincular).
export const linkAppointmentSaleSchema = z.object({
  saleId: z.uuid({ error: SALE_ID_INVALID_MESSAGE }).nullable(),
});

export type LinkAppointmentSaleInput = z.input<
  typeof linkAppointmentSaleSchema
>;
export type LinkAppointmentSale = z.output<typeof linkAppointmentSaleSchema>;

// ---------------------------------------------------------------------------
// Contrato de resposta
// ---------------------------------------------------------------------------

// Compromisso completo (detalhe, RF-06). SEM snapshot de nome/whatsapp
// (ADR-0016) — `clientName`/`clientWhatsapp`/`leadName`/`leadWhatsapp` são
// derivados por LEFT JOIN na leitura, nulos quando não há vínculo ou a pessoa
// foi excluída. `saleId`/`saleTotalCents` derivados (RF-10).
export const appointmentSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid().nullable(),
  clientName: z.string().nullable(),
  clientWhatsapp: z.string().nullable(),
  leadId: z.uuid().nullable(),
  leadName: z.string().nullable(),
  leadWhatsapp: z.string().nullable(),
  saleId: z.uuid().nullable(),
  saleTotalCents: z.number().int().nullable(),
  kind: z.enum(appointmentKindValues),
  title: z.string().nullable(),
  startsAt: z.iso.datetime(),
  durationMinutes: z.number().int(),
  status: z.enum(appointmentStatusValues),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Appointment = z.infer<typeof appointmentSchema>;

// Item da listagem (RF-01, RF-05): SEM `notes` (não é dado que a listagem
// precisa) e SEM `clientWhatsapp`/`leadWhatsapp` — minimização de dado
// pessoal (security.md): o número só trafega no detalhe, que é onde vive o
// botão de confirmação (RF-20).
export const appointmentListItemSchema = appointmentSchema.omit({
  notes: true,
  clientWhatsapp: true,
  leadWhatsapp: true,
});

export type AppointmentListItem = z.infer<typeof appointmentListItemSchema>;

// ---------------------------------------------------------------------------
// Precedência cliente>lead (RF-02) — ÚNICA implementação. Nunca reimplementar
// em componente/página: tudo consome esta função (plan.md).
// ---------------------------------------------------------------------------

export type AppointmentPersonKind = "client" | "lead" | "none";

export type AppointmentPerson = {
  name: string | null;
  kind: AppointmentPersonKind;
};

type AppointmentPersonSource = {
  clientId: string | null;
  clientName: string | null;
  leadId: string | null;
  leadName: string | null;
};

export function resolveAppointmentPerson(
  appointment: AppointmentPersonSource,
): AppointmentPerson {
  if (appointment.clientId !== null && appointment.clientName !== null) {
    return { name: appointment.clientName, kind: "client" };
  }
  if (appointment.leadId !== null && appointment.leadName !== null) {
    return { name: appointment.leadName, kind: "lead" };
  }
  return { name: null, kind: "none" };
}

// ---------------------------------------------------------------------------
// Query de listagem (RF-05)
// ---------------------------------------------------------------------------

export const appointmentsListQuerySchema = paginationQuerySchema
  .extend({
    range: z
      .enum(appointmentRangeValues, { error: RANGE_INVALID_MESSAGE })
      .default("upcoming"),
    date: z.iso.date({ error: DATE_INVALID_MESSAGE }).optional(),
    status: z
      .enum(appointmentStatusValues, { error: STATUS_INVALID_MESSAGE })
      .optional(),
    kind: z
      .enum(appointmentKindValues, { error: KIND_INVALID_MESSAGE })
      .optional(),
    clientId: z.uuid({ error: CLIENT_ID_INVALID_MESSAGE }).optional(),
    leadId: z.uuid({ error: LEAD_ID_INVALID_MESSAGE }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.range === "day" && value.date === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: DATE_REQUIRED_MESSAGE,
      });
    }
    if (value.range !== "day" && value.date !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: DATE_ONLY_WITH_DAY_MESSAGE,
      });
    }
  });

export type AppointmentsListQueryInput = z.input<
  typeof appointmentsListQuerySchema
>;
export type AppointmentsListQuery = z.output<
  typeof appointmentsListQuerySchema
>;

// ---------------------------------------------------------------------------
// Conflitos (RF-11) — aviso não bloqueante, sem paginação (limite fixo de 20).
// ---------------------------------------------------------------------------

export const appointmentConflictsQuerySchema = z.object({
  startsAt: z.iso.datetime({ error: STARTS_AT_INVALID_MESSAGE }),
  durationMinutes: z.coerce
    .number({ error: DURATION_TYPE_MESSAGE })
    .int(DURATION_TYPE_MESSAGE)
    .min(DURATION_MIN_MINUTES, DURATION_MIN_MESSAGE)
    .max(DURATION_MAX_MINUTES, DURATION_MAX_MESSAGE),
  excludeId: z.uuid({ error: APPOINTMENT_ID_INVALID_MESSAGE }).optional(),
});

export type AppointmentConflictsQueryInput = z.input<
  typeof appointmentConflictsQuerySchema
>;
export type AppointmentConflictsQuery = z.output<
  typeof appointmentConflictsQuerySchema
>;

export const appointmentConflictsResponseSchema = z.object({
  data: z.array(appointmentListItemSchema).max(CONFLICTS_MAX_ITEMS),
});

export type AppointmentConflictsResponse = z.infer<
  typeof appointmentConflictsResponseSchema
>;
