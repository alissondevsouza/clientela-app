import { updateGoalSchema } from "@clientela/shared";
import { Elysia } from "elysia";
import { createConsultantResolver } from "../../lib/route-auth";
import type { AuthService } from "../auth/auth.service";
import type { DashboardService } from "./dashboard.service";

const AUTHORIZATION_HEADER = "authorization";

export type DashboardRoutesDeps = {
  service: DashboardService;
  authService: AuthService;
};

// Controller do módulo dashboard (api.md): valida na fronteira com o schema
// compartilhado e delega a regra ao service — sem tocar repositório nem
// conhecer o banco. Toda operação é escopada pela consultora da sessão: o
// `consultantId` sai do token validado (padrão do `/auth/me`), nunca do body.
// O guard global já barra anônimos (default-deny — security.md); a rota
// revalida o token para obter a identidade.
export const createDashboardRoutes = ({
  service,
  authService,
}: DashboardRoutesDeps) => {
  const resolveConsultantId = createConsultantResolver(authService);

  return new Elysia()
    .get("/dashboard/summary", async ({ request }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      return service.getSummary(consultantId);
    })
    .put(
      "/dashboard/goal",
      async ({ request, body }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        const monthlyGoalCents = await service.updateGoal(consultantId, body);
        return { monthlyGoalCents };
      },
      { body: updateGoalSchema },
    );
};
