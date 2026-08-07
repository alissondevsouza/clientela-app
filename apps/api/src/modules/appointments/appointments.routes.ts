import {
  appointmentConflictsQuerySchema,
  appointmentsListQuerySchema,
  completeAppointmentSchema,
  createAppointmentSchema,
  linkAppointmentSaleSchema,
  updateAppointmentSchema,
} from "@clientela/shared";
import { Elysia } from "elysia";
import { createConsultantResolver, isUuid } from "../../lib/route-auth";
import type { AuthService } from "../auth/auth.service";
import { AppointmentNotFoundError } from "./appointments.errors";
import type { AppointmentsService } from "./appointments.service";

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const AUTHORIZATION_HEADER = "authorization";

// `POST /:id/done` aceita corpo OPCIONAL (`{ saleId }` ou nenhum body) — o
// `.optional()` no topo faz o Elysia aceitar requisição sem body (validado
// empiricamente: sem body ⇒ `body === undefined`, tratado como `{}` no
// handler).
const optionalCompleteAppointmentSchema = completeAppointmentSchema.optional();

export type AppointmentsRoutesDeps = {
  service: AppointmentsService;
  authService: AuthService;
};

// Controller do módulo appointments (api.md): valida na fronteira com os
// schemas compartilhados e delega a regra ao service — sem tocar repositório
// nem conhecer o banco. Toda operação é escopada pela consultora da sessão: o
// `consultantId` sai do token validado, nunca do body (RF-04/RF-13). O guard
// global já barra anônimos (default-deny, ADR-0012); a rota revalida o token
// para obter a identidade.
export const createAppointmentsRoutes = ({
  service,
  authService,
}: AppointmentsRoutesDeps) => {
  const resolveConsultantId = createConsultantResolver(authService);

  // `:id` malformado ⇒ o 404 do domínio certo (mesma resposta de inexistente,
  // para não vazar o formato interno do id) — espelha orders/sales.
  const requireValidAppointmentId = (id: string): string => {
    if (!isUuid(id)) {
      throw new AppointmentNotFoundError();
    }
    return id;
  };

  return (
    new Elysia()
      .post(
        "/appointments",
        async ({ request, body, set }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          const appointment = await service.create(consultantId, body);
          set.status = HTTP_CREATED;
          return appointment;
        },
        { body: createAppointmentSchema },
      )
      .get(
        "/appointments",
        async ({ request, query }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.list(consultantId, query);
        },
        { query: appointmentsListQuerySchema },
      )
      // `/appointments/conflicts` registrada ANTES de `/appointments/:id`
      // (ponto de rigor #8, precedente `sales.routes.ts` §receivables/summary):
      // rota literal tem que ser resolvida antes da paramétrica.
      .get(
        "/appointments/conflicts",
        async ({ request, query }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.findConflicts(consultantId, query);
        },
        { query: appointmentConflictsQuerySchema },
      )
      .get("/appointments/:id", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.getById(
          consultantId,
          requireValidAppointmentId(params.id),
        );
      })
      .put(
        "/appointments/:id",
        async ({ request, params, body }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.update(
            consultantId,
            requireValidAppointmentId(params.id),
            body,
          );
        },
        { body: updateAppointmentSchema },
      )
      .delete("/appointments/:id", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        await service.remove(
          consultantId,
          requireValidAppointmentId(params.id),
        );
        // Elysia 1.4: retornar `undefined` para 204 lança TypeError na
        // serialização (lesson 2026-07-18) — resposta explícita sem corpo.
        return new Response(null, { status: HTTP_NO_CONTENT });
      })
      .post(
        "/appointments/:id/done",
        async ({ request, params, body }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.markDone(
            consultantId,
            requireValidAppointmentId(params.id),
            body ?? {},
          );
        },
        { body: optionalCompleteAppointmentSchema },
      )
      .post("/appointments/:id/no-show", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.markNoShow(
          consultantId,
          requireValidAppointmentId(params.id),
        );
      })
      .post("/appointments/:id/cancel", async ({ request, params }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.cancel(
          consultantId,
          requireValidAppointmentId(params.id),
        );
      })
      .put(
        "/appointments/:id/sale",
        async ({ request, params, body }) => {
          const consultantId = await resolveConsultantId(
            request.headers.get(AUTHORIZATION_HEADER),
          );
          return service.linkSale(
            consultantId,
            requireValidAppointmentId(params.id),
            body,
          );
        },
        { body: linkAppointmentSaleSchema },
      )
  );
};
