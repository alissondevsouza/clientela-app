import { PAYMENT_METHOD_LABELS, type SaleListItem } from "@clientela/shared";
import Link from "next/link";
import { SaleStatusBadge } from "@/components/sales/sale-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatDateBr } from "@/lib/format";
import { saleLifecycleSubtitle } from "@/lib/sale-lifecycle";

const TOTAL_LABEL = "Total";
const PAYMENT_LABEL = "Pagamento";
const SOLD_AT_LABEL = "Data";
const OUTSTANDING_LABEL = "Falta receber";
const NO_CLIENT_TEXT = "—";
const ISO_DATE_TIME_SEPARATOR = "T";

const saleDetailHref = (id: string): string => `/crm/sales/${id}`;

// `soldAt` chega como ISO datetime (ex.: `2026-07-18T12:00:00.000Z`); a UI mostra
// só a data (dd/mm/aaaa). `formatDateBr` espera `yyyy-mm-dd`, então extraímos a
// parte da data antes do `T`. Fallback ao valor cru se o formato fugir do
// esperado (`formatDateBr` é fail-safe de todo modo).
const toDatePart = (isoDateTime: string): string =>
  isoDateTime.split(ISO_DATE_TIME_SEPARATOR)[0] ?? isoDateTime;

// Card da listagem de vendas (RSC): cliente (snapshot; "—" quando ausente) como
// link para o detalhe, total formatado (R$), forma de pagamento pt-BR, data e
// badge textual de status com o subtítulo do ciclo (entrega × pagamento, que o
// status sozinho não expressa). Sem interatividade → Server Component.
export function SaleCard({ sale }: { sale: SaleListItem }) {
  const clientLabel =
    sale.clientName.length > 0 ? sale.clientName : NO_CLIENT_TEXT;
  const lifecycleSubtitle = saleLifecycleSubtitle(sale);

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">
            <Link
              href={saleDetailHref(sale.id)}
              className="outline-none hover:underline focus-visible:underline"
            >
              {clientLabel}
            </Link>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {SOLD_AT_LABEL}: {formatDateBr(toDatePart(sale.soldAt))}
          </p>
        </div>
        <SaleStatusBadge status={sale.status} />
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{TOTAL_LABEL}:</span>{" "}
          {formatBRL(sale.totalCents)}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{PAYMENT_LABEL}:</span>{" "}
          {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
        </p>
        {lifecycleSubtitle !== null ? (
          <p className="text-sm text-muted-foreground">{lifecycleSubtitle}</p>
        ) : null}
        {sale.outstandingCents > 0 ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {OUTSTANDING_LABEL}:
            </span>{" "}
            {formatBRL(sale.outstandingCents)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
