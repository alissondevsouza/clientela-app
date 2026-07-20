import {
  apiErrorSchema,
  type DashboardSummary,
  dashboardSummarySchema,
  updateGoalSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;

const SUMMARY_PATH = "/dashboard/summary";
const GOAL_PATH = "/dashboard/goal";

const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API.
const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a ação agora. Verifique sua conexão e tente novamente.";

export type DashboardApiDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  token: string;
};

// Resultados discriminados (core.md): a página/action faz narrowing sem
// try/catch.
export type GetDashboardSummaryResult =
  | { ok: true; summary: DashboardSummary }
  | { ok: false; message: string };

export type UpdateGoalResult =
  | { ok: true; monthlyGoalCents: number | null }
  | { ok: false; message: string };

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

// Busca o agregado do painel (GET /dashboard/summary): vendas do mês, lucro
// estimado (com sinal), a receber (pendente/atrasado) e meta. NUNCA lança.
export const getDashboardSummary = async ({
  fetchImpl,
  apiUrl,
  token,
}: DashboardApiDeps): Promise<GetDashboardSummaryResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, SUMMARY_PATH), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = dashboardSummarySchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, summary: parsed.data };
};

// Define, edita ou remove (`null`) a meta mensal (PUT /dashboard/goal). Valida
// o payload na fronteira com o schema compartilhado antes de enviar (0 e valores
// fora do teto nunca chegam a sair do cliente); a API retorna o novo valor no
// mesmo shape do payload. NUNCA lança.
export const updateGoal = async (
  monthlyGoalCents: number | null,
  { fetchImpl, apiUrl, token }: DashboardApiDeps,
): Promise<UpdateGoalResult> => {
  const parsedInput = updateGoalSchema.safeParse({ monthlyGoalCents });
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, GOAL_PATH), {
      method: "PUT",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = updateGoalSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, monthlyGoalCents: parsed.data.monthlyGoalCents };
};
