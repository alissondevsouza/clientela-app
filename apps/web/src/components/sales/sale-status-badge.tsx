import { SALE_STATUS_LABELS, type SaleStatus } from "@clientela/shared";
import { cn } from "@/lib/utils";

// Classe por status: o rótulo pt-BR (texto) é SEMPRE renderizado — a cor é apenas
// reforço, nunca o único portador da informação (a11y/RF-08). Concluída em tom
// neutro/positivo; cancelada em destaque de destrutivo para leitura imediata.
const STATUS_CLASSES: Record<SaleStatus, string> = {
  completed: "bg-secondary text-secondary-foreground ring-1 ring-border",
  canceled: "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
};

// Badge textual do status da venda (RSC): rótulo pt-BR de `SALE_STATUS_LABELS`
// dentro de uma pílula. Sem interatividade → Server Component.
export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status],
      )}
    >
      {SALE_STATUS_LABELS[status]}
    </span>
  );
}
