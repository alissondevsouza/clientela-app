import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  type Appointment,
  type AppointmentKind,
  apiErrorSchema,
  appointmentSchema,
  type Client,
  type CrmLead,
  clientSchema,
  crmLeadSchema,
  type LeadStatus,
  loginResponseSchema,
  paginated,
  WHATSAPP_INVALID_MESSAGE,
} from "@clientela/shared";
import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import {
  appointments,
  clients,
  consultants,
  leads,
  sales,
} from "../../db/schema";
import { UNAUTHORIZED_MESSAGE } from "../../plugins/auth-guard";
import {
  createRateLimiter,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "../../plugins/rate-limit";
import { createAppointmentsRepository } from "../appointments/appointments.repository";
import { createAppointmentsService } from "../appointments/appointments.service";
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
import { createDashboardService } from "../dashboard/dashboard.service";
import { createDashboardPerformanceRepository } from "../dashboard/dashboard-performance.repository";
import { createDashboardTodayRepository } from "../dashboard/dashboard-today.repository";
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
      clock: () => new Date(),
    });
    const ordersService = createOrdersService({
      repository: createOrdersRepository(ctx.db),
    });
    const dashboardService = createDashboardService({
      performanceRepository: createDashboardPerformanceRepository(ctx.db),
      todayRepository: createDashboardTodayRepository(ctx.db),
      clock: () => new Date(),
    });
    const appointmentsService = createAppointmentsService({
      repository: createAppointmentsRepository(ctx.db),
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
      appointmentsService,
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

  const getLead = (app: App, id: string, token?: string): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/leads/${id}`, {
        method: "GET",
        headers: authHeaders(token),
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

  // Criação de lead pelo CRM (RF-24, ADR-0020): rota autenticada e DISTINTA da
  // captura pública (`POST /leads/manual`, não `POST /leads` — evita a colisão
  // de rota comprovada empiricamente: dois handlers no mesmo (método, path)
  // fariam o último `.use()` composto vencer para TODA requisição).
  const createLeadManual = (
    app: App,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/leads/manual", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(body),
      }),
    );

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

  type SeedAppointmentValues = {
    consultantId: string;
    leadId?: string | null;
    clientId?: string | null;
    saleId?: string | null;
    kind?: AppointmentKind;
    startsAt?: string;
  };

  const DEFAULT_APPOINTMENT_STARTS_AT = "2026-08-10T13:00:00.000Z";
  const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;

  // Semeadura DIRETA de compromisso (RF-12): usada para montar o fixture que
  // a conversão de lead precisa propagar — não depende da correção de
  // POST/transições, testadas no módulo appointments.
  const seedAppointment = async (
    values: SeedAppointmentValues,
  ): Promise<string> => {
    const [row] = await ctx.db
      .insert(appointments)
      .values({
        consultantId: values.consultantId,
        leadId: values.leadId ?? null,
        clientId: values.clientId ?? null,
        saleId: values.saleId ?? null,
        kind: values.kind ?? "demo",
        startsAt: new Date(values.startsAt ?? DEFAULT_APPOINTMENT_STARTS_AT),
        durationMinutes: DEFAULT_APPOINTMENT_DURATION_MINUTES,
      })
      .returning({ id: appointments.id });
    if (!row) {
      throw new Error("falha ao semear o compromisso de teste");
    }
    return row.id;
  };

  const getAppointment = (
    app: App,
    id: string,
    token: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const listAppointments = (
    app: App,
    token: string,
    queryString: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments${queryString}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const appointmentListSchema = paginated(
    appointmentSchema.omit({
      notes: true,
      clientWhatsapp: true,
      leadWhatsapp: true,
    }),
  );

  // Venda `completed` semeada direto (RF-12: prova que a conversão não
  // revalida/derruba um `sale_id` pré-existente no compromisso).
  const seedCompletedSale = async (values: {
    consultantId: string;
    clientId: string | null;
    clientName: string;
  }): Promise<string> => {
    const timestamp = new Date();
    const [row] = await ctx.db
      .insert(sales)
      .values({
        consultantId: values.consultantId,
        clientId: values.clientId,
        clientName: values.clientName,
        totalCents: 10000,
        paymentMethod: "pix",
        paymentCondition: "received",
        status: "completed",
        soldAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        deliveredAt: timestamp,
        completedAt: timestamp,
      })
      .returning({ id: sales.id });
    if (!row) {
      throw new Error("falha ao semear a venda de teste");
    }
    return row.id;
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

  describe("GET /leads/:id (RF-22, crm-appointments)", () => {
    it("lead existente ⇒ 200 com o lead", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const leadId = await seedLead({
        name: "Lead Detalhe",
        whatsapp: "11900000009",
      });

      const response = await getLead(app, leadId, token);
      expect(response.status).toBe(HTTP_OK);
      const lead = crmLeadSchema.parse(await response.json());
      expect(lead.id).toBe(leadId);
      expect(lead.name).toBe("Lead Detalhe");
    });

    it("lead inexistente (uuid válido) ⇒ 404", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await getLead(app, NONEXISTENT_UUID, token);
      expect(response.status).toBe(HTTP_NOT_FOUND);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(LEAD_NOT_FOUND_CODE);
    });

    it("id malformado ⇒ 404 (não 422 nem 500)", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await getLead(app, "nao-e-um-uuid", token);
      expect(response.status).toBe(HTTP_NOT_FOUND);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(LEAD_NOT_FOUND_CODE);
    });

    it("sem token ⇒ 401", async () => {
      const app = buildApp();
      const leadId = await seedLead({
        name: "Lead Sem Token",
        whatsapp: "11900000010",
      });

      const response = await getLead(app, leadId, undefined);
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
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

  describe("Conversão de lead propaga a agenda (RF-12, crm-appointments)", () => {
    it("compromisso scheduled do lead passa a ter o client_id da nova cliente, mantém lead_id, e aparece em ?clientId=", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const consultantId = (
        await ctx.db.select({ id: consultants.id }).from(consultants).limit(1)
      )[0]?.id;
      if (!consultantId) {
        throw new Error("consultora de teste não encontrada");
      }
      const leadId = await seedLead({
        name: "Lead Agendada",
        whatsapp: "11900000001",
        status: "new",
      });
      const appointmentId = await seedAppointment({
        consultantId,
        leadId,
      });

      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);
      const client: Client = clientSchema.parse(await convertResponse.json());

      const appointmentResponse = await getAppointment(
        app,
        appointmentId,
        token,
      );
      expect(appointmentResponse.status).toBe(HTTP_OK);
      const appointment: Appointment = appointmentSchema.parse(
        await appointmentResponse.json(),
      );
      expect(appointment.clientId).toBe(client.id);
      // lead_id preservado (rastreabilidade) — a conversão NÃO zera o vínculo.
      expect(appointment.leadId).toBe(leadId);

      const listResponse = await listAppointments(
        app,
        token,
        `?range=all&clientId=${client.id}`,
      );
      expect(listResponse.status).toBe(HTTP_OK);
      const list = appointmentListSchema.parse(await listResponse.json());
      expect(list.data.map((item) => item.id)).toContain(appointmentId);
    });

    it("compromisso do lead que já tinha cliente NÃO é sobrescrito pela conversão", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const consultantId = (
        await ctx.db.select({ id: consultants.id }).from(consultants).limit(1)
      )[0]?.id;
      if (!consultantId) {
        throw new Error("consultora de teste não encontrada");
      }
      const leadId = await seedLead({
        name: "Lead Já Vinculada",
        whatsapp: "11900000002",
        status: "new",
      });
      const [preexistingClientRow] = await ctx.db
        .insert(clients)
        .values({
          consultantId,
          name: "Cliente Pré-existente",
          whatsapp: "11900099999",
        })
        .returning({ id: clients.id });
      if (!preexistingClientRow) {
        throw new Error("falha ao semear cliente pré-existente de teste");
      }
      const preexistingClientId = preexistingClientRow.id;
      const appointmentId = await seedAppointment({
        consultantId,
        leadId,
        clientId: preexistingClientId,
      });

      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);
      const newClient: Client = clientSchema.parse(
        await convertResponse.json(),
      );
      expect(newClient.id).not.toBe(preexistingClientId);

      const appointmentResponse = await getAppointment(
        app,
        appointmentId,
        token,
      );
      expect(appointmentResponse.status).toBe(HTTP_OK);
      const appointment: Appointment = appointmentSchema.parse(
        await appointmentResponse.json(),
      );
      // Preservado: continua apontando para a cliente que já tinha, não para a
      // recém-criada pela conversão.
      expect(appointment.clientId).toBe(preexistingClientId);
      expect(appointment.leadId).toBe(leadId);
    });

    it("escopo por consultora: compromisso de OUTRA consultora com o mesmo lead_id não é tocado", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const consultantAId = (
        await ctx.db.select({ id: consultants.id }).from(consultants).limit(1)
      )[0]?.id;
      if (!consultantAId) {
        throw new Error("consultora de teste não encontrada");
      }
      const [otherConsultantRow] = await ctx.db
        .insert(consultants)
        .values({
          name: "Consultora B",
          email: "consultora-b@example.com",
          passwordHash,
          whatsapp: "11987654322",
        })
        .returning({ id: consultants.id });
      if (!otherConsultantRow) {
        throw new Error("falha ao semear a segunda consultora de teste");
      }

      const leadId = await seedLead({
        name: "Lead Compartilhado",
        whatsapp: "11900000003",
        status: "new",
      });
      // Compromisso de outra consultora, mesmo lead_id (a tabela `leads` não
      // tem consultant_id — drift documentado): não deve ser alterado pela
      // conversão feita pela consultora A.
      const otherConsultantAppointmentId = await seedAppointment({
        consultantId: otherConsultantRow.id,
        leadId,
      });

      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);

      const [rawAppointment] = await ctx.db
        .select({ clientId: appointments.clientId })
        .from(appointments)
        .where(eq(appointments.id, otherConsultantAppointmentId));
      expect(rawAppointment?.clientId).toBeNull();
    });

    it("compromisso do lead com venda vinculada é convertido sem falhar e mantém o vínculo de venda", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      const consultantId = (
        await ctx.db.select({ id: consultants.id }).from(consultants).limit(1)
      )[0]?.id;
      if (!consultantId) {
        throw new Error("consultora de teste não encontrada");
      }
      const leadId = await seedLead({
        name: "Lead Com Venda",
        whatsapp: "11900000004",
        status: "new",
      });
      // Venda sem cliente (nullable, ADR-0013) — vinculável a qualquer
      // compromisso; representa um vínculo antigo que a conversão não revalida.
      const saleId = await seedCompletedSale({
        consultantId,
        clientId: null,
        clientName: "Venda Avulsa",
      });
      const appointmentId = await seedAppointment({
        consultantId,
        leadId,
        saleId,
      });

      const convertResponse = await convertLead(app, leadId, token);
      expect(convertResponse.status).toBe(HTTP_CREATED);
      const client: Client = clientSchema.parse(await convertResponse.json());

      const appointmentResponse = await getAppointment(
        app,
        appointmentId,
        token,
      );
      expect(appointmentResponse.status).toBe(HTTP_OK);
      const appointment: Appointment = appointmentSchema.parse(
        await appointmentResponse.json(),
      );
      expect(appointment.clientId).toBe(client.id);
      expect(appointment.saleId).toBe(saleId);
    });
  });

  describe("GET /leads?search= (RF-14, crm-appointments)", () => {
    it("filtra por nome parcial, case-insensitive", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      await seedLead({ name: "Maria Silva", whatsapp: "11900000001" });
      await seedLead({ name: "Joana Souza", whatsapp: "11900000002" });

      const response = await getLeads(app, token, "?search=mari");
      expect(response.status).toBe(HTTP_OK);
      const list = crmLeadListSchema.parse(await response.json());

      expect(list.data.map((lead) => lead.name)).toEqual(["Maria Silva"]);
    });

    it("filtra por WhatsApp com termo só de dígitos (casa o número normalizado)", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      await seedLead({ name: "Lead Alvo", whatsapp: "11987654321" });
      await seedLead({ name: "Lead Outro", whatsapp: "11900000000" });

      const response = await getLeads(app, token, "?search=987654321");
      expect(response.status).toBe(HTTP_OK);
      const list = crmLeadListSchema.parse(await response.json());

      expect(list.data.map((lead) => lead.name)).toEqual(["Lead Alvo"]);
    });

    it("combina search com status", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      await seedLead({
        name: "Maria Nova",
        whatsapp: "11900000001",
        status: "new",
      });
      await seedLead({
        name: "Maria Contatada",
        whatsapp: "11900000002",
        status: "contacted",
      });

      const response = await getLeads(app, token, "?search=maria&status=new");
      expect(response.status).toBe(HTTP_OK);
      const list = crmLeadListSchema.parse(await response.json());

      expect(list.data.map((lead) => lead.name)).toEqual(["Maria Nova"]);
    });

    it("combina search com paginação", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      await seedLead({
        name: "Repetida 1",
        whatsapp: "11900000001",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });
      await seedLead({
        name: "Repetida 2",
        whatsapp: "11900000002",
        createdAt: new Date("2026-01-02T10:00:00.000Z"),
      });
      await seedLead({
        name: "Repetida 3",
        whatsapp: "11900000003",
        createdAt: new Date("2026-01-03T10:00:00.000Z"),
      });

      const response = await getLeads(
        app,
        token,
        "?search=repetida&page=1&perPage=2",
      );
      expect(response.status).toBe(HTTP_OK);
      const list = crmLeadListSchema.parse(await response.json());

      expect(list.total).toBe(3);
      expect(list.data).toHaveLength(2);
      expect(list.data.map((lead) => lead.name)).toEqual([
        "Repetida 3",
        "Repetida 2",
      ]);
    });

    it("listagem sem search não muda de comportamento (sem regressão)", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);
      await seedLead({
        name: "Lead A",
        whatsapp: "11900000001",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });
      await seedLead({
        name: "Lead B",
        whatsapp: "11900000002",
        createdAt: new Date("2026-01-02T10:00:00.000Z"),
      });

      const response = await getLeads(app, token);
      expect(response.status).toBe(HTTP_OK);
      const list = crmLeadListSchema.parse(await response.json());

      expect(list.total).toBe(2);
      expect(list.data.map((lead) => lead.name)).toEqual(["Lead B", "Lead A"]);
    });
  });

  describe("guard default-deny (RF-03)", () => {
    it("sem token ⇒ 401 nas 4 rotas do CRM de leads", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        getLeads(app, undefined),
        getLead(app, NONEXISTENT_UUID, undefined),
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

  describe("POST /leads/manual (RF-24, crm-appointments)", () => {
    it("201 autenticado: cria lead com source crm_manual, consent_at preenchido e status new", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await createLeadManual(
        app,
        { name: "Fernanda Costa", whatsapp: "(11) 98888-7777" },
        token,
      );
      expect(response.status).toBe(HTTP_CREATED);
      const lead = crmLeadSchema.parse(await response.json());
      expect(lead.name).toBe("Fernanda Costa");
      expect(lead.whatsapp).toBe("11988887777");
      expect(lead.source).toBe("crm_manual");
      expect(lead.status).toBe("new");
      expect(lead.clientId).toBeNull();

      // `consentAt` não faz parte do contrato de saída do lead (minimização de
      // dado pessoal na resposta) — a prova de que foi gravado é direto no banco.
      const [row] = await ctx.db
        .select({ consentAt: leads.consentAt, source: leads.source })
        .from(leads)
        .where(eq(leads.id, lead.id));
      expect(row?.consentAt).toBeInstanceOf(Date);
      expect(row?.source).toBe("crm_manual");
    });

    it("sem token ⇒ 401 e nada é persistido", async () => {
      const app = buildApp();

      const response = await createLeadManual(app, {
        name: "Sem Sessão",
        whatsapp: "11988887777",
      });
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(UNAUTHORIZED_CODE);

      const [row] = await ctx.db
        .select({ value: count() })
        .from(leads)
        .where(eq(leads.whatsapp, "11988887777"));
      expect(row?.value).toBe(0);
    });

    it("whatsapp inválido ⇒ 422 com a mesma mensagem pt-BR do schema compartilhado", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await createLeadManual(
        app,
        { name: "Nome Válido", whatsapp: "1234" },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toBe(WHATSAPP_INVALID_MESSAGE);
    });

    it("nome ausente ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const response = await createLeadManual(
        app,
        { whatsapp: "11988887777" },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toBe("Informe seu nome completo");
    });

    it("lead criado pelo CRM aparece na listagem e é distinguível pelo source (vs. captura pública)", async () => {
      const app = buildApp();
      const token = await seedConsultantSession(app);

      const manualResponse = await createLeadManual(
        app,
        { name: "Lead Manual", whatsapp: "11977776666" },
        token,
      );
      expect(manualResponse.status).toBe(HTTP_CREATED);
      const manualLead = crmLeadSchema.parse(await manualResponse.json());

      const publicLeadId = await captureLead(app, {
        name: "Lead Landing",
        whatsapp: "11955554444",
        consent: true,
      });

      const list = await findLeadInList(app, token, manualLead.id);
      expect(list?.source).toBe("crm_manual");

      const publicInList = await findLeadInList(app, token, publicLeadId);
      expect(publicInList?.source).toBe("landing");
    });
  });

  // O achado que motivou `POST /leads/manual` (em vez de reusar `POST /leads`
  // autenticado): o Elysia resolve dois handlers no mesmo (método, path) com o
  // ÚLTIMO `.use()` composto vencendo para TODA requisição — comprovado por
  // repro isolada. Estes testes rodam contra o app REAL e composto
  // (`buildApp()` monta leads públicas + leads CRM juntas, igual a
  // `apps/api/src/app.ts`) para provar que a captura pública da landing
  // continua intocada depois da rota nova.
  describe("Regressão: POST /leads público continua intacto (RF-24, crm-appointments)", () => {
    const captureBody = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      name: "Visitante Landing",
      whatsapp: "11987654321",
      consent: true,
      ...overrides,
    });

    it("honeypot: website não-vazio responde 201 sem persistir", async () => {
      const app = buildApp();

      const response = await app.handle(
        new Request("http://localhost/leads", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.20",
          },
          body: JSON.stringify(captureBody({ website: "http://spam.example" })),
        }),
      );
      expect(response.status).toBe(HTTP_CREATED);

      const [row] = await ctx.db.select({ value: count() }).from(leads);
      expect(row?.value).toBe(0);
    });

    it("rate limit por IP: a N+1ª requisição pública do mesmo IP ⇒ 429", async () => {
      const app = buildApp();
      const spammerIp = "198.51.100.70";

      const postCapture = () =>
        app.handle(
          new Request("http://localhost/leads", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": spammerIp,
            },
            body: JSON.stringify(captureBody()),
          }),
        );

      for (let attempt = 0; attempt < RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
        const allowed = await postCapture();
        expect(allowed.status).toBe(HTTP_CREATED);
      }

      const blocked = await postCapture();
      expect(blocked.status).toBe(HTTP_TOO_MANY_REQUESTS);
      const body = apiErrorSchema.parse(await blocked.json());
      expect(body.error.code).toBe("RATE_LIMITED");
    });

    it("source default 'landing' preservado na captura pública, distinto do crm_manual", async () => {
      const app = buildApp();

      const publicLeadId = await captureLead(
        app,
        captureBody({ name: "Visitante Público", whatsapp: "11900000098" }),
      );

      const [row] = await ctx.db
        .select({ source: leads.source })
        .from(leads)
        .where(eq(leads.id, publicLeadId));
      expect(row?.source).toBe("landing");
    });
  });
});
