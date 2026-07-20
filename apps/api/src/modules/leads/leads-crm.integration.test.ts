import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  apiErrorSchema,
  type Client,
  type CrmLead,
  clientSchema,
  crmLeadSchema,
  type LeadStatus,
  loginResponseSchema,
  paginated,
} from "@clientela/shared";
import { count } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { clients, consultants, leads } from "../../db/schema";
import { UNAUTHORIZED_MESSAGE } from "../../plugins/auth-guard";
import {
  createRateLimiter,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "../../plugins/rate-limit";
import { createAuthRepository } from "../auth/auth.repository";
import {
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from "../auth/auth.routes";
import {
  createAuthService,
  generateSecureToken,
  type PasswordHasher,
} from "../auth/auth.service";
import { createClientsRepository } from "../clients/clients.repository";
import { createClientsService } from "../clients/clients.service";
import { createDashboardRepository } from "../dashboard/dashboard.repository";
import { createDashboardService } from "../dashboard/dashboard.service";
import { createOrdersRepository } from "../orders/orders.repository";
import { createOrdersService } from "../orders/orders.service";
import { createProductsRepository } from "../products/products.repository";
import { createProductsService } from "../products/products.service";
import { createSalesRepository } from "../sales/sales.repository";
import { createSalesService } from "../sales/sales.service";
import { createLeadsRepository } from "./leads.repository";
import { createLeadsService } from "./leads.service";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_TOO_MANY_REQUESTS = 429;

const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";
const UNAUTHORIZED_CODE = "UNAUTHORIZED";
const LEAD_NOT_FOUND_CODE = "LEAD_NOT_FOUND";
const LEAD_ALREADY_CONVERTED_CODE = "LEAD_ALREADY_CONVERTED";

// Mensagens pt-BR fixadas pelo spec/contratos: asserção exata (RF-02/RF-03).
const STATUS_INVALID_MESSAGE = "Status de lead inválido";
const STATUS_UPDATE_INVALID_MESSAGE =
  "Status inválido: use novo, contatado ou descartado";
const INTEREST_NOTE_PREFIX = "Interesse (lead): ";

const CORRECT_PASSWORD = "senha-super-secreta";
const CONSULTANT_A = {
  name: "Consultora A",
  email: "consultora-a@example.com",
  whatsapp: "11987654321",
  ip: "203.0.113.10",
} as const;

// uuid v4 sintaticamente válido porém inexistente: prova que "não existe" e
// "id malformado" respondem o MESMO 404 (RF-03).
const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

// Contrato de saída da listagem paginada de leads, montado a partir dos schemas
// compartilhados (a mesma forma que o front consome). Parse real = prova de que
// a resposta adere ao contrato público.
const crmLeadListSchema = paginated(crmLeadSchema);

// Resposta da captura pública: só `id`.
const leadCaptureResponseSchema = z.object({ id: z.string() });

// O `PasswordHasher` de produção usa `Bun.password` (argon2id), indisponível sob
// Node (workers do Vitest). Como o hasher é porta injetada (api.md), o teste usa
// um KDF real do Node (scrypt) com o MESMO round-trip (hash na semeadura, verify
// no login) — prova o login real contra o Postgres. Espelha clients.integration.
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_SCHEME = "scrypt";

const realPasswordHasher: PasswordHasher = {
  hash: async (password) => {
    const salt = randomBytes(SCRYPT_SALT_BYTES);
    const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
    return `${SCRYPT_SCHEME}$${salt.toString("hex")}$${derived.toString("hex")}`;
  },
  verify: async (password, hash) => {
    const [scheme, saltHex, derivedHex] = hash.split("$");
    if (scheme !== SCRYPT_SCHEME || !saltHex || !derivedHex) {
      return false;
    }
    const derived = scryptSync(
      password,
      Buffer.from(saltHex, "hex"),
      SCRYPT_KEY_LENGTH,
    );
    const expected = Buffer.from(derivedHex, "hex");
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  },
};

const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

const authHeaders = (token?: string): Record<string, string> =>
  token ? bearer(token) : {};

describe("leads CRM (integração)", () => {
  let ctx: PgTestContext;
  let passwordHash: string;

  beforeAll(async () => {
    ctx = await startPgContainer();
    passwordHash = await realPasswordHasher.hash(CORRECT_PASSWORD);
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterEach(async () => {
    await ctx.truncateAll();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  // App real: repositórios/serviços apontando para o Postgres do container,
  // guard e rate limiters reais. Rate limiter novo por app evita vazamento de
  // contagem entre casos.
  const buildApp = () => {
    const authService = createAuthService({
      repository: createAuthRepository(ctx.db),
      clock: () => new Date(),
      hasher: realPasswordHasher,
      generateToken: generateSecureToken,
    });
    const loginRateLimiter = createRateLimiter({
      max: LOGIN_RATE_LIMIT_MAX,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      clock: () => Date.now(),
    });
    const leadsService = createLeadsService({
      repository: createLeadsRepository(ctx.db),
      clock: () => new Date(),
      generateId: () => crypto.randomUUID(),
    });
    const rateLimiter = createRateLimiter({
      max: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clock: () => Date.now(),
    });
    const clientsService = createClientsService({
      repository: createClientsRepository(ctx.db),
    });
    const productsService = createProductsService({
      repository: createProductsRepository(ctx.db),
    });
    const salesService = createSalesService({
      repository: createSalesRepository(ctx.db),
    });
    const ordersService = createOrdersService({
      repository: createOrdersRepository(ctx.db),
    });
    const dashboardService = createDashboardService({
      repository: createDashboardRepository(ctx.db),
      clock: () => new Date(),
    });
    return createApp({
      leadsService,
      rateLimiter,
      authService,
      loginRateLimiter,
      clientsService,
      productsService,
      salesService,
      ordersService,
      dashboardService,
    });
  };

  type App = ReturnType<typeof buildApp>;

  const seedConsultant = async (): Promise<string> => {
    const [row] = await ctx.db
      .insert(consultants)
      .values({
        name: CONSULTANT_A.name,
        email: CONSULTANT_A.email,
        passwordHash,
        whatsapp: CONSULTANT_A.whatsapp,
      })
      .returning({ id: consultants.id });

    if (!row) {
      throw new Error("falha ao semear a consultora de teste");
    }
    return row.id;
  };

  // Login real (POST /auth/login) ⇒ token opaco de sessão, revalidado pelas
  // rotas do CRM via authService.
  const login = async (app: App): Promise<string> => {
    const response = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": CONSULTANT_A.ip,
        },
        body: JSON.stringify({
          email: CONSULTANT_A.email,
          password: CORRECT_PASSWORD,
        }),
      }),
    );
    expect(response.status).toBe(HTTP_OK);
    const body = loginResponseSchema.parse(await response.json());
    return body.token;
  };

  const seedConsultantSession = async (app: App): Promise<string> => {
    await seedConsultant();
    return login(app);
  };

  type SeedLeadValues = {
    name: string;
    whatsapp: string;
    interest?: string | null;
    status?: LeadStatus;
    createdAt?: Date;
  };

  // Semeadura direta de leads (setup de listagem/filtro/status): permite fixar
  // status pré-existente e timestamps distintos para provar a ordem `desc`.
  const seedLead = async (values: SeedLeadValues): Promise<string> => {
    const timestamp = values.createdAt ?? new Date();
    const [row] = await ctx.db
      .insert(leads)
      .values({
        name: values.name,
        whatsapp: values.whatsapp,
        interest: values.interest ?? null,
        status: values.status ?? "new",
        consentAt: timestamp,
        createdAt: timestamp,
      })
      .returning({ id: leads.id });

    if (!row) {
      throw new Error("falha ao semear o lead de teste");
    }
    return row.id;
  };

  const getLeads = (
    app: App,
    token: string | undefined,
    queryString = "",
    ip?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/leads${queryString}`, {
        method: "GET",
        headers: {
          ...authHeaders(token),
          ...(ip ? { "x-forwarded-for": ip } : {}),
        },
      }),
    );

  const patchLeadStatus = (
    app: App,
    id: string,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/leads/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(body),
      }),
    );

  const convertLead = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/leads/${id}/convert`, {
        method: "POST",
        headers: authHeaders(token),
      }),
    );

  const getClient = (app: App, id: string, token: string): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/clients/${id}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const deleteClient = (
    app: App,
    id: string,
    token: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/clients/${id}`, {
        method: "DELETE",
        headers: bearer(token),
      }),
    );

  // Captura pública real (POST /leads sem sessão): o caminho de produção da
  // landing. Devolve o id persistido.
  const captureLead = async (
    app: App,
    body: unknown,
    ip: string = CONSULTANT_A.ip,
  ): Promise<string> => {
    const response = await app.handle(
      new Request("http://localhost/leads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(HTTP_CREATED);
    return leadCaptureResponseSchema.parse(await response.json()).id;
  };

  const findLeadInList = async (
    app: App,
    token: string,
    id: string,
  ): Promise<CrmLead | undefined> => {
    const response = await getLeads(app, token, "?perPage=100");
    expect(response.status).toBe(HTTP_OK);
    const list = crmLeadListSchema.parse(await response.json());
    return list.data.find((lead) => lead.id === id);
  };

  const countClients = async (): Promise<number> => {
    const [row] = await ctx.db.select({ value: count() }).from(clients);
    return row?.value ?? 0;
  };

  describe("GET /leads (RF-03)", () => {
    it("lista paginada ordenada por created_at desc (mais novo primeiro)", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      await seedLead({
        name: "Lead Antiga",
        whatsapp: "11900000001",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });
      await seedLead({
        name: "Lead Media",
        whatsapp: "11900000002",
        createdAt: new Date("2026-01-02T10:00:00.000Z"),
      });
      await seedLead({
        name: "Lead Nova",
        whatsapp: "11900000003",
        createdAt: new Date("2026-01-03T10:00:00.000Z"),
      });

      const response = await getLeads(app, token);
      expect(response.status).toBe(HTTP_OK);
      const list = crmLeadListSchema.parse(await response.json());

      expect(list.total).toBe(3);
      expect(list.page).toBe(1);
      expect(list.perPage).toBe(20);
      expect(list.data.map((lead) => lead.name)).toEqual([
        "Lead Nova",
        "Lead Media",
        "Lead Antiga",
      ]);
    });

    it("?status=new retorna apenas leads novos", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      await seedLead({
        name: "Nova 1",
        whatsapp: "11900000001",
        status: "new",
      });
      await seedLead({
        name: "Nova 2",
        whatsapp: "11900000002",
        status: "new",
      });
      await seedLead({
        name: "Contatada",
        whatsapp: "11900000003",
        status: "contacted",
      });
      await seedLead({
        name: "Descartada",
        whatsapp: "11900000004",
        status: "discarded",
      });

      const response = await getLeads(app, token, "?status=new");
      expect(response.status).toBe(HTTP_OK);
      const list = crmLeadListSchema.parse(await response.json());

      expect(list.total).toBe(2);
      expect(list.data.every((lead) => lead.status === "new")).toBe(true);
      expect([...list.data.map((lead) => lead.name)].sort()).toEqual([
        "Nova 1",
        "Nova 2",
      ]);
    });

    it("?status inválido ⇒ 422 pt-BR (sem termos em inglês)", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await getLeads(app, token, "?status=foo");
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toBe(STATUS_INVALID_MESSAGE);
      expect(body.error.message).not.toMatch(/invalid|expected|enum/i);
    });
  });

  describe("PATCH /leads/:id/status (RF-03)", () => {
    it("transições válidas encadeadas new→contacted→discarded→contacted ⇒ 200", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const leadId = await seedLead({
        name: "Lead Funil",
        whatsapp: "11900000001",
        status: "new",
      });

      const toContacted = await patchLeadStatus(
        app,
        leadId,
        { status: "contacted" },
        token,
      );
      expect(toContacted.status).toBe(HTTP_OK);
      expect(crmLeadSchema.parse(await toContacted.json()).status).toBe(
        "contacted",
      );

      const toDiscarded = await patchLeadStatus(
        app,
        leadId,
        { status: "discarded" },
        token,
      );
      expect(toDiscarded.status).toBe(HTTP_OK);
      expect(crmLeadSchema.parse(await toDiscarded.json()).status).toBe(
        "discarded",
      );

      const backToContacted = await patchLeadStatus(
        app,
        leadId,
        { status: "contacted" },
        token,
      );
      expect(backToContacted.status).toBe(HTTP_OK);
      expect(crmLeadSchema.parse(await backToContacted.json()).status).toBe(
        "contacted",
      );
    });

    it('body { status: "converted" } ⇒ 422 pt-BR (converted não é settável via PATCH)', async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const leadId = await seedLead({
        name: "Lead",
        whatsapp: "11900000001",
        status: "new",
      });

      const response = await patchLeadStatus(
        app,
        leadId,
        { status: "converted" },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toBe(STATUS_UPDATE_INVALID_MESSAGE);
    });

    it("lead convertido ⇒ 409 LEAD_ALREADY_CONVERTED", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const leadId = await seedLead({
        name: "Lead",
        whatsapp: "11900000001",
        status: "new",
      });

      // Converte antes pelo caminho real (POST convert), então o PATCH deve 409.
      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);

      const response = await patchLeadStatus(
        app,
        leadId,
        { status: "contacted" },
        token,
      );
      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(LEAD_ALREADY_CONVERTED_CODE);
    });

    it("id não-uuid ⇒ 404 (não 422 nem 500)", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await patchLeadStatus(
        app,
        "nao-uuid",
        { status: "contacted" },
        token,
      );
      expect(response.status).toBe(HTTP_NOT_FOUND);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(LEAD_NOT_FOUND_CODE);
    });

    it("lead inexistente (uuid válido) ⇒ 404", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await patchLeadStatus(
        app,
        NONEXISTENT_UUID,
        { status: "contacted" },
        token,
      );
      expect(response.status).toBe(HTTP_NOT_FOUND);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(LEAD_NOT_FOUND_CODE);
    });
  });

  describe("POST /leads/:id/convert (RF-04)", () => {
    it("201: cria cliente com dados do lead e notes com o interesse; vincula o lead atomicamente", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      // Caminho real de captura: POST /leads público com interesse.
      const leadId = await captureLead(app, {
        name: "Maria Silva",
        whatsapp: "(11) 98765-4321",
        interest: "Base líquida",
        consent: true,
      });

      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);
      const client: Client = clientSchema.parse(await convertResponse.json());
      expect(client.name).toBe("Maria Silva");
      // WhatsApp normalizado para só-dígitos na captura.
      expect(client.whatsapp).toBe("11987654321");
      expect(client.notes).toBe(`${INTEREST_NOTE_PREFIX}Base líquida`);

      // A cliente existe de fato pela API (GET /clients/:id da consultora da sessão).
      const clientResponse = await getClient(app, client.id, token);
      expect(clientResponse.status).toBe(HTTP_OK);
      const fetched = clientSchema.parse(await clientResponse.json());
      expect(fetched.id).toBe(client.id);
      expect(fetched.notes).toBe(`${INTEREST_NOTE_PREFIX}Base líquida`);

      // O lead ficou convertido e vinculado à cliente criada.
      const lead = await findLeadInList(app, token, leadId);
      expect(lead?.status).toBe("converted");
      expect(lead?.clientId).toBe(client.id);
    });

    it("201: lead sem interesse gera cliente com notes null", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const leadId = await seedLead({
        name: "Joana Sem Interesse",
        whatsapp: "11900000009",
        interest: null,
        status: "new",
      });

      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);
      const client = clientSchema.parse(await convertResponse.json());
      expect(client.notes).toBeNull();

      const clientResponse = await getClient(app, client.id, token);
      expect(clientResponse.status).toBe(HTTP_OK);
      expect(clientSchema.parse(await clientResponse.json()).notes).toBeNull();
    });

    it("convert repetido ⇒ 409 e não cria segunda cliente", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const leadId = await seedLead({
        name: "Lead",
        whatsapp: "11900000001",
        status: "new",
      });

      const first = await convertLead(app, leadId, token);
      expect(first.status).toBe(HTTP_CREATED);
      expect(await countClients()).toBe(1);

      const second = await convertLead(app, leadId, token);
      expect(second.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await second.json());
      expect(body.error.code).toBe(LEAD_ALREADY_CONVERTED_CODE);
      // Contagem de clientes inalterada: a atomicidade impede a 2ª cliente.
      expect(await countClients()).toBe(1);
    });

    it("convert de lead inexistente ⇒ 404 e nenhuma cliente criada", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await convertLead(app, NONEXISTENT_UUID, token);
      expect(response.status).toBe(HTTP_NOT_FOUND);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(LEAD_NOT_FOUND_CODE);
      expect(await countClients()).toBe(0);
    });
  });

  describe("ON DELETE SET NULL (RF-01)", () => {
    it("excluir a cliente vinculada mantém o lead convertido com clientId null", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const leadId = await seedLead({
        name: "Lead Convertida",
        whatsapp: "11900000001",
        status: "new",
      });

      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);
      const client = clientSchema.parse(await convertResponse.json());

      const deleteResponse = await deleteClient(app, client.id, token);
      expect(deleteResponse.status).toBe(204);

      const lead = await findLeadInList(app, token, leadId);
      expect(lead?.status).toBe("converted");
      expect(lead?.clientId).toBeNull();
    });
  });

  describe("guard default-deny (RF-03)", () => {
    it("sem token ⇒ 401 nas 3 rotas novas do CRM de leads", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        getLeads(app, undefined),
        patchLeadStatus(app, NONEXISTENT_UUID, { status: "contacted" }),
        convertLead(app, NONEXISTENT_UUID),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(HTTP_UNAUTHORIZED);
        const body = apiErrorSchema.parse(await response.json());
        expect(body.error.code).toBe(UNAUTHORIZED_CODE);
        expect(body.error.message).toBe(UNAUTHORIZED_MESSAGE);
      }
    });
  });

  describe("escopo do rate limit público (RF-05)", () => {
    it("rajada de GET /leads autenticado do mesmo IP não recebe 429; POST público do mesmo IP ainda passa", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const sharedIp = "198.51.100.60";

      // Mais que o limite do visitante: as rotas autenticadas NÃO consomem o
      // bucket (RF-05 — known-issue do guard método-agnóstico fechado).
      for (
        let attempt = 0;
        attempt < RATE_LIMIT_MAX_REQUESTS + 1;
        attempt += 1
      ) {
        const response = await getLeads(app, token, "", sharedIp);
        expect(response.status).toBe(HTTP_OK);
        expect(response.status).not.toBe(HTTP_TOO_MANY_REQUESTS);
      }

      // Bucket do visitante intacto: o POST /leads público do MESMO IP passa (201).
      const capturedId = await captureLead(
        app,
        {
          name: "Visitante",
          whatsapp: "11912345678",
          consent: true,
        },
        sharedIp,
      );
      expect(capturedId).toBeTruthy();
    });
  });
});
