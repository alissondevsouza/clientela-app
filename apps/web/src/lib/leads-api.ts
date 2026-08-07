import {
  apiErrorSchema,
  type Client,
  type CreateLeadCrmInput,
  type CrmLead,
  clientSchema,
  createLeadCrmSchema,
  crmLeadSchema,
  type LeadStatus,
  type LeadStatusUpdate,
  paginated,
  updateLeadStatusSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const LEADS_PATH = "/leads";
const LEADS_MANUAL_PATH = "/leads/manual";

const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API nem dado pessoal.
const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a ação agora. Verifique sua conexão e tente novamente.";

const NOT_FOUND_MESSAGE = "Lead não encontrado.";

const leadsListSchema = paginated(crmLeadSchema);

// Rótulos pt-BR dos status do funil (RF-07). Módulo puro: usado por badges e
// filtros sem depender do DOM, testável isoladamente. `Record<LeadStatus>`
// garante em compilação que todo status do enum tem rótulo.
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Novo",
  contacted: "Contatado",
  converted: "Convertido",
  discarded: "Descartado",
};

export type LeadsApiDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  token: string;
};

export type ListLeadsParams = {
  page?: number;
  status?: LeadStatus;
  search?: string;
};

// Resultados discriminados (core.md): a página/action faz narrowing sem
// try/catch. `notFound`/`conflict` sempre presentes na falha para a UI
// distinguir 404 e 409 do erro genérico.
export type ListLeadsResult =
  | { ok: true; data: CrmLead[]; page: number; perPage: number; total: number }
  | { ok: false; message: string };

export type GetLeadResult =
  | { ok: true; lead: CrmLead }
  | { ok: false; notFound: boolean; message: string };

export type CreateLeadResult =
  | { ok: true; lead: CrmLead }
  | { ok: false; message: string };

export type UpdateLeadStatusResult =
  | { ok: true; lead: CrmLead }
  | { ok: false; notFound: boolean; conflict: boolean; message: string };

export type ConvertLeadResult =
  | { ok: true; client: Client }
  | { ok: false; notFound: boolean; conflict: boolean; message: string };

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

const buildListUrl = (apiUrl: string, params: ListLeadsParams): string => {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.status !== undefined) {
    query.set("status", params.status);
  }
  if (params.search !== undefined && params.search.length > 0) {
    query.set("search", params.search);
  }
  const queryString = query.toString();
  const base = joinUrl(apiUrl, LEADS_PATH);
  return queryString ? `${base}?${queryString}` : base;
};

// Path do lead com o id sempre `encodeURIComponent` (hardening apontado na QA do
// CRM-03): id nunca interpolado cru na URL.
const leadPath = (id: string, suffix: string): string =>
  `${LEADS_PATH}/${encodeURIComponent(id)}${suffix}`;

// Lista leads paginados (GET /leads) com Bearer e filtro opcional por status.
// NUNCA lança: rede, status ≠ 200 e corpo malformado viram
// `{ ok: false, message }` pt-BR.
export const listLeads = async (
  params: ListLeadsParams,
  { fetchImpl, apiUrl, token }: LeadsApiDeps,
): Promise<ListLeadsResult> => {
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

  const parsed = leadsListSchema.safeParse(await readJson(response));
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

// Busca um lead por id (GET /leads/:id — RF-22 do crm-appointments: resolve
// o nome do lead pré-selecionado por id, sem depender da busca textual da
// primeira página). 404 vira `{ notFound: true }` para o chamador descartar a
// pré-seleção; nunca lança.
export const getLead = async (
  id: string,
  { fetchImpl, apiUrl, token }: LeadsApiDeps,
): Promise<GetLeadResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, leadPath(id, "")), {
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

  const parsed = crmLeadSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, lead: parsed.data };
};

// Cria lead pelo CRM (POST /leads/manual — RF-23/RF-24 de `crm-appointments`,
// ADR-0020): rota autenticada DISTINTA da captura pública (`POST /leads`,
// `submit-lead.ts`), usada pelo cadastro rápido do seletor de pessoa da
// agenda. Valida na fronteira com o schema compartilhado antes de enviar
// (defesa em profundidade — a Server Action chamadora já validou); nunca
// lança.
export const createLead = async (
  values: CreateLeadCrmInput,
  { fetchImpl, apiUrl, token }: LeadsApiDeps,
): Promise<CreateLeadResult> => {
  const parsedInput = createLeadCrmSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, LEADS_MANUAL_PATH), {
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

  const parsed = crmLeadSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, lead: parsed.data };
};

// Atualiza o status do lead (PATCH /leads/:id/status). Valida o status na
// fronteira com o schema compartilhado (exclui `converted`); 404 → notFound,
// 409 → conflict com a mensagem da API, demais erros → genérica. Nunca lança.
export const updateLeadStatus = async (
  id: string,
  status: LeadStatusUpdate,
  { fetchImpl, apiUrl, token }: LeadsApiDeps,
): Promise<UpdateLeadStatusResult> => {
  const parsedInput = updateLeadStatusSchema.safeParse({ status });
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
    response = await fetchImpl(joinUrl(apiUrl, leadPath(id, "/status")), {
      method: "PATCH",
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
      message: NOT_FOUND_MESSAGE,
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

  const parsed = crmLeadSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, lead: parsed.data };
};

// Converte o lead em cliente (POST /leads/:id/convert). 200/201 → cliente criada
// (parse do contrato de clients); 404 → notFound; 409 → conflict com a mensagem
// da API (lead já convertido). Nunca lança.
export const convertLead = async (
  id: string,
  { fetchImpl, apiUrl, token }: LeadsApiDeps,
): Promise<ConvertLeadResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, leadPath(id, "/convert")), {
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
      message: NOT_FOUND_MESSAGE,
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

  if (response.status !== HTTP_OK && response.status !== HTTP_CREATED) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = clientSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, client: parsed.data };
};
