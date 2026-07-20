import { ORDER_STATUS_LABELS, type OrderStatus } from "@clientela/shared";
import { cn } from "@/lib/utils";

// Classe por status: o rótulo pt-BR (texto) é SEMPRE renderizado — a cor é apenas
// reforço, nunca o único portador da informação (a11y/RF-07). O tema não define
// tokens "azul"/"verde" cruos (só neutros + destructive — ver globals.css), então
// mapeamos a semântica pedida nos tokens existentes, no mesmo espírito de
// `sale-status-badge.tsx`/`lead-status-badge.tsx`: rascunho neutro (muted),
// pedido em destaque informativo (primary), entregue no tratamento positivo/
// terminal que `sale-status-badge` usa para "completed" (secondary), cancelado
// reutilizando exatamente a classe de "canceled" de vendas (destructive suave).
const STATUS_CLASSES: Record<OrderStatus, string> = {
  draft: "bg-muted text-muted-foreground ring-1 ring-border",
  placed: "bg-primary text-primary-foreground",
  delivered: "bg-secondary text-secondary-foreground ring-1 ring-border",
  canceled: "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
};

// Badge textual do status do pedido (RSC): rótulo pt-BR de `ORDER_STATUS_LABELS`
// dentro de uma pílula. Sem interatividade → Server Component.
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status],
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
