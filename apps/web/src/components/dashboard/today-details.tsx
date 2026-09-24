// Conteúdo detalhado do Hoje (RF-20/RF-28): as seções por tipo (cobranças,
// agenda, entregas, leads novos, encomendas sem estoque, aniversariantes),
// cada uma com contagem, até 5 itens e botão de WhatsApp — o que ficava na
// home até a emenda RF-20a, agora exclusivo da página `/crm/today`. Server
// Component assíncrono: chama `getDashboardToday` (NUNCA lança); `ok: false`
// vira `SectionError`. Seção sem itens não aparece (`visibleTodaySections`);
// tudo vazio ⇒ `TodayEmptyState`. Cada seção tem `id` estável (âncora do
// cartão-resumo da home) com `scroll-mt` para não ficar atrás do header
// sticky.

import {
  APPOINTMENT_KIND_LABELS,
  appLocalTimeHm,
  type DashboardToday,
  resolveAppointmentPerson,
} from "@clientela/shared";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { buildConfirmationWhatsAppUrl } from "@/lib/appointment-message";
import { getDashboardToday } from "@/lib/dashboard-api";
import {
  appointmentHref,
  appointmentsHref,
  type CollectionGroupTarget,
  clientHref,
  collectionGroupHref,
  collectionsSummaryHref,
  collectionsViewAllHref,
  deliveriesViewAllHref,
  lowStockHref,
  newLeadsViewAllHref,
  productHref,
  restockOrderHref,
  saleHref,
} from "@/lib/dashboard-links";
import {
  birthdayWhatsAppUrl,
  collectionGroupWhatsAppUrl,
  newLeadWhatsAppUrl,
} from "@/lib/dashboard-messages";
import {
  birthdayDayLabel,
  formatDayMonthBr,
  sectionCountSuffix,
} from "@/lib/dashboard-today-format";
import {
  isTodayEmpty,
  TODAY_SECTION_ANCHORS,
  type TodaySectionKey,
  visibleTodaySections,
} from "@/lib/dashboard-today-view";
import { loadWebEnv } from "@/lib/env";
import { formatBRL, formatLocalDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScrollToHash } from "./scroll-to-hash";
import { SectionError } from "./section-error";
import { TodayEmptyState } from "./today-empty-state";

const TODAY_TITLE = "Hoje";

const COLLECTIONS_TITLE = "Cobranças";
const APPOINTMENTS_TITLE = "Agenda de hoje";
const DELIVERIES_TITLE = "A entregar";
const NEW_LEADS_TITLE = "Leads novos";
const RESTOCK_TITLE = "Encomendas sem estoque";
const BIRTHDAYS_TITLE = "Aniversariantes";

const VIEW_RECEIVABLES_LABEL = "Ver cobranças";
const VIEW_ALL_COLLECTIONS_LABEL = "Ver todas";
const VIEW_AGENDA_LABEL = "Ver agenda";
const VIEW_ALL_DELIVERIES_LABEL = "Ver todas";
const VIEW_ALL_NEW_LEADS_LABEL = "Ver todos";
const RESTOCK_ORDER_LABEL = "Criar pedido de reposição";
const VIEW_PRODUCTS_LABEL = "Ver produtos";

const SINGLE = 1;
const LINK_CLASS =
  "text-sm font-medium text-primary hover:underline focus-visible:underline";
const ITEM_CARD_CLASS =
  "flex items-start justify-between gap-3 rounded-lg bg-background p-3 ring-1 ring-foreground/10";
// S2: além do ícone, um rótulo curto VISÍVEL ("Cobrar", "Confirmar"…) — só o
// ícone era pouco descobrível. `aria-label` continua com o texto completo da
// ação (o rótulo curto é decorativo, `aria-hidden`).
const WHATSAPP_BUTTON_CLASS = "h-11 shrink-0 gap-1.5 px-3 md:h-9";
const COLLECTIONS_WHATSAPP_LABEL = "Cobrar";
const APPOINTMENT_WHATSAPP_LABEL = "Confirmar";
const NEW_LEAD_WHATSAPP_LABEL = "Chamar";
const BIRTHDAY_WHATSAPP_LABEL = "Parabéns";

// Header sticky de ~64px (CrmHeader) — margem de rolagem para a âncora não
// ficar escondida atrás dele.
const SCROLL_MARGIN_CLASS = "scroll-mt-20";

const pluralize = (count: number, singular: string, plural: string): string =>
  count === SINGLE ? singular : plural;

const whatsAppButton = (
  href: string | null,
  label: string,
  ariaLabel: string,
): ReactNode => {
  if (href === null) {
    return null;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(
        buttonVariants({ variant: "outline" }),
        WHATSAPP_BUTTON_CLASS,
      )}
    >
      <MessageCircle aria-hidden className="size-4" />
      <span aria-hidden>{label}</span>
    </a>
  );
};

type TodaySectionShellProps = {
  sectionKey: TodaySectionKey;
  headingId: string;
  title: string;
  children: ReactNode;
};

// Cada seção do RF-20 é um `<section aria-labelledby>` com heading próprio —
// a página `/crm/today` (RF-28) tem só o `h1` "Hoje" acima, então a
// hierarquia é h1 "Hoje" (página) → h2 por seção, sem pular nível (S1/WCAG
// 1.3.1; o comentário antigo — "h2 'Hoje' (bloco) → h3" — descrevia a home
// de antes da emenda que separou o conteúdo detalhado para esta página).
// `id` = âncora do RF-28 (destino dos cartões-resumo da home).
function TodaySectionShell({
  sectionKey,
  headingId,
  title,
  children,
}: TodaySectionShellProps) {
  return (
    <section
      id={TODAY_SECTION_ANCHORS[sectionKey]}
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        SCROLL_MARGIN_CLASS,
      )}
    >
      <h2 id={headingId} className="font-heading text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Resumo textual das cobranças (RF-20): só os grupos entram em contagem
// (atrasadas/hoje); "próximos 7 dias" é só o resumo — nunca vira grupo (RF-12).
const collectionsSummaryText = (
  collections: DashboardToday["collections"],
): string => {
  const parts: string[] = [];
  if (collections.overdueCount > 0) {
    parts.push(
      `${collections.overdueCount} ${pluralize(collections.overdueCount, "atrasada", "atrasadas")} · ${formatBRL(collections.overdueCents)}`,
    );
  }
  if (collections.dueTodayCount > 0) {
    parts.push(
      `${collections.dueTodayCount} vencendo hoje · ${formatBRL(collections.dueTodayCents)}`,
    );
  }
  if (collections.next7Count > 0) {
    parts.push(
      `${collections.next7Count} nos próximos 7 dias · ${formatBRL(collections.next7Cents)}`,
    );
  }
  return parts.join(" · ");
};

const collectionGroupKey = (group: CollectionGroupTarget): string =>
  group.clientId ?? group.saleId ?? "";

function CollectionsSection({
  collections,
  todayIso,
}: {
  collections: DashboardToday["collections"];
  todayIso: string;
}) {
  return (
    <TodaySectionShell
      sectionKey="collections"
      headingId="today-collections-heading"
      title={COLLECTIONS_TITLE}
    >
      <p className="text-sm text-muted-foreground">
        {collectionsSummaryText(collections)}
      </p>
      <Link href={collectionsSummaryHref()} className={LINK_CLASS}>
        {VIEW_RECEIVABLES_LABEL}
      </Link>

      {collections.groups.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2">
            {collections.groups.map((group) => {
              const href = collectionGroupHref(group);
              const waHref = collectionGroupWhatsAppUrl(group, todayIso);
              const dueLabel = group.overdue
                ? `venceu ${formatDayMonthBr(group.oldestDueDate)}`
                : "vence hoje";
              return (
                <li key={collectionGroupKey(group)} className={ITEM_CARD_CLASS}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={href}
                      className="truncate font-medium hover:underline"
                    >
                      {group.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {group.installmentsCount}{" "}
                      {pluralize(
                        group.installmentsCount,
                        "parcela",
                        "parcelas",
                      )}{" "}
                      · {formatBRL(group.amountCents)} · {dueLabel}
                    </p>
                  </div>
                  {whatsAppButton(
                    waHref,
                    COLLECTIONS_WHATSAPP_LABEL,
                    `Cobrar ${group.name} no WhatsApp`,
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href={collectionsViewAllHref(collections.overdueCount)}
            className={LINK_CLASS}
          >
            {VIEW_ALL_COLLECTIONS_LABEL}
          </Link>
        </>
      ) : null}
    </TodaySectionShell>
  );
}

// Título do item de agenda (RF-20): pessoa via `resolveAppointmentPerson`
// (única fonte da precedência cliente>lead); sem pessoa, cai para o `title`
// livre e, na ausência dele, para o label do tipo — mesmo padrão de
// `appointment-card.tsx`.
const appointmentHeading = (
  item: DashboardToday["appointments"]["items"][number],
): string => {
  const person = resolveAppointmentPerson(item);
  if (person.name !== null) {
    return person.name;
  }
  if (item.title !== null && item.title.trim().length > 0) {
    return item.title;
  }
  return APPOINTMENT_KIND_LABELS[item.kind];
};

function AppointmentsSection({
  appointments,
}: {
  appointments: DashboardToday["appointments"];
}) {
  return (
    <TodaySectionShell
      sectionKey="appointments"
      headingId="today-appointments-heading"
      title={`${APPOINTMENTS_TITLE}${sectionCountSuffix(appointments.total)}`}
    >
      <ul className="flex flex-col gap-2">
        {appointments.items.map((item) => {
          const heading = appointmentHeading(item);
          const waHref = buildConfirmationWhatsAppUrl(item);
          return (
            <li key={item.id} className={ITEM_CARD_CLASS}>
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={appointmentHref(item.id)}
                  className="truncate font-medium hover:underline"
                >
                  {heading}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {appLocalTimeHm(item.startsAt)} ·{" "}
                  {APPOINTMENT_KIND_LABELS[item.kind]}
                </p>
              </div>
              {whatsAppButton(
                waHref,
                APPOINTMENT_WHATSAPP_LABEL,
                `Confirmar com ${heading} no WhatsApp`,
              )}
            </li>
          );
        })}
      </ul>
      <Link href={appointmentsHref()} className={LINK_CLASS}>
        {VIEW_AGENDA_LABEL}
      </Link>
    </TodaySectionShell>
  );
}

function DeliveriesSection({
  deliveries,
}: {
  deliveries: DashboardToday["deliveries"];
}) {
  return (
    <TodaySectionShell
      sectionKey="deliveries"
      headingId="today-deliveries-heading"
      title={DELIVERIES_TITLE}
    >
      <p className="text-sm text-muted-foreground">
        {deliveries.total} {pluralize(deliveries.total, "venda", "vendas")} ·{" "}
        {formatBRL(deliveries.totalCents)}
      </p>
      <ul className="flex flex-col gap-2">
        {deliveries.items.map((item) => (
          <li
            key={item.saleId}
            className="flex flex-col gap-1 rounded-lg bg-background p-3 ring-1 ring-foreground/10"
          >
            <Link
              href={saleHref(item.saleId)}
              className="truncate font-medium hover:underline"
            >
              {item.clientName}
            </Link>
            <p className="text-sm text-muted-foreground">
              {formatBRL(item.totalCents)} · vendida em{" "}
              {formatLocalDateBr(item.soldAt)}
            </p>
          </li>
        ))}
      </ul>
      <Link href={deliveriesViewAllHref()} className={LINK_CLASS}>
        {VIEW_ALL_DELIVERIES_LABEL}
      </Link>
    </TodaySectionShell>
  );
}

function NewLeadsSection({
  newLeads,
}: {
  newLeads: DashboardToday["newLeads"];
}) {
  return (
    <TodaySectionShell
      sectionKey="newLeads"
      headingId="today-new-leads-heading"
      title={`${NEW_LEADS_TITLE}${sectionCountSuffix(newLeads.total)}`}
    >
      <ul className="flex flex-col gap-2">
        {newLeads.items.map((lead) => {
          const waHref = newLeadWhatsAppUrl(lead);
          return (
            <li key={lead.id} className={ITEM_CARD_CLASS}>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate font-medium">{lead.name}</p>
                {lead.interest !== null ? (
                  <p className="text-sm text-muted-foreground">
                    {lead.interest}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  chegou em {formatLocalDateBr(lead.createdAt)}
                </p>
              </div>
              {whatsAppButton(
                waHref,
                NEW_LEAD_WHATSAPP_LABEL,
                `Chamar ${lead.name} no WhatsApp`,
              )}
            </li>
          );
        })}
      </ul>
      <Link href={newLeadsViewAllHref()} className={LINK_CLASS}>
        {VIEW_ALL_NEW_LEADS_LABEL}
      </Link>
    </TodaySectionShell>
  );
}

function RestockSection({ restock }: { restock: DashboardToday["restock"] }) {
  return (
    <TodaySectionShell
      sectionKey="restock"
      headingId="today-restock-heading"
      title={`${RESTOCK_TITLE}${sectionCountSuffix(restock.shortCount)}`}
    >
      <ul className="flex flex-col gap-2">
        {restock.items.map((item) => (
          <li
            key={item.productId}
            className="flex flex-col gap-1 rounded-lg bg-background p-3 ring-1 ring-foreground/10"
          >
            <Link
              href={productHref(item.productId)}
              className="truncate font-medium hover:underline"
            >
              {item.name}
            </Link>
            <p className="text-sm text-muted-foreground">
              faltam {item.missingQty} un.
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link href={restockOrderHref()} className={LINK_CLASS}>
          {RESTOCK_ORDER_LABEL}
        </Link>
        <Link href={lowStockHref()} className={LINK_CLASS}>
          {VIEW_PRODUCTS_LABEL}
        </Link>
      </div>
    </TodaySectionShell>
  );
}

function BirthdaysSection({
  birthdays,
  todayIso,
}: {
  birthdays: DashboardToday["birthdays"];
  todayIso: string;
}) {
  return (
    <TodaySectionShell
      sectionKey="birthdays"
      headingId="today-birthdays-heading"
      title={`${BIRTHDAYS_TITLE}${sectionCountSuffix(birthdays.length)}`}
    >
      <ul className="flex flex-col gap-2">
        {birthdays.map((item) => {
          const waHref = birthdayWhatsAppUrl(item);
          return (
            <li key={item.clientId} className={ITEM_CARD_CLASS}>
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={clientHref(item.clientId)}
                  className="truncate font-medium hover:underline"
                >
                  {item.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {birthdayDayLabel(item.nextOn, todayIso)}
                </p>
              </div>
              {whatsAppButton(
                waHref,
                BIRTHDAY_WHATSAPP_LABEL,
                `Parabéns para ${item.name} no WhatsApp`,
              )}
            </li>
          );
        })}
      </ul>
    </TodaySectionShell>
  );
}

function renderTodaySection(
  key: TodaySectionKey,
  today: DashboardToday,
): ReactNode {
  switch (key) {
    case "collections":
      return (
        <CollectionsSection
          collections={today.collections}
          todayIso={today.today}
        />
      );
    case "appointments":
      return <AppointmentsSection appointments={today.appointments} />;
    case "deliveries":
      return <DeliveriesSection deliveries={today.deliveries} />;
    case "newLeads":
      return <NewLeadsSection newLeads={today.newLeads} />;
    case "restock":
      return <RestockSection restock={today.restock} />;
    case "birthdays":
      return (
        <BirthdaysSection birthdays={today.birthdays} todayIso={today.today} />
      );
  }
}

export type TodayDetailsProps = {
  token: string;
};

export async function TodayDetails({ token }: TodayDetailsProps) {
  const apiUrl = loadWebEnv().API_URL;
  const result = await getDashboardToday({ fetchImpl: fetch, apiUrl, token });

  if (!result.ok) {
    return <SectionError title={TODAY_TITLE} message={result.message} />;
  }

  const { today } = result;

  if (isTodayEmpty(today)) {
    return <TodayEmptyState />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Depois dos dados: os `id` das seções já existem no DOM quando este
          efeito roda (C2 — sem isso, a rolagem competia com o streaming do
          `Suspense` e perdia a corrida na maioria das vezes). */}
      <ScrollToHash />
      {visibleTodaySections(today).map((key) => (
        <div key={key}>{renderTodaySection(key, today)}</div>
      ))}
    </div>
  );
}
