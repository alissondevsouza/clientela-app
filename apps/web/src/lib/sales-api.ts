import {
  apiErrorSchema,
  type CreateSaleInput,
  createSaleSchema,
  paginated,
  type Receivable,
  type ReceivableListItem,
  type ReceivablesSummary,
  receivableListItemSchema,
  receivableSchema,
  receivablesSummarySchema,
  type Sale,
  type SaleListItem,
  type SaleStatus,
  saleListItemSchema,
  saleSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const SALES_PATH = "/sales";
const RECEIVABLES_PATH = "/receivables";
const RECEIVABLES_SUMMARY_PATH = "/receivables/summary";

const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API nem dado pessoal.
const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a ação agora. Verifique sua conexão e tente novamente.";

const SALE_NOT_FOUND_MESSAGE = "Venda não encontrada.";
const RECEIVABLE_NOT_FOUND_MESSAGE = "Recebível não encontrado.";

const salesListSchema = paginated(saleListItemSchema);
// A lista "quem me deve" carrega os dados da venda/cliente (RF-06): parseia o
// item enriquecido, não o recebível cru (que segue no detalhe da venda / PATCH).
const receivablesListSchema = paginated(receivableListItemSchema);

export type SalesApiDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  token: string;
};

export type ListSalesParams = {
  page?: number;
  status?: SaleStatus;
  clientId?: string;
};

export type ListReceivablesParams = {
  page?: number;
  pending?: boolean;
};

// Resultados discriminados (core.md): a página/action faz narrowing sem
// try/catch. `notFound`/`conflict` sempre presentes na falha para a UI
// distinguir 404 e 409 do erro genérico.
export type CreateSaleResult =
  | { ok: true; sale: Sale }
  | { ok: false; conflict: boolean; message: string };

export type ListSalesResult =
  | {
      ok: true;
      data: SaleListItem[];
      page: number;
      perPage: number;
      total: number;
    }
  | { ok: false; message: string };

export type GetSaleResult =
  | { ok: true; sale: Sale }
  | { ok: false; notFound: boolean; message: string };

export type CancelSaleResult =
  | { ok: true }
  | { ok: false; notFound: boolean; conflict: boolean; message: string };

export type ListReceivablesResult =
  | {
      ok: true;
      data: ReceivableListItem[];
      page: number;
      perPage: number;
      total: number;
    }
  | { ok: false; message: string };

export type ReceivablesSummaryResult =
  | { ok: true; summary: ReceivablesSummary }
  | { ok: false; message: string };

export type SetReceivablePaidResult =
  | { ok: true; receivable: Receivable }
  | { ok: false; notFound: boolean; conflict: boolean; message: string };

const joinUrl = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(TRAILING_SLASHES, "")}${path}`;

// Path com o id sempre `encodeURIComponent` (hardening apontado na QA do CRM-03):
// id nunca interpolado cru na URL.
const salePath = (id: string, suffix: string): string =>
  `${SALES_PATH}/${encodeURIComponent(id)}${suffix}`;

const receivablePath = (id: string): string =>
  `${RECEIVABLES_PATH}/${encodeURIComponent(id)}`;

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

const buildSalesListUrl = (apiUrl: string, params: ListSalesParams): string => {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.status !== undefined) {
    query.set("status", params.status);
  }
  if (params.clientId !== undefined && params.clientId.length > 0) {
    query.set("clientId", params.clientId);
  }
  const queryString = query.toString();
  const base = joinUrl(apiUrl, SALES_PATH);
  return queryString ? `${base}?${queryString}` : base;
};

const buildReceivablesListUrl = (
  apiUrl: string,
  params: ListReceivablesParams,
): string => {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  // `pending` default é true na API (lista só pendentes). `false` é significativo
  // (mostra todos), então enviamos sempre que definido — diferente de `lowStock`.
  if (params.pending !== undefined) {
    query.set("pending", String(params.pending));
  }
  const queryString = query.toString();
  const base = joinUrl(apiUrl, RECEIVABLES_PATH);
  return queryString ? `${base}?${queryString}` : base;
};

// Registra a venda (POST /sales). Valida o payload na fronteira com o schema
// compartilhado antes de enviar; 201 → venda parseada; 409 (estoque insuficiente)
// → conflict com a mensagem pt-BR da API; 422 e demais → mensagem da API quando
// presente. Nunca lança.
export const createSale = async (
  values: CreateSaleInput,
  { fetchImpl, apiUrl, token }: SalesApiDeps,
): Promise<CreateSaleResult> => {
  const parsedInput = createSaleSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, conflict: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, SALES_PATH), {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return { ok: false, conflict: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status === HTTP_CONFLICT) {
    return {
      ok: false,
      conflict: true,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status !== HTTP_CREATED) {
    return {
      ok: false,
      conflict: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = saleSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, conflict: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, sale: parsed.data };
};

// Lista vendas paginadas (GET /sales) com Bearer e filtros opcionais por status
// e cliente. NUNCA lança: rede, status ≠ 200 e corpo malformado viram
// `{ ok: false, message }` pt-BR.
export const listSales = async (
  params: ListSalesParams,
  { fetchImpl, apiUrl, token }: SalesApiDeps,
): Promise<ListSalesResult> => {
  let response: Response;
  try {
    response = await fetchImpl(buildSalesListUrl(apiUrl, params), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = salesListSchema.safeParse(await readJson(response));
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

// Busca a venda por id com itens e recebíveis (GET /sales/:id). 404 vira
// `{ notFound: true }` para a UI distinguir "não existe" (inclui cross-tenant)
// de falha genérica; nunca lança.
export const getSale = async (
  id: string,
  { fetchImpl, apiUrl, token }: SalesApiDeps,
): Promise<GetSaleResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, salePath(id, "")), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return { ok: false, notFound: true, message: SALE_NOT_FOUND_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = saleSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, sale: parsed.data };
};

// Cancela a venda (POST /sales/:id/cancel). 200 → sucesso; 404 → notFound
// (inclui cross-tenant); 409 → conflict com a mensagem da API (já cancelada ou
// com parcela paga). Nunca lança.
export const cancelSale = async (
  id: string,
  { fetchImpl, apiUrl, token }: SalesApiDeps,
): Promise<CancelSaleResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, salePath(id, "/cancel")), {
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
      message: SALE_NOT_FOUND_MESSAGE,
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

  return { ok: true };
};

// Lista recebíveis paginados (GET /receivables) com Bearer e filtro `pending`.
// NUNCA lança: rede, status ≠ 200 e corpo malformado viram
// `{ ok: false, message }` pt-BR.
export const listReceivables = async (
  params: ListReceivablesParams,
  { fetchImpl, apiUrl, token }: SalesApiDeps,
): Promise<ListReceivablesResult> => {
  let response: Response;
  try {
    response = await fetchImpl(buildReceivablesListUrl(apiUrl, params), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = receivablesListSchema.safeParse(await readJson(response));
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

// Busca o agregado "a receber" (GET /receivables/summary): pendente total,
// atrasado e contagem de atrasados. Total financeiro nunca derivado de lista
// paginada. NUNCA lança.
export const getReceivablesSummary = async ({
  fetchImpl,
  apiUrl,
  token,
}: SalesApiDeps): Promise<ReceivablesSummaryResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, RECEIVABLES_SUMMARY_PATH), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = receivablesSummarySchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, summary: parsed.data };
};

// Dá baixa (`paid: true`) ou estorna (`paid: false`) um recebível
// (PATCH /receivables/:id). 200 → recebível atualizado parseado; 404 → notFound
// (inclui cross-tenant); 409 → conflict com a mensagem da API (venda cancelada,
// pagar pago ou estornar pendente). Nunca lança.
export const setReceivablePaid = async (
  id: string,
  paid: boolean,
  { fetchImpl, apiUrl, token }: SalesApiDeps,
): Promise<SetReceivablePaidResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, receivablePath(id)), {
      method: "PATCH",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ paid }),
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
      message: RECEIVABLE_NOT_FOUND_MESSAGE,
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

  const parsed = receivableSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, receivable: parsed.data };
};
