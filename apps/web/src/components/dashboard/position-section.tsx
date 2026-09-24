// Bloco "Posição agora" (RF-25): saldos que NÃO dependem do período escolhido
// no Desempenho — a receber (pendente/atrasado) e estoque (capital parado,
// valor de venda, baixo estoque). Reusa os agregados já existentes de
// `receivables`/`products` (sem endpoint novo). Server Component assíncrono:
// as duas buscas saem em paralelo (`Promise.all`, web.md: sem waterfall);
// qualquer falha faz o bloco inteiro virar `SectionError` (RF-18) — os dois
// números vêm de fontes distintas e misturar "metade certo, metade genérico"
// seria mais confuso que reexecutar as duas.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  lowStockHref,
  overdueReceivablesHref,
  productsHref,
  receivablesHref,
} from "@/lib/dashboard-links";
import { loadWebEnv } from "@/lib/env";
import { formatBRL } from "@/lib/format";
import { getProductsSummary } from "@/lib/products-api";
import { getReceivablesSummary } from "@/lib/sales-api";
import { SectionError } from "./section-error";

const TITLE = "Posição agora";
const SUBTITLE = "Saldos atuais — não dependem do período do Desempenho.";
const RECEIVABLES_TITLE = "A receber";
const STOCK_TITLE = "Estoque";
const NO_OVERDUE_TEXT = "Nenhuma parcela atrasada";
const NO_LOW_STOCK_TEXT = "Nenhum produto com estoque baixo";
const STOCK_COST_HINT = "Capital parado a custo";
const VIEW_OVERDUE_LABEL = "Ver atrasadas";
const VIEW_RECEIVABLES_LABEL = "Ver cobranças";
const VIEW_LOW_STOCK_LABEL = "Ver estoque baixo";
const VIEW_PRODUCTS_LABEL = "Ver produtos";

const SINGLE = 1;
const LINK_CLASS =
  "text-sm font-medium text-primary hover:underline focus-visible:underline";

const installmentsLabel = (count: number): string =>
  count === SINGLE ? "parcela" : "parcelas";

const productsLabel = (count: number): string =>
  count === SINGLE ? "produto" : "produtos";

// Valor em reais + rótulo em pt-BR (RF-25: "R$ X em atraso · N parcelas"). A
// cor (destructive) é só reforço — a contagem/rótulo já está no texto (a11y).
const overdueText = (count: number, cents: number): string =>
  `${formatBRL(cents)} em atraso · ${count} ${installmentsLabel(count)}`;

const lowStockText = (count: number): string =>
  `${count} ${productsLabel(count)} com estoque baixo`;

export type PositionSectionProps = {
  token: string;
};

export async function PositionSection({ token }: PositionSectionProps) {
  const apiUrl = loadWebEnv().API_URL;
  const deps = { fetchImpl: fetch, apiUrl, token };

  const [receivablesResult, productsResult] = await Promise.all([
    getReceivablesSummary(deps),
    getProductsSummary(deps),
  ]);

  if (!receivablesResult.ok) {
    return <SectionError title={TITLE} message={receivablesResult.message} />;
  }
  if (!productsResult.ok) {
    return <SectionError title={TITLE} message={productsResult.message} />;
  }

  const { summary: receivables } = receivablesResult;
  const { summary: products } = productsResult;
  const hasOverdue = receivables.overdueCount > 0;
  const hasLowStock = products.lowStockCount > 0;

  return (
    <section aria-labelledby="position-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          id="position-heading"
          className="font-heading text-xl font-semibold"
        >
          {TITLE}
        </h2>
        <p className="text-sm text-muted-foreground">{SUBTITLE}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{RECEIVABLES_TITLE}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="font-heading text-xl font-semibold">
              {formatBRL(receivables.pendingCents)}
            </p>
            {hasOverdue ? (
              <p className="text-sm font-medium text-destructive">
                {overdueText(
                  receivables.overdueCount,
                  receivables.overdueCents,
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{NO_OVERDUE_TEXT}</p>
            )}
            <div className="flex flex-wrap gap-3">
              {hasOverdue ? (
                <Link href={overdueReceivablesHref()} className={LINK_CLASS}>
                  {VIEW_OVERDUE_LABEL}
                </Link>
              ) : null}
              <Link href={receivablesHref()} className={LINK_CLASS}>
                {VIEW_RECEIVABLES_LABEL}
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>{STOCK_TITLE}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="font-heading text-xl font-semibold">
              {formatBRL(products.stockCostCents)}
            </p>
            <p className="text-sm text-muted-foreground">{STOCK_COST_HINT}</p>
            <p className="text-sm text-muted-foreground">
              Valor de venda: {formatBRL(products.stockPriceCents)}
            </p>
            {hasLowStock ? (
              <p className="text-sm font-medium text-destructive">
                {lowStockText(products.lowStockCount)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {NO_LOW_STOCK_TEXT}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {hasLowStock ? (
                <Link href={lowStockHref()} className={LINK_CLASS}>
                  {VIEW_LOW_STOCK_LABEL}
                </Link>
              ) : null}
              <Link href={productsHref()} className={LINK_CLASS}>
                {VIEW_PRODUCTS_LABEL}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
