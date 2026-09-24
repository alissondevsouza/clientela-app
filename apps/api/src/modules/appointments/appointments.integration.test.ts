import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  type Appointment,
  type AppointmentKind,
  type AppointmentStatus,
  apiErrorSchema,
  appLocalDateIso,
  appLocalDateTimeToUtc,
  appointmentListItemSchema,
  appointmentSchema,
  loginResponseSchema,
  paginated,
} from "@clientela/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { appointments, clients, consultants, leads } from "../../db/schema";
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

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";
const UNAUTHORIZED_CODE = "UNAUTHORIZED";
const APPOINTMENT_NOT_FOUND_CODE = "APPOINTMENT_NOT_FOUND";
const APPOINTMENT_STATE_CODE = "APPOINTMENT_STATE";
const INVALID_APPOINTMENT_PERSON_CODE = "INVALID_APPOINTMENT_PERSON";

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
// existe" e "não é seu" respondem o MESMO 404/422 (RF-03/RF-06).
const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

const DEFAULT_DURATION_MINUTES = 30;

const appointmentListSchema = paginated(appointmentListItemSchema);

// Hasher real de KDF do Node (scrypt): os workers do Vitest rodam sob Node,
// onde o global `Bun` (argon2id) não existe. Espelha orders/sales/leads-crm.
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

// Calendário puro (sem conversão de fuso): desloca `dateIso` em `days` dias.
// Usado só para achar "ontem" a partir de "hoje" — a conversão local↔UTC em si
// continua vindo exclusivamente de `appLocalDateTimeToUtc` (RF-15/RF-16).
const shiftLocalDate = (dateIso: string, days: number): string => {
  const [year, month, day] = dateIso.split("-").map(Number);
  const shifted = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days),
  );
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

describe("appointments (integração)", () => {
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
  // guard real, clock REAL (nunca fixo) — espelha orders/leads-crm.
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

  type SeedLeadValues = {
    name: string;
    whatsapp: string;
    clientId?: string | null;
  };

  const seedLead = async (values: SeedLeadValues): Promise<string> => {
    const [row] = await ctx.db
      .insert(leads)
      .values({
        name: values.name,
        whatsapp: values.whatsapp,
        clientId: values.clientId ?? null,
        consentAt: new Date(),
      })
      .returning({ id: leads.id });
    if (!row) {
      throw new Error("falha ao semear o lead de teste");
    }
    return row.id;
  };

  type SeedAppointmentValues = {
    consultantId: string;
    clientId?: string | null;
    leadId?: string | null;
    saleId?: string | null;
    kind?: AppointmentKind;
    title?: string | null;
    startsAt: string;
    durationMinutes?: number;
    status?: AppointmentStatus;
    location?: string | null;
    notes?: string | null;
  };

  // Semeadura DIRETA (bypassa o Zod da fronteira, RF-02: o banco tolera
  // client_id e lead_id preenchidos ao mesmo tempo, e status terminal, o que a
  // API não deixa alcançar via POST/transições sozinha). Usada só para montar
  // fixtures de leitura/edição (RF-05 a RF-09) sem depender da correção de
  // RF-08 (transições), testada em outro arquivo.
  const seedAppointment = async (
    values: SeedAppointmentValues,
  ): Promise<string> => {
    const [row] = await ctx.db
      .insert(appointments)
      .values({
        consultantId: values.consultantId,
        clientId: values.clientId ?? null,
        leadId: values.leadId ?? null,
        saleId: values.saleId ?? null,
        kind: values.kind ?? "demo",
        title: values.title ?? null,
        startsAt: new Date(values.startsAt),
        durationMinutes: values.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        status: values.status ?? "scheduled",
        location: values.location ?? null,
        notes: values.notes ?? null,
      })
      .returning({ id: appointments.id });
    if (!row) {
      throw new Error("falha ao semear o compromisso de teste");
    }
    return row.id;
  };

  // ------------------------- requesters HTTP -------------------------

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

  const getAppointmentsRaw = (
    app: App,
    token?: string,
    queryString = "",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments${queryString}`, {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const getAppointmentRaw = (
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

  const putAppointmentRaw = (
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

  const deleteAppointmentRaw = (
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

  const getConflictsRaw = (app: App, token?: string): Promise<Response> =>
    app.handle(
      new Request(
        `http://localhost/appointments/conflicts?startsAt=${encodeURIComponent(
          new Date().toISOString(),
        )}&durationMinutes=30`,
        { method: "GET", headers: token ? bearer(token) : {} },
      ),
    );

  const postDoneRaw = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/appointments/${id}/done`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const postNoShowRaw = (
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

  const postCancelRaw = (
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

  const putSaleRaw = (
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

  const baseAppointmentBody = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    kind: "demo",
    startsAt: new Date().toISOString(),
    durationMinutes: DEFAULT_DURATION_MINUTES,
    ...overrides,
  });

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
    const response = await getAppointmentRaw(app, id, token);
    expect(response.status).toBe(HTTP_OK);
    return appointmentSchema.parse(await response.json());
  };

  // -------------------------------------------------------------------------
  // RF-03 — validação de existência/escopo do vínculo de pessoa
  // -------------------------------------------------------------------------
  describe("validação de pessoa (RF-03)", () => {
    it("clientId inexistente ⇒ 422 (nunca 500/violação de FK)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postAppointment(
        app,
        baseAppointmentBody({ clientId: NONEXISTENT_UUID }),
        token,
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_APPOINTMENT_PERSON_CODE);
    });

    it("clientId de OUTRA consultora ⇒ 422 com a MESMA mensagem do caso inexistente; nada é persistido", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const clientOfB = await seedClient(idB, {
        name: "Cliente da B",
        whatsapp: "11944440000",
      });

      const withNonexistent = await postAppointment(
        app,
        baseAppointmentBody({ clientId: NONEXISTENT_UUID }),
        tokenA,
      );
      const withOthers = await postAppointment(
        app,
        baseAppointmentBody({ clientId: clientOfB }),
        tokenA,
      );

      expect(withNonexistent.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(withOthers.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const bodyNonexistent = apiErrorSchema.parse(
        await withNonexistent.json(),
      );
      const bodyOthers = apiErrorSchema.parse(await withOthers.json());
      expect(bodyNonexistent.error.code).toBe(INVALID_APPOINTMENT_PERSON_CODE);
      expect(bodyOthers.error.code).toBe(INVALID_APPOINTMENT_PERSON_CODE);
      expect(bodyOthers.error.message).toBe(bodyNonexistent.error.message);

      const list = appointmentListSchema.parse(
        await (await getAppointmentsRaw(app, tokenA, "?range=all")).json(),
      );
      expect(list.total).toBe(0);
    });

    it("leadId inexistente ⇒ 422", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postAppointment(
        app,
        baseAppointmentBody({ leadId: NONEXISTENT_UUID }),
        token,
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_APPOINTMENT_PERSON_CODE);
    });

    it("caminho feliz com cliente da própria consultora ⇒ 201", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Maria da Silva",
        whatsapp: "11999990000",
      });

      const appointment = await createAppointmentOk(
        app,
        baseAppointmentBody({ clientId }),
        token,
      );

      expect(appointment.clientId).toBe(clientId);
      expect(appointment.clientName).toBe("Maria da Silva");
    });
  });

  // -------------------------------------------------------------------------
  // RF-04 — criação
  // -------------------------------------------------------------------------
  describe("criação (RF-04)", () => {
    it("POST válido ⇒ 201 com o recurso", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const appointment = await createAppointmentOk(
        app,
        baseAppointmentBody({
          kind: "skin_analysis",
          title: "Análise de pele",
          location: "Casa da cliente",
        }),
        token,
      );

      expect(appointment.kind).toBe("skin_analysis");
      expect(appointment.title).toBe("Análise de pele");
      expect(appointment.location).toBe("Casa da cliente");
      expect(appointment.status).toBe("scheduled");
      expect(appointment.durationMinutes).toBe(DEFAULT_DURATION_MINUTES);
    });

    it("startsAt no passado ⇒ 201 (registro retroativo, não é erro)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const pastIso = "2020-01-01T12:00:00.000Z";

      const appointment = await createAppointmentOk(
        app,
        baseAppointmentBody({ startsAt: pastIso }),
        token,
      );

      expect(appointment.startsAt).toBe(pastIso);
    });

    it("consultantId enviado no corpo é ignorado (o dono é o do token)", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { token: tokenB, consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );

      const created = await createAppointmentOk(
        app,
        baseAppointmentBody({ consultantId: idB }),
        tokenA,
      );

      // Visível para A (dono real), invisível para B (o campo do corpo foi
      // ignorado — o dono é sempre o do token).
      expect((await getAppointmentRaw(app, created.id, tokenA)).status).toBe(
        HTTP_OK,
      );
      expect((await getAppointmentRaw(app, created.id, tokenB)).status).toBe(
        HTTP_NOT_FOUND,
      );
    });

    it("clientId e leadId juntos ⇒ 422 (RF-02)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postAppointment(
        app,
        baseAppointmentBody({
          clientId: NONEXISTENT_UUID,
          leadId: NONEXISTENT_UUID,
        }),
        token,
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
    });
  });

  // -------------------------------------------------------------------------
  // RF-05 — listagem e recortes
  // -------------------------------------------------------------------------
  describe("listagem e recortes (RF-05)", () => {
    it("upcoming inclui compromisso de hoje já vencido e exclui os de ontem, ordem ASC", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      const todayLocal = appLocalDateIso(new Date().toISOString());
      const yesterdayLocal = shiftLocalDate(todayLocal, -1);
      const todayMidnightUtc = appLocalDateTimeToUtc(todayLocal, "00:01");
      // 1 minuto após a meia-noite local: continua "hoje", e no cenário normal
      // (execução fora da janela de 1 minuto após a virada) já está no passado
      // relativamente a "agora" — vencido, mas ainda de hoje (RF-05).
      const vencidoHojeId = await seedAppointment({
        consultantId,
        startsAt: todayMidnightUtc,
        status: "scheduled",
      });
      const futuroId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(
          shiftLocalDate(todayLocal, 30),
          "10:00",
        ),
        status: "scheduled",
      });
      const ontemId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "10:00"),
        status: "scheduled",
      });

      const list = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=upcoming&perPage=100")
        ).json(),
      );

      const ids = list.data.map((item) => item.id);
      expect(ids).toContain(vencidoHojeId);
      expect(ids).toContain(futuroId);
      expect(ids).not.toContain(ontemId);
      expect(list.total).toBe(2);
      // Ordem ascendente: o de hoje (mais cedo) vem antes do futuro.
      const vencidoIndex = ids.indexOf(vencidoHojeId);
      const futuroIndex = ids.indexOf(futuroId);
      expect(vencidoIndex).toBeLessThan(futuroIndex);
    });

    it("pending traz o de ontem ainda scheduled e não traz o de ontem já done/canceled, ordem DESC", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      const todayLocal = appLocalDateIso(new Date().toISOString());
      const yesterdayLocal = shiftLocalDate(todayLocal, -1);

      const scheduledLateId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "15:00"),
        status: "scheduled",
      });
      const scheduledEarlyId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "09:00"),
        status: "scheduled",
      });
      const doneId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "11:00"),
        status: "done",
      });
      const canceledId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "12:00"),
        status: "canceled",
      });

      const list = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=pending&perPage=100")
        ).json(),
      );

      const ids = list.data.map((item) => item.id);
      expect(ids).toEqual([scheduledLateId, scheduledEarlyId]);
      expect(ids).not.toContain(doneId);
      expect(ids).not.toContain(canceledId);
    });

    it("history traz todos com desfecho — incluindo um de hoje concluído — e nenhum scheduled, ordem DESC", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      const todayLocal = appLocalDateIso(new Date().toISOString());
      const yesterdayLocal = shiftLocalDate(todayLocal, -1);

      const canceledYesterdayId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "09:00"),
        status: "canceled",
      });
      const doneTodayId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(todayLocal, "10:00"),
        status: "done",
      });
      const scheduledId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(todayLocal, "11:00"),
        status: "scheduled",
      });

      const list = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=history&perPage=100")
        ).json(),
      );

      const ids = list.data.map((item) => item.id);
      // Ordem descendente: o de hoje (mais recente) antes do de ontem.
      expect(ids).toEqual([doneTodayId, canceledYesterdayId]);
      expect(ids).not.toContain(scheduledId);
    });

    it("day exige date (sem date ⇒ 422) e traz exatamente o dia local, ordem ASC", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      const missingDate = await getAppointmentsRaw(app, token, "?range=day");
      expect(missingDate.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(apiErrorSchema.parse(await missingDate.json()).error.code).toBe(
        VALIDATION_ERROR_CODE,
      );

      const todayLocal = appLocalDateIso(new Date().toISOString());
      const yesterdayLocal = shiftLocalDate(todayLocal, -1);

      const earlyId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(todayLocal, "08:00"),
      });
      const lateId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(todayLocal, "20:00"),
      });
      await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "10:00"),
      });

      const response = await getAppointmentsRaw(
        app,
        token,
        `?range=day&date=${todayLocal}&perPage=100`,
      );
      expect(response.status).toBe(HTTP_OK);
      const list = appointmentListSchema.parse(await response.json());
      expect(list.data.map((item) => item.id)).toEqual([earlyId, lateId]);
    });

    it("date com range diferente de day ⇒ 422", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getAppointmentsRaw(
        app,
        token,
        "?range=upcoming&date=2026-01-01",
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
        VALIDATION_ERROR_CODE,
      );
    });

    it("filtros status, kind, clientId e leadId restringem", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Cliente Filtro",
        whatsapp: "11955550000",
      });
      const leadId = await seedLead({
        name: "Lead Filtro",
        whatsapp: "11966660000",
      });

      const withClientId = await seedAppointment({
        consultantId,
        clientId,
        kind: "demo",
        status: "scheduled",
        startsAt: new Date().toISOString(),
      });
      const withLeadId = await seedAppointment({
        consultantId,
        leadId,
        kind: "skin_analysis",
        status: "scheduled",
        startsAt: new Date().toISOString(),
      });
      const doneId = await seedAppointment({
        consultantId,
        kind: "demo",
        status: "done",
        startsAt: new Date().toISOString(),
      });
      await seedAppointment({
        consultantId,
        kind: "follow_up",
        status: "scheduled",
        startsAt: new Date().toISOString(),
      });

      const byStatus = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=all&status=done")
        ).json(),
      );
      expect(byStatus.data.map((item) => item.id)).toEqual([doneId]);

      const byKind = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=all&kind=skin_analysis")
        ).json(),
      );
      expect(byKind.data.map((item) => item.id)).toEqual([withLeadId]);

      const byClientId = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(
            app,
            token,
            `?range=all&clientId=${clientId}`,
          )
        ).json(),
      );
      expect(byClientId.data.map((item) => item.id)).toEqual([withClientId]);

      const byLeadId = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, `?range=all&leadId=${leadId}`)
        ).json(),
      );
      expect(byLeadId.data.map((item) => item.id)).toEqual([withLeadId]);
    });

    it("perPage=101 ⇒ 422", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getAppointmentsRaw(
        app,
        token,
        "?range=all&perPage=101",
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
        VALIDATION_ERROR_CODE,
      );
    });

    it("envelope { data, page, perPage, total } correto com paginação", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      for (let index = 0; index < 3; index += 1) {
        await seedAppointment({
          consultantId,
          startsAt: new Date().toISOString(),
        });
      }

      const firstPage = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=all&page=1&perPage=2")
        ).json(),
      );
      expect(firstPage.total).toBe(3);
      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.page).toBe(1);
      expect(firstPage.perPage).toBe(2);

      const secondPage = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=all&page=2&perPage=2")
        ).json(),
      );
      expect(secondPage.data).toHaveLength(1);
      expect(secondPage.page).toBe(2);
    });

    it("partição: upcoming+scheduled, pending e history cobrem todo compromisso exatamente uma vez", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      const todayLocal = appLocalDateIso(new Date().toISOString());
      const yesterdayLocal = shiftLocalDate(todayLocal, -1);

      // Categoria 1 — "Próximos": hoje, ainda agendado (mesmo já vencido).
      const upcomingId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(todayLocal, "00:01"),
        status: "scheduled",
      });
      // Categoria 2 — "Pendentes": ontem, ainda agendado.
      const pendingId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(yesterdayLocal, "10:00"),
        status: "scheduled",
      });
      // Categoria 3 — "Histórico": com desfecho (independente da data).
      const historyId = await seedAppointment({
        consultantId,
        startsAt: appLocalDateTimeToUtc(todayLocal, "09:00"),
        status: "done",
      });

      const upcomingList = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(
            app,
            token,
            "?range=upcoming&status=scheduled&perPage=100",
          )
        ).json(),
      );
      const pendingList = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=pending&perPage=100")
        ).json(),
      );
      const historyList = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=history&perPage=100")
        ).json(),
      );

      const upcomingIds = upcomingList.data.map((item) => item.id);
      const pendingIds = pendingList.data.map((item) => item.id);
      const historyIds = historyList.data.map((item) => item.id);

      expect(upcomingIds).toEqual([upcomingId]);
      expect(pendingIds).toEqual([pendingId]);
      expect(historyIds).toEqual([historyId]);

      // Nenhum invisível, nenhum duplicado: a união é exatamente as três, uma
      // única vez cada.
      const union = [...upcomingIds, ...pendingIds, ...historyIds];
      expect(union.toSorted()).toEqual(
        [upcomingId, pendingId, historyId].toSorted(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // RF-06 — detalhe
  // -------------------------------------------------------------------------
  describe("detalhe (RF-06)", () => {
    it("de outra consultora ⇒ 404 (não 403)", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const appointmentOfB = await seedAppointment({
        consultantId: idB,
        startsAt: new Date().toISOString(),
      });

      const response = await getAppointmentRaw(app, appointmentOfB, tokenA);

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
        APPOINTMENT_NOT_FOUND_CODE,
      );
    });

    it("id malformado ⇒ 404", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getAppointmentRaw(app, "nao-uuid", token);

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
        APPOINTMENT_NOT_FOUND_CODE,
      );
    });

    it("existente ⇒ 200 com notes, clientName, clientWhatsapp, leadName, leadWhatsapp derivados", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Cliente Detalhe",
        whatsapp: "11911112222",
      });
      const leadId = await seedLead({
        name: "Lead Detalhe",
        whatsapp: "11933334444",
      });
      // Estado pós-conversão (RF-02/RF-12): ambas as FKs preenchidas — o banco
      // tolera, e o detalhe deve derivar os quatro campos por join.
      const id = await seedAppointment({
        consultantId,
        clientId,
        leadId,
        notes: "Cliente pediu para remarcar horário.",
        startsAt: new Date().toISOString(),
      });

      const appointment = await getAppointmentOk(app, id, token);

      expect(appointment.notes).toBe("Cliente pediu para remarcar horário.");
      expect(appointment.clientName).toBe("Cliente Detalhe");
      expect(appointment.clientWhatsapp).toBe("11911112222");
      expect(appointment.leadName).toBe("Lead Detalhe");
      expect(appointment.leadWhatsapp).toBe("11933334444");
    });
  });

  // -------------------------------------------------------------------------
  // RF-07 — edição
  // -------------------------------------------------------------------------
  describe("edição (RF-07)", () => {
    it("PUT em compromisso scheduled ⇒ 200 com os campos alterados", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const created = await createAppointmentOk(
        app,
        baseAppointmentBody({ location: "Local Original" }),
        token,
      );

      const response = await putAppointmentRaw(
        app,
        created.id,
        { location: "Novo Local", title: "Follow-up especial" },
        token,
      );

      expect(response.status).toBe(HTTP_OK);
      const updated = appointmentSchema.parse(await response.json());
      expect(updated.location).toBe("Novo Local");
      expect(updated.title).toBe("Follow-up especial");
    });

    it("PUT só com notes em status terminal ⇒ 200 com a observação gravada", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const id = await seedAppointment({
        consultantId,
        status: "done",
        startsAt: new Date().toISOString(),
      });

      const response = await putAppointmentRaw(
        app,
        id,
        { notes: "Cliente compareceu e comprou 2 produtos." },
        token,
      );

      expect(response.status).toBe(HTTP_OK);
      const updated = appointmentSchema.parse(await response.json());
      expect(updated.notes).toBe("Cliente compareceu e comprou 2 produtos.");
      expect(updated.status).toBe("done");
    });

    it("PUT com qualquer outro campo em status terminal ⇒ 409, nada é alterado", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const id = await seedAppointment({
        consultantId,
        status: "canceled",
        location: "Local Original",
        startsAt: new Date().toISOString(),
      });

      const response = await putAppointmentRaw(
        app,
        id,
        { location: "Outro Local" },
        token,
      );

      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(APPOINTMENT_STATE_CODE);

      const after = await getAppointmentOk(app, id, token);
      expect(after.location).toBe("Local Original");
    });

    it("PUT sem campos de pessoa preserva as DUAS FKs (client_id e lead_id preenchidos)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Cliente Convertida",
        whatsapp: "11977778888",
      });
      const leadId = await seedLead({
        name: "Lead Original",
        whatsapp: "11977778888",
        clientId,
      });
      const id = await seedAppointment({
        consultantId,
        clientId,
        leadId,
        status: "scheduled",
        startsAt: new Date().toISOString(),
      });

      const response = await putAppointmentRaw(
        app,
        id,
        { location: "Novo Local" },
        token,
      );

      expect(response.status).toBe(HTTP_OK);
      const updated = appointmentSchema.parse(await response.json());
      expect(updated.location).toBe("Novo Local");
      expect(updated.clientId).toBe(clientId);
      expect(updated.leadId).toBe(leadId);
    });

    it("PUT com leadId: null explícito desvincula só o lead", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(consultantId, {
        name: "Cliente Mantida",
        whatsapp: "11988889999",
      });
      const leadId = await seedLead({
        name: "Lead a Desvincular",
        whatsapp: "11988889999",
        clientId,
      });
      const id = await seedAppointment({
        consultantId,
        clientId,
        leadId,
        status: "scheduled",
        startsAt: new Date().toISOString(),
      });

      const response = await putAppointmentRaw(
        app,
        id,
        { leadId: null },
        token,
      );

      expect(response.status).toBe(HTTP_OK);
      const updated = appointmentSchema.parse(await response.json());
      expect(updated.leadId).toBeNull();
      expect(updated.clientId).toBe(clientId);
    });
  });

  // -------------------------------------------------------------------------
  // RF-09 — exclusão
  // -------------------------------------------------------------------------
  describe("exclusão (RF-09)", () => {
    it("DELETE ⇒ 204 e o recurso some da listagem", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const created = await createAppointmentOk(
        app,
        baseAppointmentBody(),
        token,
      );

      const response = await deleteAppointmentRaw(app, created.id, token);
      expect(response.status).toBe(HTTP_NO_CONTENT);

      const list = appointmentListSchema.parse(
        await (await getAppointmentsRaw(app, token, "?range=all")).json(),
      );
      expect(list.data.some((item) => item.id === created.id)).toBe(false);
    });

    it("repetir o DELETE do mesmo id ⇒ 404", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const created = await createAppointmentOk(
        app,
        baseAppointmentBody(),
        token,
      );
      expect((await deleteAppointmentRaw(app, created.id, token)).status).toBe(
        HTTP_NO_CONTENT,
      );

      const second = await deleteAppointmentRaw(app, created.id, token);
      expect(second.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await second.json()).error.code).toBe(
        APPOINTMENT_NOT_FOUND_CODE,
      );
    });

    it("DELETE de outra consultora ⇒ 404", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const appointmentOfB = await seedAppointment({
        consultantId: idB,
        startsAt: new Date().toISOString(),
      });

      const response = await deleteAppointmentRaw(app, appointmentOfB, tokenA);

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });

    it("DELETE de compromisso done e de compromisso canceled ⇒ 204 (guard de scheduled do PUT não se aplica)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const doneId = await seedAppointment({
        consultantId,
        status: "done",
        startsAt: new Date().toISOString(),
      });
      const canceledId = await seedAppointment({
        consultantId,
        status: "canceled",
        startsAt: new Date().toISOString(),
      });

      expect((await deleteAppointmentRaw(app, doneId, token)).status).toBe(
        HTTP_NO_CONTENT,
      );
      expect((await deleteAppointmentRaw(app, canceledId, token)).status).toBe(
        HTTP_NO_CONTENT,
      );
    });
  });

  // -------------------------------------------------------------------------
  // RF-13 — autenticação e escopo
  // -------------------------------------------------------------------------
  describe("auth e escopo (RF-13)", () => {
    it("todas as rotas do módulo sem token ⇒ 401 (uma asserção por rota)", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        postAppointment(app, {}),
        getAppointmentsRaw(app),
        getConflictsRaw(app),
        getAppointmentRaw(app, NONEXISTENT_UUID),
        putAppointmentRaw(app, NONEXISTENT_UUID, {}),
        deleteAppointmentRaw(app, NONEXISTENT_UUID),
        postDoneRaw(app, NONEXISTENT_UUID),
        postNoShowRaw(app, NONEXISTENT_UUID),
        postCancelRaw(app, NONEXISTENT_UUID),
        putSaleRaw(app, NONEXISTENT_UUID, { saleId: null }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(HTTP_UNAUTHORIZED);
        const body = apiErrorSchema.parse(await response.json());
        expect(body.error.code).toBe(UNAUTHORIZED_CODE);
        expect(body.error.message).toBe(UNAUTHORIZED_MESSAGE);
      }
    });

    it("compromisso de outra consultora não aparece em nenhuma listagem nem no detalhe", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const appointmentOfB = await seedAppointment({
        consultantId: idB,
        startsAt: new Date().toISOString(),
      });

      const list = appointmentListSchema.parse(
        await (await getAppointmentsRaw(app, tokenA, "?range=all")).json(),
      );
      expect(list.total).toBe(0);
      expect(list.data.some((item) => item.id === appointmentOfB)).toBe(false);

      const detail = await getAppointmentRaw(app, appointmentOfB, tokenA);
      expect(detail.status).toBe(HTTP_NOT_FOUND);
    });
  });

  // -------------------------------------------------------------------------
  // RF-15 — borda de fuso horário
  // -------------------------------------------------------------------------
  describe("borda de fuso (RF-15)", () => {
    it("2026-08-05T23:30:00Z (20:30 BRT de 05/08) aparece em range=day&date=2026-08-05, não em 06/08", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const id = await seedAppointment({
        consultantId,
        startsAt: "2026-08-05T23:30:00.000Z",
      });

      const sameDayResponse = await getAppointmentsRaw(
        app,
        token,
        "?range=day&date=2026-08-05",
      );
      expect(sameDayResponse.status).toBe(HTTP_OK);
      const sameDay = appointmentListSchema.parse(await sameDayResponse.json());
      expect(sameDay.data.map((item) => item.id)).toContain(id);

      const nextDay = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=day&date=2026-08-06")
        ).json(),
      );
      expect(nextDay.data.map((item) => item.id)).not.toContain(id);
    });

    it("2026-08-06T02:00:00Z (23:00 BRT de 05/08) idem: pertence a 05/08, não a 06/08", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const id = await seedAppointment({
        consultantId,
        startsAt: "2026-08-06T02:00:00.000Z",
      });

      const sameDay = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=day&date=2026-08-05")
        ).json(),
      );
      expect(sameDay.data.map((item) => item.id)).toContain(id);

      const nextDay = appointmentListSchema.parse(
        await (
          await getAppointmentsRaw(app, token, "?range=day&date=2026-08-06")
        ).json(),
      );
      expect(nextDay.data.map((item) => item.id)).not.toContain(id);
    });
  });
});
