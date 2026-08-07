import {
  type AppointmentKind,
  createAppointmentSchema,
  personExclusivityRefinement,
  resolveAppointmentPerson,
} from "@clientela/shared";
import { z } from "zod";

const DATE_REQUIRED_MESSAGE = "Informe a data do compromisso";
const TIME_REQUIRED_MESSAGE = "Informe o horário do compromisso";

export const DURATION_MIN = 1;
export const DURATION_MAX = 1440;
export const DEFAULT_DURATION_MINUTES = "60";
export const DEFAULT_KIND: AppointmentKind = "skin_analysis";

export const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_HM_PATTERN = /^\d{2}:\d{2}$/;

// String vazia de campo opcional vira `undefined` ANTES de validar (padrão de
// `product-form.tsx`/`client-form.tsx`); o mapeamento para `null` explícito no
// EDIT acontece em `buildAppointmentFormPayload` (lib/appointment-form-payload.ts).
const emptyToUndefined = (value: string): string | null | undefined =>
  value.trim().length === 0 ? undefined : value;

// Inteiro digitado em input numérico: vazio vira `NaN` para cair na mensagem
// pt-BR do contrato (min/max), em vez de virar 0 silenciosamente.
const stringToInt = (value: string): number =>
  value.trim().length === 0 ? Number.NaN : Number(value);

// Schema de UI derivado CAMPO A CAMPO do contrato compartilhado (padrão de
// `product-form.tsx`): `kind`/`durationMinutes`/`title`/`location`/`notes`
// reusam a validação (e as mensagens pt-BR) de `createAppointmentSchema` —
// nunca duplicadas aqui. `dateIso`/`timeHm` são só desta tela (o contrato só
// conhece `startsAt` já composto); `clientId`/`leadId`/`clientName`/`leadName`
// PRECISAM estar no schema — campo fora do schema é stripado pelo zodResolver
// no submit (lesson 2026-07-17), o que apagaria a pessoa selecionada.
//
// Extraído para módulo puro em `lib/` (ALERTA da revisão rodada 2 de
// `crm-appointments`): o schema precisa ser importável tanto pelo form
// (`"use client"`) quanto pelo teste, que valida os `defaultValues` REAIS do
// detalhe (RSC) contra este mesmo schema — é o caminho que quebrou duas vezes
// por falta de teste ponta a ponta (`appointment-form-schema.test.ts`).
//
// `.superRefine(personExclusivityRefinement)` reaplica a MESMA validação de
// exclusividade cliente×lead do contrato: a violação vira erro de campo em
// pt-BR sob `clientId`/`leadId`, nunca duplicando a regra. Depende de
// `resolveAppointmentFormPersonDefaults` (abaixo) nunca alimentar o form com
// as duas FKs de um compromisso pós-conversão (RF-12) — do contrário o
// próprio estado inicial viola este refine e o submit falha em silêncio
// (CRÍTICO da rodada 2).
export const appointmentFormSchema = z
  .object({
    kind: createAppointmentSchema.shape.kind,
    dateIso: z
      .string()
      .min(1, DATE_REQUIRED_MESSAGE)
      .regex(DATE_ISO_PATTERN, DATE_REQUIRED_MESSAGE),
    timeHm: z
      .string()
      .min(1, TIME_REQUIRED_MESSAGE)
      .regex(TIME_HM_PATTERN, TIME_REQUIRED_MESSAGE),
    durationMinutes: z
      .string()
      .transform(stringToInt)
      .pipe(createAppointmentSchema.shape.durationMinutes),
    clientId: z.string().nullable(),
    clientName: z.string(),
    leadId: z.string().nullable(),
    leadName: z.string(),
    location: z
      .string()
      .transform(emptyToUndefined)
      .pipe(createAppointmentSchema.shape.location),
    title: z
      .string()
      .transform(emptyToUndefined)
      .pipe(createAppointmentSchema.shape.title),
    notes: z
      .string()
      .transform(emptyToUndefined)
      .pipe(createAppointmentSchema.shape.notes),
  })
  .superRefine(personExclusivityRefinement);

// Input (z.input): campos controlados como `string` (exceto `kind`, que é o
// próprio enum — o `<select>` só produz valores válidos). Output (z.output):
// `durationMinutes` vira número; opcionais viram `string | undefined`.
export type AppointmentFormFieldValues = z.input<typeof appointmentFormSchema>;
export type AppointmentFormValues = z.output<typeof appointmentFormSchema>;

export const EMPTY_APPOINTMENT_FORM_VALUES: AppointmentFormFieldValues = {
  kind: DEFAULT_KIND,
  dateIso: "",
  timeHm: "",
  durationMinutes: DEFAULT_DURATION_MINUTES,
  clientId: null,
  clientName: "",
  leadId: null,
  leadName: "",
  location: "",
  title: "",
  notes: "",
};

export type AppointmentFormPersonSource = {
  clientId: string | null;
  clientName: string | null;
  leadId: string | null;
  leadName: string | null;
};

export type AppointmentFormPersonDefaults = Pick<
  AppointmentFormFieldValues,
  "clientId" | "clientName" | "leadId" | "leadName"
>;

// Projeta um compromisso REAL (com as duas FKs preenchidas, estado
// pós-conversão do RF-12) para o estado que o FORMULÁRIO pode carregar sem
// violar `personExclusivityRefinement`: só a pessoa VENCEDORA (cliente tem
// precedência — `resolveAppointmentPerson`, ÚNICA implementação da regra do
// RF-02) entra nos `defaultValues`. A FK perdedora nunca é reenviada pelo
// `PUT` enquanto não houver interação no `PersonSelect`: ela continua
// preservada no banco porque fica OMITIDA do payload (RF-07,
// `buildAppointmentFormPayload`), não porque o form "lembra" dela — é assim
// que trocar de cliente preserva o `lead_id` sem reimplementar a regra.
//
// Usada pelo RSC de detalhe (`[id]/page.tsx`) e testada diretamente aqui
// (CRÍTICO da rodada 2: o defeito estava exatamente na falta de um teste que
// exercitasse esta função com os `defaultValues` reais).
export const resolveAppointmentFormPersonDefaults = (
  appointment: AppointmentFormPersonSource,
): AppointmentFormPersonDefaults => {
  const person = resolveAppointmentPerson(appointment);
  return {
    clientId: person.kind === "client" ? appointment.clientId : null,
    clientName: person.kind === "client" ? (appointment.clientName ?? "") : "",
    leadId: person.kind === "lead" ? appointment.leadId : null,
    leadName: person.kind === "lead" ? (appointment.leadName ?? "") : "",
  };
};
