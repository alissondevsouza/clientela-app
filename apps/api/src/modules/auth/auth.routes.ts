import {
  type ApiError,
  type LoginResponse,
  loginRequestSchema,
} from "@clientela/shared";
import { Elysia } from "elysia";
import { extractBearerToken } from "../../lib/route-auth";
import { type RateLimiter, resolveClientIp } from "../../plugins/rate-limit";
import { UnauthorizedError } from "./auth.errors";
import type { AuthService } from "./auth.service";

const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;

// Rate limit de login mais restrito que o de leads (anti brute-force — plan.md):
// 5 tentativas/min por IP, em instância separada (janelas independentes). O IP
// chega via `x-forwarded-for` repassado pelo web (ADR-0008: browser não fala com
// a API). Exportado para o composition root e para o teste de integração (2.4).
export const LOGIN_RATE_LIMIT_MAX = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;

const LOGIN_PATH = "/auth/login";
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const AUTHORIZATION_HEADER = "authorization";

const RATE_LIMITED_CODE = "RATE_LIMITED";
export const LOGIN_RATE_LIMITED_MESSAGE =
  "Muitas tentativas de login em pouco tempo. Aguarde um instante e tente novamente.";

const rateLimitError: ApiError = {
  error: { code: RATE_LIMITED_CODE, message: LOGIN_RATE_LIMITED_MESSAGE },
};

const TRAILING_SLASHES = /\/+$/;

// Mesma técnica anti trailing-slash do módulo leads: o rate limit roda num hook
// `onRequest` (antes do roteamento), então normalizamos as barras finais para
// que `/auth/login/` não escape do limite. A query já não faz parte do pathname.
const matchesLoginPath = (pathname: string): boolean =>
  pathname.replace(TRAILING_SLASHES, "") === LOGIN_PATH;

export type AuthRoutesDeps = {
  service: AuthService;
  loginRateLimiter: RateLimiter;
};

// Controller do módulo auth (api.md): valida na fronteira com o schema
// compartilhado e delega a regra ao service — sem tocar repositório nem conhecer
// o banco. Nunca loga token/senha (RF-11).
//
// O rate limit de login roda em `onRequest` (antes do parse e da validação):
// bodies inválidos também consomem a janela, então um flood de 422 acaba em 429.
// A guarda por path restringe o limite ao endpoint `/auth/login`.
export const createAuthRoutes = ({
  service,
  loginRateLimiter,
}: AuthRoutesDeps) =>
  new Elysia()
    .onRequest(({ request, server, set }) => {
      if (!matchesLoginPath(new URL(request.url).pathname)) {
        return;
      }

      const clientIp = resolveClientIp(
        request.headers.get(FORWARDED_FOR_HEADER),
        server?.requestIP(request)?.address ?? null,
      );

      if (!loginRateLimiter.check(clientIp).allowed) {
        set.status = HTTP_TOO_MANY_REQUESTS;
        return rateLimitError;
      }
    })
    .post(
      "/auth/login",
      async ({ body, set }): Promise<LoginResponse> => {
        const result = await service.login(body.email, body.password);
        set.status = HTTP_OK;
        // O service devolve `expiresAt` como Date; o contrato usa ISO 8601.
        return {
          token: result.token,
          expiresAt: result.expiresAt.toISOString(),
          consultant: result.consultant,
        };
      },
      { body: loginRequestSchema },
    )
    // Responde os dados públicos da consultora SEM envelope: o helper do web
    // parseia o corpo com `authConsultantSchema` direto (contrato fixado aqui).
    .get("/auth/me", ({ request }) => {
      const token = extractBearerToken(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      if (!token) {
        throw new UnauthorizedError();
      }
      return service.validateSession(token);
    })
    .post("/auth/logout", async ({ request }) => {
      const token = extractBearerToken(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      if (!token) {
        throw new UnauthorizedError();
      }
      // Logout idempotente (RF-05): remover sessão inexistente não é erro.
      await service.logout(token);
      return { ok: true };
    });
