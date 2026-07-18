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
import { createLeadsRepository } from "./modules/leads/leads.repository";
import { createLeadsService } from "./modules/leads/leads.service";
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

createApp({
  leadsService,
  rateLimiter,
  authService,
  loginRateLimiter,
  clientsService,
}).listen(env.PORT, ({ hostname, port: boundPort }) => {
  console.log(`API rodando em http://${hostname}:${boundPort}`);
});
