import { Elysia } from "elysia";
import { createAppointmentsRoutes } from "./modules/appointments/appointments.routes";
import type { AppointmentsService } from "./modules/appointments/appointments.service";
import { createAuthRoutes } from "./modules/auth/auth.routes";
import type { AuthService } from "./modules/auth/auth.service";
import { createClientsRoutes } from "./modules/clients/clients.routes";
import type { ClientsService } from "./modules/clients/clients.service";
import { createDashboardRoutes } from "./modules/dashboard/dashboard.routes";
import type { DashboardService } from "./modules/dashboard/dashboard.service";
import { createLeadsRoutes } from "./modules/leads/leads.routes";
import type { LeadsService } from "./modules/leads/leads.service";
import { createLeadsCrmRoutes } from "./modules/leads/leads-crm.routes";
import { createOrdersRoutes } from "./modules/orders/orders.routes";
import type { OrdersService } from "./modules/orders/orders.service";
import { createProductsRoutes } from "./modules/products/products.routes";
import type { ProductsService } from "./modules/products/products.service";
import { createSalesRoutes } from "./modules/sales/sales.routes";
import type { SalesService } from "./modules/sales/sales.service";
import { createAuthGuard } from "./plugins/auth-guard";
import { errorHandler } from "./plugins/error-handler";
import type { RateLimiter } from "./plugins/rate-limit";

export type AppDeps = {
  leadsService: LeadsService;
  rateLimiter: RateLimiter;
  authService: AuthService;
  loginRateLimiter: RateLimiter;
  clientsService: ClientsService;
  productsService: ProductsService;
  salesService: SalesService;
  ordersService: OrdersService;
  dashboardService: DashboardService;
  appointmentsService: AppointmentsService;
};

// Montagem do app com dependências injetadas (composition root em index.ts as
// instancia). Ordem: error handler global → guard de autenticação (default-deny,
// allowlist pública) → rotas. O guard usa `.as("global")`, então protege TODAS
// as rotas compostas depois dele; as públicas (`/health`, `POST /leads`,
// `POST /auth/login`) estão na allowlist do próprio guard.
export const createApp = ({
  leadsService,
  rateLimiter,
  authService,
  loginRateLimiter,
  clientsService,
  productsService,
  salesService,
  ordersService,
  dashboardService,
  appointmentsService,
}: AppDeps) =>
  new Elysia()
    .use(errorHandler)
    .use(createAuthGuard({ authService }))
    .get("/health", () => ({ status: "ok" }))
    .use(createLeadsRoutes({ service: leadsService, rateLimiter }))
    .use(createLeadsCrmRoutes({ service: leadsService, authService }))
    .use(createAuthRoutes({ service: authService, loginRateLimiter }))
    .use(createClientsRoutes({ service: clientsService, authService }))
    .use(createProductsRoutes({ service: productsService, authService }))
    .use(createSalesRoutes({ service: salesService, authService }))
    .use(createOrdersRoutes({ service: ordersService, authService }))
    .use(createDashboardRoutes({ service: dashboardService, authService }))
    .use(
      createAppointmentsRoutes({ service: appointmentsService, authService }),
    );
