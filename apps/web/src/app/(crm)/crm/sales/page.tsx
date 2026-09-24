import {
  SALES_LIST_STATUS_FILTER_LABELS,
  type SalesListStatusFilter,
  saleStatusValues,
} from "@clientela/shared";
import { Plus, X } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceivablesSummary } from "@/components/sales/receivables-summary";
import { SaleCard } from "@/components/sales/sale-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { getReceivablesSummary, listSales } from "@/lib/sales-api";
import {
  activeSalesFilterChips,
  buildSalesListHref,
  hasActiveSalesFilters,
  parseSalesListSearchParams,
  salesEmptyState,
  salesResultCountText,
} from "@/lib/sales-list-params";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Vendas";
const NEW_SALE_HREF = "/crm/sales/new";
const LIST_HREF = "/crm/sales";
const RECEIVABLES_HREF = "/crm/sales/receivables";
const LOGIN_PATH = "/login";

const MIN_TOTAL_PAGES = 1;

const ALL_FILTER_LABEL = "Todas";

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type CrmSalesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const filterTabClass = (isActive: boolean): string =>
  cn(
    buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" }),
    "h-9 md:h-8",
  );

// Ordem das abas (RF-16): "Todas", depois "Vendidas" (escopo Vendido — RF-14),
// depois os status reais na ordem de `saleStatusValues`. `undefined` = "Todas".
const STATUS_TABS: Array<SalesListStatusFilter | undefined> = [
  undefined,
  "sold",
  ...saleStatusValues,
];

const statusTabLabel = (value: SalesListStatusFilter | undefined): string =>
  value === undefined
    ? ALL_FILTER_LABEL
    : SALES_LIST_STATUS_FILTER_LABELS[value];

// Listagem de vendas (RSC, server-first): sanea a URL (`sales-list-params.ts` —
// página, aba, período, entrega e cliente, nunca lança) e busca a página e o
// resumo "a receber" EM PARALELO (`Promise.all`, sem waterfall — web.md). O
// resumo vem SEMPRE de `getReceivablesSummary`, nunca da lista paginada (RF-08).
// Falha de qualquer chamada vira `throw` para o error.tsx (retry). Estados de
// vazio, vazio-de-filtro e conteúdo cobrem web.md; o skeleton fica no loading.tsx.
export default async function CrmSalesPage({
  searchParams,
}: CrmSalesPageProps) {
  const filters = parseSalesListSearchParams(await searchParams);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };
  const [result, summaryResult] = await Promise.all([
    listSales(filters, deps),
    getReceivablesSummary(deps),
  ]);

  if (!result.ok) {
    throw new Error(result.message);
  }
  if (!summaryResult.ok) {
    throw new Error(summaryResult.message);
  }

  const header = (
    <header className="flex items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
      <Link
        href={NEW_SALE_HREF}
        className={cn(buttonVariants(), "h-11 gap-1.5 px-3 md:h-8")}
      >
        <Plus aria-hidden />
        Nova venda
      </Link>
    </header>
  );

  const summary = (
    <ReceivablesSummary
      summary={summaryResult.summary}
      receivablesHref={RECEIVABLES_HREF}
    />
  );

  const filterTabs = (
    <nav
      aria-label="Filtrar por status"
      className="flex flex-wrap items-center gap-2"
    >
      {STATUS_TABS.map((value) => (
        <Link
          key={value ?? "all"}
          href={buildSalesListHref(filters, { status: value })}
          aria-current={filters.status === value ? "page" : undefined}
          className={filterTabClass(filters.status === value)}
        >
          {statusTabLabel(value)}
        </Link>
      ))}
    </nav>
  );

  // Formulário de período (RF-16): GET puro (sem JS), preserva aba/entrega/
  // cliente em campos ocultos — só o que o formulário NÃO edita. Digitar De >
  // Até nunca vira 422: `parseSalesListSearchParams` troca as datas.
  const periodForm = (
    <form
      method="GET"
      action={LIST_HREF}
      className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {filters.status !== undefined && (
        <input type="hidden" name="status" value={filters.status} />
      )}
      {filters.clientId !== undefined && (
        <input type="hidden" name="clientId" value={filters.clientId} />
      )}
      {filters.delivery !== undefined && (
        <input type="hidden" name="delivery" value={filters.delivery} />
      )}
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="sales-sold-from">De</Label>
        <Input
          id="sales-sold-from"
          name="soldFrom"
          type="date"
          defaultValue={filters.soldFrom ?? ""}
          className="h-11 md:h-8"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="sales-sold-to">Até</Label>
        <Input
          id="sales-sold-to"
          name="soldTo"
          type="date"
          defaultValue={filters.soldTo ?? ""}
          className="h-11 md:h-8"
        />
      </div>
      <Button type="submit" variant="outline" className="h-11 md:h-8">
        Filtrar
      </Button>
    </form>
  );

  const chips = activeSalesFilterChips(filters);
  const chipsRow =
    chips.length > 0 ? (
      <ul className="flex list-none flex-wrap items-center gap-2 p-0">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.removeHref}
              aria-label={`Remover filtro ${chip.label}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 md:h-8"
            >
              {chip.label}
              <X aria-hidden className="size-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    ) : null;

  const isEmpty = result.data.length === 0;
  const emptyState = salesEmptyState(filters);

  if (isEmpty && emptyState === "no_sales") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {summary}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div className="flex flex-col gap-1">
            <p className="font-medium">Nenhuma venda registrada ainda</p>
            <p className="text-sm text-muted-foreground">
              Registre sua primeira venda para acompanhar faturamento, estoque e
              o que tem a receber.
            </p>
          </div>
          <Link href={NEW_SALE_HREF} className={buttonVariants()}>
            Registrar primeira venda
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(
    MIN_TOTAL_PAGES,
    Math.ceil(result.total / result.perPage),
  );
  const hasPrev = result.page > MIN_TOTAL_PAGES;
  const hasNext = result.page < totalPages;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {summary}
      {filterTabs}
      {periodForm}
      {chipsRow}

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">Nenhuma venda com estes filtros.</p>
          <Link
            href={LIST_HREF}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 md:h-8",
            )}
          >
            Limpar filtros
          </Link>
        </div>
      ) : (
        <>
          {hasActiveSalesFilters(filters) && (
            <p className="text-sm text-muted-foreground">
              {salesResultCountText(result.total)}
            </p>
          )}

          <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {result.data.map((sale) => (
              <li key={sale.id}>
                <SaleCard sale={sale} />
              </li>
            ))}
          </ul>

          <nav
            aria-label="Paginação"
            className="flex items-center justify-between gap-3"
          >
            {hasPrev ? (
              <Link
                href={buildSalesListHref(filters, { page: result.page - 1 })}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 md:h-8",
                )}
              >
                Anterior
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 pointer-events-none opacity-50 md:h-8",
                )}
              >
                Anterior
              </span>
            )}

            <span className="text-sm text-muted-foreground">
              Página {result.page} de {totalPages}
            </span>

            {hasNext ? (
              <Link
                href={buildSalesListHref(filters, { page: result.page + 1 })}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 md:h-8",
                )}
              >
                Próxima
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 pointer-events-none opacity-50 md:h-8",
                )}
              >
                Próxima
              </span>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
