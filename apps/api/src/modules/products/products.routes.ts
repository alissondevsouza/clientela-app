import {
  createProductSchema,
  productsListQuerySchema,
  updateProductSchema,
} from "@clientela/shared";
import { Elysia } from "elysia";
import { createConsultantResolver, isUuid } from "../../lib/route-auth";
import type { AuthService } from "../auth/auth.service";
import { ProductNotFoundError } from "./products.errors";
import type { ProductsService } from "./products.service";

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const AUTHORIZATION_HEADER = "authorization";

export type ProductsRoutesDeps = {
  service: ProductsService;
  authService: AuthService;
};

// Controller do módulo products (api.md): valida na fronteira com os schemas
// compartilhados e delega a regra ao service — sem tocar repositório nem
// conhecer o banco. Toda operação é escopada pela consultora da sessão (RF-03):
// o `consultantId` sai do token validado (padrão do `/auth/me`), nunca do body.
// O guard global já barra anônimos antes de chegar aqui; a rota revalida o token
// para obter a identidade e não depende do guard (plan.md).
export const createProductsRoutes = ({
  service,
  authService,
}: ProductsRoutesDeps) => {
  const resolveConsultantId = createConsultantResolver(authService);

  // `:id` malformado ⇒ `ProductNotFoundError` (404): a mesma resposta de
  // inexistente, para não vazar o formato interno do id (RF-05). Não usamos
  // schema de params do Elysia porque um id inválido viraria 422 — o contrato
  // aqui é 404.
  const requireValidId = (id: string): string => {
    if (!isUuid(id)) {
      throw new ProductNotFoundError();
    }
    return id;
  };

  return (
    new Elysia()
      .get(
        "/products",
        async ({ request, query }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.list(consultantId, query);
        },
        { query: productsListQuerySchema },
      )
      // `/products/summary` registrada ANTES de `/products/:id` (plan.md): embora
      // "summary" não seja uuid e o `requireValidId` já mapeasse para 404, a ordem
      // deixa a intenção explícita e evita depender só do isUuid.
      .get("/products/summary", async ({ request }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.summary(consultantId);
      })
      .post(
        "/products",
        async ({ request, body, set }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          const product = await service.create(consultantId, body);
          set.status = HTTP_CREATED;
          return product;
        },
        { body: createProductSchema },
      )
      .get("/products/:id", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.getById(consultantId, requireValidId(params.id));
      })
      .patch(
        "/products/:id",
        async ({ request, params, body }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.update(consultantId, requireValidId(params.id), body);
        },
        { body: updateProductSchema },
      )
      .delete("/products/:id", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        await service.remove(consultantId, requireValidId(params.id));
        // Elysia 1.4 lança TypeError ao serializar `undefined`; retornar uma
        // Response explícita entrega 204 sem corpo sem passar pelo serializador.
        return new Response(null, { status: HTTP_NO_CONTENT });
      })
  );
};
