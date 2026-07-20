import type { LeadStatus } from "@clientela/shared";
import { LEAD_STATUS_LABELS } from "@/lib/leads-api";
import { cn } from "@/lib/utils";

// Classe por status: o rótulo pt-BR (texto) é SEMPRE renderizado — a cor é apenas
// reforço, nunca o único portador da informação (a11y/RF-09). A paleta do tema é
// neutra, então a distinção vem de preenchimento/contorno + o texto explícito.
const STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "bg-primary text-primary-foreground",
  contacted: "bg-secondary text-secondary-foreground ring-1 ring-border",
  converted: "bg-accent text-accent-foreground ring-1 ring-foreground/25",
  discarded: "bg-muted text-muted-foreground ring-1 ring-border",
};

// Badge textual do status do funil (RSC): rótulo pt-BR de `LEAD_STATUS_LABELS`
// dentro de uma pílula. Sem interatividade → Server Component.
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status],
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
