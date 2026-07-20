import type { ApiError } from "@clientela/shared";
import { Elysia } from "elysia";
import { extractBearerToken } from "../lib/route-auth";
import { UnauthorizedError } from "../modules/auth/auth.errors";
import type { AuthService } from "../modules/auth/auth.service";

const HTTP_UNAUTHORIZED = 401;

const UNAUTHORIZED_CODE = "UNAUTHORIZED";
// Mensagem genérica pt-BR (RF-04/RF-11): não revela se faltou header, se o token
// é desconhecido ou se a sessão expirou — nunca expõe internals.
export const UNAUTHORIZED_MESSAGE = "Sessão inválida ou expirada.";

const unauthorizedError: ApiError = {
  error: { code: UNAUTHORIZED_CODE, message: UNAUTHORIZED_MESSAGE },
};

const AUTHORIZATION_HEADER = "authorization";

const TRAILING_SLASHES = /\/+$/;

// Rota pública é um par (método, path): o método importa — `GET /leads` NÃO é
// público, só `POST /leads` (RF-04). O path é comparado normalizado.
export type PublicRoute = {
  method: string;
  path: string;
};

// Allowlist pública explícita (default-deny — security.md/RF-04): toda rota fora
// desta lista exige sessão válida. Exceções hoje: health check e os dois
// endpoints públicos (captura de lead e login).
export const DEFAULT_PUBLIC_ROUTES: readonly PublicRoute[] = [
  { method: "GET", path: "/health" },
  { method: "POST", path: "/leads" },
  { method: "POST", path: "/auth/login" },
] as const;

// Normaliza o pathname cru antes de comparar: o roteador non-strict do Elysia
// entrega `/health`, `/health/` e `/health//` ao mesmo handler, mas o pathname
// cru não é normalizado — comparar por igualdade exata abriria bypass do guard
// via trailing slash (lesson Elysia 2026-07-17). A query string já não faz parte
// do pathname. O método é comparado case-insensitive (HTTP é maiúsculo, mas
// normalizamos para não depender disso).
export const isPublicRoute = (
  method: string,
  pathname: string,
  publicRoutes: readonly PublicRoute[],
): boolean => {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = pathname.replace(TRAILING_SLASHES, "");

  return publicRoutes.some(
    (route) =>
      route.method.toUpperCase() === normalizedMethod &&
      route.path.replace(TRAILING_SLASHES, "") === normalizedPath,
  );
};

export type AuthGuardDeps = {
  authService: AuthService;
  publicRoutes?: readonly PublicRoute[];
};

// Guard de autenticação da API (RF-04): hook `onRequest` fail-closed. Roda antes
// do roteamento e da validação do body (lesson Elysia: `beforeHandle` roda
// depois da validação e vazaria 422 a anônimos), então filtramos por
// (método, path) contra a allowlist. Requisição não-pública sem sessão válida
// recebe 401 imediato no envelope padrão — nunca logamos o token (RF-11).
export const createAuthGuard = ({
  authService,
  publicRoutes = DEFAULT_PUBLIC_ROUTES,
}: AuthGuardDeps) =>
  new Elysia({ name: "auth-guard" })
    .onRequest(async ({ request, set }) => {
      const { pathname } = new URL(request.url);

      if (isPublicRoute(request.method, pathname, publicRoutes)) {
        return;
      }

      const token = extractBearerToken(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      if (!token) {
        set.status = HTTP_UNAUTHORIZED;
        return unauthorizedError;
      }

      try {
        await authService.validateSession(token);
      } catch (error) {
        // Sessão desconhecida/expirada ⇒ 401. Erros inesperados sobem para o
        // error-handler central (vira 500) — não os mascaramos como 401.
        if (error instanceof UnauthorizedError) {
          set.status = HTTP_UNAUTHORIZED;
          return unauthorizedError;
        }
        throw error;
      }
    })
    // `as("global")` propaga o hook para toda a árvore do app onde o plugin é
    // composto (antes das rotas) — sem isso, o guard ficaria restrito ao escopo
    // local e não protegeria as rotas dos outros módulos.
    .as("global");
