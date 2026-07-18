import type { AuthConsultant } from "@clientela/shared";
import { Elysia } from "elysia";
import { describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../modules/auth/auth.errors";
import type { AuthService } from "../modules/auth/auth.service";
import {
  createAuthGuard,
  DEFAULT_PUBLIC_ROUTES,
  isPublicRoute,
  type PublicRoute,
} from "./auth-guard";

const PUBLIC_ROUTES: readonly PublicRoute[] = DEFAULT_PUBLIC_ROUTES;

describe("isPublicRoute", () => {
  it("reconhece uma rota pública por método e path exatos", () => {
    expect(isPublicRoute("POST", "/auth/login", PUBLIC_ROUTES)).toBe(true);
    expect(isPublicRoute("GET", "/health", PUBLIC_ROUTES)).toBe(true);
    expect(isPublicRoute("POST", "/leads", PUBLIC_ROUTES)).toBe(true);
  });

  it("ignora trailing slash ao comparar o path (sem bypass)", () => {
    expect(isPublicRoute("POST", "/auth/login/", PUBLIC_ROUTES)).toBe(true);
    expect(isPublicRoute("GET", "/health//", PUBLIC_ROUTES)).toBe(true);
  });

  it("não considera a query string (o pathname já a exclui)", () => {
    // O pathname cru de uma URL nunca inclui a query; ainda assim comparamos o
    // path puro para deixar explícito que `?x=1` não participa do matching.
    expect(isPublicRoute("GET", "/health", PUBLIC_ROUTES)).toBe(true);
  });

  it("compara o método: GET /leads NÃO é público (só POST)", () => {
    expect(isPublicRoute("GET", "/leads", PUBLIC_ROUTES)).toBe(false);
    expect(isPublicRoute("DELETE", "/auth/login", PUBLIC_ROUTES)).toBe(false);
  });

  it("normaliza o case do método antes de comparar", () => {
    expect(isPublicRoute("post", "/auth/login", PUBLIC_ROUTES)).toBe(true);
    expect(isPublicRoute("get", "/health", PUBLIC_ROUTES)).toBe(true);
  });

  it("trata path não listado como não-público (default-deny)", () => {
    expect(isPublicRoute("GET", "/auth/me", PUBLIC_ROUTES)).toBe(false);
    expect(isPublicRoute("POST", "/auth/logout", PUBLIC_ROUTES)).toBe(false);
    expect(isPublicRoute("GET", "/clients", PUBLIC_ROUTES)).toBe(false);
  });
});

const CONSULTANT: AuthConsultant = {
  id: "0191f000-0000-7000-8000-000000000000",
  name: "Consultora",
  email: "consultora@example.com",
};

// Fake explícito do service (testing.md: injeção por construtor dispensa mock de
// módulo). `validateSession` decide o cenário; login/logout existem só para
// satisfazer o tipo — o guard não os usa.
const createFakeAuthService = (
  validateSession: AuthService["validateSession"],
): { service: AuthService; validateCalls: () => number } => {
  const spy = vi.fn(validateSession);
  const service: AuthService = {
    login: vi.fn(),
    logout: vi.fn(),
    validateSession: spy,
  };
  return { service, validateCalls: () => spy.mock.calls.length };
};

const buildApp = (service: AuthService) =>
  new Elysia()
    .use(createAuthGuard({ authService: service }))
    .get("/health", () => ({ status: "ok" }))
    .get("/auth/me", () => ({ consultant: CONSULTANT }));

const request = (
  app: ReturnType<typeof buildApp>,
  path: string,
  headers?: Record<string, string>,
) => app.handle(new Request(`http://localhost${path}`, { headers }));

describe("createAuthGuard", () => {
  it("rejeita requisição não-pública sem header Authorization com 401", async () => {
    const { service, validateCalls } = createFakeAuthService(
      async () => CONSULTANT,
    );
    const app = buildApp(service);

    const response = await request(app, "/auth/me");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Sessão inválida ou expirada." },
    });
    expect(validateCalls()).toBe(0);
  });

  it("rejeita header sem esquema Bearer com 401 sem chamar o service", async () => {
    const { service, validateCalls } = createFakeAuthService(
      async () => CONSULTANT,
    );
    const app = buildApp(service);

    const response = await request(app, "/auth/me", {
      authorization: "Basic abc",
    });

    expect(response.status).toBe(401);
    expect(validateCalls()).toBe(0);
  });

  it("rejeita token inválido (service lança UnauthorizedError) com 401", async () => {
    const { service } = createFakeAuthService(async () => {
      throw new UnauthorizedError();
    });
    const app = buildApp(service);

    const response = await request(app, "/auth/me", {
      authorization: "Bearer token-invalido",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Sessão inválida ou expirada." },
    });
  });

  it("deixa o handler rodar quando o Bearer é válido", async () => {
    const { service, validateCalls } = createFakeAuthService(
      async () => CONSULTANT,
    );
    const app = buildApp(service);

    const response = await request(app, "/auth/me", {
      authorization: "Bearer token-valido",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ consultant: CONSULTANT });
    expect(validateCalls()).toBe(1);
  });

  it("deixa rota pública passar sem chamar o service", async () => {
    const { service, validateCalls } = createFakeAuthService(
      async () => CONSULTANT,
    );
    const app = buildApp(service);

    const response = await request(app, "/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(validateCalls()).toBe(0);
  });
});
