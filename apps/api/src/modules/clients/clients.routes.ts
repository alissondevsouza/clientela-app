import {
  clientsListQuerySchema,
  createClientSchema,
  updateClientSchema,
} from "@clientela/shared";
import { Elysia } from "elysia";
import { UnauthorizedError } from "../auth/auth.errors";
import type { AuthService } from "../auth/auth.service";
import { ClientNotFoundError } from "./clients.errors";
import type { ClientsService } from "./clients.service";

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const AUTHORIZATION_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";

// Formato uuid genérico (qualquer versão): o `:id` do banco é uuid v7, mas o
// que importa aqui é rejeitar formato inválido antes de consultar o banco.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Espelha `extractBearerToken` do auth-guard e do módulo auth: header ausente,
// esquema diferente de Bearer ou token vazio ⇒ `null`.
const extractBearerToken = (authorization: string | null): string | null => {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
};

export type ClientsRoutesDeps = {
  service: ClientsService;
  authService: AuthService;
};

// Controller do módulo clients (api.md): valida na fronteira com os schemas
// compartilhados e delega a regra ao service — sem tocar repositório nem
// conhecer o banco. Toda operação é escopada pela consultora da sessão (RF-04):
// o `consultantId` sai do token validado (padrão do `/auth/me`), nunca do body.
// O guard global já barra anônimos antes de chegar aqui; a rota revalida o token
// para obter a identidade e não depende do guard (plan.md).
export const createClientsRoutes = ({
  service,
  authService,
}: ClientsRoutesDeps) => {
  const resolveConsultantId = async (
    authorization: string | null,
  ): Promise<string> => {
    const token = extractBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedError();
    }
    const consultant = await authService.validateSession(token);
    return consultant.id;
  };

  // `:id` malformado ⇒ `ClientNotFoundError` (404): a mesma resposta de
  // inexistente, para não vazar o formato interno do id (RF-05). Não usamos
  // schema de params do Elysia porque um id inválido viraria 422 — o contrato
  // aqui é 404.
  const requireValidId = (id: string): string => {
    if (!UUID_REGEX.test(id)) {
      throw new ClientNotFoundError();
    }
    return id;
  };

  return new Elysia()
    .get(
      "/clients",
      async ({ request, query }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.list(consultantId, query);
      },
      { query: clientsListQuerySchema },
    )
    .post(
      "/clients",
      async ({ request, body, set }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        const client = await service.create(consultantId, body);
        set.status = HTTP_CREATED;
        return client;
      },
      { body: createClientSchema },
    )
    .get("/clients/:id", async ({ request, params }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      return service.getById(consultantId, requireValidId(params.id));
    })
    .patch(
      "/clients/:id",
      async ({ request, params, body }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.update(consultantId, requireValidId(params.id), body);
      },
      { body: updateClientSchema },
    )
    .delete("/clients/:id", async ({ request, params }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      await service.remove(consultantId, requireValidId(params.id));
      // Elysia 1.4 lança TypeError ao serializar `undefined`; retornar uma
      // Response explícita entrega 204 sem corpo sem passar pelo serializador.
      return new Response(null, { status: HTTP_NO_CONTENT });
    });
};
