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
  type AuthRepositoryPort,
  createAuthService,
  type PasswordHasher,
} from "../auth/auth.service";
import {
  type ClientsRepositoryPort,
  createClientsService,
} from "../clients/clients.service";
import { createLeadsRepository } from "./leads.repository";
import { RATE_LIMITED_MESSAGE } from "./leads.routes";
import { createLeadsService } from "./leads.service";

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

  const postLead = (
    app: ReturnType<typeof buildApp>,
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
