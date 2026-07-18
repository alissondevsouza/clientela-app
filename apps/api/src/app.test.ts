import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import {
  type AuthRepositoryPort,
  createAuthService,
  type PasswordHasher,
} from "./modules/auth/auth.service";
import {
  type ClientsRepositoryPort,
  createClientsService,
} from "./modules/clients/clients.service";
import {
  createLeadsService,
  type LeadsRepositoryPort,
} from "./modules/leads/leads.service";
import { createRateLimiter } from "./plugins/rate-limit";

const FAKE_ID = "00000000-0000-7000-8000-000000000000";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

const noopRepository: LeadsRepositoryPort = {
  insert: async () => ({ id: FAKE_ID }),
};

// Auth em memória: o único caso deste arquivo é o `/health` (rota pública), que o
// guard deixa passar sem tocar o service — o fake só satisfaz o contrato.
const noopAuthRepository: AuthRepositoryPort = {
  findConsultantByEmail: async () => undefined,
  insertSession: async () => {},
  findSessionWithConsultantByTokenHash: async () => undefined,
  deleteSessionByTokenHash: async () => {},
  deleteExpiredSessions: async () => {},
};

const noopHasher: PasswordHasher = {
  hash: async (password) => password,
  verify: async () => false,
};

// Clients em memória: o único caso deste arquivo é o `/health` (rota pública),
// que não toca clients — o fake só satisfaz o contrato do `createApp`.
const noopClientsRepository: ClientsRepositoryPort = {
  insert: async () => {
    throw new Error("clients não é exercitado neste teste");
  },
  findById: async () => undefined,
  update: async () => undefined,
  delete: async () => false,
  list: async () => ({ rows: [], total: 0 }),
};

const buildApp = () =>
  createApp({
    leadsService: createLeadsService({
      repository: noopRepository,
      clock: () => new Date(),
      generateId: () => FAKE_ID,
    }),
    rateLimiter: createRateLimiter({
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clock: () => Date.now(),
    }),
    authService: createAuthService({
      repository: noopAuthRepository,
      clock: () => new Date(),
      hasher: noopHasher,
      generateToken: () => "unused-token",
    }),
    loginRateLimiter: createRateLimiter({
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clock: () => Date.now(),
    }),
    clientsService: createClientsService({
      repository: noopClientsRepository,
    }),
  });

describe("api", () => {
  it("responde ao health check", async () => {
    const app = buildApp();
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
