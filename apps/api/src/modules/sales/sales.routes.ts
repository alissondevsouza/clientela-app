import {
  createSaleSchema,
  receivablesListQuerySchema,
  salesListQuerySchema,
} from "@clientela/shared";
import { Elysia } from "elysia";
import { z } from "zod";
import { createConsultantResolver, isUuid } from "../../lib/route-auth";
import type { AuthService } from "../auth/auth.service";
import { ReceivableNotFoundError, SaleNotFoundError } from "./sales.errors";
import type { SalesService } from "./sales.service";

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const AUTHORIZATION_HEADER = "authorization";

const PAID_TYPE_MESSAGE = "Informe se a parcela está paga (true ou false)";

// Contrato mínimo do PATCH de recebível: só o estado `paid` (baixa/estorno). A
// regra de transição (pagar pago, estornar pendente, venda cancelada) é do
// service/repository — aqui só validamos a fronteira (api.md).
const setReceivablePaidSchema = z.object({
  paid: z.boolean({ error: PAID_TYPE_MESSAGE }),
});

export type SalesRoutesDeps = {
  service: SalesService;
  authService: AuthService;
};

// Controller do módulo sales/recebíveis (api.md): valida na fronteira com os
// schemas compartilhados e delega a regra ao service — sem tocar repositório nem
// conhecer o banco. Toda operação é escopada pela consultora da sessão: o
// `consultantId` sai do token validado (padrão do `/auth/me`), nunca do body. O
// guard global já barra anônimos; a rota revalida o token para obter a identidade.
export const createSalesRoutes = ({
  service,
  authService,
}: SalesRoutesDeps) => {
  const resolveConsultantId = createConsultantResolver(authService);

  // `:id` malformado ⇒ o 404 do domínio certo (a mesma resposta de inexistente,
  // para não vazar o formato interno do id). Não usamos schema de params do
  // Elysia porque um id inválido viraria 422 — o contrato aqui é 404.
  const requireValidSaleId = (id: string): string => {
    if (!isUuid(id)) {
      throw new SaleNotFoundError();
    }
    return id;
  };

  const requireValidReceivableId = (id: string): string => {
    if (!isUuid(id)) {
      throw new ReceivableNotFoundError();
    }
    return id;
  };

  return (
    new Elysia()
      .post(
        "/sales",
        async ({ request, body, set }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          const sale = await service.create(consultantId, body);
          set.status = HTTP_CREATED;
          return sale;
        },
        { body: createSaleSchema },
      )
      .get(
        "/sales",
        async ({ request, query }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.list(consultantId, query);
        },
        { query: salesListQuerySchema },
      )
      .get("/sales/:id", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.getById(consultantId, requireValidSaleId(params.id));
      })
      // RF-08 a RF-13: exclusão definitiva (reversão de estoque + DELETE numa
      // única transação, sales.repository.ts). 204 explícito via `new
      // Response` — `set.status = 204` com retorno `undefined` derruba o
      // request com TypeError na serialização (lesson 2026-07-18, Elysia 1.4).
      .delete("/sales/:id", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        await service.remove(consultantId, requireValidSaleId(params.id));
        return new Response(null, { status: HTTP_NO_CONTENT });
      })
      .post("/sales/:id/cancel", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.cancel(consultantId, requireValidSaleId(params.id));
      })
      .post("/sales/:id/deliver", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.deliver(consultantId, requireValidSaleId(params.id));
      })
      // `/receivables/summary` registrada ANTES de `/receivables/:id` (plan.md):
      // "summary" não é uuid e o `requireValidReceivableId` já mapearia para 404,
      // mas a ordem deixa a intenção explícita e evita depender só do isUuid.
      .get("/receivables/summary", async ({ request }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.receivablesSummary(consultantId);
      })
      .get(
        "/receivables",
        async ({ request, query }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.listReceivables(consultantId, query);
        },
        { query: receivablesListQuerySchema },
      )
      .patch(
        "/receivables/:id",
        async ({ request, params, body }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.setReceivablePaid(
            consultantId,
            requireValidReceivableId(params.id),
            body.paid,
          );
        },
        { body: setReceivablePaidSchema },
      )
  );
};
