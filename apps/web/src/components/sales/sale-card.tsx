import { PAYMENT_METHOD_LABELS, type SaleListItem } from "@clientela/shared";
import Link from "next/link";
import { SaleStatusBadge } from "@/components/sales/sale-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatLocalDateBr } from "@/lib/format";
import { saleLifecycleSubtitle } from "@/lib/sale-lifecycle";

const TOTAL_LABEL = "Total";
const PAYMENT_LABEL = "Pagamento";
const SOLD_AT_LABEL = "Data";
const OUTSTANDING_LABEL = "Falta receber";
const NO_CLIENT_TEXT = "—";

const saleDetailHref = (id: string): string => `/crm/sales/${id}`;

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
            {SOLD_AT_LABEL}: {formatLocalDateBr(sale.soldAt)}
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
