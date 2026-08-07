import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
} from "@clientela/shared";
import { cn } from "@/lib/utils";

// Classe por status: o rótulo pt-BR (texto) é SEMPRE renderizado — a cor é apenas
// reforço, nunca o único portador da informação (a11y/RF-17). O tema não define
// tokens "azul"/"verde" cruos (só neutros + destructive — ver globals.css), então
// mapeamos a semântica pedida nos tokens existentes, no mesmo espírito de
// `order-status-badge.tsx`/`sale-status-badge.tsx`: agendado em destaque
// informativo (primary), realizado no tratamento positivo/terminal (secondary),
// não compareceu em neutro (muted — desfecho sem venda, mas sem a severidade de
// um cancelamento), cancelado no tratamento destrutivo suave já usado em vendas.
const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: "bg-primary text-primary-foreground",
  done: "bg-secondary text-secondary-foreground ring-1 ring-border",
  no_show: "bg-muted text-muted-foreground ring-1 ring-border",
  canceled: "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
};

// Badge textual do status do compromisso (RSC): rótulo pt-BR de
// `APPOINTMENT_STATUS_LABELS` dentro de uma pílula. Sem interatividade → Server
// Component.
export function AppointmentStatusBadge({
  status,
}: {
  status: AppointmentStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status],
      )}
    >
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
