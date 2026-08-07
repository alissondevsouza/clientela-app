import type { Appointment } from "@clientela/shared";
import {
  APPOINTMENT_KIND_LABELS,
  appLocalDateIso,
  appLocalTimeHm,
  resolveAppointmentPerson,
} from "@clientela/shared";
import { ArrowLeft, CalendarPlus, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  cancelAppointmentAction,
  checkConflictsAction,
  completeAppointmentAction,
  convertAppointmentLeadAction,
  deleteAppointmentAction,
  linkAppointmentSaleAction,
  listLinkableSalesAction,
  noShowAppointmentAction,
  quickCreateClientAction,
  quickCreateLeadAction,
  searchClientsAction,
  searchLeadsAction,
  updateAppointmentAction,
} from "@/app/(crm)/crm/appointments/actions";
import {
  AppointmentActions,
  AppointmentNotesForm,
} from "@/components/appointments/appointment-actions";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { SaleLinkForm } from "@/components/appointments/sale-link-form";
import { buttonVariants } from "@/components/ui/button";
import { resolveAppointmentFormPersonDefaults } from "@/lib/appointment-form-schema";
import { resolveConvertibleLead } from "@/lib/appointment-lead-conversion";
import { buildConfirmationWhatsAppUrl } from "@/lib/appointment-message";
import { getAppointment } from "@/lib/appointments-api";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { formatBRL, formatDateBr } from "@/lib/format";
import { buildGoogleCalendarUrl } from "@/lib/google-calendar";
import { getLead } from "@/lib/leads-api";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Compromisso";
const BACK_LABEL = "Voltar para a agenda";
const LIST_HREF = "/crm/appointments";
const LOGIN_PATH = "/login";

const KIND_LABEL = "Tipo";
const DATE_LABEL = "Data";
const TIME_LABEL = "Hora";
const DURATION_LABEL = "Duração";
const LOCATION_LABEL = "Local";
const PERSON_LABEL = "Pessoa";
const SALE_LABEL = "Venda vinculada";
const NOT_INFORMED = "Não informado";
const NO_PERSON_LABEL = "Sem pessoa vinculada";
const NO_SALE_LABEL = "Nenhuma";
const DURATION_UNIT = "min";

const EDIT_HEADING = "Editar compromisso";
const NOTES_HEADING = "Observações";
const SALE_LINK_HEADING = "Vínculo de venda";
const ACTIONS_HEADING = "Ações";
const SAVE_LABEL = "Salvar alterações";

const WHATSAPP_LABEL = "Confirmar pelo WhatsApp";
const WHATSAPP_ARIA_LABEL = "Confirmar compromisso pelo WhatsApp";
const GOOGLE_CALENDAR_LABEL = "Adicionar ao Google Agenda";
const GOOGLE_CALENDAR_ARIA_LABEL = "Adicionar compromisso ao Google Agenda";

const SCHEDULED_STATUS = "scheduled";
const DONE_STATUS = "done";
const SALEABLE_STATUSES = new Set<string>([SCHEDULED_STATUS, DONE_STATUS]);

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type AppointmentDetailPageProps = {
  params: Promise<{ id: string }>;
};

// Título do compromisso (RF-19/RF-22): pessoa via `resolveAppointmentPerson`
// (ÚNICA fonte da precedência cliente>lead); sem pessoa, cai para o `title`
// livre e, na ausência dele, para o label do tipo — mesma regra do card da
// listagem (`appointment-card.tsx`), nunca reimplementada de outro jeito.
const appointmentHeading = (
  appointment: Pick<
    Appointment,
    "clientId" | "clientName" | "leadId" | "leadName" | "title" | "kind"
  >,
): string => {
  const person = resolveAppointmentPerson(appointment);
  if (person.name !== null) {
    return person.name;
  }
  if (appointment.title !== null && appointment.title.trim().length > 0) {
    return appointment.title;
  }
  return APPOINTMENT_KIND_LABELS[appointment.kind];
};

// Detalhe/edição/ações de compromisso (RSC async, server-first — RF-06/RF-07/
// RF-08/RF-09/RF-10/RF-19/RF-20/RF-21/RF-25): `params` é uma Promise (Next
// 15). 404 do compromisso (inclui cross-tenant e id malformado) ⇒
// `notFound()`. A lista de vendas ofertáveis (RF-19) e o status do lead
// vinculado (RF-25 — `appointmentSchema` não traz o status do lead, só
// `leadId`/`leadName`, então é preciso buscá-lo à parte) DEPENDEM do
// `getAppointment` anterior (não dá pra evitar essa dependência real), mas
// rodam em `Promise.all` ENTRE si — sem waterfall um do outro (web.md). Toda
// Server Action chega aos componentes client já com o id fixado por `.bind`
// — referência DIRETA (lesson 2026-07-19).
export default async function AppointmentDetailPage({
  params,
}: AppointmentDetailPageProps) {
  const { id } = await params;

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };

  const result = await getAppointment(id, deps);
  if (!result.ok) {
    if (result.notFound) {
      notFound();
    }
    throw new Error(result.message);
  }

  const { appointment } = result;
  const isScheduled = appointment.status === SCHEDULED_STATUS;
  const canLinkSale = SALEABLE_STATUSES.has(appointment.status);
  // Pessoa identificada é o LEAD (cliente tem precedência, RF-02): condição
  // necessária de RF-25 — compromisso com cliente ou sem pessoa nunca oferece
  // "Converter em cliente", então nem vale a pena buscar o status do lead.
  const linkedLeadId =
    appointment.clientId === null ? appointment.leadId : null;

  const [linkableSalesResult, leadStatusResult] = await Promise.all([
    canLinkSale
      ? listLinkableSalesAction(appointment.clientId ?? undefined)
      : Promise.resolve(null),
    linkedLeadId !== null ? getLead(linkedLeadId, deps) : Promise.resolve(null),
  ]);
  const linkableSales = linkableSalesResult?.ok
    ? linkableSalesResult.sales
    : [];
  // Falha ao buscar o lead (rede, 404) NUNCA derruba a página — só some com o
  // botão de conversão (fail-closed): a informação que falta é só essa ação
  // extra, o resto do detalhe já veio de `appointment`.
  const leadStatus = leadStatusResult?.ok ? leadStatusResult.lead.status : null;
  const convertibleLeadId = resolveConvertibleLead(appointment, leadStatus);
  const convertLeadAction =
    convertibleLeadId !== null
      ? convertAppointmentLeadAction.bind(
          null,
          appointment.id,
          convertibleLeadId,
        )
      : null;

  const person = resolveAppointmentPerson(appointment);
  const heading = appointmentHeading(appointment);
  const whatsAppUrl = buildConfirmationWhatsAppUrl(appointment);
  const googleCalendarUrl = buildGoogleCalendarUrl({
    title: heading,
    details: appointment.notes,
    location: appointment.location,
    startsAt: appointment.startsAt,
    durationMinutes: appointment.durationMinutes,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={LIST_HREF}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {BACK_LABEL}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold break-words">
            {heading}
          </h1>
          <AppointmentStatusBadge status={appointment.status} />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{KIND_LABEL}</dt>
          <dd>{APPOINTMENT_KIND_LABELS[appointment.kind]}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{PERSON_LABEL}</dt>
          <dd>{person.name ?? NO_PERSON_LABEL}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{DATE_LABEL}</dt>
          <dd>{formatDateBr(appLocalDateIso(appointment.startsAt))}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{TIME_LABEL}</dt>
          <dd>{appLocalTimeHm(appointment.startsAt)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{DURATION_LABEL}</dt>
          <dd>
            {appointment.durationMinutes} {DURATION_UNIT}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{LOCATION_LABEL}</dt>
          <dd>{appointment.location ?? NOT_INFORMED}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <dt className="text-muted-foreground">{SALE_LABEL}</dt>
          <dd>
            {appointment.saleId !== null ? (
              <Link
                href={`/crm/sales/${appointment.saleId}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {formatBRL(appointment.saleTotalCents ?? 0)}
              </Link>
            ) : (
              NO_SALE_LABEL
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {whatsAppUrl !== null ? (
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={WHATSAPP_ARIA_LABEL}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 gap-1.5 md:h-9",
            )}
          >
            <MessageCircle className="size-4" aria-hidden />
            {WHATSAPP_LABEL}
          </a>
        ) : null}
        <a
          href={googleCalendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={GOOGLE_CALENDAR_ARIA_LABEL}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 gap-1.5 md:h-9",
          )}
        >
          <CalendarPlus className="size-4" aria-hidden />
          {GOOGLE_CALENDAR_LABEL}
        </a>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          {isScheduled ? EDIT_HEADING : NOTES_HEADING}
        </h2>
        {isScheduled ? (
          <AppointmentForm
            mode="edit"
            submitLabel={SAVE_LABEL}
            onSubmit={updateAppointmentAction.bind(null, appointment.id)}
            excludeConflictId={appointment.id}
            searchClientsAction={searchClientsAction}
            searchLeadsAction={searchLeadsAction}
            checkConflictsAction={checkConflictsAction}
            quickCreateClientAction={quickCreateClientAction}
            quickCreateLeadAction={quickCreateLeadAction}
            defaultValues={{
              kind: appointment.kind,
              dateIso: appLocalDateIso(appointment.startsAt),
              timeHm: appLocalTimeHm(appointment.startsAt),
              durationMinutes: String(appointment.durationMinutes),
              // CRÍTICO da rodada 2 da revisão (`crm-appointments`): só a
              // pessoa VENCEDORA entra nos `defaultValues` do formulário —
              // um compromisso pós-conversão de lead (RF-12) tem `clientId`
              // E `leadId` reais preenchidos no banco, e carregar as duas
              // FKs aqui violaria `personExclusivityRefinement` já no
              // estado inicial, travando o submit em silêncio. A FK
              // perdedora continua preservada no banco (RF-07) porque fica
              // omitida do `PUT` — ver `appointment-form.tsx` (`initialPerson`)
              // e `lib/appointment-form-schema.ts`.
              ...resolveAppointmentFormPersonDefaults(appointment),
              location: appointment.location ?? "",
              title: appointment.title ?? "",
              notes: appointment.notes ?? "",
            }}
          />
        ) : (
          <AppointmentNotesForm
            defaultNotes={appointment.notes ?? ""}
            updateAppointmentAction={updateAppointmentAction.bind(
              null,
              appointment.id,
            )}
          />
        )}
      </section>

      {canLinkSale ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            {SALE_LINK_HEADING}
          </h2>
          <SaleLinkForm
            currentSaleId={appointment.saleId}
            sales={linkableSales}
            linkAppointmentSaleAction={linkAppointmentSaleAction.bind(
              null,
              appointment.id,
            )}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          {ACTIONS_HEADING}
        </h2>
        <AppointmentActions
          status={appointment.status}
          linkableSales={linkableSales}
          convertLeadAction={convertLeadAction}
          completeAppointmentAction={completeAppointmentAction.bind(
            null,
            appointment.id,
          )}
          noShowAppointmentAction={noShowAppointmentAction.bind(
            null,
            appointment.id,
          )}
          cancelAppointmentAction={cancelAppointmentAction.bind(
            null,
            appointment.id,
          )}
          deleteAppointmentAction={deleteAppointmentAction.bind(
            null,
            appointment.id,
          )}
        />
      </section>
    </div>
  );
}
