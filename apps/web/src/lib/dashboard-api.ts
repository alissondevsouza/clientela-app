import {
  apiErrorSchema,
  type DashboardPerformance,
  type DashboardPeriodQuery,
  type DashboardToday,
  dashboardPerformanceSchema,
  dashboardTodaySchema,
  updateGoalResponseSchema,
  updateGoalSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;

const PERFORMANCE_PATH = "/dashboard/performance";
const TODAY_PATH = "/dashboard/today";
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
export type GetDashboardPerformanceResult =
  | { ok: true; performance: DashboardPerformance }
  | { ok: false; message: string };

export type GetDashboardTodayResult =
  | { ok: true; today: DashboardToday }
  | { ok: false; message: string };

export type UpdateGoalResult =
  | { ok: true; month: string; monthlyGoalCents: number | null }
  | { ok: false; message: string };

const joinUrl = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(TRAILING_SLASHES, "")}${path}`;

// Monta a query de `/dashboard/performance` (RF-11) só com os parâmetros que
// pertencem ao `period` escolhido — `DashboardPeriodQuery` já é a SAÍDA de
// `dashboardPeriodQuerySchema` (parseada antes de chegar aqui), então nunca
// carrega um parâmetro alheio ao `period` (o schema já barrou isso).
const buildDashboardPerformanceUrl = (
  apiUrl: string,
  query: DashboardPeriodQuery,
): string => {
  const params = new URLSearchParams();
  params.set("period", query.period);
  if (query.month !== undefined) {
    params.set("month", query.month);
  }
  if (query.year !== undefined) {
    params.set("year", query.year);
  }
  if (query.from !== undefined) {
    params.set("from", query.from);
  }
  if (query.to !== undefined) {
    params.set("to", query.to);
  }
  return `${joinUrl(apiUrl, PERFORMANCE_PATH)}?${params.toString()}`;
};

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

// Busca o desempenho do painel para um período (GET /dashboard/performance —
// RF-11): atual/comparado, série de 12 meses, rankings e meta. `query` já é a
// SAÍDA de `dashboardPeriodQuerySchema` (a page/helper resolve os
// `searchParams` antes de chamar aqui). NUNCA lança.
export const getDashboardPerformance = async (
  query: DashboardPeriodQuery,
  { fetchImpl, apiUrl, token }: DashboardApiDeps,
): Promise<GetDashboardPerformanceResult> => {
  let response: Response;
  try {
    response = await fetchImpl(buildDashboardPerformanceUrl(apiUrl, query), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = dashboardPerformanceSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, performance: parsed.data };
};

// Busca a central do dia (GET /dashboard/today — RF-12): cobranças, agenda,
// entregas, leads novos, encomendas sem estoque e aniversariantes. NUNCA lança.
export const getDashboardToday = async ({
  fetchImpl,
  apiUrl,
  token,
}: DashboardApiDeps): Promise<GetDashboardTodayResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, TODAY_PATH), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = dashboardTodaySchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, today: parsed.data };
};

// Define, edita ou remove (`null`) a meta mensal (PUT /dashboard/goal — RF-09).
// Valida o payload na fronteira com o schema compartilhado antes de enviar (0 e
// valores fora do teto nunca chegam a sair do cliente); a API sempre grava o MÊS
// CORRENTE (decidido pelo relógio do servidor) e devolve `{ month, monthlyGoalCents }`
// (`updateGoalResponseSchema` — RF-07: a meta agora tem histórico por mês).
// NUNCA lança.
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

  const parsed = updateGoalResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return {
    ok: true,
    month: parsed.data.month,
    monthlyGoalCents: parsed.data.monthlyGoalCents,
  };
};
