import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  type Appointment,
  apiErrorSchema,
  appointmentConflictsResponseSchema,
  appointmentSchema,
  loginResponseSchema,
} from "@clientela/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { clients, consultants, sales } from "../../db/schema";
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
import { createDashboardService } from "../dashboard/dashboard.service";
import { createDashboardPerformanceRepository } from "../dashboard/dashboard-performance.repository";
import { createDashboardTodayRepository } from "../dashboard/dashboard-today.repository";
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createOrdersRepository } from "../orders/orders.repository";
import { createOrdersService } from "../orders/orders.service";
import { createProductsRepository } from "../products/products.repository";
import { createProductsService } from "../products/products.service";
import { createSalesRepository } from "../sales/sales.repository";
import { createSalesService } from "../sales/sales.service";
import { createAppointmentsRepository } from "./appointments.repository";
import { createAppointmentsService } from "./appointments.service";

// ---------------------------------------------------------------------------
// Escopo DESTE arquivo (spec-driven, ver specs/crm-appointments/spec.md):
// RF-08 (matriz de transições + efeito sobre sale_id), RF-08.1 (concorrência
// entre endpoints com guards diferentes — ADR-0015/lesson 2026-07-20 sobre
// EvalPlanQual), RF-10 (vínculo de venda) e RF-07 (compatibilidade de
// clientId trocado com venda vinculada) e RF-11 (conflitos de agenda).
// Criação/listagem/detalhe/edição "pura"/exclusão/auth/fuso são cobertos em
// outro arquivo de integração do módulo — não duplicados aqui.
// ---------------------------------------------------------------------------

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const APPOINTMENT_NOT_FOUND_CODE = "APPOINTMENT_NOT_FOUND";
const APPOINTMENT_STATE_CODE = "APPOINTMENT_STATE";
const INVALID_APPOINTMENT_SALE_CODE = "INVALID_APPOINTMENT_SALE";

const CORRECT_PASSWORD = "senha-super-secreta";
const CONSULTANT_A = {
  name: "Consultora A",
  email: "consultora-a@example.com",
  whatsapp: "11987654321",
} as const;
const CONSULTANT_B = {
  name: "Consultora B",
  email: "consultora-b@example.com",
  whatsapp: "11912345678",
} as const;

// uuid v4 sintaticamente válido porém inexistente no banco: prova que "não
// existe" e "não é seu" respondem o MESMO 404/422, sem vazar existência.
const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

// Concorrência (RF-08.1): repetido múltiplas vezes, recriando o estado a cada
// rodada — comprova o resultado por amostragem, não por uma corrida só.
const CONCURRENCY_ROUNDS = 5;

// Hasher real de KDF do Node (scrypt): os workers do Vitest rodam sob Node,
// onde o global `Bun` (argon2id) não existe. Espelha orders/sales/products.
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

const jsonHeaders = (token?: string): Record<string, string> => ({
  "content-type": "application/json",
  ...(token ? bearer(token) : {}),
});

describe("appointments — ciclo de vida e vínculo de venda (integração)", () => {
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

  // App real: repositórios/serviços apontando para o Postgres do container
  // (mesmo padrão de orders.integration.test.ts — AppDeps exige todos os
  // módulos, mesmo os não exercitados diretamente aqui).
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
  type Consultant = typeof CONSULTANT_A | typeof CONSULTANT_B;

  const seedConsultant = async (data: Consultant): Promise<string> => {
    const [row] = await ctx.db
      .insert(consultants)
      .values({
        name: data.name,
        email: data.email,
        passwordHash,
        whatsapp: data.whatsapp,
      })
      .returning({ id: consultants.id });
    if (!row) {
      throw new Error("falha ao semear a consultora de teste");
    }
    return row.id;
  };

  const login = async (app: App, data: Consultant): Promise<string> => {
    const response = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.email, password: CORRECT_PASSWORD }),
      }),
    );
    expect(response.status).toBe(HTTP_OK);
    const body = loginResponseSchema.parse(await response.json());
    return body.token;
  };

  const seedConsultantSession = async (
    app: App,
    data: Consultant,
  ): Promise<{ consultantId: string; token: string }> => {
    const consultantId = await seedConsultant(data);
    const token = await login(app, data);
    return { consultantId, token };
  };

  type SeedClientValues = {
    name: string;
    whatsapp: string;
  };

  const seedClient = async (
    consultantId: string,
    values: SeedClientValues,
  ): Promise<string> => {
    const [row] = await ctx.db
      .insert(clients)
      .values({ consultantId, ...values })
      .returning({ id: clients.id });
    if (!row) {
      throw new Error("falha ao semear a cliente de teste");
    }
    return row.id;
  };

  type SeedSaleValues = {
    clientId?: string | null;
    clientName?: string;
    totalCents?: number;
    paymentMethod?: "cash" | "pix" | "card" | "credit";
    status?: "open" | "completed" | "canceled";
  };

  // Semeadura direta de venda (o comportamento sob teste é o vínculo
  // compromisso↔venda, não o POST /sales) — mesmo padrão de
  // orders/sales.integration.test.ts.
  const seedSale = async (
    consultantId: string,
    values: SeedSaleValues = {},
  ): Promise<string> => {
    const timestamp = new Date();
    const status = values.status ?? "completed";
    const [row] = await ctx.db
      .insert(sales)
      .values({
        consultantId,
        clientId: values.clientId ?? null,
        clientName: values.clientName ?? "Cliente Semeada",
        totalCents: values.totalCents ?? 10_000,
        paymentMethod: values.paymentMethod ?? "credit",
        paymentCondition:
          (values.paymentMethod ?? "credit") === "credit"
            ? "installments"
            : "received",
        installments: 1,
        status,
        soldAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(status === "completed"
          ? { deliveredAt: timestamp, completedAt: timestamp }
          : {}),
        ...(status === "canceled" ? { canceledAt: timestamp } : {}),
      })
      .returning({ id: sales.id });
    if (!row) {
      throw new Error("falha ao semear a venda de teste");
    }
    return row.id;
  };

  const deleteSaleDirectly = async (saleId: string): Promise<void> => {
    await ctx.db.delete(sales).where(eq(sales.id, saleId));
  };

  // ------------------------- requesters HTTP -------------------------

  type AppointmentBody = Record<string, unknown>;

  const DEFAULT_STARTS_AT = "2026-09-01T12:00:00.000Z";
  const DEFAULT_DURATION_MINUTES = 60;

  const appointmentBody = (
    overrides: AppointmentBody = {},
  ): AppointmentBody => ({
    kind: "demo",
    startsAt: DEFAULT_STARTS_AT,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    ...overrides,
  });

  const postAppointment = (
    app: App,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/appointments", {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const getAppointment = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}`, {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const putAppointment = (
    app: App,
    id: string,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}`, {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const deleteAppointment = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}`, {
        method: "DELETE",
        headers: token ? bearer(token) : {},
      }),
    );

  const markDone = (
    app: App,
    id: string,
    token: string | undefined,
    body: { saleId?: string } = {},
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}/done`, {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const markNoShow = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}/no-show`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const cancelAppointment = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}/cancel`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const putAppointmentSale = (
    app: App,
    id: string,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}/sale`, {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const getConflicts = (
    app: App,
    token: string,
    query: {
      startsAt: string;
      durationMinutes: number;
      excludeId?: string;
    },
  ): Promise<Response> => {
    const params = new URLSearchParams({
      startsAt: query.startsAt,
      durationMinutes: String(query.durationMinutes),
    });
    if (query.excludeId) {
      params.set("excludeId", query.excludeId);
    }
    return app.handle(
      new Request(`http://localhost/appointments/conflicts?${params}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );
  };

  const createAppointmentOk = async (
    app: App,
    body: unknown,
    token: string,
  ): Promise<Appointment> => {
    const response = await postAppointment(app, body, token);
    expect(response.status).toBe(HTTP_CREATED);
    return appointmentSchema.parse(await response.json());
  };

  const getAppointmentOk = async (
    app: App,
    id: string,
    token: string,
  ): Promise<Appointment> => {
    const response = await getAppointment(app, id, token);
    expect(response.status).toBe(HTTP_OK);
    return appointmentSchema.parse(await response.json());
  };

  // -------------------------------------------------------------------------
  // RF-08 — matriz de transições e efeito sobre o vínculo de venda
  // -------------------------------------------------------------------------
  describe("matriz de transições (RF-08)", () => {
    it("de scheduled: done ⇒ 200 com status done", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const appt = await createAppointmentOk(app, appointmentBody(), token);

      const response = await markDone(app, appt.id, token);
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.status).toBe("done");
    });

    it("de scheduled: no-show ⇒ 200 com status no_show", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const appt = await createAppointmentOk(app, appointmentBody(), token);

      const response = await markNoShow(app, appt.id, token);
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.status).toBe("no_show");
    });

    it("de scheduled: cancel ⇒ 200 com status canceled", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const appt = await createAppointmentOk(app, appointmentBody(), token);

      const response = await cancelAppointment(app, appt.id, token);
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.status).toBe("canceled");
    });

    it("de qualquer status terminal, qualquer transição ⇒ 409 (matriz completa 3×3)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const reachTerminal: Record<string, (id: string) => Promise<Response>> = {
        done: (id) => markDone(app, id, token),
        no_show: (id) => markNoShow(app, id, token),
        canceled: (id) => cancelAppointment(app, id, token),
      };

      for (const [terminalStatus, reach] of Object.entries(reachTerminal)) {
        const appt = await createAppointmentOk(app, appointmentBody(), token);
        const reached = await reach(appt.id);
        expect(reached.status).toBe(HTTP_OK);

        for (const [, attempt] of Object.entries(reachTerminal)) {
          const response = await attempt(appt.id);
          expect(response.status).toBe(HTTP_CONFLICT);
          const errorBody = apiErrorSchema.parse(await response.json());
          expect(errorBody.error.code).toBe(APPOINTMENT_STATE_CODE);
        }

        const final = await getAppointmentOk(app, appt.id, token);
        expect(final.status).toBe(terminalStatus);
      }
    });

    it("compromisso inexistente ⇒ 404 em done/no-show/cancel", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const responses = await Promise.all([
        markDone(app, NONEXISTENT_UUID, token),
        markNoShow(app, NONEXISTENT_UUID, token),
        cancelAppointment(app, NONEXISTENT_UUID, token),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(HTTP_NOT_FOUND);
        const body = apiErrorSchema.parse(await response.json());
        expect(body.error.code).toBe(APPOINTMENT_NOT_FOUND_CODE);
      }
    });

    it("done com saleId válido ⇒ 200 com o vínculo preenchido", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Maria",
        whatsapp: "11911112222",
      });
      const saleId = await seedSale(consultantId, {
        clientId,
        totalCents: 25_000,
      });
      const appt = await createAppointmentOk(
        app,
        appointmentBody({ clientId }),
        token,
      );

      const response = await markDone(app, appt.id, token, { saleId });
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.status).toBe("done");
      expect(body.saleId).toBe(saleId);
      expect(body.saleTotalCents).toBe(25_000);
    });

    it("done com saleId inválido ⇒ 422 e o compromisso permanece scheduled sem vínculo (transação aborta)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const appt = await createAppointmentOk(app, appointmentBody(), token);

      const response = await markDone(app, appt.id, token, {
        saleId: NONEXISTENT_UUID,
      });
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_APPOINTMENT_SALE_CODE);

      const after = await getAppointmentOk(app, appt.id, token);
      expect(after.status).toBe("scheduled");
      expect(after.saleId).toBeNull();
    });

    it("done sem saleId preserva vínculo de venda feito antes (ainda scheduled)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId);
      const appt = await createAppointmentOk(app, appointmentBody(), token);
      const linkResponse = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(linkResponse.status).toBe(HTTP_OK);

      const response = await markDone(app, appt.id, token);
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.status).toBe("done");
      expect(body.saleId).toBe(saleId);
    });

    it("cancel sobre compromisso com venda vinculada ⇒ 200 e saleId volta a nulo", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId);
      const appt = await createAppointmentOk(app, appointmentBody(), token);
      expect(
        (await putAppointmentSale(app, appt.id, { saleId }, token)).status,
      ).toBe(HTTP_OK);

      const response = await cancelAppointment(app, appt.id, token);
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.status).toBe("canceled");
      expect(body.saleId).toBeNull();
    });

    it("no_show sobre compromisso com venda vinculada ⇒ 200 e saleId volta a nulo", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId);
      const appt = await createAppointmentOk(app, appointmentBody(), token);
      expect(
        (await putAppointmentSale(app, appt.id, { saleId }, token)).status,
      ).toBe(HTTP_OK);

      const response = await markNoShow(app, appt.id, token);
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.status).toBe("no_show");
      expect(body.saleId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // RF-08.1 — concorrência entre endpoints com guards diferentes
  // (ADR-0015 / lesson 2026-07-20 — EvalPlanQual: o guard de `PUT /:id/sale`
  // é `status IN ('scheduled','done')`, superconjunto do alvo de `done`, então
  // nem todo par serializa a corrida como exclusividade estrita).
  // -------------------------------------------------------------------------
  describe("concorrência entre transições (RF-08.1)", () => {
    it("done ‖ cancel: exatamente uma 200 e uma 409, status final é o da vencedora", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      for (let round = 0; round < CONCURRENCY_ROUNDS; round += 1) {
        const appt = await createAppointmentOk(app, appointmentBody(), token);

        const [doneResponse, cancelResponse] = await Promise.all([
          markDone(app, appt.id, token),
          cancelAppointment(app, appt.id, token),
        ]);

        const statuses = [doneResponse.status, cancelResponse.status].toSorted(
          (a, b) => a - b,
        );
        expect(statuses).toEqual([HTTP_OK, HTTP_CONFLICT]);

        const final = await getAppointmentOk(app, appt.id, token);
        if (doneResponse.status === HTTP_OK) {
          expect(cancelResponse.status).toBe(HTTP_CONFLICT);
          expect(final.status).toBe("done");
        } else {
          expect(cancelResponse.status).toBe(HTTP_OK);
          expect(final.status).toBe("canceled");
        }

        const conflictResponse =
          doneResponse.status === HTTP_CONFLICT ? doneResponse : cancelResponse;
        const conflictBody = apiErrorSchema.parse(
          await conflictResponse.json(),
        );
        expect(conflictBody.error.code).toBe(APPOINTMENT_STATE_CODE);
      }
    });

    // Guard de linkSale (`scheduled`/`done`) é SUPERCONJUNTO do alvo de
    // `cancel`/`no_show` só indiretamente: a transição limpa `sale_id` no
    // MESMO update que muda o status, então o resultado final satisfaz a
    // invariante do RF-08 em QUALQUER ordem de commit — não asserta o par de
    // códigos HTTP (seria teste flaky), só o estado final.
    it("cancel ‖ linkSale: estado final SEMPRE canceled com saleId nulo", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      for (let round = 0; round < CONCURRENCY_ROUNDS; round += 1) {
        const saleId = await seedSale(consultantId);
        const appt = await createAppointmentOk(app, appointmentBody(), token);

        const [cancelResponse, linkResponse] = await Promise.all([
          cancelAppointment(app, appt.id, token),
          putAppointmentSale(app, appt.id, { saleId }, token),
        ]);

        expect([HTTP_OK, HTTP_CONFLICT]).toContain(cancelResponse.status);
        expect([HTTP_OK, HTTP_CONFLICT]).toContain(linkResponse.status);

        const final = await getAppointmentOk(app, appt.id, token);
        expect(final.status).toBe("canceled");
        expect(final.saleId).toBeNull();
      }
    });

    it("no_show ‖ linkSale: estado final SEMPRE no_show com saleId nulo", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      for (let round = 0; round < CONCURRENCY_ROUNDS; round += 1) {
        const saleId = await seedSale(consultantId);
        const appt = await createAppointmentOk(app, appointmentBody(), token);

        const [noShowResponse, linkResponse] = await Promise.all([
          markNoShow(app, appt.id, token),
          putAppointmentSale(app, appt.id, { saleId }, token),
        ]);

        expect([HTTP_OK, HTTP_CONFLICT]).toContain(noShowResponse.status);
        expect([HTTP_OK, HTTP_CONFLICT]).toContain(linkResponse.status);

        const final = await getAppointmentOk(app, appt.id, token);
        expect(final.status).toBe("no_show");
        expect(final.saleId).toBeNull();
      }
    });

    it("done ‖ linkSale: estado final SEMPRE done com saleId preenchido", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      for (let round = 0; round < CONCURRENCY_ROUNDS; round += 1) {
        const saleId = await seedSale(consultantId);
        const appt = await createAppointmentOk(app, appointmentBody(), token);

        const [doneResponse, linkResponse] = await Promise.all([
          markDone(app, appt.id, token),
          putAppointmentSale(app, appt.id, { saleId }, token),
        ]);

        expect([HTTP_OK, HTTP_CONFLICT]).toContain(doneResponse.status);
        expect([HTTP_OK, HTTP_CONFLICT]).toContain(linkResponse.status);

        const final = await getAppointmentOk(app, appt.id, token);
        expect(final.status).toBe("done");
        expect(final.saleId).toBe(saleId);
      }
    });

    it("PUT ‖ cancel: estado final SEMPRE canceled, com a edição aplicada ou 409", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const ORIGINAL_TITLE = "Sessão original";
      const EDITED_TITLE = "Sessão editada";

      for (let round = 0; round < CONCURRENCY_ROUNDS; round += 1) {
        const appt = await createAppointmentOk(
          app,
          appointmentBody({ title: ORIGINAL_TITLE }),
          token,
        );

        const [putResponse, cancelResponse] = await Promise.all([
          putAppointment(app, appt.id, { title: EDITED_TITLE }, token),
          cancelAppointment(app, appt.id, token),
        ]);

        expect([HTTP_OK, HTTP_CONFLICT]).toContain(putResponse.status);
        expect([HTTP_OK, HTTP_CONFLICT]).toContain(cancelResponse.status);

        const final = await getAppointmentOk(app, appt.id, token);
        expect(final.status).toBe("canceled");
        expect([ORIGINAL_TITLE, EDITED_TITLE]).toContain(final.title);
      }
    });

    it("DELETE ‖ cancel: 204 e (200 ou 404) — nunca 409 (a linha some, o fallback devolve 404)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      for (let round = 0; round < CONCURRENCY_ROUNDS; round += 1) {
        const appt = await createAppointmentOk(app, appointmentBody(), token);

        const [deleteResponse, cancelResponse] = await Promise.all([
          deleteAppointment(app, appt.id, token),
          cancelAppointment(app, appt.id, token),
        ]);

        expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);
        expect(cancelResponse.status).not.toBe(HTTP_CONFLICT);
        expect([HTTP_OK, HTTP_NOT_FOUND]).toContain(cancelResponse.status);

        if (cancelResponse.status === HTTP_NOT_FOUND) {
          const body = apiErrorSchema.parse(await cancelResponse.json());
          expect(body.error.code).toBe(APPOINTMENT_NOT_FOUND_CODE);
        }

        // Invariante: a linha nunca sobrevive à corrida (delete sempre vence
        // a existência da linha, cancel nunca "ressuscita" o registro).
        const afterDelete = await getAppointment(app, appt.id, token);
        expect(afterDelete.status).toBe(HTTP_NOT_FOUND);
      }
    });
  });

  // -------------------------------------------------------------------------
  // RF-10 (+ RF-07) — vínculo de venda
  // -------------------------------------------------------------------------
  describe("vínculo com venda (RF-10)", () => {
    it("vincular venda completed da mesma cliente ⇒ 200 com saleId e saleTotalCents", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Ana",
        whatsapp: "11922223333",
      });
      const saleId = await seedSale(consultantId, {
        clientId,
        totalCents: 15_000,
      });
      const appt = await createAppointmentOk(
        app,
        appointmentBody({ clientId }),
        token,
      );

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.saleId).toBe(saleId);
      expect(body.saleTotalCents).toBe(15_000);
    });

    it("vincular venda ABERTA ⇒ 200 (CRM-12: o ciclo começa em aberto)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Bruna",
        whatsapp: "11933334444",
      });
      // Encomenda combinada no compromisso: a venda existe, ainda não foi
      // entregue nem paga. Exigir `completed` deixaria justamente esse caso —
      // o mais comum na agenda — sem vínculo possível.
      const saleId = await seedSale(consultantId, {
        clientId,
        totalCents: 20_000,
        status: "open",
      });
      const appt = await createAppointmentOk(
        app,
        appointmentBody({ clientId }),
        token,
      );

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.saleId).toBe(saleId);
      expect(body.saleTotalCents).toBe(20_000);
    });

    it("vincular venda CANCELADA ⇒ 422 (mesma mensagem genérica)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId, { status: "canceled" });
      const appt = await createAppointmentOk(app, appointmentBody(), token);

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    });

    it("venda de outra consultora ⇒ 422 com a MESMA mensagem genérica de um id inexistente", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const saleOfB = await seedSale(idB);
      const appt = await createAppointmentOk(app, appointmentBody(), tokenA);

      const withNonexistent = await putAppointmentSale(
        app,
        appt.id,
        { saleId: NONEXISTENT_UUID },
        tokenA,
      );
      const withOthers = await putAppointmentSale(
        app,
        appt.id,
        { saleId: saleOfB },
        tokenA,
      );

      expect(withNonexistent.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(withOthers.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const bodyNonexistent = apiErrorSchema.parse(
        await withNonexistent.json(),
      );
      const bodyOthers = apiErrorSchema.parse(await withOthers.json());
      expect(bodyNonexistent.error.code).toBe(INVALID_APPOINTMENT_SALE_CODE);
      expect(bodyOthers.error.code).toBe(INVALID_APPOINTMENT_SALE_CODE);
      expect(bodyOthers.error.message).toBe(bodyNonexistent.error.message);
    });

    it("venda canceled ⇒ 422", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId, { status: "canceled" });
      const appt = await createAppointmentOk(app, appointmentBody(), token);

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_APPOINTMENT_SALE_CODE);
    });

    it("venda de cliente diferente do compromisso ⇒ 422", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientA = await seedClient(consultantId, {
        name: "Cliente A",
        whatsapp: "11933334444",
      });
      const clientB = await seedClient(consultantId, {
        name: "Cliente B",
        whatsapp: "11944445555",
      });
      const saleOfB = await seedSale(consultantId, { clientId: clientB });
      const appt = await createAppointmentOk(
        app,
        appointmentBody({ clientId: clientA }),
        token,
      );

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId: saleOfB },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_APPOINTMENT_SALE_CODE);
    });

    it("venda sem cliente ⇒ 200 (vinculável a compromisso com cliente)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Cliente C",
        whatsapp: "11955556666",
      });
      const saleWithoutClient = await seedSale(consultantId, {
        clientId: null,
      });
      const appt = await createAppointmentOk(
        app,
        appointmentBody({ clientId }),
        token,
      );

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId: saleWithoutClient },
        token,
      );
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.saleId).toBe(saleWithoutClient);
    });

    it("compromisso sem cliente com venda de qualquer cliente ⇒ 200", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Cliente D",
        whatsapp: "11966667777",
      });
      const saleId = await seedSale(consultantId, { clientId });
      const appt = await createAppointmentOk(app, appointmentBody(), token);

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.saleId).toBe(saleId);
    });

    it("{ saleId: null } desvincula ⇒ 200", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId);
      const appt = await createAppointmentOk(app, appointmentBody(), token);
      expect(
        (await putAppointmentSale(app, appt.id, { saleId }, token)).status,
      ).toBe(HTTP_OK);

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId: null },
        token,
      );
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentSchema.parse(await response.json());
      expect(body.saleId).toBeNull();
    });

    it("vincular em compromisso canceled ⇒ 409", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId);
      const appt = await createAppointmentOk(app, appointmentBody(), token);
      expect((await cancelAppointment(app, appt.id, token)).status).toBe(
        HTTP_OK,
      );

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(APPOINTMENT_STATE_CODE);
    });

    it("vincular em compromisso no_show ⇒ 409", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId);
      const appt = await createAppointmentOk(app, appointmentBody(), token);
      expect((await markNoShow(app, appt.id, token)).status).toBe(HTTP_OK);

      const response = await putAppointmentSale(
        app,
        appt.id,
        { saleId },
        token,
      );
      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(APPOINTMENT_STATE_CODE);
    });

    it("excluir a venda vinculada mantém o compromisso com saleId nulo (FK SET NULL)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId);
      const appt = await createAppointmentOk(app, appointmentBody(), token);
      expect(
        (await putAppointmentSale(app, appt.id, { saleId }, token)).status,
      ).toBe(HTTP_OK);

      await deleteSaleDirectly(saleId);

      const after = await getAppointmentOk(app, appt.id, token);
      expect(after.saleId).toBeNull();
      expect(after.saleTotalCents).toBeNull();
      // O compromisso em si permanece íntegro (só a FK some).
      expect(after.status).toBe("scheduled");
    });

    it("RF-07: trocar clientId de compromisso com venda de OUTRA cliente ⇒ 422 e nada é alterado", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientA = await seedClient(consultantId, {
        name: "Cliente A",
        whatsapp: "11977778888",
      });
      const clientB = await seedClient(consultantId, {
        name: "Cliente B",
        whatsapp: "11988889999",
      });
      const saleId = await seedSale(consultantId, { clientId: clientA });
      const appt = await createAppointmentOk(
        app,
        appointmentBody({ clientId: clientA }),
        token,
      );
      expect(
        (await putAppointmentSale(app, appt.id, { saleId }, token)).status,
      ).toBe(HTTP_OK);

      const response = await putAppointment(
        app,
        appt.id,
        { clientId: clientB },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_APPOINTMENT_SALE_CODE);

      const after = await getAppointmentOk(app, appt.id, token);
      expect(after.clientId).toBe(clientA);
      expect(after.saleId).toBe(saleId);
    });

    it("RF-07/RF-10: PUT { clientId: null } em compromisso com venda de cliente ⇒ 200 e venda preservada", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientA = await seedClient(consultantId, {
        name: "Cliente A",
        whatsapp: "11977778888",
      });
      const saleId = await seedSale(consultantId, { clientId: clientA });
      const appt = await createAppointmentOk(
        app,
        appointmentBody({ clientId: clientA }),
        token,
      );
      expect(
        (await putAppointmentSale(app, appt.id, { saleId }, token)).status,
      ).toBe(HTTP_OK);

      const response = await putAppointment(
        app,
        appt.id,
        { clientId: null },
        token,
      );
      expect(response.status).toBe(HTTP_OK);
      const updated = appointmentSchema.parse(await response.json());
      expect(updated.clientId).toBeNull();
      expect(updated.saleId).toBe(saleId);
    });
  });

  // -------------------------------------------------------------------------
  // RF-11 — conflitos de agenda (aviso, sem bloqueio)
  // -------------------------------------------------------------------------
  describe("conflitos (RF-11)", () => {
    const EXISTING_STARTS_AT = "2026-09-10T12:00:00.000Z"; // 12:00–13:00
    const EXISTING_DURATION = 60;

    it("intervalo contido no existente ⇒ conflito", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );

      const response = await getConflicts(app, token, {
        startsAt: "2026-09-10T12:15:00.000Z",
        durationMinutes: 30,
      });
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentConflictsResponseSchema.parse(
        await response.json(),
      );
      expect(body.data).toHaveLength(1);
    });

    it("sobreposição parcial no início do existente ⇒ conflito", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );

      // [11:30, 12:30) sobrepõe o início de [12:00, 13:00).
      const response = await getConflicts(app, token, {
        startsAt: "2026-09-10T11:30:00.000Z",
        durationMinutes: 60,
      });
      const body = appointmentConflictsResponseSchema.parse(
        await response.json(),
      );
      expect(body.data).toHaveLength(1);
    });

    it("sobreposição parcial no fim do existente ⇒ conflito", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );

      // [12:30, 13:30) sobrepõe o fim de [12:00, 13:00).
      const response = await getConflicts(app, token, {
        startsAt: "2026-09-10T12:30:00.000Z",
        durationMinutes: 60,
      });
      const body = appointmentConflictsResponseSchema.parse(
        await response.json(),
      );
      expect(body.data).toHaveLength(1);
    });

    it("intervalo consultado contém o existente ⇒ conflito", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );

      // [11:00, 14:00) contém [12:00, 13:00).
      const response = await getConflicts(app, token, {
        startsAt: "2026-09-10T11:00:00.000Z",
        durationMinutes: 180,
      });
      const body = appointmentConflictsResponseSchema.parse(
        await response.json(),
      );
      expect(body.data).toHaveLength(1);
    });

    it("limites tocando (fim == início) ⇒ NÃO é conflito, em ambas as direções", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );

      // [11:00, 12:00) termina exatamente quando o existente começa (12:00).
      const beforeTouching = await getConflicts(app, token, {
        startsAt: "2026-09-10T11:00:00.000Z",
        durationMinutes: 60,
      });
      const beforeBody = appointmentConflictsResponseSchema.parse(
        await beforeTouching.json(),
      );
      expect(beforeBody.data).toHaveLength(0);

      // [13:00, 13:30) começa exatamente quando o existente termina (13:00).
      const afterTouching = await getConflicts(app, token, {
        startsAt: "2026-09-10T13:00:00.000Z",
        durationMinutes: 30,
      });
      const afterBody = appointmentConflictsResponseSchema.parse(
        await afterTouching.json(),
      );
      expect(afterBody.data).toHaveLength(0);
    });

    it("compromisso done/no_show/canceled ⇒ não é conflito", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const doneAppt = await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );
      expect((await markDone(app, doneAppt.id, token)).status).toBe(HTTP_OK);

      const noShowAppt = await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );
      expect((await markNoShow(app, noShowAppt.id, token)).status).toBe(
        HTTP_OK,
      );

      const canceledAppt = await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );
      expect(
        (await cancelAppointment(app, canceledAppt.id, token)).status,
      ).toBe(HTTP_OK);

      const response = await getConflicts(app, token, {
        startsAt: EXISTING_STARTS_AT,
        durationMinutes: EXISTING_DURATION,
      });
      const body = appointmentConflictsResponseSchema.parse(
        await response.json(),
      );
      expect(body.data).toHaveLength(0);
    });

    it("excludeId remove o próprio compromisso do resultado", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const target = await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        token,
      );

      const withoutExclude = await getConflicts(app, token, {
        startsAt: EXISTING_STARTS_AT,
        durationMinutes: EXISTING_DURATION,
      });
      const withoutExcludeBody = appointmentConflictsResponseSchema.parse(
        await withoutExclude.json(),
      );
      expect(withoutExcludeBody.data.map((item) => item.id)).toContain(
        target.id,
      );

      const withExclude = await getConflicts(app, token, {
        startsAt: EXISTING_STARTS_AT,
        durationMinutes: EXISTING_DURATION,
        excludeId: target.id,
      });
      const withExcludeBody = appointmentConflictsResponseSchema.parse(
        await withExclude.json(),
      );
      expect(withExcludeBody.data.map((item) => item.id)).not.toContain(
        target.id,
      );
    });

    it("compromisso de outra consultora ⇒ não aparece", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      await seedConsultantSession(app, CONSULTANT_B);
      const tokenB = await login(app, CONSULTANT_B);
      const apptB = await createAppointmentOk(
        app,
        appointmentBody({
          startsAt: EXISTING_STARTS_AT,
          durationMinutes: EXISTING_DURATION,
        }),
        tokenB,
      );

      const response = await getConflicts(app, tokenA, {
        startsAt: EXISTING_STARTS_AT,
        durationMinutes: EXISTING_DURATION,
      });
      const body = appointmentConflictsResponseSchema.parse(
        await response.json(),
      );
      expect(body.data.map((item) => item.id)).not.toContain(apptB.id);
    });

    it("mais de 20 sobreposições ⇒ resposta truncada em 20, contendo os 20 mais próximos, em ordem ascendente", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const TOTAL_OVERLAPPING = 25;
      const EXPECTED_TRUNCATED = 20;
      const baseStart = new Date("2026-09-15T09:00:00.000Z");
      const created: Appointment[] = [];
      for (let index = 0; index < TOTAL_OVERLAPPING; index += 1) {
        const startsAt = new Date(
          baseStart.getTime() + index * 60_000,
        ).toISOString();
        // Setup sequencial e determinístico (ordem de starts_at importa para
        // a asserção) — await dentro do loop é intencional.
        const appt = await createAppointmentOk(
          app,
          appointmentBody({ startsAt, durationMinutes: 60 }),
          token,
        );
        created.push(appt);
      }

      // Janela de 10h cobrindo folgadamente todos os 25 compromissos criados.
      const response = await getConflicts(app, token, {
        startsAt: "2026-09-15T08:00:00.000Z",
        durationMinutes: 600,
      });
      expect(response.status).toBe(HTTP_OK);
      const body = appointmentConflictsResponseSchema.parse(
        await response.json(),
      );

      expect(body.data).toHaveLength(EXPECTED_TRUNCATED);
      const expectedIds = created
        .slice(0, EXPECTED_TRUNCATED)
        .map((appt) => appt.id);
      expect(body.data.map((item) => item.id)).toEqual(expectedIds);

      // Ordem ascendente por starts_at.
      const timestamps = body.data.map((item) =>
        new Date(item.startsAt).getTime(),
      );
      const sorted = timestamps.toSorted((a, b) => a - b);
      expect(timestamps).toEqual(sorted);
    });
  });
});
