import {
  type Appointment,
  type AppointmentConflictsQueryInput,
  type AppointmentKind,
  type AppointmentListItem,
  type AppointmentRange,
  type AppointmentStatus,
  apiErrorSchema,
  appointmentConflictsResponseSchema,
  appointmentListItemSchema,
  appointmentSchema,
  type CompleteAppointmentInput,
  type CreateAppointmentInput,
  completeAppointmentSchema,
  createAppointmentSchema,
  type LinkAppointmentSaleInput,
  linkAppointmentSaleSchema,
  paginated,
  type UpdateAppointmentInput,
  updateAppointmentSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const APPOINTMENTS_PATH = "/appointments";
const APPOINTMENT_CONFLICTS_PATH = "/appointments/conflicts";

const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API nem dado pessoal.
const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a ação agora. Verifique sua conexão e tente novamente.";

const APPOINTMENT_NOT_FOUND_MESSAGE = "Compromisso não encontrado.";

const appointmentsListSchema = paginated(appointmentListItemSchema);

export type AppointmentsApiDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  token: string;
};

export type ListAppointmentsParams = {
  page?: number;
  perPage?: number;
  range?: AppointmentRange;
  date?: string;
  status?: AppointmentStatus;
  kind?: AppointmentKind;
  clientId?: string;
  leadId?: string;
};

export type TransitionAppointmentKind = "done" | "no-show" | "cancel";

// Resultados discriminados (core.md): a página/action faz narrowing sem
// try/catch. `notFound`/`conflict`/`invalid` sempre presentes na falha para a
// UI distinguir 404, 409 (estado) e 422 (validação/pessoa/venda) do erro
// genérico.
export type ListAppointmentsResult =
  | {
      ok: true;
      data: AppointmentListItem[];
      page: number;
      perPage: number;
      total: number;
    }
  | { ok: false; message: string };

export type GetAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; notFound: boolean; message: string };

export type CreateAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; message: string };

export type UpdateAppointmentResult =
  | { ok: true; appointment: Appointment }
  | {
      ok: false;
      notFound: boolean;
      conflict: boolean;
      invalid: boolean;
      message: string;
    };

export type DeleteAppointmentResult =
  | { ok: true }
  | { ok: false; notFound: boolean; message: string };

export type TransitionAppointmentResult =
  | { ok: true; appointment: Appointment }
  | {
      ok: false;
      notFound: boolean;
      conflict: boolean;
      invalid: boolean;
      message: string;
    };

export type LinkAppointmentSaleResult =
  | { ok: true; appointment: Appointment }
  | {
      ok: false;
      notFound: boolean;
      conflict: boolean;
      invalid: boolean;
      message: string;
    };

export type GetAppointmentConflictsResult =
  | { ok: true; data: AppointmentListItem[] }
  | { ok: false; message: string };

const joinUrl = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(TRAILING_SLASHES, "")}${path}`;

// Path com o id sempre `encodeURIComponent` (hardening apontado na QA do
// CRM-03/CRM-06): id nunca interpolado cru na URL.
const appointmentPath = (id: string, suffix: string): string =>
  `${APPOINTMENTS_PATH}/${encodeURIComponent(id)}${suffix}`;

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

const buildListUrl = (
  apiUrl: string,
  params: ListAppointmentsParams,
): string => {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    query.set("perPage", String(params.perPage));
  }
  // Só enviamos cada filtro quando definido: ausente ⇒ a API usa o default
  // (`range=upcoming`, sem os demais), mantendo a URL limpa na paginação.
  if (params.range !== undefined) {
    query.set("range", params.range);
  }
  if (params.date !== undefined) {
    query.set("date", params.date);
  }
  if (params.status !== undefined) {
    query.set("status", params.status);
  }
  if (params.kind !== undefined) {
    query.set("kind", params.kind);
  }
  if (params.clientId !== undefined) {
    query.set("clientId", params.clientId);
  }
  if (params.leadId !== undefined) {
    query.set("leadId", params.leadId);
  }
  const queryString = query.toString();
  const base = joinUrl(apiUrl, APPOINTMENTS_PATH);
  return queryString ? `${base}?${queryString}` : base;
};

// Lista compromissos paginados (GET /appointments) com Bearer e os filtros do
// RF-05. NUNCA lança: rede, status ≠ 200 e corpo malformado viram
// `{ ok: false, message }` pt-BR.
export const listAppointments = async (
  params: ListAppointmentsParams,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<ListAppointmentsResult> => {
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

  const parsed = appointmentsListSchema.safeParse(await readJson(response));
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

// Busca um compromisso por id com detalhe completo (GET /appointments/:id).
// 404 vira `{ notFound: true }` para a UI distinguir "não existe" (inclui
// cross-tenant e id malformado) de falha genérica; nunca lança.
export const getAppointment = async (
  id: string,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<GetAppointmentResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, appointmentPath(id, "")), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return {
      ok: false,
      notFound: true,
      message: APPOINTMENT_NOT_FOUND_MESSAGE,
    };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = appointmentSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, appointment: parsed.data };
};

// Cria um compromisso (POST /appointments). Valida o payload na fronteira com
// o schema compartilhado antes de enviar; `consultantId` sempre vem do token
// no servidor (RF-04). Nunca lança.
export const createAppointment = async (
  values: CreateAppointmentInput,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<CreateAppointmentResult> => {
  const parsedInput = createAppointmentSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, APPOINTMENTS_PATH), {
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

  const parsed = appointmentSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, appointment: parsed.data };
};

// Edita um compromisso (PUT /appointments/:id, RF-07). Valida o payload na
// fronteira antes de enviar; 404 → notFound (inclui cross-tenant/id
// malformado); 409 → conflict (edição de campo além de `notes` em status
// terminal); 422 → invalid (vínculo de pessoa/venda inválido). Nunca lança.
export const updateAppointment = async (
  id: string,
  values: UpdateAppointmentInput,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<UpdateAppointmentResult> => {
  const parsedInput = updateAppointmentSchema.safeParse(values);
  if (!parsedInput.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: true,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, appointmentPath(id, "")), {
      method: "PUT",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return {
      ok: false,
      notFound: true,
      conflict: false,
      invalid: false,
      message: APPOINTMENT_NOT_FOUND_MESSAGE,
    };
  }

  if (response.status === HTTP_CONFLICT) {
    return {
      ok: false,
      notFound: false,
      conflict: true,
      invalid: false,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status === HTTP_UNPROCESSABLE_ENTITY) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: true,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = appointmentSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, appointment: parsed.data };
};

// Remove um compromisso (DELETE /appointments/:id, RF-09) — "marquei por
// engano"; não tem guard de status. 404 → notFound (inclui cross-tenant/id
// malformado); nunca lança.
export const deleteAppointment = async (
  id: string,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<DeleteAppointmentResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, appointmentPath(id, "")), {
      method: "DELETE",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return {
      ok: false,
      notFound: true,
      message: APPOINTMENT_NOT_FOUND_MESSAGE,
    };
  }

  if (response.status !== HTTP_NO_CONTENT) {
    return {
      ok: false,
      notFound: false,
      message: await extractErrorMessage(response),
    };
  }

  return { ok: true };
};

// Aplica uma transição de desfecho (RF-08): `POST /appointments/:id/done`
// (corpo opcional `{ saleId }`), `/no-show` ou `/cancel`. 404 → notFound; 409
// → conflict (transição a partir de status terminal); 422 → invalid (`saleId`
// inválido em `done`). Nunca lança.
export const transitionAppointment = async (
  id: string,
  transition: TransitionAppointmentKind,
  body: CompleteAppointmentInput | undefined,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<TransitionAppointmentResult> => {
  let requestInit: RequestInit;
  if (transition === "done") {
    const parsedInput = completeAppointmentSchema.safeParse(body ?? {});
    if (!parsedInput.success) {
      return {
        ok: false,
        notFound: false,
        conflict: false,
        invalid: true,
        message: GENERIC_ERROR_MESSAGE,
      };
    }
    requestInit = {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    };
  } else {
    requestInit = { method: "POST", headers: authHeaders(token) };
  }

  let response: Response;
  try {
    response = await fetchImpl(
      joinUrl(apiUrl, appointmentPath(id, `/${transition}`)),
      requestInit,
    );
  } catch {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return {
      ok: false,
      notFound: true,
      conflict: false,
      invalid: false,
      message: APPOINTMENT_NOT_FOUND_MESSAGE,
    };
  }

  if (response.status === HTTP_CONFLICT) {
    return {
      ok: false,
      notFound: false,
      conflict: true,
      invalid: false,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status === HTTP_UNPROCESSABLE_ENTITY) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: true,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = appointmentSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, appointment: parsed.data };
};

// Vincula/desvincula a venda do compromisso (PUT /appointments/:id/sale,
// RF-10). Valida o payload na fronteira antes de enviar (`saleId` uuid ou
// `null`); 404 → notFound; 409 → conflict (fora de `scheduled`/`done`); 422 →
// invalid (venda inexistente/alheia/não `completed`/cliente incompatível).
// Nunca lança.
export const linkAppointmentSale = async (
  id: string,
  saleId: string | null,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<LinkAppointmentSaleResult> => {
  const parsedInput = linkAppointmentSaleSchema.safeParse({
    saleId,
  } satisfies LinkAppointmentSaleInput);
  if (!parsedInput.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: true,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, appointmentPath(id, "/sale")), {
      method: "PUT",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return {
      ok: false,
      notFound: true,
      conflict: false,
      invalid: false,
      message: APPOINTMENT_NOT_FOUND_MESSAGE,
    };
  }

  if (response.status === HTTP_CONFLICT) {
    return {
      ok: false,
      notFound: false,
      conflict: true,
      invalid: false,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status === HTTP_UNPROCESSABLE_ENTITY) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: true,
      message: await extractErrorMessage(response),
    };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = appointmentSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return {
      ok: false,
      notFound: false,
      conflict: false,
      invalid: false,
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  return { ok: true, appointment: parsed.data };
};

const buildConflictsUrl = (
  apiUrl: string,
  params: AppointmentConflictsQueryInput,
): string => {
  const query = new URLSearchParams();
  query.set("startsAt", params.startsAt);
  query.set("durationMinutes", String(params.durationMinutes));
  if (params.excludeId !== undefined) {
    query.set("excludeId", params.excludeId);
  }
  return `${joinUrl(apiUrl, APPOINTMENT_CONFLICTS_PATH)}?${query.toString()}`;
};

// Lista os compromissos que sobrepõem o intervalo consultado, sem bloquear
// nada (GET /appointments/conflicts, RF-11) — aviso não bloqueante para o
// formulário. Nunca lança.
export const getAppointmentConflicts = async (
  params: AppointmentConflictsQueryInput,
  { fetchImpl, apiUrl, token }: AppointmentsApiDeps,
): Promise<GetAppointmentConflictsResult> => {
  let response: Response;
  try {
    response = await fetchImpl(buildConflictsUrl(apiUrl, params), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = appointmentConflictsResponseSchema.safeParse(
    await readJson(response),
  );
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, data: parsed.data.data };
};
