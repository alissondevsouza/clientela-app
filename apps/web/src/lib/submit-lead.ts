import {
  apiErrorSchema,
  type LeadCaptureRequestInput,
  leadCaptureRequestSchema,
} from "@clientela/shared";

const HTTP_CREATED = 201;
const LEADS_PATH = "/leads";
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica e acionável (pt-BR): usada para qualquer falha cujo detalhe
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API (security.md / core.md).
const GENERIC_ERROR_MESSAGE =
  "Não foi possível enviar agora. Verifique sua conexão e tente novamente.";

// Resultado discriminado (core.md): a UI faz narrowing sem try/catch.
export type SubmitLeadResult = { ok: true } | { ok: false; message: string };

// Assinatura mínima de `fetch` injetada (o `fetch` global — e um fake de teste —
// são atribuíveis). Evita `typeof fetch`, que exige extensões do runtime (Bun
// `preconnect`) irrelevantes aqui.
export type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SubmitLeadDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  // IP do visitante extraído do XFF pela action; repassado à API para preservar
  // o rate limit POR VISITANTE (RF-06). Ausente → header omitido (API fail-closed).
  clientIp?: string;
};

const failure = (message: string): SubmitLeadResult => ({ ok: false, message });

// Extrai a mensagem do envelope de erro conhecido da API; qualquer desvio
// (resposta não-JSON, shape inesperado) cai na mensagem genérica.
const extractErrorMessage = async (response: Response): Promise<string> => {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return GENERIC_ERROR_MESSAGE;
  }

  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data.error.message;
  }
  return GENERIC_ERROR_MESSAGE;
};

// Helper puro de submissão (deps injetadas): valida na fronteira com o schema
// compartilhado, faz POST no servidor e mapeia a resposta para um resultado
// discriminado. NUNCA lança — todo caminho de erro vira `{ ok: false, message }`.
export const submitLead = async (
  values: LeadCaptureRequestInput,
  { fetchImpl, apiUrl, clientIp }: SubmitLeadDeps,
): Promise<SubmitLeadResult> => {
  const parsed = leadCaptureRequestSchema.safeParse(values);
  if (!parsed.success) {
    return failure(GENERIC_ERROR_MESSAGE);
  }

  const headers: Record<string, string> = {
    [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
  };
  if (clientIp) {
    headers[FORWARDED_FOR_HEADER] = clientIp;
  }

  const url = `${apiUrl.replace(TRAILING_SLASHES, "")}${LEADS_PATH}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(parsed.data),
    });
  } catch {
    return failure(GENERIC_ERROR_MESSAGE);
  }

  if (response.status === HTTP_CREATED) {
    return { ok: true };
  }

  return failure(await extractErrorMessage(response));
};
