import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ReceivableRow } from "@/components/sales/receivable-row";
import { buttonVariants } from "@/components/ui/button";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { listReceivables } from "@/lib/sales-api";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Quem me deve";
const LIST_HREF = "/crm/sales/receivables";
const SALES_HREF = "/crm/sales";
const LOGIN_PATH = "/login";

const PAGE_FALLBACK = 1;
const MIN_TOTAL_PAGES = 1;

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Saneamento dos `searchParams` na fronteira da page (core.md): `?page` inválido
// cai no default via `.catch`, nunca lança nem cai no error boundary (RF-11).
const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(PAGE_FALLBACK),
});

type CrmReceivablesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const buildPageHref = (targetPage: number): string => {
  const query = new URLSearchParams({ page: String(targetPage) });
  return `${LIST_HREF}?${query.toString()}`;
};

// "Quem me deve" (RSC, server-first): sanea a URL, lê o Bearer do cookie (o
// layout já barra sessão ausente — redirect defensivo aqui) e lista os recebíveis
// PENDENTES ordenados por vencimento (`pending: true` — RF-11). Falha da API vira
// `throw` para o error.tsx (retry). Estado vazio e conteúdo cobrem web.md; o
// skeleton fica no loading.tsx. O destaque de "Atrasada" e a baixa direto da
// lista ficam em `ReceivableRow`.
export default async function CrmReceivablesPage({
  searchParams,
}: CrmReceivablesPageProps) {
  const { page } = searchParamsSchema.parse(await searchParams);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const result = await listReceivables(
    { page, pending: true },
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
      <Link
        href={SALES_HREF}
        className="text-sm font-medium text-primary hover:underline focus-visible:underline"
      >
        Voltar para vendas
      </Link>
    </header>
  );

  const isEmpty = result.data.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">Ninguém te deve no momento 🎉</p>
          <p className="text-sm text-muted-foreground">
            As parcelas a prazo em aberto aparecem aqui, ordenadas por
            vencimento.
          </p>
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

      <ul className="grid list-none grid-cols-1 gap-3 p-0">
        {result.data.map((receivable) => (
          <li key={receivable.id}>
            <ReceivableRow receivable={receivable} />
          </li>
        ))}
      </ul>

      <nav
        aria-label="Paginação"
        className="flex items-center justify-between gap-3"
      >
        {hasPrev ? (
          <Link
            href={buildPageHref(result.page - 1)}
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
            href={buildPageHref(result.page + 1)}
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
