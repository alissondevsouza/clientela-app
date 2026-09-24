import {
  dashboardPeriodQuerySchema,
  updateGoalSchema,
} from "@clientela/shared";
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
//
// `GET /dashboard/summary` saiu (RF-13, crm-home-period-and-daily-hub): as
// três rotas abaixo (`performance`/`today`/`goal`) são o painel novo — a home
// absorveu o resumo antigo em Desempenho + Posição.
export const createDashboardRoutes = ({
  service,
  authService,
}: DashboardRoutesDeps) => {
  const resolveConsultantId = createConsultantResolver(authService);

  return new Elysia()
    .get(
      "/dashboard/performance",
      async ({ request, query }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.getPerformance(consultantId, query);
      },
      { query: dashboardPeriodQuerySchema },
    )
    .get("/dashboard/today", async ({ request }) => {
      const consultantId = await resolveConsultantId(
        request.headers.get(AUTHORIZATION_HEADER),
      );
      return service.getToday(consultantId);
    })
    .put(
      "/dashboard/goal",
      async ({ request, body }) => {
        const consultantId = await resolveConsultantId(
          request.headers.get(AUTHORIZATION_HEADER),
        );
        return service.updateMonthlyGoal(consultantId, body.monthlyGoalCents);
      },
      { body: updateGoalSchema },
    );
};
