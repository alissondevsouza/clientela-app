import type { OrderListItem } from "@clientela/shared";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatDateBr } from "@/lib/format";

const TITLE_PREFIX = "Pedido";
const TOTAL_LABEL = "Total";
const CREATED_LABEL = "Criado em";
const ISO_DATE_TIME_SEPARATOR = "T";

const TRANSITION_LABELS_BY_STATUS = {
  placed: "Pedido em",
  delivered: "Entregue em",
  canceled: "Cancelado em",
} as const;

const orderDetailHref = (id: string): string => `/crm/orders/${id}`;

// `createdAt`/`placedAt`/`deliveredAt`/`canceledAt` chegam como ISO datetime
// (ex.: `2026-07-18T12:00:00.000Z`); a UI mostra só a data (dd/mm/aaaa).
// `formatDateBr` espera `yyyy-mm-dd`, então extraímos a parte da data antes do
// `T`. Fallback ao valor cru se o formato fugir do esperado (`formatDateBr` já
// é fail-safe de todo modo).
const toDatePart = (isoDateTime: string): string =>
  isoDateTime.split(ISO_DATE_TIME_SEPARATOR)[0] ?? isoDateTime;

// Data da última transição (spec RF-07): rascunho não tem transição ainda —
// só `createdAt` é mostrado. Para os demais status, mostramos o timestamp
// correspondente ao status atual (nunca os dois juntos — o mais recente já
// resume o histórico para a listagem).
const lastTransitionEntry = (
  order: OrderListItem,
): { label: string; isoDateTime: string } | null => {
  if (order.status === "placed" && order.placedAt) {
    return {
      label: TRANSITION_LABELS_BY_STATUS.placed,
      isoDateTime: order.placedAt,
    };
  }
  if (order.status === "delivered" && order.deliveredAt) {
    return {
      label: TRANSITION_LABELS_BY_STATUS.delivered,
      isoDateTime: order.deliveredAt,
    };
  }
  if (order.status === "canceled" && order.canceledAt) {
    return {
      label: TRANSITION_LABELS_BY_STATUS.canceled,
      isoDateTime: order.canceledAt,
    };
  }
  return null;
};

// Card da listagem de pedidos (RSC): id curto como link para o detalhe, total
// formatado (R$), data de criação e data da última transição (quando houver),
// badge textual de status. Sem interatividade → Server Component.
export function OrderCard({ order }: { order: OrderListItem }) {
  const transition = lastTransitionEntry(order);

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">
            <Link
              href={orderDetailHref(order.id)}
              className="outline-none hover:underline focus-visible:underline"
            >
              {TITLE_PREFIX} #{order.id.slice(0, 8)}
            </Link>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {CREATED_LABEL}: {formatDateBr(toDatePart(order.createdAt))}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{TOTAL_LABEL}:</span>{" "}
          {formatBRL(order.totalCents)}
        </p>
        {transition ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {transition.label}:
            </span>{" "}
            {formatDateBr(toDatePart(transition.isoDateTime))}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
