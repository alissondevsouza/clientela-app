import {
  SALE_STATUS_LABELS,
  type SaleStatus,
  saleStatusValues,
} from "@clientela/shared";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ReceivablesSummary } from "@/components/sales/receivables-summary";
import { SaleCard } from "@/components/sales/sale-card";
import { buttonVariants } from "@/components/ui/button";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { getReceivablesSummary, listSales } from "@/lib/sales-api";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Vendas";
const NEW_SALE_HREF = "/crm/sales/new";
const LIST_HREF = "/crm/sales";
const RECEIVABLES_HREF = "/crm/sales/receivables";
const LOGIN_PATH = "/login";

const PAGE_FALLBACK = 1;
const MIN_TOTAL_PAGES = 1;

const ALL_FILTER_LABEL = "Todas";

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Saneamento dos `searchParams` na fronteira da page (core.md): `?page` inválido
// (`abc`, `0`, arrays) e `?status` fora do enum CAEM NO DEFAULT via `.catch`,
// nunca lançam nem caem no error boundary (RF-08).
const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(PAGE_FALLBACK),
  status: z.enum(saleStatusValues).optional().catch(undefined),
});

type CrmSalesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Href do filtro: trocar de status reseta a paginação (volta à página 1 = sem
// `page` na querystring). "Todas" = sem `status`.
const buildFilterHref = (status: SaleStatus | undefined): string => {
  if (!status) {
    return LIST_HREF;
  }
  const query = new URLSearchParams({ status });
  return `${LIST_HREF}?${query.toString()}`;
};

// Href de paginação: preserva o filtro `?status` ao mudar de página.
const buildPageHref = (
  targetPage: number,
  status: SaleStatus | undefined,
): string => {
  const query = new URLSearchParams();
  query.set("page", String(targetPage));
  if (status) {
    query.set("status", status);
  }
  return `${LIST_HREF}?${query.toString()}`;
};

const filterTabClass = (isActive: boolean): string =>
  cn(
    buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" }),
    "h-9 md:h-8",
  );

// Listagem de vendas (RSC, server-first): sanea a URL, lê o Bearer do cookie (o
// layout já barra sessão ausente — redirect defensivo aqui) e busca a página e o
// resumo "a receber" EM PARALELO (`Promise.all`, sem waterfall — web.md). O
// resumo vem SEMPRE de `getReceivablesSummary`, nunca da lista paginada (RF-08).
// Falha de qualquer chamada vira `throw` para o error.tsx (retry). Estados de
// vazio, vazio-de-filtro e conteúdo cobrem web.md; o skeleton fica no loading.tsx.
export default async function CrmSalesPage({
  searchParams,
}: CrmSalesPageProps) {
  const { page, status } = searchParamsSchema.parse(await searchParams);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };
  const [result, summaryResult] = await Promise.all([
    listSales({ page, status }, deps),
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
      <Link
        href={buildFilterHref(undefined)}
        aria-current={status ? undefined : "page"}
        className={filterTabClass(!status)}
      >
        {ALL_FILTER_LABEL}
      </Link>
      {saleStatusValues.map((value) => (
        <Link
          key={value}
          href={buildFilterHref(value)}
          aria-current={status === value ? "page" : undefined}
          className={filterTabClass(status === value)}
        >
          {SALE_STATUS_LABELS[value]}
        </Link>
      ))}
    </nav>
  );

  const isEmpty = result.data.length === 0;

  if (isEmpty && !status) {
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

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">
            Nenhuma venda com o status “
            {status ? SALE_STATUS_LABELS[status] : ""}”.
          </p>
          <Link
            href={buildFilterHref(undefined)}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 md:h-8",
            )}
          >
            Ver todas
          </Link>
        </div>
      ) : (
        <>
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
                href={buildPageHref(result.page - 1, status)}
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
                href={buildPageHref(result.page + 1, status)}
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
