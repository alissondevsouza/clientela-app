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
  createDashboardService,
  type DashboardRepositoryPort,
} from "./modules/dashboard/dashboard.service";
import {
  createLeadsService,
  type LeadsRepositoryPort,
} from "./modules/leads/leads.service";
import {
  createOrdersService,
  type OrdersRepositoryPort,
} from "./modules/orders/orders.service";
import {
  createProductsService,
  type ProductsRepositoryPort,
} from "./modules/products/products.service";
import {
  createSalesService,
  type SalesRepositoryPort,
} from "./modules/sales/sales.service";
import { createRateLimiter } from "./plugins/rate-limit";

const FAKE_ID = "00000000-0000-7000-8000-000000000000";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

const noopRepository: LeadsRepositoryPort = {
  insert: async () => ({ id: FAKE_ID }),
  list: async () => ({ rows: [], total: 0 }),
  findById: async () => undefined,
  updateStatus: async () => undefined,
  convert: async () => {
    throw new Error("convert não é exercitado neste teste");
  },
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

// Products em memória: o único caso deste arquivo é o `/health` (rota pública),
// que não toca products — o fake só satisfaz o contrato do `createApp`.
const noopProductsRepository: ProductsRepositoryPort = {
  insert: async () => {
    throw new Error("products não é exercitado neste teste");
  },
  findById: async () => undefined,
  update: async () => undefined,
  delete: async () => false,
  list: async () => ({ rows: [], total: 0 }),
  summary: async () => ({
    stockCostCents: 0,
    stockPriceCents: 0,
    lowStockCount: 0,
  }),
};

// Sales em memória: o único caso deste arquivo é o `/health` (rota pública), que
// não toca sales — o fake só satisfaz o contrato do `createApp`.
const noopSalesRepository: SalesRepositoryPort = {
  findProductsByIds: async () => [],
  createSale: async () => {
    throw new Error("sales não é exercitado neste teste");
  },
  list: async () => ({ rows: [], total: 0 }),
  getById: async () => undefined,
  cancel: async () => {
    throw new Error("sales não é exercitado neste teste");
  },
  listReceivables: async () => ({ rows: [], total: 0 }),
  receivablesSummary: async () => ({
    pendingCents: 0,
    overdueCents: 0,
    overdueCount: 0,
  }),
  setReceivablePaid: async () => {
    throw new Error("sales não é exercitado neste teste");
  },
};

// Orders em memória: o único caso deste arquivo é o `/health` (rota pública),
// que não toca orders — o fake só satisfaz o contrato do `createApp`.
const noopOrdersRepository: OrdersRepositoryPort = {
  findProductsByIds: async () => [],
  findClientsByIds: async () => [],
  createOrder: async () => {
    throw new Error("orders não é exercitado neste teste");
  },
  replaceItems: async () => {
    throw new Error("orders não é exercitado neste teste");
  },
  list: async () => ({ rows: [], total: 0 }),
  getById: async () => undefined,
  place: async () => {
    throw new Error("orders não é exercitado neste teste");
  },
  deliver: async () => {
    throw new Error("orders não é exercitado neste teste");
  },
  cancel: async () => {
    throw new Error("orders não é exercitado neste teste");
  },
};

// Dashboard em memória: o único caso deste arquivo é o `/health` (rota
// pública), que não toca dashboard — o fake só satisfaz o contrato do
// `createApp`.
const noopDashboardRepository: DashboardRepositoryPort = {
  summary: async () => {
    throw new Error("dashboard não é exercitado neste teste");
  },
  updateGoal: async () => {
    throw new Error("dashboard não é exercitado neste teste");
  },
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
    productsService: createProductsService({
      repository: noopProductsRepository,
    }),
    salesService: createSalesService({
      repository: noopSalesRepository,
    }),
    ordersService: createOrdersService({
      repository: noopOrdersRepository,
    }),
    dashboardService: createDashboardService({
      repository: noopDashboardRepository,
      clock: () => new Date(),
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
