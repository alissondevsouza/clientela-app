import type { DashboardSummary } from "@clientela/shared";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

const SALES_TITLE = "Vendas do mês";
const OPEN_SALES_TITLE = "Previsto para receber";
const OPEN_SALES_HINT = "Vendas em aberto, ainda não concluídas.";
const PROFIT_TITLE = "Lucro estimado";
const PROFIT_NOTE =
  "Estimado a partir do custo registrado em cada venda no momento da compra.";
const RECEIVABLES_TITLE = "A receber";
const RECEIVABLES_VIEW_LABEL = "Ver quem me deve";
const NO_OVERDUE_TEXT = "Nenhuma parcela atrasada";
const OVERDUE_LABEL = "Em atraso";
const QUICK_ACTIONS_TITLE = "Ações rápidas";
const NEW_SALE_LABEL = "Nova venda";
const NEW_CLIENT_LABEL = "Nova cliente";

const SINGLE = 1;
const NO_OVERDUE = 0;
const SALE_UNIT_SINGULAR = "venda";
const SALE_UNIT_PLURAL = "vendas";
const OVERDUE_UNIT_SINGULAR = "parcela atrasada";
const OVERDUE_UNIT_PLURAL = "parcelas atrasadas";

const salesCountText = (count: number): string =>
  `${count} ${count === SINGLE ? SALE_UNIT_SINGULAR : SALE_UNIT_PLURAL}`;

// Texto do atraso (a11y/RF-07): a informação vive no TEXTO pt-BR — a cor de
// destaque é só reforço, nunca o único sinal. Espelha `ReceivablesSummary`.
const overdueText = (count: number, cents: number): string =>
  `${formatBRL(cents)} · ${count} ${
    count === SINGLE ? OVERDUE_UNIT_SINGULAR : OVERDUE_UNIT_PLURAL
  }`;

export type SummaryCardsProps = {
  summary: DashboardSummary;
  newSaleHref: string;
  newClientHref: string;
  receivablesHref: string;
};

// Cards do painel (RSC, sem interação — RF-05): vendas do mês, lucro estimado
// (nota "estimado" sempre visível — `formatBRL` já formata negativo com o
// sinal do próprio `Intl`, sem tratamento especial), a receber (atrasadas em
// destaque textual + link) e links rápidos. Mobile-first: coluna única em
// ~375px, duas colunas a partir de sm.
export function SummaryCards({
  summary,
  newSaleHref,
  newClientHref,
  receivablesHref,
}: SummaryCardsProps) {
  const hasOverdue = summary.overdueReceivablesCount > NO_OVERDUE;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{SALES_TITLE}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="font-heading text-xl font-semibold">
            {formatBRL(summary.monthSalesCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            {salesCountText(summary.monthSalesCount)} em {summary.monthLabel}
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{OPEN_SALES_TITLE}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="font-heading text-xl font-semibold">
            {formatBRL(summary.openSalesCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            {salesCountText(summary.openSalesCount)} em aberto
          </p>
          <p className="text-xs text-muted-foreground">{OPEN_SALES_HINT}</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{PROFIT_TITLE}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="font-heading text-xl font-semibold">
            {formatBRL(summary.monthProfitCents)}
          </p>
          <p className="text-xs text-muted-foreground">{PROFIT_NOTE}</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{RECEIVABLES_TITLE}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-heading text-xl font-semibold">
            {formatBRL(summary.pendingReceivablesCents)}
          </p>
          {hasOverdue ? (
            <p className="text-sm font-medium text-destructive">
              {OVERDUE_LABEL}:{" "}
              {overdueText(
                summary.overdueReceivablesCount,
                summary.overdueReceivablesCents,
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{NO_OVERDUE_TEXT}</p>
          )}
          <Link
            href={receivablesHref}
            className="text-sm font-medium text-primary hover:underline focus-visible:underline"
          >
            {RECEIVABLES_VIEW_LABEL}
          </Link>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{QUICK_ACTIONS_TITLE}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            href={newSaleHref}
            className={cn(buttonVariants(), "h-11 md:h-8")}
          >
            {NEW_SALE_LABEL}
          </Link>
          <Link
            href={newClientHref}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 md:h-8",
            )}
          >
            {NEW_CLIENT_LABEL}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
