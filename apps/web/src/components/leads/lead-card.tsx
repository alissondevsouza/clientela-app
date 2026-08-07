import type { CrmLead } from "@clientela/shared";
import { CalendarPlus, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl, toWaPhone } from "@/lib/whatsapp";

const INTEREST_LABEL = "Interesse";
const CAPTURED_AT_LABEL = "Captado em";
const VIEW_CLIENT_LABEL = "Ver cliente";
const DELETED_CLIENT_TEXT = "Cliente excluída";

const CONVERTED_STATUS = "converted";
// Lead descartado não se agenda (RF-22) — a única exceção à ação "Agendar",
// que existe para todos os demais status (inclusive convertido, cujo
// compromisso passa a apontar para a cliente via conversão, RF-12).
const DISCARDED_STATUS = "discarded";
const ISO_DATE_TIME_SEPARATOR = "T";

const clientDetailHref = (id: string): string => `/crm/clients/${id}`;

const newAppointmentHref = (leadId: string): string =>
  `/crm/appointments/new?leadId=${encodeURIComponent(leadId)}`;

const whatsappAriaLabel = (name: string): string =>
  `Conversar com ${name} no WhatsApp`;

const scheduleAriaLabel = (name: string): string =>
  `Agendar compromisso com ${name}`;

// `createdAt` chega como ISO datetime (ex.: `2026-07-18T12:00:00.000Z`); a UI
// mostra só a data (dd/mm/aaaa). `formatDateBr` espera `yyyy-mm-dd`, então
// extraímos a parte da data antes do `T`. Fallback ao valor cru se o formato
// fugir do esperado (formatDateBr é fail-safe de todo modo).
const toDatePart = (isoDateTime: string): string =>
  isoDateTime.split(ISO_DATE_TIME_SEPARATOR)[0] ?? isoDateTime;

type LeadCardProps = {
  lead: CrmLead;
  // Ações client (contatar/descartar/converter) chegam na Task 3.3 como slot;
  // um lead convertido NUNCA mostra ações — mostra o vínculo com a cliente.
  children?: ReactNode;
};

// Card da listagem de leads (RSC): nome, WhatsApp, interesse (quando houver),
// data de captura, badge de status e atalho de conversa wa.me (número
// normalizado para E.164 via `toWaPhone`). A área de ações troca conforme o
// status: convertido exibe o vínculo com a cliente; demais renderizam o slot.
export function LeadCard({ lead, children }: LeadCardProps) {
  const waHref = buildWhatsAppUrl({ phone: toWaPhone(lead.whatsapp) });
  const isConverted = lead.status === CONVERTED_STATUS;
  const canSchedule = lead.status !== DISCARDED_STATUS;

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">{lead.name}</CardTitle>
          <p className="truncate text-sm text-muted-foreground">
            {lead.whatsapp}
          </p>
          <LeadStatusBadge status={lead.status} />
        </div>
        <div className="flex shrink-0 gap-2">
          {canSchedule ? (
            <Link
              href={newAppointmentHref(lead.id)}
              aria-label={scheduleAriaLabel(lead.name)}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "size-11 md:size-9",
              )}
            >
              <CalendarPlus aria-hidden />
            </Link>
          ) : null}
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={whatsappAriaLabel(lead.name)}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "size-11 md:size-9",
            )}
          >
            <MessageCircle aria-hidden />
          </a>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {lead.interest ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {INTEREST_LABEL}:
            </span>{" "}
            {lead.interest}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {CAPTURED_AT_LABEL}: {formatDateBr(toDatePart(lead.createdAt))}
        </p>

        {isConverted ? (
          lead.clientId ? (
            <Link
              href={clientDetailHref(lead.clientId)}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 self-start md:h-8",
              )}
            >
              {VIEW_CLIENT_LABEL}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              {DELETED_CLIENT_TEXT}
            </p>
          )
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
