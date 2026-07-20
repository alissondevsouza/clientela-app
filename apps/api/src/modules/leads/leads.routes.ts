import { type ApiError, leadCaptureRequestSchema } from "@clientela/shared";
import { Elysia } from "elysia";
import { type RateLimiter, resolveClientIp } from "../../plugins/rate-limit";
import type { LeadsService } from "./leads.service";

const HTTP_CREATED = 201;
const HTTP_TOO_MANY_REQUESTS = 429;

const LEADS_PATH = "/leads";
const CAPTURE_METHOD = "POST";
const FORWARDED_FOR_HEADER = "x-forwarded-for";

const RATE_LIMITED_CODE = "RATE_LIMITED";
export const RATE_LIMITED_MESSAGE =
  "Muitas solicitações em pouco tempo. Aguarde um instante e tente novamente.";

const rateLimitError: ApiError = {
  error: { code: RATE_LIMITED_CODE, message: RATE_LIMITED_MESSAGE },
};

const TRAILING_SLASHES = /\/+$/;

// O rate limit é exclusivo do endpoint público de captura: `POST /leads`. Só
// esse par (método, path) consome o bucket do visitante. `GET /leads`,
// `PATCH /leads/:id/status`, `POST /leads/:id/convert` e demais rotas
// autenticadas do CRM-04 compartilham o prefixo `/leads`, mas NÃO podem cair no
// limite do visitante (RF-05 — fecha o known-issue "rate limit cobre qualquer
// método").
//
// O roteador do Elysia (strictPath desligado por default) entrega tanto `/leads`
// quanto `/leads/` — e `/leads/?x=1` — ao mesmo handler. Como o rate limit roda
// num hook (`onRequest`, antes do roteamento), comparar o pathname por igualdade
// exata deixava `/leads/` escapar do limite. Normalizamos removendo as barras
// finais (o pathname já exclui a query string) para que TODA variante de URL do
// POST de captura seja limitada — e só ela.
const isPublicLeadCapture = (method: string, pathname: string): boolean =>
  method === CAPTURE_METHOD &&
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
// limite. Como `onRequest` dispara antes do roteamento, a guarda por (método,
// path) restringe o limite ao `POST /leads` público — sem afetar `/health` nem
// as rotas autenticadas de leads do CRM-04.
export const createLeadsRoutes = ({ service, rateLimiter }: LeadsRoutesDeps) =>
  new Elysia()
    .onRequest(({ request, server, set }) => {
      if (!isPublicLeadCapture(request.method, new URL(request.url).pathname)) {
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
