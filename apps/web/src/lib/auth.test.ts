import type { LoginRequestInput } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  buildSessionCookieOptions,
  fetchSession,
  login,
  logout,
  SESSION_COOKIE_NAME,
  sessionCookieMaxAgeSeconds,
} from "./auth";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";

const validCredentials: LoginRequestInput = {
  email: "consultora@example.com",
  password: "senha-secreta",
};

const consultant = {
  id: "018f3a2b-7c1d-7e2f-9a4b-1c2d3e4f5a6b",
  name: "Mary Kay",
  email: "consultora@example.com",
};

const loginSuccessBody = {
  token: "opaque-session-token",
  expiresAt: "2026-08-16T12:00:00.000Z",
  consultant,
};

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

// Fetch fake que registra as chamadas e delega a resposta a um responder
// (testing.md: fake explícito injetado, sem vi.mock). O responder pode lançar
// para simular queda de rede.
const stubFetch = (
  responder: () => Response,
): { fetchImpl: FetchImpl; calls: FetchCall[] } => {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchImpl = async (input, init) => {
    calls.push({ url: String(input), init });
    return responder();
  };
  return { fetchImpl, calls };
};

const headerValue = (
  init: RequestInit | undefined,
  key: string,
): string | null => {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    return null;
  }
  return headers[key] ?? null;
};

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

describe("buildSessionCookieOptions", () => {
  it("em produção marca secure e usa o maxAge derivado da API", () => {
    const options = buildSessionCookieOptions({
      isProduction: true,
      maxAgeSeconds: THIRTY_DAYS_SECONDS,
    });

    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS_SECONDS,
    });
  });

  it("fora de produção desativa secure (http localhost) sem mudar o resto", () => {
    const options = buildSessionCookieOptions({
      isProduction: false,
      maxAgeSeconds: THIRTY_DAYS_SECONDS,
    });

    expect(options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS_SECONDS,
    });
  });

  it("usa o nome de cookie esperado", () => {
    expect(SESSION_COOKIE_NAME).toBe("clientela_session");
  });
});

describe("sessionCookieMaxAgeSeconds", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("converte um expiresAt 30 dias no futuro para os segundos correspondentes", () => {
    const expiresAt = new Date(
      now.getTime() + THIRTY_DAYS_SECONDS * 1000,
    ).toISOString();

    expect(sessionCookieMaxAgeSeconds(expiresAt, now)).toBe(
      THIRTY_DAYS_SECONDS,
    );
  });

  it("arredonda para baixo quando faltam segundos fracionários", () => {
    const expiresAt = new Date(now.getTime() + 90_500).toISOString();

    expect(sessionCookieMaxAgeSeconds(expiresAt, now)).toBe(90);
  });

  it("retorna 0 quando o expiresAt já passou (fail-safe)", () => {
    const expiresAt = new Date(now.getTime() - 1000).toISOString();

    expect(sessionCookieMaxAgeSeconds(expiresAt, now)).toBe(0);
  });

  it("retorna 0 sem lançar quando o expiresAt não é parseável", () => {
    expect(sessionCookieMaxAgeSeconds("nao-e-data", now)).toBe(0);
  });
});

describe("login", () => {
  it("chama /auth/login com body validado e retorna os dados da sessão", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(loginSuccessBody), { status: 200 }),
    );

    const result = await login(validCredentials, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({
      ok: true,
      token: loginSuccessBody.token,
      expiresAt: loginSuccessBody.expiresAt,
      consultant,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:3001/auth/login");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify(validCredentials));
  });

  it("repassa o x-forwarded-for quando clientIp é fornecido", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(loginSuccessBody), { status: 200 }),
    );

    await login(validCredentials, {
      fetchImpl,
      apiUrl: API_URL,
      clientIp: "203.0.113.9",
    });

    expect(headerValue(calls[0]?.init, "x-forwarded-for")).toBe("203.0.113.9");
  });

  it("omite o x-forwarded-for quando clientIp está ausente", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(loginSuccessBody), { status: 200 }),
    );

    await login(validCredentials, { fetchImpl, apiUrl: API_URL });

    expect(headerValue(calls[0]?.init, "x-forwarded-for")).toBeNull();
  });

  it("não chama a API quando as credenciais são inválidas na fronteira", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(loginSuccessBody), { status: 200 }),
    );

    const result = await login(
      { email: "nao-e-email", password: "" },
      { fetchImpl, apiUrl: API_URL },
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("repassa a mensagem do envelope de erro da API em 401", async () => {
    const envelope = {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "E-mail ou senha inválidos.",
      },
    };
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify(envelope), { status: 401 }),
    );

    const result = await login(validCredentials, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({
      ok: false,
      message: "E-mail ou senha inválidos.",
    });
  });

  it("retorna mensagem genérica pt-BR quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ token: 123 }), { status: 200 }),
    );

    const result = await login(validCredentials, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha (não lança)", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await login(validCredentials, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("fetchSession", () => {
  it("valida a sessão via /auth/me com Bearer e retorna a consultora", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(consultant), { status: 200 }),
    );

    const result = await fetchSession("session-token", {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({ ok: true, consultant });
    expect(calls[0]?.url).toBe("http://localhost:3001/auth/me");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      "Bearer session-token",
    );
  });

  it("retorna ok:false em 401", async () => {
    const { fetchImpl } = stubFetch(() => new Response("", { status: 401 }));

    const result = await fetchSession("expired-token", {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({ ok: false });
  });

  it("retorna ok:false quando o corpo do 200 é malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await fetchSession("session-token", {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({ ok: false });
  });

  it("retorna ok:false quando a rede falha (não lança)", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await fetchSession("session-token", {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({ ok: false });
  });
});

describe("logout", () => {
  it("invalida a sessão via /auth/logout com Bearer e retorna true no sucesso", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response("", { status: 200 }),
    );

    const result = await logout("session-token", {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toBe(true);
    expect(calls[0]?.url).toBe("http://localhost:3001/auth/logout");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      "Bearer session-token",
    );
  });

  it("retorna false sem lançar quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await logout("session-token", {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toBe(false);
  });

  it("retorna false quando a API responde erro", async () => {
    const { fetchImpl } = stubFetch(() => new Response("", { status: 500 }));

    const result = await logout("session-token", {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toBe(false);
  });
});
