import {
  apiErrorSchema,
  type Client,
  type CreateClientInput,
  clientSchema,
  createClientSchema,
  paginated,
  type UpdateClientInput,
  updateClientSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;

const CLIENTS_PATH = "/clients";

const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API nem dado pessoal.
const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a ação agora. Verifique sua conexão e tente novamente.";

const NOT_FOUND_MESSAGE = "Cliente não encontrada.";

const clientsListSchema = paginated(clientSchema);

export type ClientsApiDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  token: string;
};

export type ListClientsParams = {
  page?: number;
  perPage?: number;
  search?: string;
};

// Resultados discriminados (core.md): a página/action faz narrowing sem try/catch.
export type ListClientsResult =
  | { ok: true; data: Client[]; page: number; perPage: number; total: number }
  | { ok: false; message: string };

export type GetClientResult =
  | { ok: true; client: Client }
  | { ok: false; notFound: boolean; message: string };

export type MutateClientResult =
  | { ok: true; client: Client }
  | { ok: false; message: string };

export type DeleteClientResult = { ok: true } | { ok: false; message: string };

const joinUrl = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(TRAILING_SLASHES, "")}${path}`;

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

const buildListUrl = (apiUrl: string, params: ListClientsParams): string => {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    query.set("perPage", String(params.perPage));
  }
  if (params.search !== undefined && params.search.length > 0) {
    query.set("search", params.search);
  }
  const queryString = query.toString();
  const base = joinUrl(apiUrl, CLIENTS_PATH);
  return queryString ? `${base}?${queryString}` : base;
};

// Lista clientes paginadas (GET /clients) com Bearer. NUNCA lança: rede, status
// ≠ 200 e corpo malformado viram `{ ok: false, message }` pt-BR.
export const listClients = async (
  params: ListClientsParams,
  { fetchImpl, apiUrl, token }: ClientsApiDeps,
): Promise<ListClientsResult> => {
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

  const parsed = clientsListSchema.safeParse(await readJson(response));
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

// Busca uma cliente por id (GET /clients/:id). 404 vira `{ notFound: true }`
// para a UI distinguir "não existe" de falha genérica; nunca lança.
export const getClient = async (
  id: string,
  { fetchImpl, apiUrl, token }: ClientsApiDeps,
): Promise<GetClientResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, `${CLIENTS_PATH}/${id}`), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return { ok: false, notFound: true, message: NOT_FOUND_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = clientSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, client: parsed.data };
};

// Cria uma cliente (POST /clients). Valida na fronteira com o schema
// compartilhado antes de enviar; nunca lança.
export const createClient = async (
  values: CreateClientInput,
  { fetchImpl, apiUrl, token }: ClientsApiDeps,
): Promise<MutateClientResult> => {
  const parsedInput = createClientSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, CLIENTS_PATH), {
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

  const parsed = clientSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, client: parsed.data };
};

// Atualiza parcialmente uma cliente (PATCH /clients/:id). Valida na fronteira
// com o schema de update parcial antes de enviar; nunca lança.
export const updateClient = async (
  id: string,
  values: UpdateClientInput,
  { fetchImpl, apiUrl, token }: ClientsApiDeps,
): Promise<MutateClientResult> => {
  const parsedInput = updateClientSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, `${CLIENTS_PATH}/${id}`), {
      method: "PATCH",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = clientSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, client: parsed.data };
};

// Exclui fisicamente uma cliente (DELETE /clients/:id — LGPD). 204 → sucesso;
// nunca lança.
export const deleteClient = async (
  id: string,
  { fetchImpl, apiUrl, token }: ClientsApiDeps,
): Promise<DeleteClientResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, `${CLIENTS_PATH}/${id}`), {
      method: "DELETE",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_NO_CONTENT) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  return { ok: true };
};
