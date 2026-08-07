import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  apiErrorSchema,
  authConsultantSchema,
  loginResponseSchema,
} from "@clientela/shared";
import { count } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { consultants, sessions } from "../../db/schema";
import { UNAUTHORIZED_MESSAGE } from "../../plugins/auth-guard";
import {
  createRateLimiter,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "../../plugins/rate-limit";
import { createAppointmentsRepository } from "../appointments/appointments.repository";
import { createAppointmentsService } from "../appointments/appointments.service";
import { createClientsRepository } from "../clients/clients.repository";
import { createClientsService } from "../clients/clients.service";
import { createDashboardRepository } from "../dashboard/dashboard.repository";
import { createDashboardService } from "../dashboard/dashboard.service";
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createOrdersRepository } from "../orders/orders.repository";
import { createOrdersService } from "../orders/orders.service";
import { createProductsRepository } from "../products/products.repository";
import { createProductsService } from "../products/products.service";
import { createSalesRepository } from "../sales/sales.repository";
import { createSalesService } from "../sales/sales.service";
import { createAuthRepository } from "./auth.repository";
import {
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  LOGIN_RATE_LIMITED_MESSAGE,
} from "./auth.routes";
import {
  createAuthService,
  generateSecureToken,
  type PasswordHasher,
  SESSION_DURATION_MS,
} from "./auth.service";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

// A consultora é semeada a cada teste (o truncateAll limpa entre casos). O hash
// argon2id real é caro (~centenas de ms), então é computado UMA vez no beforeAll
// e reusado em todas as inserções — só o `verify` do login paga o custo por caso.
const CONSULTANT_NAME = "Mary Consultora";
const CONSULTANT_EMAIL = "mary@example.com";
const CONSULTANT_WHATSAPP = "11987654321";
const CORRECT_PASSWORD = "senha-super-secreta";
const WRONG_PASSWORD = "senha-errada";
const UNKNOWN_EMAIL = "ninguem@example.com";

const DEFAULT_LOGIN_IP = "203.0.113.10";

const VALID_LEAD_BODY = {
  name: "Cliente Lead",
  whatsapp: "(11) 98765-4321",
  interest: "Base líquida",
  consent: true,
} as const;

const INVALID_CREDENTIALS_CODE = "INVALID_CREDENTIALS";
const UNAUTHORIZED_CODE = "UNAUTHORIZED";
const RATE_LIMITED_CODE = "RATE_LIMITED";
const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_INTERNAL_ERROR = 500;

// Réplica exata do hashing de token do service (RF-07): o banco guarda só o
// SHA-256 hex. Usado para provar que o token não é armazenado em claro e para
// semear sessões diretamente no banco.
const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

// O `PasswordHasher` de produção (`bunPasswordHasher`) usa `Bun.password`
// (argon2id), disponível só no runtime do Bun. Os workers do Vitest rodam sob
// Node, onde o global `Bun` não existe — invocá-lo aqui quebra o arquivo inteiro.
// Como o hasher é uma porta injetada (api.md), o teste de integração usa um KDF
// real do Node (`scrypt`) fazendo o MESMO round-trip (hash na semeadura, verify
// no login): prova de verdade a discriminação senha correta ⇒ 200 / errada ⇒ 401
// contra o Postgres. A cobertura do argon2id em si fica no seed (RF-02), rodado
// sob Bun — ver discrepância reportada no handoff.
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

describe("auth (integração)", () => {
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

  // App real com repositórios/serviços apontando para o Postgres do container:
  // hasher argon2id real, token via CSPRNG, guard e rate limiters reais. Rate
  // limiter novo por app evita vazamento de contagem entre casos.
  const buildApp = () => {
    const authRepository = createAuthRepository(ctx.db);
    const authService = createAuthService({
      repository: authRepository,
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

  type SeededConsultant = { id: string; name: string; email: string };

  const seedConsultant = async (): Promise<SeededConsultant> => {
    const [row] = await ctx.db
      .insert(consultants)
      .values({
        name: CONSULTANT_NAME,
        email: CONSULTANT_EMAIL,
        passwordHash,
        whatsapp: CONSULTANT_WHATSAPP,
      })
      .returning({
        id: consultants.id,
        name: consultants.name,
        email: consultants.email,
      });

    if (!row) {
      throw new Error("falha ao semear a consultora de teste");
    }
    return row;
  };

  const insertSessionRow = async (
    consultantId: string,
    token: string,
    expiresAt: Date,
  ): Promise<void> => {
    await ctx.db.insert(sessions).values({
      consultantId,
      tokenHash: sha256Hex(token),
      expiresAt,
    });
  };

  const postLogin = (
    app: App,
    body: unknown,
    ip = DEFAULT_LOGIN_IP,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify(body),
      }),
    );

  const getMe = (
    app: App,
    headers: Record<string, string> = {},
    path = "/auth/me",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost${path}`, { method: "GET", headers }),
    );

  const postLogout = (
    app: App,
    headers: Record<string, string> = {},
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/auth/logout", { method: "POST", headers }),
    );

  const postLead = (app: App): Promise<Response> =>
    app.handle(
      new Request("http://localhost/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.7",
        },
        body: JSON.stringify(VALID_LEAD_BODY),
      }),
    );

  // Login real com as credenciais semeadas: devolve o token opaco emitido.
  const loginWithCorrectPassword = async (
    app: App,
    ip = DEFAULT_LOGIN_IP,
  ): Promise<string> => {
    const response = await postLogin(
      app,
      { email: CONSULTANT_EMAIL, password: CORRECT_PASSWORD },
      ip,
    );
    expect(response.status).toBe(HTTP_OK);
    const body = loginResponseSchema.parse(await response.json());
    return body.token;
  };

  const countSessions = async (): Promise<number> => {
    const [row] = await ctx.db.select({ value: count() }).from(sessions);
    return row?.value ?? 0;
  };

  describe("POST /auth/login (RF-03)", () => {
    it("credenciais corretas ⇒ 200 com token, dados públicos e expiresAt ISO ~30 dias no futuro", async () => {
      const consultant = await seedConsultant();
      const app = buildApp();

      const before = Date.now();
      const response = await postLogin(app, {
        email: CONSULTANT_EMAIL,
        password: CORRECT_PASSWORD,
      });
      const after = Date.now();

      expect(response.status).toBe(HTTP_OK);
      const body = loginResponseSchema.parse(await response.json());

      expect(body.token.length).toBeGreaterThan(0);
      expect(body.consultant).toEqual({
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
      });

      const expiresAtMs = new Date(body.expiresAt).getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + SESSION_DURATION_MS);
      expect(expiresAtMs).toBeLessThanOrEqual(after + SESSION_DURATION_MS);
    });

    it("senha errada e e-mail inexistente ⇒ ambos 401 com body EXATAMENTE idêntico", async () => {
      await seedConsultant();
      const app = buildApp();

      const wrongPasswordResponse = await postLogin(app, {
        email: CONSULTANT_EMAIL,
        password: WRONG_PASSWORD,
      });
      const unknownEmailResponse = await postLogin(app, {
        email: UNKNOWN_EMAIL,
        password: CORRECT_PASSWORD,
      });

      expect(wrongPasswordResponse.status).toBe(HTTP_UNAUTHORIZED);
      expect(unknownEmailResponse.status).toBe(HTTP_UNAUTHORIZED);

      const wrongPasswordBody = apiErrorSchema.parse(
        await wrongPasswordResponse.json(),
      );
      const unknownEmailBody = apiErrorSchema.parse(
        await unknownEmailResponse.json(),
      );

      // Anti-enumeração (RF-03): o cliente não consegue distinguir os dois casos.
      expect(wrongPasswordBody).toEqual(unknownEmailBody);
      expect(wrongPasswordBody.error.code).toBe(INVALID_CREDENTIALS_CODE);
      expect(await countSessions()).toBe(0);
    });

    it("body sem e-mail ⇒ 422 com mensagem pt-BR (não em inglês)", async () => {
      const app = buildApp();

      const response = await postLogin(app, {});
      const raw = await response.json();
      const body = apiErrorSchema.parse(raw);

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/informe/i);
      expect(body.error.message).not.toMatch(
        /invalid input|expected|required/i,
      );
      expect(JSON.stringify(raw)).not.toMatch(/at .*\(/);
    });

    it("senha ausente ⇒ 422 com mensagem pt-BR de senha", async () => {
      const app = buildApp();

      const response = await postLogin(app, { email: CONSULTANT_EMAIL });
      const body = apiErrorSchema.parse(await response.json());

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/senha/i);
    });

    it("estouro do rate limit no mesmo IP ⇒ 429; IP diferente não é afetado", async () => {
      await seedConsultant();
      const app = buildApp();
      const spammerIp = "198.51.100.20";

      // As LOGIN_RATE_LIMIT_MAX primeiras (creds erradas) passam pelo limiter e
      // respondem 401; a N+1ª do mesmo IP é barrada no onRequest ⇒ 429.
      for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_MAX; attempt += 1) {
        const allowed = await postLogin(
          app,
          { email: CONSULTANT_EMAIL, password: WRONG_PASSWORD },
          spammerIp,
        );
        expect(allowed.status).toBe(HTTP_UNAUTHORIZED);
      }

      const blocked = await postLogin(
        app,
        { email: CONSULTANT_EMAIL, password: WRONG_PASSWORD },
        spammerIp,
      );
      const blockedBody = apiErrorSchema.parse(await blocked.json());
      expect(blocked.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(blockedBody.error.code).toBe(RATE_LIMITED_CODE);
      expect(blockedBody.error.message).toBe(LOGIN_RATE_LIMITED_MESSAGE);

      // Outro IP com credenciais corretas segue passando ⇒ o bucket é por IP.
      const otherIp = await postLogin(
        app,
        { email: CONSULTANT_EMAIL, password: CORRECT_PASSWORD },
        "198.51.100.99",
      );
      expect(otherIp.status).toBe(HTTP_OK);
    });

    it("POST /auth/login é público: funciona sem token de sessão", async () => {
      await seedConsultant();
      const app = buildApp();

      const response = await postLogin(app, {
        email: CONSULTANT_EMAIL,
        password: CORRECT_PASSWORD,
      });

      expect(response.status).toBe(HTTP_OK);
    });
  });

  describe("guard default-deny (RF-04)", () => {
    it("GET /auth/me sem header Authorization ⇒ 401 no envelope padrão", async () => {
      const app = buildApp();

      const response = await getMe(app);
      const body = apiErrorSchema.parse(await response.json());

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(body.error.code).toBe(UNAUTHORIZED_CODE);
      expect(body.error.message).toBe(UNAUTHORIZED_MESSAGE);
    });

    it("GET /auth/me com token forjado ⇒ 401", async () => {
      const app = buildApp();

      const response = await getMe(app, bearer("token-forjado-inexistente"));
      const body = apiErrorSchema.parse(await response.json());

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(body.error.code).toBe(UNAUTHORIZED_CODE);
    });

    it("GET /auth/me com sessão EXPIRADA ⇒ 401", async () => {
      const consultant = await seedConsultant();
      const expiredToken = "token-de-sessao-expirada";
      const pastExpiry = new Date(Date.now() - 1_000);
      await insertSessionRow(consultant.id, expiredToken, pastExpiry);

      const app = buildApp();
      const response = await getMe(app, bearer(expiredToken));
      const body = apiErrorSchema.parse(await response.json());

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(body.error.code).toBe(UNAUTHORIZED_CODE);
    });

    it("variantes de path não bypassam o guard (trailing slash, query, barra dupla)", async () => {
      const app = buildApp();

      const trailingSlash = await getMe(app, {}, "/auth/me/");
      const queryString = await getMe(app, {}, "/auth/me?x=1");
      const doubleSlash = await getMe(app, {}, "//auth/me");

      expect(trailingSlash.status).toBe(HTTP_UNAUTHORIZED);
      expect(queryString.status).toBe(HTTP_UNAUTHORIZED);
      expect(doubleSlash.status).toBe(HTTP_UNAUTHORIZED);
    });

    it("rota inexistente autenticada ⇒ 401 (não 404: guard não vaza existência)", async () => {
      const app = buildApp();

      const response = await getMe(app, {}, "/qualquer-rota");
      const body = apiErrorSchema.parse(await response.json());

      // O guard roda antes do roteamento: sem sessão válida a resposta é 401,
      // não 404 — anônimo não descobre quais rotas existem.
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(body.error.code).toBe(UNAUTHORIZED_CODE);
    });

    it("rotas públicas seguem abertas sem token: GET /health e POST /leads", async () => {
      const app = buildApp();

      const health = await getMe(app, {}, "/health");
      expect(health.status).toBe(HTTP_OK);
      expect(await health.json()).toEqual({ status: "ok" });

      const lead = await postLead(app);
      expect(lead.status).toBe(HTTP_CREATED);
    });
  });

  describe("GET /auth/me com sessão válida (RF-05)", () => {
    it("⇒ 200 com a consultora SEM envelope e SEM password_hash", async () => {
      const consultant = await seedConsultant();
      const app = buildApp();
      const token = await loginWithCorrectPassword(app);

      const response = await getMe(app, bearer(token));
      expect(response.status).toBe(HTTP_OK);

      const raw: unknown = await response.json();
      const body = authConsultantSchema.parse(raw);

      expect(body).toEqual({
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
      });
      // Sem envelope `{ error }` e sem qualquer vazamento do hash da senha.
      expect(raw).not.toHaveProperty("error");
      expect(raw).not.toHaveProperty("password_hash");
      expect(raw).not.toHaveProperty("passwordHash");
      expect(Object.keys(body).sort()).toEqual(["email", "id", "name"]);
    });
  });

  describe("POST /auth/logout (RF-05)", () => {
    it("com sessão válida ⇒ { ok: true }; o mesmo token depois ⇒ 401; logout repetido é idempotente (não-500)", async () => {
      await seedConsultant();
      const app = buildApp();
      const token = await loginWithCorrectPassword(app);

      const logoutResponse = await postLogout(app, bearer(token));
      expect(logoutResponse.status).toBe(HTTP_OK);
      expect(await logoutResponse.json()).toEqual({ ok: true });
      expect(await countSessions()).toBe(0);

      const meAfterLogout = await getMe(app, bearer(token));
      expect(meAfterLogout.status).toBe(HTTP_UNAUTHORIZED);

      // O guard barra o re-logout (sessão já removida): responde 401, nunca 500.
      const secondLogout = await postLogout(app, bearer(token));
      expect(secondLogout.status).not.toBe(HTTP_INTERNAL_ERROR);
      expect(secondLogout.status).toBe(HTTP_UNAUTHORIZED);
    });
  });

  describe("token opaco não armazenado em claro (RF-07)", () => {
    it("a linha de sessions guarda o SHA-256 hex do token, nunca o token", async () => {
      await seedConsultant();
      const app = buildApp();
      const token = await loginWithCorrectPassword(app);

      const stored = await ctx.db.select().from(sessions);
      expect(stored).toHaveLength(1);
      const [row] = stored;
      expect(row?.tokenHash).not.toBe(token);
      expect(row?.tokenHash).toBe(sha256Hex(token));
    });
  });

  describe("limpeza oportunista no login (RF-06)", () => {
    it("novo login remove a sessão expirada da consultora e preserva a sessão válida anterior", async () => {
      const consultant = await seedConsultant();
      const app = buildApp();

      const firstToken = await loginWithCorrectPassword(app);
      const expiredToken = "token-expirado-antigo";
      await insertSessionRow(
        consultant.id,
        expiredToken,
        new Date(Date.now() - 1_000),
      );
      expect(await countSessions()).toBe(2);

      const secondToken = await loginWithCorrectPassword(app);

      const stored = await ctx.db.select().from(sessions);
      const storedHashes = stored.map((row) => row.tokenHash);

      expect(storedHashes).not.toContain(sha256Hex(expiredToken));
      expect(storedHashes).toContain(sha256Hex(firstToken));
      expect(storedHashes).toContain(sha256Hex(secondToken));
      expect(stored).toHaveLength(2);
    });
  });
});
