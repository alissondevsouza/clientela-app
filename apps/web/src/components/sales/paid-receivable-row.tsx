import type { ReceivableListItem } from "@clientela/shared";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL, formatLocalDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAID_AT_LABEL_PREFIX = "Recebida em";
const VIEW_SALE_LABEL = "Ver venda";
const NO_CLIENT_TEXT = "—";
const NO_PAID_AT_TEXT = "—";

const saleDetailHref = (id: string): string => `/crm/sales/${id}`;

export type PaidReceivableRowProps = {
  receivable: Pick<
    ReceivableListItem,
    "id" | "saleId" | "amountCents" | "clientName" | "paidAt"
  >;
};

// Linha da visão "Recebidas no período" (RF-17): valor, cliente e a data da
// baixa. `paidAt` é um INSTANTE (o momento em que a baixa foi registrada —
// ADR-0025), por isso `formatLocalDateBr` (dia no `APP_TIME_ZONE`), nunca
// fatiando o ISO (lesson RSC×client). Server Component sem estado: a mudança
// de status já aconteceu — aqui é só histórico, SEM ação de baixa/estorno.
export function PaidReceivableRow({ receivable }: PaidReceivableRowProps) {
  const clientLabel =
    receivable.clientName.length > 0 ? receivable.clientName : NO_CLIENT_TEXT;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-heading text-lg font-semibold">
          {formatBRL(receivable.amountCents)}
        </p>
        <p className="truncate text-sm text-muted-foreground">{clientLabel}</p>
        <p className="text-sm text-muted-foreground">
          {PAID_AT_LABEL_PREFIX}{" "}
          {receivable.paidAt
            ? formatLocalDateBr(receivable.paidAt)
            : NO_PAID_AT_TEXT}
        </p>
      </div>

      <Link
        href={saleDetailHref(receivable.saleId)}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-11 shrink-0 md:h-8",
        )}
      >
        {VIEW_SALE_LABEL}
      </Link>
    </div>
  );
}
