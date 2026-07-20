import {
  createOrderSchema,
  ordersListQuerySchema,
  replaceOrderItemsSchema,
} from "@clientela/shared";
import { Elysia } from "elysia";
import { createConsultantResolver, isUuid } from "../../lib/route-auth";
import type { AuthService } from "../auth/auth.service";
import { OrderNotFoundError } from "./orders.errors";
import type { OrdersService } from "./orders.service";

const HTTP_CREATED = 201;

const AUTHORIZATION_HEADER = "authorization";

export type OrdersRoutesDeps = {
  service: OrdersService;
  authService: AuthService;
};

// Controller do módulo orders (api.md): valida na fronteira com os schemas
// compartilhados e delega a regra ao service — sem tocar repositório nem
// conhecer o banco. Toda operação é escopada pela consultora da sessão: o
// `consultantId` sai do token validado (padrão do `/auth/me`), nunca do body.
// O guard global já barra anônimos (default-deny, ADR-0012); a rota revalida o
// token para obter a identidade.
export const createOrdersRoutes = ({
  service,
  authService,
}: OrdersRoutesDeps) => {
  const resolveConsultantId = createConsultantResolver(authService);

  // `:id` malformado ⇒ o 404 do domínio certo (mesma resposta de inexistente,
  // para não vazar o formato interno do id) — espelha sales/products.
  const requireValidOrderId = (id: string): string => {
    if (!isUuid(id)) {
      throw new OrderNotFoundError();
    }
    return id;
  };

  return new Elysia()
    .post(
      "/orders",
      async ({ request, body, set }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        const order = await service.create(consultantId, body);
        set.status = HTTP_CREATED;
        return order;
      },
      { body: createOrderSchema },
    )
    .get(
      "/orders",
      async ({ request, query }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.list(consultantId, query);
      },
      { query: ordersListQuerySchema },
    )
    .get("/orders/:id", async ({ request, params }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      return service.getById(consultantId, requireValidOrderId(params.id));
    })
    .put(
      "/orders/:id/items",
      async ({ request, params, body }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.replaceItems(
          consultantId,
          requireValidOrderId(params.id),
          body,
        );
      },
      { body: replaceOrderItemsSchema },
    )
    .post("/orders/:id/place", async ({ request, params }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      return service.place(consultantId, requireValidOrderId(params.id));
    })
    .post("/orders/:id/deliver", async ({ request, params }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      return service.deliver(consultantId, requireValidOrderId(params.id));
    })
    .post("/orders/:id/cancel", async ({ request, params }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      return service.cancel(consultantId, requireValidOrderId(params.id));
    });
};
