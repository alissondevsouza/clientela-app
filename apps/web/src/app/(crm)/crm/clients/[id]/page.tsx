import {
  APPOINTMENT_KIND_LABELS,
  appLocalDateIso,
  appLocalTimeHm,
} from "@clientela/shared";
import { ArrowLeft, CalendarPlus, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateClientAction } from "@/app/(crm)/crm/clients/actions";
import { ClientForm } from "@/components/clients/client-form";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { buttonVariants } from "@/components/ui/button";
import { listAppointments } from "@/lib/appointments-api";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getClient } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import { formatDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl, toWaPhone } from "@/lib/whatsapp";

const PAGE_TITLE = "Cliente";
const EDIT_HEADING = "Editar dados";
const SAVE_LABEL = "Salvar alterações";
const BACK_LABEL = "Voltar para clientes";
const LIST_HREF = "/crm/clients";
const LOGIN_PATH = "/login";

const BIRTHDAY_LABEL = "Aniversário";
const SKIN_TONE_LABEL = "Tom de pele";
const NOT_INFORMED = "Não informado";
const NEXT_APPOINTMENT_HEADING = "Próximo compromisso";

// Só um resultado por vez: a ficha só precisa saber se existe um próximo
// compromisso agendado, nunca uma listagem navegável (RF-22).
const NEXT_APPOINTMENT_PER_PAGE = 1;

export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
};

const whatsappAriaLabel = (name: string): string =>
  `Conversar com ${name} no WhatsApp`;

const scheduleAriaLabel = (name: string): string =>
  `Agendar compromisso com ${name}`;

const newAppointmentHref = (clientId: string): string =>
  `/crm/appointments/new?clientId=${encodeURIComponent(clientId)}`;

const appointmentDetailHref = (id: string): string =>
  `/crm/appointments/${encodeURIComponent(id)}`;

// Detalhe/edição de cliente (RSC async, server-first): `params` é uma Promise
// (Next 15) — await antes de usar. Busca a cliente e o próximo compromisso
// agendado EM PARALELO (`Promise.all`, sem waterfall — web.md, RF-22); a
// cliente é o dado principal (404 ⇒ `notFound()`; falha genérica ⇒ `throw`,
// cai no `error.tsx` local), enquanto a busca de compromisso degrada com
// elegância em caso de falha (`{ ok: false }` ⇒ bloco simplesmente não
// aparece, nunca derruba a página). O form de edição liga a Server Action
// `updateClientAction` com o id fixado por `.bind`. O botão WhatsApp
// normaliza o número armazenado (só dígitos) para E.164 antes de montar o
// link (RF-08).
export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { id } = await params;

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };

  const [result, nextAppointmentResult] = await Promise.all([
    getClient(id, deps),
    listAppointments(
      {
        clientId: id,
        range: "upcoming",
        status: "scheduled",
        perPage: NEXT_APPOINTMENT_PER_PAGE,
      },
      deps,
    ),
  ]);

  if (!result.ok) {
    if (result.notFound) {
      notFound();
    }
    throw new Error(result.message);
  }

  const { client } = result;
  const waHref = buildWhatsAppUrl({ phone: toWaPhone(client.whatsapp) });
  const nextAppointment = nextAppointmentResult.ok
    ? (nextAppointmentResult.data[0] ?? null)
    : null;

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
            {client.name}
          </h1>
          <div className="flex shrink-0 gap-2">
            <Link
              href={newAppointmentHref(client.id)}
              aria-label={scheduleAriaLabel(client.name)}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "size-11 md:size-9",
              )}
            >
              <CalendarPlus aria-hidden />
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={whatsappAriaLabel(client.name)}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "size-11 md:size-9",
              )}
            >
              <MessageCircle aria-hidden />
            </a>
          </div>
        </div>
      </div>

      {nextAppointment ? (
        <section className="flex flex-col gap-2 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">
            {NEXT_APPOINTMENT_HEADING}
          </h2>
          <Link
            href={appointmentDetailHref(nextAppointment.id)}
            className="flex flex-col gap-0.5 outline-none hover:underline focus-visible:underline"
          >
            <span className="font-medium text-foreground">
              {formatDateBr(appLocalDateIso(nextAppointment.startsAt))} às{" "}
              {appLocalTimeHm(nextAppointment.startsAt)}
            </span>
            <span className="text-muted-foreground">
              {APPOINTMENT_KIND_LABELS[nextAppointment.kind]}
            </span>
          </Link>
        </section>
      ) : null}

      <dl className="grid grid-cols-1 gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">WhatsApp</dt>
          <dd>{client.whatsapp}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{BIRTHDAY_LABEL}</dt>
          <dd>
            {client.birthday ? formatDateBr(client.birthday) : NOT_INFORMED}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{SKIN_TONE_LABEL}</dt>
          <dd>{client.skinTone ?? NOT_INFORMED}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold">{EDIT_HEADING}</h2>
        <ClientForm
          mode="edit"
          submitLabel={SAVE_LABEL}
          onSubmit={updateClientAction.bind(null, client.id)}
          defaultValues={{
            name: client.name,
            whatsapp: client.whatsapp,
            birthday: client.birthday ?? "",
            skinTone: client.skinTone ?? "",
            notes: client.notes ?? "",
          }}
        />
      </section>

      <DeleteClientButton clientId={client.id} />
    </div>
  );
}
