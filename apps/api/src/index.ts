import { createApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";
import { createAuthRepository } from "./modules/auth/auth.repository";
import {
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from "./modules/auth/auth.routes";
import {
  bunPasswordHasher,
  createAuthService,
  generateSecureToken,
} from "./modules/auth/auth.service";
import { createClientsRepository } from "./modules/clients/clients.repository";
import { createClientsService } from "./modules/clients/clients.service";
import { createDashboardRepository } from "./modules/dashboard/dashboard.repository";
import { createDashboardService } from "./modules/dashboard/dashboard.service";
import { createLeadsRepository } from "./modules/leads/leads.repository";
import { createLeadsService } from "./modules/leads/leads.service";
import { createOrdersRepository } from "./modules/orders/orders.repository";
import { createOrdersService } from "./modules/orders/orders.service";
import { createProductsRepository } from "./modules/products/products.repository";
import { createProductsService } from "./modules/products/products.service";
import { createSalesRepository } from "./modules/sales/sales.repository";
import { createSalesService } from "./modules/sales/sales.service";
import {
  createRateLimiter,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "./plugins/rate-limit";

// Composition root (api.md): env → db → repository → service → rate limiter →
// app. Única instanciação de conexão; nenhum módulo importa singleton.
const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);

const leadsRepository = createLeadsRepository(db);
const leadsService = createLeadsService({
  repository: leadsRepository,
  clock: () => new Date(),
  generateId: () => crypto.randomUUID(),
});

const rateLimiter = createRateLimiter({
  max: RATE_LIMIT_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
  clock: () => Date.now(),
});

const authRepository = createAuthRepository(db);
const authService = createAuthService({
  repository: authRepository,
  clock: () => new Date(),
  hasher: bunPasswordHasher,
  generateToken: generateSecureToken,
});

const loginRateLimiter = createRateLimiter({
  max: LOGIN_RATE_LIMIT_MAX,
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  clock: () => Date.now(),
});

const clientsRepository = createClientsRepository(db);
const clientsService = createClientsService({ repository: clientsRepository });

const productsRepository = createProductsRepository(db);
const productsService = createProductsService({
  repository: productsRepository,
});

const salesRepository = createSalesRepository(db);
const salesService = createSalesService({ repository: salesRepository });

const ordersRepository = createOrdersRepository(db);
const ordersService = createOrdersService({ repository: ordersRepository });

const dashboardRepository = createDashboardRepository(db);
const dashboardService = createDashboardService({
  repository: dashboardRepository,
  clock: () => new Date(),
});

createApp({
  leadsService,
  rateLimiter,
  authService,
  loginRateLimiter,
  clientsService,
  productsService,
  salesService,
  ordersService,
  dashboardService,
}).listen(env.PORT, ({ hostname, port: boundPort }) => {
  console.log(`API rodando em http://${hostname}:${boundPort}`);
});
