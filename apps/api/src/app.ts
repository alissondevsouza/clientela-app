import { Elysia } from "elysia";
import { createAuthRoutes } from "./modules/auth/auth.routes";
import type { AuthService } from "./modules/auth/auth.service";
import { createClientsRoutes } from "./modules/clients/clients.routes";
import type { ClientsService } from "./modules/clients/clients.service";
import { createLeadsRoutes } from "./modules/leads/leads.routes";
import type { LeadsService } from "./modules/leads/leads.service";
import { createAuthGuard } from "./plugins/auth-guard";
import { errorHandler } from "./plugins/error-handler";
import type { RateLimiter } from "./plugins/rate-limit";

export type AppDeps = {
  leadsService: LeadsService;
  rateLimiter: RateLimiter;
  authService: AuthService;
  loginRateLimiter: RateLimiter;
  clientsService: ClientsService;
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
}: AppDeps) =>
  new Elysia()
    .use(errorHandler)
    .use(createAuthGuard({ authService }))
    .get("/health", () => ({ status: "ok" }))
    .use(createLeadsRoutes({ service: leadsService, rateLimiter }))
    .use(createAuthRoutes({ service: authService, loginRateLimiter }))
    .use(createClientsRoutes({ service: clientsService, authService }));
