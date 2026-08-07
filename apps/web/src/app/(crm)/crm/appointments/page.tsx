import {
  type AppointmentDayBucket,
  type AppointmentListItem,
  appLocalDateIso,
  appointmentDayBucket,
} from "@clientela/shared";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppointmentCard } from "@/components/appointments/appointment-card";
import { buttonVariants } from "@/components/ui/button";
import type { ListAppointmentsParams } from "@/lib/appointments-api";
import { listAppointments } from "@/lib/appointments-api";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Agenda";
const NEW_APPOINTMENT_HREF = "/crm/appointments/new";
const LIST_HREF = "/crm/appointments";
const LOGIN_PATH = "/login";

const PAGE_FALLBACK = 1;
const MIN_TOTAL_PAGES = 1;

// Abas da tela (RF-17): "Próximos" combina `range=upcoming` COM
// `status=scheduled` (um compromisso futuro já cancelado não polui a agenda) —
// a partição entre as três abas é uma propriedade da TELA, não da API (RF-05).
const APPOINTMENT_TAB_VALUES = ["upcoming", "pending", "history"] as const;
type AppointmentTab = (typeof APPOINTMENT_TAB_VALUES)[number];
const DEFAULT_TAB: AppointmentTab = "upcoming";

const TAB_LABELS: Record<AppointmentTab, string> = {
  upcoming: "Próximos",
  pending: "Pendentes",
  history: "Histórico",
};

const EMPTY_TITLES: Record<AppointmentTab, string> = {
  upcoming: "Nenhum compromisso agendado",
  pending: "Nenhum compromisso pendente",
  history: "Nenhum compromisso no histórico",
};

const EMPTY_DESCRIPTIONS: Record<AppointmentTab, string> = {
  upcoming:
    "Agende um encontro com uma cliente ou lead para organizar sua semana.",
  pending:
    "Compromissos de dias anteriores que ficaram sem desfecho aparecem aqui.",
  history:
    "Compromissos já concluídos, cancelados ou sem comparecimento aparecem aqui.",
};

// Grupos do agrupamento por dia da aba Próximos (RF-17). `"past"` nunca deveria
// ocorrer dado `range=upcoming` (que já filtra `starts_at >= hoje`), mas o tipo
// de `appointmentDayBucket` é o union completo — tratado defensivamente abaixo.
type UpcomingBucket = Exclude<AppointmentDayBucket, "past">;

const BUCKET_ORDER: readonly UpcomingBucket[] = ["today", "next7", "later"];

const BUCKET_LABELS: Record<UpcomingBucket, string> = {
  today: "Hoje",
  next7: "Próximos 7 dias",
  later: "Depois",
};

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Saneamento dos `searchParams` na fronteira da page (core.md): `?page`
// inválido e `?tab` fora do enum CAEM NO DEFAULT via `.catch`, nunca lançam
// nem caem no error boundary.
const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(PAGE_FALLBACK),
  tab: z.enum(APPOINTMENT_TAB_VALUES).catch(DEFAULT_TAB),
});

type CrmAppointmentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Href da aba: trocar de aba reseta a paginação (volta à página 1 = sem
// `page` na querystring). "Próximos" é o default, sem `tab` na URL.
const buildTabHref = (tab: AppointmentTab): string => {
  if (tab === DEFAULT_TAB) {
    return LIST_HREF;
  }
  const query = new URLSearchParams({ tab });
  return `${LIST_HREF}?${query.toString()}`;
};

// Href de paginação: preserva a aba ativa ao mudar de página.
const buildPageHref = (targetPage: number, tab: AppointmentTab): string => {
  const query = new URLSearchParams();
  query.set("page", String(targetPage));
  if (tab !== DEFAULT_TAB) {
    query.set("tab", tab);
  }
  return `${LIST_HREF}?${query.toString()}`;
};

const tabLinkClass = (isActive: boolean): string =>
  cn(
    buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" }),
    "h-9 md:h-8",
  );

// Parâmetros da API por aba: só "Próximos" soma `status=scheduled` ao recorte
// (RF-17) — as demais abas usam o recorte puro do RF-05.
const listParamsForTab = (
  tab: AppointmentTab,
  page: number,
): ListAppointmentsParams =>
  tab === "upcoming"
    ? { page, range: "upcoming", status: "scheduled" }
    : { page, range: tab };

// Agrupa os itens da aba Próximos por dia (RF-17), preservando a ordem
// ascendente já devolvida pela API. `appointmentDayBucket` é a única
// implementação do agrupamento (função pura testada em `time.test.ts`) —
// nunca reimplementada aqui.
const groupByBucket = (
  data: AppointmentListItem[],
  todayLocalDateIso: string,
): Partial<Record<UpcomingBucket, AppointmentListItem[]>> => {
  const groups: Partial<Record<UpcomingBucket, AppointmentListItem[]>> = {};
  for (const appointment of data) {
    const bucket = appointmentDayBucket(
      appLocalDateIso(appointment.startsAt),
      todayLocalDateIso,
    );
    if (bucket === "past") {
      continue;
    }
    const existing = groups[bucket] ?? [];
    groups[bucket] = [...existing, appointment];
  }
  return groups;
};

// Listagem de compromissos (RSC, server-first): sanea a URL, lê o Bearer do
// cookie (o layout já barra sessão ausente — redirect defensivo aqui) e busca
// a página filtrada/paginada pela aba ativa. Falha da chamada vira `throw`
// para o error.tsx (retry). Estados de vazio e conteúdo cobrem web.md; o
// skeleton fica no loading.tsx.
export default async function CrmAppointmentsPage({
  searchParams,
}: CrmAppointmentsPageProps) {
  const { page, tab } = searchParamsSchema.parse(await searchParams);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };
  const result = await listAppointments(listParamsForTab(tab, page), deps);

  if (!result.ok) {
    throw new Error(result.message);
  }

  const header = (
    <header className="flex items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
      <Link
        href={NEW_APPOINTMENT_HREF}
        className={cn(buttonVariants(), "h-11 gap-1.5 px-3 md:h-8")}
      >
        <Plus aria-hidden />
        Agendar
      </Link>
    </header>
  );

  const tabs = (
    <nav
      aria-label="Abas da agenda"
      className="flex flex-wrap items-center gap-2"
    >
      {APPOINTMENT_TAB_VALUES.map((value) => (
        <Link
          key={value}
          href={buildTabHref(value)}
          aria-current={tab === value ? "page" : undefined}
          className={tabLinkClass(tab === value)}
        >
          {TAB_LABELS[value]}
        </Link>
      ))}
    </nav>
  );

  const isEmpty = result.data.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {tabs}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div className="flex flex-col gap-1">
            <p className="font-medium">{EMPTY_TITLES[tab]}</p>
            <p className="text-sm text-muted-foreground">
              {EMPTY_DESCRIPTIONS[tab]}
            </p>
          </div>
          <Link href={NEW_APPOINTMENT_HREF} className={buttonVariants()}>
            Agendar
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(
    MIN_TOTAL_PAGES,
    Math.ceil(result.total / result.perPage),
  );
  const hasPrev = result.page > MIN_TOTAL_PAGES;
  const hasNext = result.page < totalPages;

  const todayLocalDateIso = appLocalDateIso(new Date().toISOString());
  const bucketedAppointments =
    tab === "upcoming" ? groupByBucket(result.data, todayLocalDateIso) : {};

  const list =
    tab === "upcoming" ? (
      <div className="flex flex-col gap-6">
        {BUCKET_ORDER.map((bucket) => {
          const items = bucketedAppointments[bucket];
          if (!items || items.length === 0) {
            return null;
          }
          return (
            <section key={bucket} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {BUCKET_LABELS[bucket]}
              </h2>
              <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
                {items.map((appointment) => (
                  <li key={appointment.id}>
                    <AppointmentCard
                      appointment={appointment}
                      showDate={bucket !== "today"}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    ) : (
      <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {result.data.map((appointment) => (
          <li key={appointment.id}>
            <AppointmentCard appointment={appointment} />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-6">
      {header}
      {tabs}
      {list}

      <nav
        aria-label="Paginação"
        className="flex items-center justify-between gap-3"
      >
        {hasPrev ? (
          <Link
            href={buildPageHref(result.page - 1, tab)}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 md:h-8",
            )}
          >
            Anterior
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 pointer-events-none opacity-50 md:h-8",
            )}
          >
            Anterior
          </span>
        )}

        <span className="text-sm text-muted-foreground">
          Página {result.page} de {totalPages}
        </span>

        {hasNext ? (
          <Link
            href={buildPageHref(result.page + 1, tab)}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 md:h-8",
            )}
          >
            Próxima
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 pointer-events-none opacity-50 md:h-8",
            )}
          >
            Próxima
          </span>
        )}
      </nav>
    </div>
  );
}
