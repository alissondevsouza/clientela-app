import {
  type AuthConsultant,
  apiErrorSchema,
  authConsultantSchema,
  type LoginRequestInput,
  loginRequestSchema,
  loginResponseSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;

const LOGIN_PATH = "/auth/login";
const ME_PATH = "/auth/me";
const LOGOUT_PATH = "/auth/logout";

const FORWARDED_FOR_HEADER = "x-forwarded-for";
const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Nome do cookie de sessão gravado apenas no web (ADR-0008: o browser nunca fala
// com a API — o token viaja como Bearer nas Server Actions). Prefixo `__Host-`
// foi descartado no plan (nome condicional por ambiente, ganho marginal).
export const SESSION_COOKIE_NAME = "clientela_session";

const MILLISECONDS_PER_SECOND = 1000;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
const GENERIC_ERROR_MESSAGE =
  "Não foi possível entrar agora. Verifique sua conexão e tente novamente.";

// Segundos até o `expiresAt` da API (RF-08): a API é a ÚNICA fonte da duração da
// sessão (o web não duplica mais a constante de 30 dias). Floor + mínimo 0; um
// `expiresAt` não-parseável ou no passado vira 0 — fail-safe, NUNCA lança (um
// cookie com maxAge 0 é de sessão/expirado, e o guard rejeita a sessão de todo).
export const sessionCookieMaxAgeSeconds = (
  expiresAt: string,
  now: Date,
): number => {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return 0;
  }
  const remainingSeconds = Math.floor(
    (expiresAtMs - now.getTime()) / MILLISECONDS_PER_SECOND,
  );
  return Math.max(remainingSeconds, 0);
};

// Atributos do cookie de sessão (security.md): `secure` só em produção — em dev
// (http://localhost) `secure` impediria o navegador de gravar o cookie. Testável
// isolando o fator de ambiente (produção vs. dev) e o `maxAge` derivado da API.
export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

export type BuildSessionCookieOptionsInput = {
  isProduction: boolean;
  maxAgeSeconds: number;
};

export const buildSessionCookieOptions = ({
  isProduction,
  maxAgeSeconds,
}: BuildSessionCookieOptionsInput): SessionCookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: maxAgeSeconds,
});

export type AuthFetchDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
};

export type LoginDeps = AuthFetchDeps & {
  // IP do cliente extraído do XFF pela Server Action; repassado à API para
  // preservar o rate limit POR IP do login (RF-08). Ausente → header omitido.
  clientIp?: string;
};

// Resultado discriminado (core.md): a UI/action faz narrowing sem try/catch.
export type LoginResult =
  | { ok: true; token: string; expiresAt: string; consultant: AuthConsultant }
  | { ok: false; message: string };

export type SessionResult =
  | { ok: true; consultant: AuthConsultant }
  | { ok: false };

const loginFailure = (message: string): LoginResult => ({ ok: false, message });

const joinUrl = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(TRAILING_SLASHES, "")}${path}`;

// Extrai a mensagem do envelope de erro conhecido da API; qualquer desvio
// (não-JSON, shape inesperado) cai na mensagem genérica — nunca vaza internals.
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

// Helper puro de login (deps injetadas): valida na fronteira com o schema
// compartilhado, faz POST no servidor e mapeia a resposta para um resultado
// discriminado. NUNCA lança — todo caminho de erro vira `{ ok: false, message }`.
export const login = async (
  values: LoginRequestInput,
  { fetchImpl, apiUrl, clientIp }: LoginDeps,
): Promise<LoginResult> => {
  const parsed = loginRequestSchema.safeParse(values);
  if (!parsed.success) {
    return loginFailure(GENERIC_ERROR_MESSAGE);
  }

  const headers: Record<string, string> = {
    [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
  };
  if (clientIp) {
    headers[FORWARDED_FOR_HEADER] = clientIp;
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, LOGIN_PATH), {
      method: "POST",
      headers,
      body: JSON.stringify(parsed.data),
    });
  } catch {
    return loginFailure(GENERIC_ERROR_MESSAGE);
  }

  if (response.status !== HTTP_OK) {
    return loginFailure(await extractErrorMessage(response));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return loginFailure(GENERIC_ERROR_MESSAGE);
  }

  const body = loginResponseSchema.safeParse(payload);
  if (!body.success) {
    return loginFailure(GENERIC_ERROR_MESSAGE);
  }

  return {
    ok: true,
    token: body.data.token,
    expiresAt: body.data.expiresAt,
    consultant: body.data.consultant,
  };
};

// Valida a sessão contra a API (RF-09, guard do grupo `(crm)`): GET /auth/me com
// Bearer. Qualquer falha (rede, status ≠ 200, corpo malformado) → `{ ok: false }`,
// para o layout redirecionar a `/login` sem vazar detalhes.
export const fetchSession = async (
  token: string,
  { fetchImpl, apiUrl }: AuthFetchDeps,
): Promise<SessionResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, ME_PATH), {
      method: "GET",
      headers: { [AUTHORIZATION_HEADER]: `Bearer ${token}` },
    });
  } catch {
    return { ok: false };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false };
  }

  const parsed = authConsultantSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false };
  }

  return { ok: true, consultant: parsed.data };
};

// Invalida a sessão na API (RF-09): POST /auth/logout com Bearer. Falha de rede
// NÃO lança — o logout local (limpar cookie + redirect) prossegue de qualquer
// forma. Retorna `true` só quando a API confirmou a invalidação.
export const logout = async (
  token: string,
  { fetchImpl, apiUrl }: AuthFetchDeps,
): Promise<boolean> => {
  try {
    const response = await fetchImpl(joinUrl(apiUrl, LOGOUT_PATH), {
      method: "POST",
      headers: { [AUTHORIZATION_HEADER]: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
};
