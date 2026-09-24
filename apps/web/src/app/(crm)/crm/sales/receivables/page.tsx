import { appLocalDateIso } from "@clientela/shared";
import { X } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PaidReceivableRow } from "@/components/sales/paid-receivable-row";
import { ReceivableRow } from "@/components/sales/receivable-row";
import { buttonVariants } from "@/components/ui/button";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import type { ListReceivablesParams } from "@/lib/sales-api";
import { listReceivables } from "@/lib/sales-api";
import {
  buildReceivablesHref,
  formatPaidRangeLabel,
  parseReceivablesSearchParams,
  type ReceivablesListFilters,
  type ReceivablesView,
  receivablesCountText,
  receivablesEmptyText,
  receivablesViewTabs,
} from "@/lib/sales-list-params";
import { cn } from "@/lib/utils";

const SALES_HREF = "/crm/sales";
const LOGIN_PATH = "/login";

const MIN_TOTAL_PAGES = 1;

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: "Quem me deve",
};

type CrmReceivablesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const VIEW_TITLES: Record<ReceivablesView, string> = {
  pending: "Quem me deve",
  overdue: "Cobranças atrasadas",
  paid: "Recebidas no período",
};

const filterTabClass = (isActive: boolean): string =>
  cn(
    buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" }),
    "h-9 md:h-8",
  );

const listParamsForFilters = (
  filters: ReceivablesListFilters,
): ListReceivablesParams =>
  filters.view === "paid"
    ? {
        page: filters.page,
        pending: false,
        paidFrom: filters.paidFrom,
        paidTo: filters.paidTo,
      }
    : {
        page: filters.page,
        pending: true,
        overdue: filters.view === "overdue",
      };

// Voltar para a visão padrão ("A receber"), sempre limpando as datas da
// visão "paid" — usado pelo vazio das visões não-padrão.
const defaultViewHref = (filters: ReceivablesListFilters): string =>
  buildReceivablesHref(filters, {
    view: "pending",
    paidFrom: undefined,
    paidTo: undefined,
  });

// "Quem me deve" (RSC, server-first, RF-17): sanea a URL em três visões — "A
// receber" (padrão, `pending: true`), "Atrasadas" (`overdue: true`) e
// "Recebidas no período" (só alcançável por link, `pending: false` +
// `paidFrom`/`paidTo`, sem ação de baixa). O layout já barra sessão ausente —
// redirect defensivo aqui. Falha da API vira `throw` para o error.tsx (retry).
// `todayIso` (dia local — RF-04) é calculado no servidor e repassado para a
// mensagem de WhatsApp de cada linha pendente/atrasada.
export default async function CrmReceivablesPage({
  searchParams,
}: CrmReceivablesPageProps) {
  const filters = parseReceivablesSearchParams(await searchParams);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const todayIso = appLocalDateIso(new Date().toISOString());

  const result = await listReceivables(listParamsForFilters(filters), {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="font-heading text-2xl font-semibold">
        {VIEW_TITLES[filters.view]}
      </h1>
      <Link
        href={SALES_HREF}
        className="text-sm font-medium text-primary hover:underline focus-visible:underline"
      >
        Voltar para vendas
      </Link>
    </header>
  );

  const tabsNav = (
    <nav
      aria-label="Visão de cobranças"
      className="flex flex-wrap items-center gap-2"
    >
      {receivablesViewTabs(filters).map((tab) => (
        <Link
          key={tab.view}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={filterTabClass(tab.active)}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );

  const paidRangeChip =
    filters.view === "paid" ? (
      <ul className="flex list-none flex-wrap items-center gap-2 p-0">
        <li>
          <Link
            href={defaultViewHref(filters)}
            aria-label={`Remover filtro ${formatPaidRangeLabel(filters.paidFrom, filters.paidTo)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 md:h-8"
          >
            {formatPaidRangeLabel(filters.paidFrom, filters.paidTo)}
            <X aria-hidden className="size-3.5" />
          </Link>
        </li>
      </ul>
    ) : null;

  const isEmpty = result.data.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {tabsNav}
        {paidRangeChip}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">
            {receivablesEmptyText(filters.view)}
            {filters.view === "pending" ? " \u{1F389}" : ""}
          </p>
          {filters.view === "pending" ? (
            <p className="text-sm text-muted-foreground">
              As parcelas a prazo em aberto aparecem aqui, ordenadas por
              vencimento.
            </p>
          ) : (
            <Link
              href={defaultViewHref(filters)}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 md:h-8",
              )}
            >
              Ver quem me deve
            </Link>
          )}
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
      {tabsNav}
      {paidRangeChip}

      <p className="text-sm text-muted-foreground">
        {receivablesCountText(filters.view, result.total)}
      </p>

      <ul className="grid list-none grid-cols-1 gap-3 p-0">
        {result.data.map((receivable) => (
          <li key={receivable.id}>
            {filters.view === "paid" ? (
              <PaidReceivableRow receivable={receivable} />
            ) : (
              <ReceivableRow receivable={receivable} todayIso={todayIso} />
            )}
          </li>
        ))}
      </ul>

      <nav
        aria-label="Paginação"
        className="flex items-center justify-between gap-3"
      >
        {hasPrev ? (
          <Link
            href={buildReceivablesHref(filters, { page: result.page - 1 })}
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
            href={buildReceivablesHref(filters, { page: result.page + 1 })}
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
    </div>
  );
}
