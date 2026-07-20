import {
  apiErrorSchema,
  type CreateOrderInput,
  createOrderSchema,
  type Order,
  type OrderListItem,
  type OrderStatus,
  orderListItemSchema,
  orderSchema,
  paginated,
  type ReplaceOrderItemsInput,
  replaceOrderItemsSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const ORDERS_PATH = "/orders";

const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API.
const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a ação agora. Verifique sua conexão e tente novamente.";

const ORDER_NOT_FOUND_MESSAGE = "Pedido não encontrado.";

const ordersListSchema = paginated(orderListItemSchema);

export type OrdersApiDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  token: string;
};

export type ListOrdersParams = {
  page?: number;
  perPage?: number;
  status?: OrderStatus;
};

// Resultados discriminados (core.md): a página/action faz narrowing sem
// try/catch. `notFound`/`conflict` sempre presentes na falha para a UI
// distinguir 404 e 409 do erro genérico.
export type ListOrdersResult =
  | {
      ok: true;
      data: OrderListItem[];
      page: number;
      perPage: number;
      total: number;
    }
  | { ok: false; message: string };

export type GetOrderResult =
  | { ok: true; order: Order }
  | { ok: false; notFound: boolean; message: string };

export type CreateOrderResult =
  | { ok: true; order: Order }
  | { ok: false; message: string };

export type ReplaceOrderItemsResult =
  | { ok: true; order: Order }
  | { ok: false; notFound: boolean; conflict: boolean; message: string };

export type TransitionOrderResult =
  | { ok: true; order: Order }
  | { ok: false; notFound: boolean; conflict: boolean; message: string };

const joinUrl = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(TRAILING_SLASHES, "")}${path}`;

// Path com o id sempre `encodeURIComponent` (hardening apontado na QA do
// CRM-03/CRM-06): id nunca interpolado cru na URL.
const orderPath = (id: string, suffix: string): string =>
  `${ORDERS_PATH}/${encodeURIComponent(id)}${suffix}`;

const authHeaders = (token: string): Record<string, string> => ({
  [AUTHORIZATION_HEADER]: `Bearer ${token}`,
});

const jsonAuthHeaders = (token: string): Record<string, string> => ({
  ...authHeaders(token),
  [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
});

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

// Extrai a mensagem do envelope de erro conhecido da API; qualquer desvio
// (não-JSON, shape inesperado) cai na mensagem genérica — nunca vaza internals.
const extractErrorMessage = async (response: Response): Promise<string> => {
  const parsed = apiErrorSchema.safeParse(await readJson(response));
  if (parsed.success) {
    return parsed.data.error.message;
  }
  return GENERIC_ERROR_MESSAGE;
};

const buildListUrl = (apiUrl: string, params: ListOrdersParams): string => {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    query.set("perPage", String(params.perPage));
  }
  // Só enviamos o filtro quando definido: ausente ⇒ a API lista todos os
  // status (comportamento padrão), mantendo a URL limpa na paginação.
  if (params.status !== undefined) {
    query.set("status", params.status);
  }
  const queryString = query.toString();
  const base = joinUrl(apiUrl, ORDERS_PATH);
  return queryString ? `${base}?${queryString}` : base;
};

// Lista pedidos paginados (GET /orders) com Bearer e filtro opcional de
// status. NUNCA lança: rede, status ≠ 200 e corpo malformado viram
// `{ ok: false, message }` pt-BR.
export const listOrders = async (
  params: ListOrdersParams,
  { fetchImpl, apiUrl, token }: OrdersApiDeps,
): Promise<ListOrdersResult> => {
  let response: Response;
  try {
    response = await fetchImpl(buildListUrl(apiUrl, params), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = ordersListSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return {
    ok: true,
    data: parsed.data.data,
    page: parsed.data.page,
    perPage: parsed.data.perPage,
    total: parsed.data.total,
  };
};

// Busca um pedido por id com itens (GET /orders/:id). 404 vira
// `{ notFound: true }` para a UI distinguir "não existe" (inclui cross-tenant)
// de falha genérica; nunca lança.
export const getOrder = async (
  id: string,
  { fetchImpl, apiUrl, token }: OrdersApiDeps,
): Promise<GetOrderResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, orderPath(id, "")), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return { ok: false, notFound: true, message: ORDER_NOT_FOUND_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = orderSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, order: parsed.data };
};

// Cria um pedido em rascunho (POST /orders), com itens opcionais. Valida o
// payload na fronteira com o schema compartilhado antes de enviar; nunca
// lança.
export const createOrder = async (
  values: CreateOrderInput,
  { fetchImpl, apiUrl, token }: OrdersApiDeps,
): Promise<CreateOrderResult> => {
  const parsedInput = createOrderSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, ORDERS_PATH), {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_CREATED) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = orderSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, order: parsed.data };
};

// Substitui a lista de itens do rascunho (PUT /orders/:id/items) — permitido
// somente em `draft`. Valida o payload na fronteira antes de enviar; 404 →
// notFound (inclui cross-tenant); 409 → conflict com a mensagem pt-BR da API
// (pedido não está mais em rascunho). Nunca lança.
export const replaceOrderItems = async (
  id: string,
  values: ReplaceOrderItemsInput,
  { fetchImpl, apiUrl, token }: OrdersApiDeps,
): Promise<ReplaceOrderItemsResult> => {
  const parsedInput = replaceOrderItemsSchema.safeParse(values);
  if (!parsedInput.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, orderPath(id, "/items")), {
      method: "PUT",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return {
      ok: false,
      notFound: true,
      conflict: false,
      message: ORDER_NOT_FOUND_MESSAGE,
    };
  }

  if (response.status === HTTP_CONFLICT) {
    return {
      ok: false,
      notFound: false,
      conflict: true,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = orderSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, order: parsed.data };
};

// Aplica uma transição de status (`POST /orders/:id/{place,deliver,cancel}`).
// 404 → notFound (inclui cross-tenant); 409 → conflict com a mensagem pt-BR
// da API (transição inválida para o status atual). Nunca lança.
const transitionOrder = async (
  id: string,
  action: "place" | "deliver" | "cancel",
  { fetchImpl, apiUrl, token }: OrdersApiDeps,
): Promise<TransitionOrderResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, orderPath(id, `/${action}`)), {
      method: "POST",
      headers: authHeaders(token),
    });
  } catch {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return {
      ok: false,
      notFound: true,
      conflict: false,
      message: ORDER_NOT_FOUND_MESSAGE,
    };
  }

  if (response.status === HTTP_CONFLICT) {
    return {
      ok: false,
      notFound: false,
      conflict: true,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = orderSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, order: parsed.data };
};

// Marca o rascunho como feito (POST /orders/:id/place): `draft` → `placed`.
// Exige ao menos 1 item (409 caso contrário, ver spec RF-03).
export const placeOrder = (
  id: string,
  deps: OrdersApiDeps,
): Promise<TransitionOrderResult> => transitionOrder(id, "place", deps);

// Marca o pedido como entregue (POST /orders/:id/deliver): `placed` →
// `delivered`, credita o estoque atomicamente no servidor.
export const deliverOrder = (
  id: string,
  deps: OrdersApiDeps,
): Promise<TransitionOrderResult> => transitionOrder(id, "deliver", deps);

// Cancela o pedido (POST /orders/:id/cancel): `draft`/`placed` → `canceled`,
// sem efeito de estoque.
export const cancelOrder = (
  id: string,
  deps: OrdersApiDeps,
): Promise<TransitionOrderResult> => transitionOrder(id, "cancel", deps);
