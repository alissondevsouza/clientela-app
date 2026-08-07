"use client";

import {
  APPOINTMENT_KIND_LABELS,
  type AppointmentListItem,
  appLocalDateIso,
  appLocalDateTimeToUtc,
  appLocalTimeHm,
  type CreateAppointmentInput,
  type CreateClientInput,
  type CreateLeadCrmInput,
  resolveAppointmentPerson,
} from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import type {
  AppointmentActionResult,
  CheckConflictsInput,
  CheckConflictsResult,
  QuickCreateClientResult,
  QuickCreateLeadResult,
  SearchClientsResult,
  SearchLeadsResult,
} from "@/app/(crm)/crm/appointments/actions";
import type { PersonSelectValue } from "@/components/appointments/person-select";
import { PersonSelect } from "@/components/appointments/person-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildAppointmentFormPayload } from "@/lib/appointment-form-payload";
import type {
  AppointmentFormFieldValues,
  AppointmentFormValues,
} from "@/lib/appointment-form-schema";
import {
  appointmentFormSchema,
  DATE_ISO_PATTERN,
  DURATION_MAX,
  DURATION_MIN,
  EMPTY_APPOINTMENT_FORM_VALUES,
  TIME_HM_PATTERN,
} from "@/lib/appointment-form-schema";
import { formatDateBr } from "@/lib/format";

const KIND_ID = "appointment-kind";
const DATE_ID = "appointment-date";
const TIME_ID = "appointment-time";
const DURATION_ID = "appointment-duration";
const PERSON_SELECT_ID = "appointment-person";
const LOCATION_ID = "appointment-location";
const TITLE_ID = "appointment-title";
const NOTES_ID = "appointment-notes";

const KIND_LABEL = "Tipo";
const DATE_LABEL = "Data";
const TIME_LABEL = "Hora";
const DURATION_LABEL = "Duração (minutos)";
const LOCATION_LABEL = "Local";
const TITLE_LABEL = "Título";
const NOTES_LABEL = "Observações";

const OPTIONAL_HINT = "(opcional)";
const SUBMITTING_LABEL = "Salvando...";

const PAST_DATE_WARNING =
  "Esse horário já passou. O registro retroativo é permitido, mas confira a data.";

const CONFLICTS_CHECKING_TEXT = "Verificando conflitos de horário...";
const CONFLICTS_WARNING_TITLE = "Atenção: horário sobreposto";
const CONFLICTS_WARNING_HINT =
  "Já existe compromisso nesse intervalo. Você ainda pode salvar normalmente.";

const CONFLICT_DEBOUNCE_MS = 400;

const SELECT_CLASS_NAME =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm";

// Schema (`appointmentFormSchema`) e tipos derivados vivem em
// `lib/appointment-form-schema.ts` (ALERTA da revisão rodada 2): módulo puro,
// importável pelo teste que valida os `defaultValues` reais do detalhe contra
// o mesmo schema usado aqui.

export type AppointmentFormMode = "create" | "edit";

export type AppointmentFormProps = {
  mode: AppointmentFormMode;
  submitLabel: string;
  onSubmit: (
    values: CreateAppointmentInput,
  ) => Promise<AppointmentActionResult>;
  defaultValues?: Partial<AppointmentFormFieldValues>;
  /** Id do próprio compromisso, para o aviso de conflito (RF-11) não acusar
   * sobreposição contra ele mesmo ao editar. */
  excludeConflictId?: string;
  searchClientsAction: (term: string) => Promise<SearchClientsResult>;
  searchLeadsAction: (term: string) => Promise<SearchLeadsResult>;
  checkConflictsAction: (
    values: CheckConflictsInput,
  ) => Promise<CheckConflictsResult>;
  quickCreateClientAction: (
    values: CreateClientInput,
  ) => Promise<QuickCreateClientResult>;
  quickCreateLeadAction: (
    values: CreateLeadCrmInput,
  ) => Promise<QuickCreateLeadResult>;
};

// Descreve um item de conflito para a lista de aviso: nome da pessoa (via
// `resolveAppointmentPerson`, ÚNICA implementação da precedência cliente>lead)
// ou, sem pessoa, o título/label do tipo — mesma regra do card da listagem.
const describeConflict = (item: AppointmentListItem): string => {
  const person = resolveAppointmentPerson(item);
  if (person.name !== null) {
    return person.name;
  }
  return item.title ?? APPOINTMENT_KIND_LABELS[item.kind];
};

// Horário do conflito, no fuso do RF-15 (SUGESTÃO da revisão: sem pessoa
// vinculada, `describeConflict` já devolve `title`/label do tipo — repetir o
// título ao lado só duplicava o mesmo texto, ex.: "Entrega — Entrega". O
// horário é a informação que falta para a consultora avaliar a sobreposição.
const describeConflictTime = (item: AppointmentListItem): string =>
  `${formatDateBr(appLocalDateIso(item.startsAt))} ${appLocalTimeHm(item.startsAt)}`;

// Aviso de sobreposição, NUNCA bloqueante (RF-11/RF-18): consulta
// `checkConflictsAction` com debounce sempre que data/hora/duração formam um
// instante válido. Falha de rede/formato inválido apenas esvazia o aviso —
// nunca impede o preenchimento nem o envio do formulário.
function useConflictCheck({
  dateIso,
  timeHm,
  durationMinutes,
  excludeId,
  checkConflictsAction,
}: {
  dateIso: string;
  timeHm: string;
  durationMinutes: string;
  excludeId: string | undefined;
  checkConflictsAction: (
    values: CheckConflictsInput,
  ) => Promise<CheckConflictsResult>;
}): { conflicts: AppointmentListItem[]; isChecking: boolean } {
  const [conflicts, setConflicts] = useState<AppointmentListItem[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const parsedDuration = Number(durationMinutes.trim());
    const hasValidInputs =
      DATE_ISO_PATTERN.test(dateIso) &&
      TIME_HM_PATTERN.test(timeHm) &&
      Number.isInteger(parsedDuration) &&
      parsedDuration >= DURATION_MIN &&
      parsedDuration <= DURATION_MAX;

    if (!hasValidInputs) {
      setConflicts([]);
      setIsChecking(false);
      return;
    }

    let startsAt: string;
    try {
      startsAt = appLocalDateTimeToUtc(dateIso, timeHm);
    } catch {
      setConflicts([]);
      setIsChecking(false);
      return;
    }

    let active = true;
    setIsChecking(true);
    const timer = setTimeout(() => {
      void (async () => {
        const result = await checkConflictsAction({
          startsAt,
          durationMinutes: parsedDuration,
          ...(excludeId !== undefined ? { excludeId } : {}),
        });
        if (!active) {
          return;
        }
        setIsChecking(false);
        setConflicts(result.ok ? result.conflicts : []);
      })();
    }, CONFLICT_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dateIso, timeHm, durationMinutes, excludeId, checkConflictsAction]);

  return { conflicts, isChecking };
}

// `true` quando data+hora formam um instante válido já passado — só
// sinalização visual (RF-18: compromisso no passado é aceito).
const isPastDateTime = (dateIso: string, timeHm: string): boolean => {
  if (!DATE_ISO_PATTERN.test(dateIso) || !TIME_HM_PATTERN.test(timeHm)) {
    return false;
  }
  try {
    return (
      new Date(appLocalDateTimeToUtc(dateIso, timeHm)).getTime() < Date.now()
    );
  } catch {
    return false;
  }
};

// Form de compromisso (Client Component, folha da árvore — RF-18): serve
// criação e edição (`mode`). RHF + zodResolver com schema derivado campo a
// campo do contrato compartilhado; a data/hora local só viram `startsAt` no
// submit, via `appLocalDateTimeToUtc` (RF-16). Estados de web.md: enviando
// (botão desabilitado + "Salvando..."), erro do servidor (`role="alert"`),
// erro de campo em pt-BR sob cada input, mais os avisos não bloqueantes de
// conflito (RF-11) e data no passado.
export function AppointmentForm({
  mode,
  submitLabel,
  onSubmit,
  defaultValues,
  excludeConflictId,
  searchClientsAction,
  searchLeadsAction,
  checkConflictsAction,
  quickCreateClientAction,
  quickCreateLeadAction,
}: AppointmentFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<AppointmentFormFieldValues, unknown, AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: { ...EMPTY_APPOINTMENT_FORM_VALUES, ...defaultValues },
  });

  const dateIso = useWatch({ control, name: "dateIso" }) ?? "";
  const timeHm = useWatch({ control, name: "timeHm" }) ?? "";
  const durationMinutesRaw =
    useWatch({ control, name: "durationMinutes" }) ?? "";
  const clientId = useWatch({ control, name: "clientId" }) ?? null;
  const clientName = useWatch({ control, name: "clientName" }) ?? "";
  const leadId = useWatch({ control, name: "leadId" }) ?? null;
  const leadName = useWatch({ control, name: "leadName" }) ?? "";

  const { conflicts, isChecking } = useConflictCheck({
    dateIso,
    timeHm,
    durationMinutes: durationMinutesRaw,
    excludeId: excludeConflictId,
    checkConflictsAction,
  });

  const personValue: PersonSelectValue = {
    clientId,
    clientName,
    leadId,
    leadName,
  };

  const handlePersonChange = (value: PersonSelectValue) => {
    setValue("clientId", value.clientId);
    setValue("clientName", value.clientName);
    setValue("leadId", value.leadId);
    setValue("leadName", value.leadName);
  };

  // Estado de pessoa ANTES de qualquer interação (CRÍTICO da rodada 2 da
  // revisão): no EDIT, `buildAppointmentFormPayload` só inclui `clientId`/
  // `leadId` no payload quando o valor mudou em relação a este estado. O
  // RSC de detalhe (`[id]/page.tsx`) já entrega `defaultValues` com só a
  // pessoa VENCEDORA (via `resolveAppointmentFormPersonDefaults`, cliente tem
  // precedência) — nunca as duas FKs de um compromisso pós-conversão
  // (RF-12) — então `initialPerson`, derivado do mesmo `defaultValues`,
  // nunca viola `personExclusivityRefinement`. A FK perdedora (ex.: `lead_id`
  // depois da conversão) continua preservada no banco porque fica OMITIDA do
  // `PUT` enquanto ninguém troca a pessoa pelo `PersonSelect` — trocar a
  // cliente só altera `clientId`, então `leadId` segue de fora do payload e
  // o valor real no banco não é tocado. `defaultValues` é estável durante o
  // ciclo de vida do form (vem do RSC, não muda entre renders).
  const initialPerson = {
    clientId: defaultValues?.clientId ?? null,
    leadId: defaultValues?.leadId ?? null,
  };

  const submit = (values: AppointmentFormValues) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await onSubmit(
        buildAppointmentFormPayload(mode, values, initialPerson),
      );
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  const kindError = errors.kind?.message;
  const dateError = errors.dateIso?.message;
  const timeError = errors.timeHm?.message;
  const durationError = errors.durationMinutes?.message;
  const locationError = errors.location?.message;
  const titleError = errors.title?.message;
  const notesError = errors.notes?.message;
  // `personExclusivityRefinement` marca a MESMA issue em `clientId` e
  // `leadId` (SUGESTÃO #1 da rodada 2 da revisão): sem esta renderização, a
  // violação nunca chegava à usuária — o botão "virava" morto sem nenhum
  // sinal. Defesa em profundidade: com `defaultValues` já corrigido
  // (só a pessoa vencedora) isso não deve disparar em uso normal, mas
  // qualquer caminho que ainda preencha as duas FKs precisa de feedback
  // visível, não de uma falha silenciosa.
  const personError = errors.clientId?.message ?? errors.leadId?.message;

  const showPastWarning = isPastDateTime(dateIso, timeHm);
  const showConflictsWarning = !isChecking && conflicts.length > 0;

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={KIND_ID}>{KIND_LABEL}</Label>
        <select
          id={KIND_ID}
          className={SELECT_CLASS_NAME}
          aria-invalid={kindError ? true : undefined}
          aria-describedby={kindError ? `${KIND_ID}-error` : undefined}
          {...register("kind")}
        >
          {Object.entries(APPOINTMENT_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {kindError ? (
          <p id={`${KIND_ID}-error`} className="text-sm text-destructive">
            {kindError}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={DATE_ID}>{DATE_LABEL}</Label>
          <Input
            id={DATE_ID}
            type="date"
            className="h-11 md:h-9"
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? `${DATE_ID}-error` : undefined}
            {...register("dateIso")}
          />
          {dateError ? (
            <p id={`${DATE_ID}-error`} className="text-sm text-destructive">
              {dateError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={TIME_ID}>{TIME_LABEL}</Label>
          <Input
            id={TIME_ID}
            type="time"
            className="h-11 md:h-9"
            aria-invalid={timeError ? true : undefined}
            aria-describedby={timeError ? `${TIME_ID}-error` : undefined}
            {...register("timeHm")}
          />
          {timeError ? (
            <p id={`${TIME_ID}-error`} className="text-sm text-destructive">
              {timeError}
            </p>
          ) : null}
        </div>
      </div>

      {showPastWarning ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {PAST_DATE_WARNING}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={DURATION_ID}>{DURATION_LABEL}</Label>
        <Input
          id={DURATION_ID}
          type="number"
          inputMode="numeric"
          min={DURATION_MIN}
          max={DURATION_MAX}
          step={1}
          className="h-11 md:h-9"
          aria-invalid={durationError ? true : undefined}
          aria-describedby={durationError ? `${DURATION_ID}-error` : undefined}
          {...register("durationMinutes")}
        />
        {durationError ? (
          <p id={`${DURATION_ID}-error`} className="text-sm text-destructive">
            {durationError}
          </p>
        ) : null}
      </div>

      {isChecking ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {CONFLICTS_CHECKING_TEXT}
        </p>
      ) : null}
      {showConflictsWarning ? (
        <div
          aria-live="polite"
          className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800"
        >
          <p className="text-sm font-medium">{CONFLICTS_WARNING_TITLE}</p>
          <p className="text-xs">{CONFLICTS_WARNING_HINT}</p>
          <ul className="flex flex-col gap-0.5 text-xs">
            {conflicts.map((item) => (
              <li key={item.id}>
                {describeConflict(item)} — {describeConflictTime(item)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PersonSelect
        id={PERSON_SELECT_ID}
        value={personValue}
        onChange={handlePersonChange}
        searchClientsAction={searchClientsAction}
        searchLeadsAction={searchLeadsAction}
        quickCreateClientAction={quickCreateClientAction}
        quickCreateLeadAction={quickCreateLeadAction}
      />
      {personError ? (
        <p
          id={`${PERSON_SELECT_ID}-error`}
          role="alert"
          className="text-sm text-destructive"
        >
          {personError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={LOCATION_ID}>
          {LOCATION_LABEL}{" "}
          <span className="text-muted-foreground">{OPTIONAL_HINT}</span>
        </Label>
        <Input
          id={LOCATION_ID}
          type="text"
          className="h-11 md:h-9"
          aria-invalid={locationError ? true : undefined}
          aria-describedby={locationError ? `${LOCATION_ID}-error` : undefined}
          {...register("location")}
        />
        {locationError ? (
          <p id={`${LOCATION_ID}-error`} className="text-sm text-destructive">
            {locationError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={TITLE_ID}>
          {TITLE_LABEL}{" "}
          <span className="text-muted-foreground">{OPTIONAL_HINT}</span>
        </Label>
        <Input
          id={TITLE_ID}
          type="text"
          className="h-11 md:h-9"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${TITLE_ID}-error` : undefined}
          {...register("title")}
        />
        {titleError ? (
          <p id={`${TITLE_ID}-error`} className="text-sm text-destructive">
            {titleError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={NOTES_ID}>
          {NOTES_LABEL}{" "}
          <span className="text-muted-foreground">{OPTIONAL_HINT}</span>
        </Label>
        <Textarea
          id={NOTES_ID}
          rows={4}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? `${NOTES_ID}-error` : undefined}
          {...register("notes")}
        />
        {notesError ? (
          <p id={`${NOTES_ID}-error`} className="text-sm text-destructive">
            {notesError}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="h-11 w-full text-base md:w-auto md:self-start md:px-6"
      >
        {isPending ? SUBMITTING_LABEL : submitLabel}
      </Button>
    </form>
  );
}
