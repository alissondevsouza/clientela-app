import {
  APPOINTMENT_KIND_LABELS,
  type AppointmentListItem,
  appLocalDateIso,
  appLocalTimeHm,
  resolveAppointmentPerson,
} from "@clientela/shared";
import { AlertTriangle, MapPin, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBr } from "@/lib/format";

const SALE_LINKED_LABEL = "Venda vinculada";
const OVERDUE_LABEL = "Vencido sem desfecho";
const SCHEDULED_STATUS = "scheduled";

const appointmentDetailHref = (id: string): string => `/crm/appointments/${id}`;

// Título do card (RF-22): pessoa via `resolveAppointmentPerson` (ÚNICA fonte da
// precedência cliente>lead — nunca reimplementar); sem pessoa, cai para o
// `title` livre e, na ausência dele, para o label do tipo.
const cardHeading = (appointment: AppointmentListItem): string => {
  const person = resolveAppointmentPerson(appointment);
  if (person.name !== null) {
    return person.name;
  }
  if (appointment.title !== null && appointment.title.trim().length > 0) {
    return appointment.title;
  }
  return APPOINTMENT_KIND_LABELS[appointment.kind];
};

// "Vencido sem desfecho": ainda `scheduled` mas o instante de início já passou
// — o caso que a aba Pendentes existe para resolver (RF-05/RF-17). Comparação
// por instante (UTC), sem depender do fuso do dispositivo.
const isOverdueWithoutOutcome = (
  appointment: AppointmentListItem,
  now: Date,
): boolean =>
  appointment.status === SCHEDULED_STATUS &&
  new Date(appointment.startsAt).getTime() < now.getTime();

type AppointmentCardProps = {
  appointment: AppointmentListItem;
  // A aba Próximos já agrupa por dia sob um título (Hoje/Próximos 7
  // dias/Depois) — repetir a data em todo card seria redundante. Demais
  // contextos (Pendentes, Histórico) mostram a data.
  showDate?: boolean;
  now?: Date;
};

// Card da listagem de compromissos (RSC): hora (e data quando fizer sentido) no
// fuso da app, tipo, pessoa/título como heading, local, indicador de venda
// vinculada e sinalização de vencido sem desfecho. Sem interatividade além do
// link de detalhe → Server Component.
export function AppointmentCard({
  appointment,
  showDate = true,
  now = new Date(),
}: AppointmentCardProps) {
  const overdue = isOverdueWithoutOutcome(appointment, now);
  const timeLabel = appLocalTimeHm(appointment.startsAt);
  const dateLabel = showDate
    ? formatDateBr(appLocalDateIso(appointment.startsAt))
    : null;

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">
            <Link
              href={appointmentDetailHref(appointment.id)}
              className="outline-none hover:underline focus-visible:underline"
            >
              {cardHeading(appointment)}
            </Link>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {dateLabel ? `${dateLabel} · ` : ""}
            {timeLabel} · {APPOINTMENT_KIND_LABELS[appointment.kind]}
          </p>
        </div>
        <AppointmentStatusBadge status={appointment.status} />
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        {appointment.location ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{appointment.location}</span>
          </p>
        ) : null}

        {appointment.saleId ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShoppingBag className="size-4 shrink-0" aria-hidden />
            {SALE_LINKED_LABEL}
          </p>
        ) : null}

        {overdue ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {OVERDUE_LABEL}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
