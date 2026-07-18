import { type ApiError, leadCaptureRequestSchema } from "@clientela/shared";
import { Elysia } from "elysia";
import { type RateLimiter, resolveClientIp } from "../../plugins/rate-limit";
import type { LeadsService } from "./leads.service";

const HTTP_CREATED = 201;
const HTTP_TOO_MANY_REQUESTS = 429;

const LEADS_PATH = "/leads";
const FORWARDED_FOR_HEADER = "x-forwarded-for";

const RATE_LIMITED_CODE = "RATE_LIMITED";
export const RATE_LIMITED_MESSAGE =
  "Muitas solicitações em pouco tempo. Aguarde um instante e tente novamente.";

const rateLimitError: ApiError = {
  error: { code: RATE_LIMITED_CODE, message: RATE_LIMITED_MESSAGE },
};

const TRAILING_SLASHES = /\/+$/;

// O roteador do Elysia (strictPath desligado por default) entrega tanto `/leads`
// quanto `/leads/` — e `/leads/?x=1` — ao mesmo handler. Como o rate limit roda
// num hook global (`onRequest`, antes do roteamento), comparar o pathname por
// igualdade exata deixava `/leads/` escapar do limite. Normalizamos removendo as
// barras finais (o pathname já exclui a query string) para que TODA variante de
// URL que alcança a rota seja limitada — sem afetar `/health` ou outras rotas.
const matchesLeadsPath = (pathname: string): boolean =>
  pathname.replace(TRAILING_SLASHES, "") === LEADS_PATH;

export type LeadsRoutesDeps = {
  service: LeadsService;
  rateLimiter: RateLimiter;
};

// Controller do módulo leads (api.md): valida na fronteira com o schema
// compartilhado, aplica rate limit por IP e delega a regra ao service — sem
// tocar repositório nem conhecer o banco.
//
// O rate limit roda em `onRequest` (primeiro hook do ciclo, antes do parse e da
// validação do body): assim payload inválido também consome a janela e um flood
// de 422 acaba recebendo 429 (RF-05). `beforeHandle` rodaria depois da
// validação (comprovado empiricamente), deixando bodies inválidos escaparem do
// limite. Como `onRequest` dispara antes do roteamento (é global), a guarda por
// path restringe o limite ao endpoint público `/leads`, sem afetar `/health`.
export const createLeadsRoutes = ({ service, rateLimiter }: LeadsRoutesDeps) =>
  new Elysia()
    .onRequest(({ request, server, set }) => {
      if (!matchesLeadsPath(new URL(request.url).pathname)) {
        return;
      }

      const clientIp = resolveClientIp(
        request.headers.get(FORWARDED_FOR_HEADER),
        server?.requestIP(request)?.address ?? null,
      );

      if (!rateLimiter.check(clientIp).allowed) {
        set.status = HTTP_TOO_MANY_REQUESTS;
        return rateLimitError;
      }
    })
    .post(
      "/leads",
      async ({ body, set }) => {
        const result = await service.capture(body);
        set.status = HTTP_CREATED;
        return result;
      },
      { body: leadCaptureRequestSchema },
    );
