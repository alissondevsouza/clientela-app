import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ProductCard } from "@/components/products/product-card";
import { ProductsSummary } from "@/components/products/products-summary";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { getProductsSummary, listProducts } from "@/lib/products-api";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Produtos";
const NEW_PRODUCT_HREF = "/crm/products/new";
const LIST_HREF = "/crm/products";
const LOGIN_PATH = "/login";

const PAGE_FALLBACK = 1;
const SEARCH_MAX_LENGTH = 100;
const MIN_TOTAL_PAGES = 1;

const LOW_STOCK_PARAM = "lowStock";
const LOW_STOCK_ON = "true";
const LOW_STOCK_FILTER_LABEL = "Estoque baixo";
const ALL_FILTER_LABEL = "Todos";

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Saneamento dos `searchParams` na fronteira da page (core.md): valores inválidos
// (`?page=abc`, `?page=0`, arrays, `?lowStock=xyz`) CAEM NO DEFAULT via `.catch`,
// nunca lançam nem caem no error boundary (RF-06). `lowStock` só é `true` quando
// o texto for exatamente "true".
const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(PAGE_FALLBACK),
  search: z
    .string()
    .trim()
    .min(1)
    .max(SEARCH_MAX_LENGTH)
    .optional()
    .catch(undefined),
  lowStock: z
    .literal(LOW_STOCK_ON)
    .transform(() => true)
    .optional()
    .catch(undefined),
});

type CrmProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Href de paginação: preserva a busca e o filtro de estoque baixo ao mudar de página.
const buildPageHref = (
  targetPage: number,
  search: string | undefined,
  lowStock: boolean | undefined,
): string => {
  const query = new URLSearchParams();
  query.set("page", String(targetPage));
  if (search) {
    query.set("search", search);
  }
  if (lowStock) {
    query.set(LOW_STOCK_PARAM, LOW_STOCK_ON);
  }
  return `${LIST_HREF}?${query.toString()}`;
};

// Href do filtro de estoque baixo: liga/desliga o filtro preservando a busca e
// resetando a paginação (volta à página 1 = sem `page` na querystring).
const buildFilterHref = (
  search: string | undefined,
  lowStock: boolean,
): string => {
  const query = new URLSearchParams();
  if (search) {
    query.set("search", search);
  }
  if (lowStock) {
    query.set(LOW_STOCK_PARAM, LOW_STOCK_ON);
  }
  const queryString = query.toString();
  return queryString ? `${LIST_HREF}?${queryString}` : LIST_HREF;
};

const filterTabClass = (isActive: boolean): string =>
  cn(
    buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" }),
    "h-9 md:h-8",
  );

// Listagem de produtos (RSC, server-first): sanea a URL, lê o Bearer do cookie
// (o layout já barra sessão ausente — redirect defensivo aqui) e busca a página
// e o resumo do estoque EM PARALELO (`Promise.all`, sem waterfall — web.md).
// Falha de qualquer chamada vira `throw` para o error.tsx (retry). Estados de
// vazio, vazio-de-busca e conteúdo cobrem web.md; o skeleton fica no loading.tsx.
export default async function CrmProductsPage({
  searchParams,
}: CrmProductsPageProps) {
  const { page, search, lowStock } = searchParamsSchema.parse(
    await searchParams,
  );

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };
  const [result, summaryResult] = await Promise.all([
    listProducts({ page, search, lowStock }, deps),
    getProductsSummary(deps),
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
        href={NEW_PRODUCT_HREF}
        className={cn(buttonVariants(), "h-11 gap-1.5 px-3 md:h-8")}
      >
        <Plus aria-hidden />
        Novo produto
      </Link>
    </header>
  );

  const summary = (
    <ProductsSummary
      summary={summaryResult.summary}
      lowStockHref={buildFilterHref(search, true)}
    />
  );

  const searchForm = (
    <form method="get" action={LIST_HREF} className="flex items-end gap-2">
      {/* Preserva o filtro de estoque baixo ao submeter a busca (form GET). */}
      {lowStock ? (
        <input type="hidden" name={LOW_STOCK_PARAM} value={LOW_STOCK_ON} />
      ) : null}
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="products-search">Buscar produto</Label>
        <Input
          id="products-search"
          name="search"
          type="search"
          defaultValue={search ?? ""}
          placeholder="Nome ou código"
          className="h-11 md:h-8"
        />
      </div>
      <Button type="submit" variant="outline" className="h-11 md:h-8">
        Buscar
      </Button>
    </form>
  );

  const filterTabs = (
    <nav
      aria-label="Filtrar por estoque"
      className="flex flex-wrap items-center gap-2"
    >
      <Link
        href={buildFilterHref(search, false)}
        aria-current={lowStock ? undefined : "page"}
        className={filterTabClass(!lowStock)}
      >
        {ALL_FILTER_LABEL}
      </Link>
      <Link
        href={buildFilterHref(search, true)}
        aria-current={lowStock ? "page" : undefined}
        className={filterTabClass(Boolean(lowStock))}
      >
        {LOW_STOCK_FILTER_LABEL}
      </Link>
    </nav>
  );

  const isEmpty = result.data.length === 0;

  if (isEmpty && !search && !lowStock) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {summary}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div className="flex flex-col gap-1">
            <p className="font-medium">Nenhum produto cadastrado ainda</p>
            <p className="text-sm text-muted-foreground">
              Comece cadastrando seu primeiro produto para controlar preço e
              estoque.
            </p>
          </div>
          <Link href={NEW_PRODUCT_HREF} className={buttonVariants()}>
            Cadastrar primeiro produto
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
      {searchForm}
      {filterTabs}

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">
            Nenhum produto encontrado com os filtros atuais.
          </p>
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
          <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {result.data.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>

          <nav
            aria-label="Paginação"
            className="flex items-center justify-between gap-3"
          >
            {hasPrev ? (
              <Link
                href={buildPageHref(result.page - 1, search, lowStock)}
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
                href={buildPageHref(result.page + 1, search, lowStock)}
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
