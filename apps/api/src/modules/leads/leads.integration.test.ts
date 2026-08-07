import { apiErrorSchema } from "@clientela/shared";
import { count } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { leads } from "../../db/schema";
import {
  createRateLimiter,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "../../plugins/rate-limit";
import {
  type AppointmentsRepositoryPort,
  createAppointmentsService,
} from "../appointments/appointments.service";
import {
  type AuthRepositoryPort,
  createAuthService,
  type PasswordHasher,
} from "../auth/auth.service";
import {
  type ClientsRepositoryPort,
  createClientsService,
} from "../clients/clients.service";
import {
  createDashboardService,
  type DashboardRepositoryPort,
} from "../dashboard/dashboard.service";
import {
  createOrdersService,
  type OrdersRepositoryPort,
} from "../orders/orders.service";
import {
  createProductsService,
  type ProductsRepositoryPort,
} from "../products/products.service";
import {
  createSalesService,
  type SalesRepositoryPort,
} from "../sales/sales.service";
import { createLeadsRepository } from "./leads.repository";
import { createLeadsRoutes, RATE_LIMITED_MESSAGE } from "./leads.routes";
import { createLeadsService } from "./leads.service";

// Ambos `createApp` e `createLeadsRoutes` são instâncias Elysia com `.handle`;
// os helpers de request aceitam qualquer um dos dois.
type Handleable = { handle: (request: Request) => Promise<Response> };

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
// Ids persistidos vêm do banco (uuid v7). O id sintético do honeypot vem de
// crypto.randomUUID() (uuid v4): por isso o teste do honeypot usa o regex
// genérico, e o do lead persistido exige v7.
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resposta de sucesso deve conter APENAS `id`: `.strict()` faz o parse falhar
// se qualquer dado pessoal for ecoado.
const successResponseSchema = z.object({ id: z.string() }).strict();

const VALID_LEAD_BODY = {
  name: "Maria Silva",
  whatsapp: "(11) 98765-4321",
  interest: "Base líquida",
  consent: true,
} as const;

// Auth em memória: os casos deste arquivo só exercem `/leads` e `/health`
// (públicos), que o guard deixa passar sem tocar o service. Injeta-se um
// authService/loginRateLimiter reais apenas para satisfazer o contrato do
// `createApp` — nenhuma rota autenticada é chamada aqui.
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

// Clients em memória: este arquivo só exercita `/leads` e `/health` — nenhuma
// rota autenticada de clients é chamada. O fake só satisfaz o `createApp`.
const noopClientsRepository: ClientsRepositoryPort = {
  insert: async () => {
    throw new Error("clients não é exercitado neste teste");
  },
  findById: async () => undefined,
  update: async () => undefined,
  delete: async () => false,
  list: async () => ({ rows: [], total: 0 }),
};

// Products em memória: este arquivo só exercita `/leads` e `/health` — nenhuma
// rota autenticada de products é chamada. O fake só satisfaz o `createApp`.
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

// Sales em memória: este arquivo só exercita `/leads` e `/health` — nenhuma rota
// autenticada de sales é chamada. O fake só satisfaz o `createApp`.
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

// Orders em memória: este arquivo só exercita `/leads` e `/health` — nenhuma
// rota autenticada de orders é chamada. O fake só satisfaz o `createApp`.
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

// Dashboard em memória: este arquivo só exercita `/leads` e `/health` —
// nenhuma rota autenticada de dashboard é chamada. O fake só satisfaz o
// `createApp`.
const noopDashboardRepository: DashboardRepositoryPort = {
  summary: async () => {
    throw new Error("dashboard não é exercitado neste teste");
  },
  updateGoal: async () => {
    throw new Error("dashboard não é exercitado neste teste");
  },
};

// Appointments em memória: este arquivo só exercita `/leads` e `/health` —
// nenhuma rota autenticada de appointments é chamada. O fake só satisfaz o
// `createApp`.
const noopAppointmentsRepository: AppointmentsRepositoryPort = {
  findClientById: async () => undefined,
  findLeadById: async () => undefined,
  create: async () => {
    throw new Error("appointments não é exercitado neste teste");
  },
  list: async () => ({ rows: [], total: 0 }),
  getById: async () => undefined,
  update: async () => {
    throw new Error("appointments não é exercitado neste teste");
  },
  markDone: async () => {
    throw new Error("appointments não é exercitado neste teste");
  },
  markNoShow: async () => {
    throw new Error("appointments não é exercitado neste teste");
  },
  cancel: async () => {
    throw new Error("appointments não é exercitado neste teste");
  },
  linkSale: async () => {
    throw new Error("appointments não é exercitado neste teste");
  },
  remove: async () => {
    throw new Error("appointments não é exercitado neste teste");
  },
  findConflicts: async () => [],
};

const buildNoopAuthDeps = () => ({
  authService: createAuthService({
    repository: noopAuthRepository,
    clock: () => new Date(),
    hasher: noopHasher,
    generateToken: () => "unused-token",
  }),
  loginRateLimiter: createRateLimiter({
    max: RATE_LIMIT_MAX_REQUESTS,
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
  appointmentsService: createAppointmentsService({
    repository: noopAppointmentsRepository,
    clock: () => new Date(),
  }),
});

describe("POST /leads (integração)", () => {
  let ctx: PgTestContext;

  beforeAll(async () => {
    ctx = await startPgContainer();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterEach(async () => {
    await ctx.truncateAll();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  // App real com o repositório apontando para o Postgres do container. Rate
  // limiter novo por app evita vazamento de contagem entre casos.
  const buildApp = () => {
    const repository = createLeadsRepository(ctx.db);
    const service = createLeadsService({
      repository,
      clock: () => new Date(),
      generateId: () => crypto.randomUUID(),
    });
    const rateLimiter = createRateLimiter({
      max: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clock: () => Date.now(),
    });
    return createApp({
      leadsService: service,
      rateLimiter,
      ...buildNoopAuthDeps(),
    });
  };

  // Plugin público de leads isolado (sem o auth-guard global). O guard de rate
  // limit vive aqui: testá-lo direto exercita exatamente o ponto que o
  // known-issue reporta (limite método-agnóstico). No app composto o auth-guard
  // 401aria um GET anônimo antes de o guard de leads rodar, mascarando o escopo.
  const buildLeadsPlugin = (): Handleable => {
    const repository = createLeadsRepository(ctx.db);
    const service = createLeadsService({
      repository,
      clock: () => new Date(),
      generateId: () => crypto.randomUUID(),
    });
    const rateLimiter = createRateLimiter({
      max: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clock: () => Date.now(),
    });
    return createLeadsRoutes({ service, rateLimiter });
  };

  const postLead = (
    app: Handleable,
    body: unknown,
    ip = "203.0.113.10",
    path = "/leads",
  ) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify(body),
      }),
    );

  const getLeads = (app: Handleable, ip = "203.0.113.10", path = "/leads") =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: "GET",
        headers: { "x-forwarded-for": ip },
      }),
    );

  const countLeads = async (): Promise<number> => {
    const [row] = await ctx.db.select({ value: count() }).from(leads);
    return row?.value ?? 0;
  };

  it("persiste lead válido com defaults e whatsapp normalizado (201)", async () => {
    const app = buildApp();

    const response = await postLead(app, VALID_LEAD_BODY);
    // `.strict()` garante que a resposta não ecoa dado pessoal (só o id).
    const body = successResponseSchema.parse(await response.json());

    expect(response.status).toBe(201);
    expect(body.id).toMatch(UUID_V7_REGEX);

    const stored = await ctx.db.select().from(leads);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.name).toBe("Maria Silva");
    expect(stored[0]?.whatsapp).toBe("11987654321");
    expect(stored[0]?.interest).toBe("Base líquida");
    expect(stored[0]?.status).toBe("new");
    expect(stored[0]?.source).toBe("landing");
    expect(stored[0]?.consentAt).toBeInstanceOf(Date);
  });

  it("rejeita body sem name com 422 e mensagem pt-BR (não em inglês) sem stack", async () => {
    const app = buildApp();

    // Campo obrigatório ausente gera issue `invalid_type`: a mensagem precisa
    // sair em pt-BR (RF-02), não a default do Zod em inglês.
    const response = await postLead(app, {
      whatsapp: "11987654321",
    });
    const raw = await response.json();
    const body = apiErrorSchema.parse(raw);

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Informe seu nome completo");
    expect(body.error.message).not.toMatch(/invalid input|expected string/i);
    expect(JSON.stringify(raw)).not.toMatch(/at .*\(/);
    expect(await countLeads()).toBe(0);
  });

  it("honeypot: website não-vazio responde 201 sem persistir", async () => {
    const app = buildApp();

    const response = await postLead(app, {
      ...VALID_LEAD_BODY,
      website: "http://spam.example",
    });
    const body = successResponseSchema.parse(await response.json());

    expect(response.status).toBe(201);
    expect(body.id).toMatch(UUID_REGEX);
    expect(await countLeads()).toBe(0);
  });

  it("website vazio ('') é humano e é persistido (201)", async () => {
    const app = buildApp();

    const response = await postLead(app, { ...VALID_LEAD_BODY, website: "" });

    expect(response.status).toBe(201);
    expect(await countLeads()).toBe(1);
  });

  it("aplica rate limit por IP: N+1ª do mesmo IP retorna 429, IP distinto passa", async () => {
    const app = buildApp();
    const spammerIp = "198.51.100.20";

    for (let attempt = 0; attempt < RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
      const allowed = await postLead(app, VALID_LEAD_BODY, spammerIp);
      expect(allowed.status).toBe(201);
    }

    const blocked = await postLead(app, VALID_LEAD_BODY, spammerIp);
    const blockedBody = apiErrorSchema.parse(await blocked.json());
    expect(blocked.status).toBe(429);
    expect(blockedBody.error.code).toBe("RATE_LIMITED");
    expect(blockedBody.error.message).toBe(RATE_LIMITED_MESSAGE);

    const otherIp = await postLead(app, VALID_LEAD_BODY, "198.51.100.99");
    expect(otherIp.status).toBe(201);
  });

  it("rate limit cobre trailing slash: flood de /leads/ do mesmo IP chega a 429", async () => {
    const app = buildApp();
    const spammerIp = "198.51.100.40";

    // Elysia (strictPath desligado) roteia `/leads/` para o mesmo handler; o
    // guard global normaliza a barra final, então a variante NÃO escapa do
    // limite (regressão do bypass CRÍTICO da rodada 2).
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
      const allowed = await postLead(
        app,
        VALID_LEAD_BODY,
        spammerIp,
        "/leads/",
      );
      expect(allowed.status).toBe(201);
    }

    const blocked = await postLead(app, VALID_LEAD_BODY, spammerIp, "/leads/");
    const blockedBody = apiErrorSchema.parse(await blocked.json());
    expect(blocked.status).toBe(429);
    expect(blockedBody.error.code).toBe("RATE_LIMITED");
    expect(blockedBody.error.message).toBe(RATE_LIMITED_MESSAGE);
    // A N+1ª foi bloqueada antes de persistir: só as N primeiras entraram.
    expect(await countLeads()).toBe(RATE_LIMIT_MAX_REQUESTS);
  });

  it("rate limit cobre query string: flood de /leads?x=1 do mesmo IP chega a 429", async () => {
    const app = buildApp();
    const spammerIp = "198.51.100.50";

    for (let attempt = 0; attempt < RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
      const allowed = await postLead(
        app,
        VALID_LEAD_BODY,
        spammerIp,
        "/leads?x=1",
      );
      expect(allowed.status).toBe(201);
    }

    const blocked = await postLead(
      app,
      VALID_LEAD_BODY,
      spammerIp,
      "/leads?x=1",
    );
    const blockedBody = apiErrorSchema.parse(await blocked.json());
    expect(blocked.status).toBe(429);
    expect(blockedBody.error.code).toBe("RATE_LIMITED");
    expect(blockedBody.error.message).toBe(RATE_LIMITED_MESSAGE);
    expect(await countLeads()).toBe(RATE_LIMIT_MAX_REQUESTS);
  });

  it("guard do rate limit é exclusivo do POST público: rajada de GET /leads não recebe 429 nem consome o bucket (RF-05)", async () => {
    const plugin = buildLeadsPlugin();
    const sharedIp = "198.51.100.60";

    // O guard `onRequest` do rate limit de leads deve valer SÓ para o `POST
    // /leads` público de captura. Uma rajada de GET /leads acima do limite do
    // visitante NUNCA pode receber 429: as rotas autenticadas do CRM-04
    // compartilham o path `/leads` e não podem cair no limite do visitante
    // (RF-05 / known-issue "rate limit cobre qualquer método"). O GET aqui
    // responde 404 (a rota autenticada nasce na Task 2.2); o invariante testado
    // é "nunca 429".
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_REQUESTS + 1; attempt += 1) {
      const response = await getLeads(plugin, sharedIp);
      expect(response.status).not.toBe(429);
    }

    // Bucket intacto: o POST público válido do MESMO IP ainda passa (201) — a
    // rajada de GET não consumiu a janela do rate limit.
    const created = await postLead(plugin, VALID_LEAD_BODY, sharedIp);
    expect(created.status).toBe(201);
  });

  it("rate limit conta payloads inválidos: flood de 422 do mesmo IP acaba em 429", async () => {
    const app = buildApp();
    const floodIp = "198.51.100.30";
    const invalidBody = { whatsapp: "11987654321" };

    // Payloads inválidos repetidos consomem a janela (o guard roda antes da
    // validação): as primeiras N respostas são 422, a N+1ª é 429 — um bot
    // martelando body inválido não escapa do limite (RF-05).
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
      const rejected = await postLead(app, invalidBody, floodIp);
      expect(rejected.status).toBe(422);
    }

    const blocked = await postLead(app, invalidBody, floodIp);
    const blockedBody = apiErrorSchema.parse(await blocked.json());
    expect(blocked.status).toBe(429);
    expect(blockedBody.error.code).toBe("RATE_LIMITED");
    expect(await countLeads()).toBe(0);
  });

  it("erro inesperado no service vira 500 com envelope genérico sem internals", async () => {
    const failingService = createLeadsService({
      repository: {
        insert: async () => {
          throw new Error("segredo interno do banco de dados");
        },
        list: async () => ({ rows: [], total: 0 }),
        findById: async () => undefined,
        updateStatus: async () => undefined,
        convert: async () => {
          throw new Error("convert não é exercitado neste teste");
        },
      },
      clock: () => new Date(),
      generateId: () => crypto.randomUUID(),
    });
    const rateLimiter = createRateLimiter({
      max: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clock: () => Date.now(),
    });
    // createApp já monta o error-handler global: o erro do service é mapeado
    // para 500 genérico pela mesma cadeia usada em produção.
    const app = createApp({
      leadsService: failingService,
      rateLimiter,
      ...buildNoopAuthDeps(),
    });

    const response = await postLead(app, VALID_LEAD_BODY);
    const raw = await response.json();
    const body = apiErrorSchema.parse(raw);

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(raw)).not.toContain("segredo interno");
  });
});
