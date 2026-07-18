import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ClientCard } from "@/components/clients/client-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { listClients } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Clientes";
const NEW_CLIENT_HREF = "/crm/clients/new";
const LIST_HREF = "/crm/clients";
const LOGIN_PATH = "/login";

const PAGE_FALLBACK = 1;
const SEARCH_MAX_LENGTH = 100;
const MIN_TOTAL_PAGES = 1;

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Saneamento dos `searchParams` na fronteira da page (core.md): valores inválidos
// (`?page=abc`, `?page=0`, arrays) CAEM NO DEFAULT via `.catch`, nunca lançam nem
// caem no error boundary (RF-06).
const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(PAGE_FALLBACK),
  search: z
    .string()
    .trim()
    .min(1)
    .max(SEARCH_MAX_LENGTH)
    .optional()
    .catch(undefined),
});

type CrmClientsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const buildPageHref = (
  targetPage: number,
  search: string | undefined,
): string => {
  const query = new URLSearchParams();
  query.set("page", String(targetPage));
  if (search) {
    query.set("search", search);
  }
  return `${LIST_HREF}?${query.toString()}`;
};

// Listagem de clientes (RSC, server-first): sanea a URL, lê o Bearer do cookie
// (o layout já barra sessão ausente — redirect defensivo aqui) e busca a página
// na API. Falha da API vira `throw` para o error.tsx (retry). Estados de vazio,
// vazio-de-busca e conteúdo cobrem web.md; o skeleton fica no loading.tsx.
export default async function CrmClientsPage({
  searchParams,
}: CrmClientsPageProps) {
  const { page, search } = searchParamsSchema.parse(await searchParams);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const result = await listClients(
    { page, search },
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  const isEmpty = result.data.length === 0;

  if (isEmpty && !search) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
        </header>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div className="flex flex-col gap-1">
            <p className="font-medium">Nenhuma cliente cadastrada ainda</p>
            <p className="text-sm text-muted-foreground">
              Comece cadastrando sua primeira cliente para acompanhar o
              relacionamento.
            </p>
          </div>
          <Link href={NEW_CLIENT_HREF} className={buttonVariants()}>
            Cadastrar primeira cliente
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
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
        <Link
          href={NEW_CLIENT_HREF}
          className={cn(buttonVariants(), "h-11 gap-1.5 px-3 md:h-8")}
        >
          <Plus aria-hidden />
          Nova cliente
        </Link>
      </header>

      <form method="get" action={LIST_HREF} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="clients-search">Buscar cliente</Label>
          <Input
            id="clients-search"
            name="search"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Nome ou WhatsApp"
            className="h-11 md:h-8"
          />
        </div>
        <Button type="submit" variant="outline" className="h-11 md:h-8">
          Buscar
        </Button>
      </form>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">
            Nenhuma cliente encontrada para “{search}”.
          </p>
          <Link
            href={LIST_HREF}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 md:h-8",
            )}
          >
            Limpar busca
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {result.data.map((client) => (
              <li key={client.id}>
                <ClientCard client={client} />
              </li>
            ))}
          </ul>

          <nav
            aria-label="Paginação"
            className="flex items-center justify-between gap-3"
          >
            {hasPrev ? (
              <Link
                href={buildPageHref(result.page - 1, search)}
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
                href={buildPageHref(result.page + 1, search)}
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
