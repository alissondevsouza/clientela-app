"use server";

import {
  type CreateClientInput,
  type CreateOrderInput,
  createClientSchema,
  createOrderSchema,
  type ReplaceOrderItemsInput,
  replaceOrderItemsSchema,
} from "@clientela/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { createClient, listClients } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import {
  cancelOrder,
  createOrder,
  deliverOrder,
  placeOrder,
  replaceOrderItems,
} from "@/lib/orders-api";

const LIST_PATH = "/crm/orders";
const PRODUCTS_PATH = "/crm/products";
const CLIENTS_LIST_PATH = "/crm/clients";
const LOGIN_PATH = "/login";

// Teto de resultados da busca digitada do seletor de cliente (RF-05): mesmo
// máximo de `PER_PAGE_MAX` do contrato compartilhado — cobre a busca sem
// paginação adicional no combobox.
const SEARCH_CLIENTS_PER_PAGE = 100;

const orderDetailPath = (id: string): string => `${LIST_PATH}/${id}`;

const INVALID_INPUT_MESSAGE =
  "Não foi possível concluir a ação agora. Tente novamente.";

// Resultado observável pela UI: falha sempre traz `{ ok: false, message }`
// pt-BR para o componente exibir em `role="alert"`. `createOrderAction`
// REDIRECIONA no sucesso (a promise não resolve com valor); as demais
// retornam `{ ok: true }`.
export type OrderActionResult = { ok: true } | { ok: false; message: string };

// Payload de itens compartilhado pelo form de criação/edição (RF-01/RF-02):
// mesmo shape aceito tanto por `createOrderSchema.items` (opcional) quanto por
// `replaceOrderItemsSchema.items` (obrigatório, mas aceita lista vazia) — um
// objeto com `items` sempre presente satisfaz os dois contratos.
export type OrderItemsPayload = {
  items: Array<{
    productId: string;
    qty: number;
    unitCostCents?: number;
    clientId?: string | null;
  }>;
};

// Cliente reduzida às colunas necessárias no seletor do form (RF-05/RF-06):
// nunca expomos WhatsApp/aniversário/observações aqui — só o que a UI precisa
// para exibir e selecionar.
export type OrderFormClient = { id: string; name: string };

export type SearchClientsResult =
  | { ok: true; clients: OrderFormClient[] }
  | { ok: false; message: string };

export type QuickCreateClientResult =
  | { ok: true; client: OrderFormClient }
  | { ok: false; message: string };

// Lê o Bearer do cookie de sessão. O layout do grupo `(crm)` já barra sessão
// ausente — a checagem aqui é defensiva (redirect fora de try/catch).
const requireToken = async (): Promise<string> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  return token;
};

const orderIdSchema = z.uuid();

// Cria um pedido em rascunho (POST /orders), com itens opcionais (RF-01).
// Revalida o payload com o contrato na fronteira (security.md: nunca confiar
// no client) antes de chamar a API. Sucesso ⇒ revalida a listagem e
// redireciona para o DETALHE do pedido recém-criado; `revalidatePath`/
// `redirect` ficam FORA de try/catch (o helper nunca lança; `redirect` lança
// NEXT_REDIRECT propositalmente).
export const createOrderAction = async (
  values: CreateOrderInput,
): Promise<OrderActionResult> => {
  const parsed = createOrderSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await createOrder(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  redirect(orderDetailPath(result.order.id));
};

// Substitui os itens de um rascunho (PUT /orders/:id/items — RF-02), permitido
// só em `draft`. Sucesso ⇒ revalida a listagem e o detalhe (para refletir o
// novo total/itens) e retorna `{ ok: true }` — a usuária permanece no
// detalhe. Falha (409 fora de `draft`, 422 item inválido, rede) ⇒
// `{ ok: false, message }` com a mensagem pt-BR da API.
export const replaceOrderItemsAction = async (
  orderId: string,
  values: ReplaceOrderItemsInput,
): Promise<OrderActionResult> => {
  const parsedId = orderIdSchema.safeParse(orderId);
  const parsedValues = replaceOrderItemsSchema.safeParse(values);
  if (!parsedId.success || !parsedValues.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await replaceOrderItems(parsedId.data, parsedValues.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(orderDetailPath(parsedId.data));
  return { ok: true };
};

// Marca o rascunho como pedido feito (POST /orders/:id/place — RF-03):
// `draft` → `placed`. Sucesso ⇒ revalida listagem e detalhe. Falha (409 sem
// itens/status inválido, 404, rede) ⇒ mensagem pt-BR da API.
export const placeOrderAction = async (
  orderId: string,
): Promise<OrderActionResult> => {
  const parsedId = orderIdSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await placeOrder(parsedId.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(orderDetailPath(parsedId.data));
  return { ok: true };
};

// Marca o pedido como entregue (POST /orders/:id/deliver — RF-03/RF-04):
// `placed` → `delivered`, credita o estoque atomicamente no servidor. Sucesso
// ⇒ revalida listagem, detalhe E a lista de produtos (o estoque dos itens
// subiu — mesmo padrão de `cancelSaleAction` revalidando produtos).
export const deliverOrderAction = async (
  orderId: string,
): Promise<OrderActionResult> => {
  const parsedId = orderIdSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await deliverOrder(parsedId.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(orderDetailPath(parsedId.data));
  revalidatePath(PRODUCTS_PATH);
  return { ok: true };
};

// Cancela o pedido (POST /orders/:id/cancel — RF-03): `draft`/`placed` →
// `canceled`, sem efeito de estoque (RF-04). Sucesso ⇒ revalida listagem e
// detalhe.
export const cancelOrderAction = async (
  orderId: string,
): Promise<OrderActionResult> => {
  const parsedId = orderIdSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await cancelOrder(parsedId.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(orderDetailPath(parsedId.data));
  return { ok: true };
};

// Busca clientes (RF-05, `client-select.tsx`): reusa `listClients(search)` do
// módulo de clientes existente — a base cresce sem limite, então o seletor não
// pode se apoiar só numa lista fixa. Retorna só `id`/`name` (nunca dado
// pessoal a mais). Nunca lança: falha vira `{ ok: false, message }` pt-BR.
export const searchClientsAction = async (
  term: string,
): Promise<SearchClientsResult> => {
  const token = await requireToken();

  const result = await listClients(
    { search: term, perPage: SEARCH_CLIENTS_PER_PAGE },
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return {
    ok: true,
    clients: result.data.map((client) => ({
      id: client.id,
      name: client.name,
    })),
  };
};

// Cadastro rápido de cliente a partir do form de itens do pedido (RF-06): cria
// via `createClient` do módulo de clientes existente (sem endpoint novo) e
// revalida `/crm/clients`. Sucesso ⇒ `{ ok: true, client }` para o form
// selecionar a cliente recém-criada no item ativo; falha (validação ou API)
// ⇒ `{ ok: false, message }` pt-BR, nada criado.
export const quickCreateClientAction = async (
  values: CreateClientInput,
): Promise<QuickCreateClientResult> => {
  const parsed = createClientSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await createClient(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(CLIENTS_LIST_PATH);
  return {
    ok: true,
    client: { id: result.client.id, name: result.client.name },
  };
};
