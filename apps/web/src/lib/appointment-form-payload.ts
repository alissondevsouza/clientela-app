import {
  type AppointmentKind,
  appLocalDateTimeToUtc,
  type CreateAppointmentInput,
} from "@clientela/shared";

export type AppointmentFormPayloadMode = "create" | "edit";

export type AppointmentFormPersonValues = {
  clientId: string | null;
  leadId: string | null;
};

export type AppointmentFormPayloadValues = AppointmentFormPersonValues & {
  kind: AppointmentKind;
  dateIso: string;
  timeHm: string;
  durationMinutes: number;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
};

// Achado CRÍTICO da revisão de `crm-appointments` (RF-07/RF-12/RF-18): no
// modo EDIT, `clientId`/`leadId` só entram no payload quando o valor MUDOU em
// relação ao estado inicial do formulário. Campo omitido é preservado pelo
// `PUT` (RF-07) — é o que permite editar um compromisso pós-conversão de lead
// (client_id E lead_id preenchidos, RF-12) sem reenviar as duas FKs e violar
// a exclusividade de `updateAppointmentSchema`. Campo que MUDOU vai explícito
// (id novo ou `null` no desvínculo) — nunca os dois de uma vez a não ser que
// os dois tenham mudado de fato.
//
// ALERTA #1 da rodada 3: `initialPerson` vem dos `defaultValues` PROJETADOS
// (só a pessoa vencedora, cliente > lead — RF-02), então num compromisso
// pós-conversão `initialPerson.leadId` já é `null` mesmo quando o `lead_id`
// real no banco está preenchido. Sem tratamento especial, "Remover pessoa"
// nesse estado zera só `clientId` — o diff vê `leadId` como "não mudou"
// (`null === null`) e o omite, e o `lead_id` real sobrevive no banco. Como a
// função não tem como distinguir "leadId já era null no banco" de "leadId é
// null só por projeção", a saída segura é: sempre que o estado inicial TINHA
// alguma pessoa e a usuária remove as duas (submissão com `clientId` E
// `leadId` nulos — "Remover pessoa"), mandar `clientId: null` E `leadId:
// null` explícitos. `leadId: null` é um no-op inofensivo quando o valor real
// já era null; é o que falta quando não era. Desvínculo PARCIAL (só troca o
// lead ou só troca o cliente, mantendo a outra pessoa) continua pelo diff
// normal abaixo — não é "remover pessoa".
const buildEditPersonPayload = (
  values: AppointmentFormPersonValues,
  initialPerson: AppointmentFormPersonValues,
): Partial<AppointmentFormPersonValues> => {
  const hadPerson =
    initialPerson.clientId !== null || initialPerson.leadId !== null;
  const isExplicitFullUnlink =
    hadPerson && values.clientId === null && values.leadId === null;
  if (isExplicitFullUnlink) {
    return { clientId: null, leadId: null };
  }

  const payload: Partial<AppointmentFormPersonValues> = {};
  if (values.clientId !== initialPerson.clientId) {
    payload.clientId = values.clientId;
  }
  if (values.leadId !== initialPerson.leadId) {
    payload.leadId = values.leadId;
  }
  return payload;
};

// Monta o payload enviado à action (extraído de `appointment-form.tsx` para
// ser testável sem harness de componente — `spec.md`: "Sem teste de
// componente no web"). No CREATE, `clientId`/`leadId` vão SEMPRE explícitos
// (id ou `null`), refletindo o estado atual do seletor — comportamento
// inalterado. No EDIT, ver `buildEditPersonPayload`; os demais opcionais
// (`title`/`location`/`notes`) vazios viram `null` explícito para LIMPAR o
// campo (padrão `product-form.tsx`), e no CREATE permanecem `undefined`
// (omitidos do corpo).
export const buildAppointmentFormPayload = (
  mode: AppointmentFormPayloadMode,
  values: AppointmentFormPayloadValues,
  initialPerson: AppointmentFormPersonValues,
): CreateAppointmentInput => {
  const personPayload: Partial<AppointmentFormPersonValues> =
    mode === "edit"
      ? buildEditPersonPayload(values, initialPerson)
      : { clientId: values.clientId, leadId: values.leadId };

  const base = {
    kind: values.kind,
    // CRÍTICO (RF-16): composição SEMPRE via `appLocalDateTimeToUtc` — nunca
    // `new Date("yyyy-mm-ddTHH:mm")` (usaria o fuso do DISPOSITIVO e gravaria
    // o compromisso no instante errado fora do BRT).
    startsAt: appLocalDateTimeToUtc(values.dateIso, values.timeHm),
    durationMinutes: values.durationMinutes,
    ...personPayload,
  };

  if (mode === "edit") {
    return {
      ...base,
      title: values.title ?? null,
      location: values.location ?? null,
      notes: values.notes ?? null,
    };
  }
  return {
    ...base,
    title: values.title,
    location: values.location,
    notes: values.notes,
  };
};
