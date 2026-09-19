"use server";

import { type CreateSaleInput, createSaleSchema } from "@clientela/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { listClients } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import { listProducts } from "@/lib/products-api";
import {
  cancelSale,
  createSale,
  deleteSale,
  deliverSale,
  setReceivablePaid,
} from "@/lib/sales-api";

const LIST_PATH = "/crm/sales";
const PRODUCTS_PATH = "/crm/products";
const RECEIVABLES_PATH = "/crm/sales/receivables";
// Home "Início" do CRM (`(crm)/crm/page.tsx`): agrega vendas/lucro do mês e a
// receber. Excluir venda entregue devolve estoque e remove cobranças —
// nenhuma outra action de vendas revalidava este path até agora.
const DASHBOARD_PATH = "/crm";
const LOGIN_PATH = "/login";

// Limite de resultados da busca no form de venda: dados mínimos para escolher
// (não é listagem paginada). Clientes já limitados no query; produtos fatiados
// no client desta action (o helper de produtos não expõe `perPage`).
const SEARCH_TERM_MAX = 100;
const SEARCH_RESULT_LIMIT = 10;

const saleDetailPath = (id: string): string => `${LIST_PATH}/${id}`;

// Payload da baixa/estorno de recebível validado na fronteira da action
// (core.md/security.md): `id` uuid e `paid` boolean. Input inválido nunca chega
// à API — vira falha genérica pt-BR.
const setReceivablePaidInputSchema = z.object({
  id: z.uuid(),
  paid: z.boolean(),
});

const INVALID_INPUT_MESSAGE =
  "Não foi possível concluir a ação agora. Tente novamente.";

// Resultado observável pela UI: falha sempre traz `{ ok: false, message }` pt-BR
// para o componente exibir em `role="alert"`. Recebíveis carregam dado de cliente
// só por ID/valor — mantemos o padrão de logar apenas IDs (security.md/RF-12).
export type SalesActionResult = { ok: true } | { ok: false; message: string };

// Lê o Bearer do cookie de sessão. O layout do grupo `(crm)` já barra sessão
// ausente — a checagem aqui é defensiva (redirect fora de try/catch).
const requireToken = async (): Promise<string> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  return token;
};

// Dá baixa (`paid: true`) ou estorna (`paid: false`) um recebível
// (PATCH /receivables/:id). Sucesso ⇒ revalida a lista de vendas, a lista
// "Quem me deve" e o detalhe da venda (o estado da parcela muda nas três telas)
// e retorna `{ ok: true }`. Falha (404/409/rede) ⇒ mensagem da API. O `saleId`
// é opcional: quando a chamadora o conhece (linha de recebível), revalidamos
// também o detalhe da venda por path dinâmico.
export const setReceivablePaidAction = async (
  id: string,
  paid: boolean,
  saleId?: string,
): Promise<SalesActionResult> => {
  const parsed = setReceivablePaidInputSchema.safeParse({ id, paid });
  if (!parsed.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await setReceivablePaid(parsed.data.id, parsed.data.paid, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(RECEIVABLES_PATH);
  if (saleId !== undefined && saleId.length > 0) {
    revalidatePath(saleDetailPath(saleId));
  }
  return { ok: true };
};

// `id` da venda validado na fronteira da action (core.md/security.md): uuid.
const saleIdSchema = z.uuid();

// Cancela a venda (POST /sales/:id/cancel). Sucesso ⇒ revalida a lista de
// vendas, a de produtos (o estoque dos itens é devolvido), a lista "Quem me
// deve" (os recebíveis pendentes somem) e o PRÓPRIO detalhe — a usuária PERMANECE
// no detalhe, que passa a exibir "Venda cancelada" (sem redirect). Falha
// (409 já cancelada / com parcela paga, 404, rede) ⇒ `{ ok: false, message }`
// com a mensagem pt-BR da API para o botão exibir em `role="alert"`.
export const cancelSaleAction = async (
  id: string,
): Promise<SalesActionResult> => {
  const parsed = saleIdSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await cancelSale(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(PRODUCTS_PATH);
  revalidatePath(RECEIVABLES_PATH);
  revalidatePath(saleDetailPath(parsed.data));
  return { ok: true };
};

export const deliverSaleAction = async (
  id: string,
): Promise<SalesActionResult> => {
  const parsed = saleIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: INVALID_INPUT_MESSAGE };
  const token = await requireToken();
  const result = await deliverSale(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath(LIST_PATH);
  revalidatePath(PRODUCTS_PATH);
  revalidatePath(RECEIVABLES_PATH);
  revalidatePath(saleDetailPath(parsed.data));
  return { ok: true };
};

// Exclui a venda (DELETE /sales/:id — RF-08/RF-09). Ao contrário de cancelar,
// o DETALHE DEIXA DE EXISTIR: sucesso revalida a lista de vendas, a de produtos
// (venda entregue devolve estoque), "Quem me deve" (as cobranças somem), o
// dashboard (RF-15: os agregados de faturamento/a receber mudam) e o próprio
// detalhe (para qualquer requisição em voo não servir a página apagada do
// cache) — e REDIRECIONA para a lista, nunca permanecendo no detalhe.
// `revalidatePath`/`redirect` ficam FORA de try/catch: o helper nunca lança
// (resultado discriminado) e `redirect` lança NEXT_REDIRECT propositalmente.
// Falha (404 cross-tenant, rede) ⇒ `{ ok: false, message }` pt-BR.
export const deleteSaleAction = async (
  id: string,
): Promise<SalesActionResult> => {
  const parsed = saleIdSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await deleteSale(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(PRODUCTS_PATH);
  revalidatePath(RECEIVABLES_PATH);
  revalidatePath(saleDetailPath(parsed.data));
  revalidatePath(DASHBOARD_PATH);
  redirect(LIST_PATH);
};

// Dados mínimos de cliente para a busca do form de venda (LGPD/RF-12: só o
// necessário para escolher e contatar). Nunca carrega o cadastro completo.
export type ClientSearchItem = {
  id: string;
  name: string;
  whatsapp: string;
};

// Dados mínimos de produto para a busca do form: identificação, preço para
// pré-preencher o campo editável e estoque para orientar a quantidade.
export type ProductSearchItem = {
  id: string;
  name: string;
  brandCode: string | null;
  priceCents: number;
  stockQty: number;
};

// Resultados discriminados: falha vira `{ ok: false }` (a UI mostra aviso curto e
// segue) — nunca lança nem vaza internals. Termo em branco ⇒ lista vazia (sem
// chamar a API para "buscar tudo").
export type SearchClientsResult =
  | { ok: true; clients: ClientSearchItem[] }
  | { ok: false };

export type SearchProductsResult =
  | { ok: true; products: ProductSearchItem[] }
  | { ok: false };

// Termo de busca validado na fronteira (core.md/security.md): string de até 100
// caracteres. Fora disso ⇒ `{ ok: false }` — entrada malformada nunca chega à API.
const searchTermSchema = z.string().max(SEARCH_TERM_MAX);

// Busca clientes por nome (GET /clients?search) para o seletor do form de venda.
// Retorna só id/nome/WhatsApp (dados mínimos) das 10 primeiras. Termo em branco
// ⇒ lista vazia sem tocar a API.
export const searchClientsAction = async (
  term: string,
): Promise<SearchClientsResult> => {
  const parsed = searchTermSchema.safeParse(term);
  if (!parsed.success) {
    return { ok: false };
  }
  const trimmed = parsed.data.trim();
  if (trimmed.length === 0) {
    return { ok: true, clients: [] };
  }

  const token = await requireToken();

  const result = await listClients(
    { search: trimmed, perPage: SEARCH_RESULT_LIMIT },
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    clients: result.data.map((client) => ({
      id: client.id,
      name: client.name,
      whatsapp: client.whatsapp,
    })),
  };
};

// Busca produtos por nome/código (GET /products?search) para o seletor de itens.
// Retorna id/nome/código/preço/estoque (o preço pré-preenche o campo editável e o
// estoque orienta a quantidade). Fatiado nas 10 primeiras (o helper de produtos
// não expõe `perPage`).
export const searchProductsAction = async (
  term: string,
): Promise<SearchProductsResult> => {
  const parsed = searchTermSchema.safeParse(term);
  if (!parsed.success) {
    return { ok: false };
  }
  const trimmed = parsed.data.trim();
  if (trimmed.length === 0) {
    return { ok: true, products: [] };
  }

  const token = await requireToken();

  const result = await listProducts(
    { search: trimmed },
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    products: result.data.slice(0, SEARCH_RESULT_LIMIT).map((product) => ({
      id: product.id,
      name: product.name,
      brandCode: product.brandCode,
      priceCents: product.priceCents,
      stockQty: product.stockQty,
    })),
  };
};

// Registra a venda (POST /sales). Revalida o payload com o contrato na fronteira
// (security.md: nunca confiar no client) antes de chamar a API. Sucesso ⇒
// revalida a lista de vendas E a de produtos (o estoque baixou) e redireciona
// para o DETALHE da venda; `revalidatePath`/`redirect` ficam FORA de try/catch
// (o helper nunca lança; `redirect` lança NEXT_REDIRECT propositalmente). Falha
// ⇒ `{ ok: false, message }` com a mensagem da API (ex.: estoque insuficiente).
export const createSaleAction = async (
  values: CreateSaleInput,
): Promise<SalesActionResult> => {
  const parsed = createSaleSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await createSale(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(PRODUCTS_PATH);
  redirect(saleDetailPath(result.sale.id));
};
