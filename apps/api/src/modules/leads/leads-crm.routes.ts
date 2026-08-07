import {
  createLeadCrmSchema,
  leadsListQuerySchema,
  updateLeadStatusSchema,
} from "@clientela/shared";
import { Elysia } from "elysia";
import { createConsultantResolver, isUuid } from "../../lib/route-auth";
import type { AuthService } from "../auth/auth.service";
import { LeadNotFoundError } from "./leads.errors";
import type { LeadsService } from "./leads.service";

const HTTP_CREATED = 201;

const AUTHORIZATION_HEADER = "authorization";

export type LeadsCrmRoutesDeps = {
  service: LeadsService;
  authService: AuthService;
};

// Controller das rotas autenticadas do funil de leads (CRM-04), separado das
// rotas públicas de captura (api.md/plan.md: coesão de domínio, separação
// pública×autenticada explícita no composition root). Valida na fronteira com os
// schemas compartilhados e delega a regra ao service — sem tocar repositório nem
// conhecer o banco. Como o guard global já barra anônimos, cada rota revalida o
// token só para obter a identidade da consultora da sessão (padrão clients).
export const createLeadsCrmRoutes = ({
  service,
  authService,
}: LeadsCrmRoutesDeps) => {
  const resolveConsultantId = createConsultantResolver(authService);

  // `:id` malformado ⇒ `LeadNotFoundError` (404): a mesma resposta de
  // inexistente, para não vazar o formato interno do id. Não usamos schema de
  // params do Elysia porque um id inválido viraria 422 — o contrato aqui é 404.
  const requireValidId = (id: string): string => {
    if (!isUuid(id)) {
      throw new LeadNotFoundError();
    }
    return id;
  };

  return (
    new Elysia()
      .get(
        "/leads",
        async ({ request, query }) => {
          await resolveConsultantId(request.headers.get(AUTHORIZATION_HEADER));
          return service.listForCrm(query);
        },
        { query: leadsListQuerySchema },
      )
      // `/leads/manual` registrada ANTES de `/leads/:id` (convenção de
      // sales.routes.ts: literal antes de paramétrica). RF-24/ADR-0020: rota
      // DISTINTA de `POST /leads` (pública, `leads.routes.ts`) — o Elysia resolve
      // (método, path) duplicados com o último `.use()` composto vencendo para
      // TODA requisição (comprovado empiricamente), então reusar o mesmo path
      // aqui apagaria silenciosamente a captura pública. Autenticada por padrão
      // (guard default-deny) — NÃO entra em `DEFAULT_PUBLIC_ROUTES`.
      .post(
        "/leads/manual",
        async ({ request, body, set }) => {
          await resolveConsultantId(request.headers.get(AUTHORIZATION_HEADER));
          const lead = await service.createManual(body);
          set.status = HTTP_CREATED;
          return lead;
        },
        { body: createLeadCrmSchema },
      )
      .get("/leads/:id", async ({ request, params }) => {
        await resolveConsultantId(request.headers.get(AUTHORIZATION_HEADER));
        return service.getById(requireValidId(params.id));
      })
      .patch(
        "/leads/:id/status",
        async ({ request, params, body }) => {
          await resolveConsultantId(request.headers.get(AUTHORIZATION_HEADER));
          return service.updateStatus(requireValidId(params.id), body.status);
        },
        { body: updateLeadStatusSchema },
      )
      .post("/leads/:id/convert", async ({ request, params, set }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        const client = await service.convertToClient(
          requireValidId(params.id),
          consultantId,
        );
        set.status = HTTP_CREATED;
        return client;
      })
  );
};
