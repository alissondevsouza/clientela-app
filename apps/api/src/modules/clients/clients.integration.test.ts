import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  apiErrorSchema,
  type Client,
  clientSchema,
  loginResponseSchema,
  paginated,
} from "@clientela/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { clients, consultants } from "../../db/schema";
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
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createClientsRepository } from "./clients.repository";
import { createClientsService } from "./clients.service";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_INTERNAL_ERROR = 500;

const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";
const UNAUTHORIZED_CODE = "UNAUTHORIZED";
const CLIENT_NOT_FOUND_CODE = "CLIENT_NOT_FOUND";

const CORRECT_PASSWORD = "senha-super-secreta";
const CONSULTANT_A = {
  name: "Consultora A",
  email: "consultora-a@example.com",
  whatsapp: "11987654321",
  ip: "203.0.113.10",
} as const;
const CONSULTANT_B = {
  name: "Consultora B",
  email: "consultora-b@example.com",
  whatsapp: "11912345678",
  ip: "203.0.113.20",
} as const;

// uuid v4 sintaticamente válido porém inexistente no banco: usado para provar que
// "não existe" e "não é sua" respondem o MESMO 404 (RF-04/RF-05).
const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

// Contrato de saída da listagem paginada, montado a partir dos schemas
// compartilhados (mesma forma que o front consome). Parse real = prova de que a
// resposta da API adere ao contrato público.
const clientListSchema = paginated(clientSchema);

// O `PasswordHasher` de produção usa `Bun.password` (argon2id), disponível só no
// runtime do Bun; os workers do Vitest rodam sob Node, onde o global `Bun` não
// existe. Como o hasher é uma porta injetada (api.md), o teste usa um KDF real do
// Node (`scrypt`) com o MESMO round-trip (hash na semeadura, verify no login) —
// prova de verdade o login real contra o Postgres. Espelha o auth.integration.
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

const VALID_CLIENT_BODY = {
  name: "Ana Maria",
  whatsapp: "(11) 98765-4321",
  birthday: "1990-05-10",
  skinTone: "média",
  notes: "gosta de batom rosa",
} as const;

// WhatsApp é normalizado para só-dígitos na fronteira (whatsappSchema): a máscara
// enviada no POST vira este valor armazenado/retornado.
const VALID_CLIENT_WHATSAPP_DIGITS = "11987654321";

describe("clients (integração)", () => {
  let ctx: PgTestContext;
  let passwordHash: string;

  beforeAll(async () => {
    ctx = await startPgContainer();
    // argon2id real é caro; scrypt aqui também. Computa UMA vez e reusa em todas
    // as consultoras (mesma senha) — só o verify do login paga custo por caso.
    passwordHash = await realPasswordHasher.hash(CORRECT_PASSWORD);
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterEach(async () => {
    await ctx.truncateAll();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  // App real: repositórios/serviços apontando para o Postgres do container, guard
  // e rate limiters reais. Rate limiter novo por app evita vazamento de contagem
  // entre casos.
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
    return createApp({
      leadsService,
      rateLimiter,
      authService,
      loginRateLimiter,
      clientsService,
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

  // Login real (POST /auth/login) com as credenciais semeadas ⇒ token opaco de
  // sessão. É a sessão real que as rotas de clients revalidam via authService.
  const login = async (app: App, data: Consultant): Promise<string> => {
    const response = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": data.ip,
        },
        body: JSON.stringify({ email: data.email, password: CORRECT_PASSWORD }),
      }),
    );
    expect(response.status).toBe(HTTP_OK);
    const body = loginResponseSchema.parse(await response.json());
    return body.token;
  };

  // Semeia consultora + abre sessão real, devolvendo o id e o token.
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
    birthday?: string;
    skinTone?: string;
    notes?: string;
  };

  // Semeadura direta de clientes (setup de listagem/busca/escopo): o
  // comportamento sob teste é o GET, não o POST. WhatsApp é gravado só-dígitos,
  // como a fronteira o normalizaria.
  const seedClients = async (
    consultantId: string,
    values: readonly SeedClientValues[],
  ): Promise<void> => {
    await ctx.db
      .insert(clients)
      .values(values.map((value) => ({ consultantId, ...value })));
  };

  const getClients = (
    app: App,
    token: string,
    queryString = "",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/clients${queryString}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const postClient = (
    app: App,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/clients", {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const getClient = (app: App, id: string, token?: string): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/clients/${id}`, {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const patchClient = (
    app: App,
    id: string,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/clients/${id}`, {
        method: "PATCH",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const deleteClient = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/clients/${id}`, {
        method: "DELETE",
        headers: token ? bearer(token) : {},
      }),
    );

  const createValidClient = async (
    app: App,
    token: string,
  ): Promise<Client> => {
    const response = await postClient(app, VALID_CLIENT_BODY, token);
    expect(response.status).toBe(HTTP_CREATED);
    return clientSchema.parse(await response.json());
  };

  describe("fluxo CRUD com sessão real (RF-03/RF-05)", () => {
    it("POST 201 → lista → detalhe → PATCH parcial → PATCH null limpa → DELETE 204 → 404", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      // POST 201 aderente ao clientSchema; whatsapp normalizado; datas ISO.
      const created = await createValidClient(app, token);
      expect(created.name).toBe(VALID_CLIENT_BODY.name);
      expect(created.whatsapp).toBe(VALID_CLIENT_WHATSAPP_DIGITS);
      expect(created.birthday).toBe(VALID_CLIENT_BODY.birthday);
      expect(created.skinTone).toBe(VALID_CLIENT_BODY.skinTone);
      expect(created.notes).toBe(VALID_CLIENT_BODY.notes);

      // GET lista paginada: total 1, a cliente recém-criada.
      const listResponse = await getClients(app, token);
      expect(listResponse.status).toBe(HTTP_OK);
      const list = clientListSchema.parse(await listResponse.json());
      expect(list.total).toBe(1);
      expect(list.page).toBe(1);
      expect(list.perPage).toBe(20);
      expect(list.data).toHaveLength(1);
      expect(list.data[0]?.id).toBe(created.id);

      // GET :id 200 — mesma linha, idêntica ao retorno do POST.
      const detailResponse = await getClient(app, created.id, token);
      expect(detailResponse.status).toBe(HTTP_OK);
      expect(clientSchema.parse(await detailResponse.json())).toEqual(created);

      // PATCH parcial: altera SÓ `name`; os demais campos permanecem.
      const patchResponse = await patchClient(
        app,
        created.id,
        { name: "Ana Paula" },
        token,
      );
      expect(patchResponse.status).toBe(HTTP_OK);
      const patched = clientSchema.parse(await patchResponse.json());
      expect(patched.name).toBe("Ana Paula");
      expect(patched.whatsapp).toBe(created.whatsapp);
      expect(patched.birthday).toBe(created.birthday);
      expect(patched.skinTone).toBe(created.skinTone);
      expect(patched.notes).toBe(created.notes);
      expect(patched.id).toBe(created.id);

      // PATCH { birthday: null }: limpa o campo nullable; `name` (não enviado)
      // segue como estava.
      const clearResponse = await patchClient(
        app,
        created.id,
        { birthday: null },
        token,
      );
      expect(clearResponse.status).toBe(HTTP_OK);
      const cleared = clientSchema.parse(await clearResponse.json());
      expect(cleared.birthday).toBeNull();
      expect(cleared.name).toBe("Ana Paula");

      // DELETE 204 sem corpo.
      const deleteResponse = await deleteClient(app, created.id, token);
      expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);
      expect(await deleteResponse.text()).toBe("");

      // GET :id após exclusão ⇒ 404 pt-BR no envelope padrão.
      const goneResponse = await getClient(app, created.id, token);
      expect(goneResponse.status).toBe(HTTP_NOT_FOUND);
      const goneBody = apiErrorSchema.parse(await goneResponse.json());
      expect(goneBody.error.code).toBe(CLIENT_NOT_FOUND_CODE);
      expect(goneBody.error.message).toMatch(/não encontrada/i);
    });

    it("birthday faz ida-e-volta pela API preservando yyyy-mm-dd", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const created = await createValidClient(app, token);
      expect(created.birthday).toBe("1990-05-10");

      const detailResponse = await getClient(app, created.id, token);
      const detail = clientSchema.parse(await detailResponse.json());
      expect(detail.birthday).toBe("1990-05-10");
    });
  });

  describe("paginação (RF-03)", () => {
    const seedManyClients = async (consultantId: string): Promise<number> => {
      const total = 25;
      const rows = Array.from({ length: total }, (_, idx) => {
        const n = idx + 1;
        const padded = String(n).padStart(2, "0");
        return {
          name: `Cliente ${padded}`,
          whatsapp: `1198800${String(n).padStart(4, "0")}`,
        };
      });
      await seedClients(consultantId, rows);
      return total;
    };

    it("default retorna 20 na página 1 com total correto", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const total = await seedManyClients(consultantId);

      const response = await getClients(app, token);
      expect(response.status).toBe(HTTP_OK);
      const list = clientListSchema.parse(await response.json());

      expect(list.total).toBe(total);
      expect(list.page).toBe(1);
      expect(list.perPage).toBe(20);
      expect(list.data).toHaveLength(20);
      // Ordenação estável por nome asc: a primeira janela é Cliente 01..20.
      expect(list.data[0]?.name).toBe("Cliente 01");
      expect(list.data[19]?.name).toBe("Cliente 20");
    });

    it("?perPage=5&page=2 respeita a janela pedida", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const total = await seedManyClients(consultantId);

      const response = await getClients(app, token, "?perPage=5&page=2");
      expect(response.status).toBe(HTTP_OK);
      const list = clientListSchema.parse(await response.json());

      expect(list.total).toBe(total);
      expect(list.page).toBe(2);
      expect(list.perPage).toBe(5);
      expect(list.data).toHaveLength(5);
      // offset (2-1)*5 = 5 ⇒ Cliente 06..10.
      expect(list.data[0]?.name).toBe("Cliente 06");
      expect(list.data[4]?.name).toBe("Cliente 10");
    });

    it("?perPage=101 (acima do máximo) ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getClients(app, token, "?perPage=101");
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/máximo/i);
      expect(body.error.message).not.toMatch(
        /expected|invalid input|less than/i,
      );
    });

    it("?page=0 (abaixo do mínimo) ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getClients(app, token, "?page=0");
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/mínimo|página/i);
    });
  });

  describe("busca (RF-03)", () => {
    const SEARCH_FIXTURES: readonly SeedClientValues[] = [
      { name: "Ana Silva", whatsapp: "11988887777" },
      { name: "Bruno Costa", whatsapp: "21977776666" },
      { name: "Carla Souza", whatsapp: "31966665555" },
    ];

    it("filtra por fragmento de nome case-insensitive", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedClients(consultantId, SEARCH_FIXTURES);

      const lowerResponse = await getClients(app, token, "?search=ana");
      const lower = clientListSchema.parse(await lowerResponse.json());
      expect(lower.total).toBe(1);
      expect(lower.data.map((client) => client.name)).toEqual(["Ana Silva"]);

      // Mesma cliente encontrada com o fragmento em caixa alta ⇒ ILIKE.
      const upperResponse = await getClients(app, token, "?search=SILVA");
      const upper = clientListSchema.parse(await upperResponse.json());
      expect(upper.total).toBe(1);
      expect(upper.data.map((client) => client.name)).toEqual(["Ana Silva"]);
    });

    it("filtra por dígitos do whatsapp", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedClients(consultantId, SEARCH_FIXTURES);

      const response = await getClients(app, token, "?search=9888");
      const list = clientListSchema.parse(await response.json());
      expect(list.total).toBe(1);
      expect(list.data.map((client) => client.name)).toEqual(["Ana Silva"]);
    });

    it("termo sem correspondência ⇒ data vazia com total 0", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedClients(consultantId, SEARCH_FIXTURES);

      const response = await getClients(app, token, "?search=zzzznaoexiste");
      expect(response.status).toBe(HTTP_OK);
      const list = clientListSchema.parse(await response.json());
      expect(list.total).toBe(0);
      expect(list.data).toEqual([]);
    });

    it("search com mais de 100 caracteres ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const longSearch = "a".repeat(101);
      const response = await getClients(app, token, `?search=${longSearch}`);
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/busca|100/i);
    });
  });

  describe("escopo multi-consultora (RF-04)", () => {
    it("a sessão de A não lista clientes de B", async () => {
      const app = buildApp();
      const { consultantId: idA, token: tokenA } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );

      await seedClients(idA, [
        { name: "Cliente da A", whatsapp: "11900000001" },
      ]);
      await seedClients(idB, [
        { name: "Cliente da B", whatsapp: "11900000002" },
      ]);

      const response = await getClients(app, tokenA);
      const list = clientListSchema.parse(await response.json());
      expect(list.total).toBe(1);
      expect(list.data.map((client) => client.name)).toEqual(["Cliente da A"]);
    });

    it("GET/PATCH/DELETE do id de B com sessão A ⇒ 404 idêntico ao inexistente", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );

      const [clientOfB] = await ctx.db
        .insert(clients)
        .values({
          consultantId: idB,
          name: "Cliente da B",
          whatsapp: "11900000002",
        })
        .returning({ id: clients.id });
      const clientBId = clientOfB?.id;
      if (!clientBId) {
        throw new Error("falha ao semear a cliente da consultora B");
      }

      // Corpo de referência: 404 de um id sintaticamente válido mas inexistente.
      const referenceResponse = await getClient(app, NONEXISTENT_UUID, tokenA);
      expect(referenceResponse.status).toBe(HTTP_NOT_FOUND);
      const referenceBody = apiErrorSchema.parse(
        await referenceResponse.json(),
      );

      const getResponse = await getClient(app, clientBId, tokenA);
      expect(getResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await getResponse.json())).toEqual(
        referenceBody,
      );

      const patchResponse = await patchClient(
        app,
        clientBId,
        { name: "Invasão" },
        tokenA,
      );
      expect(patchResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await patchResponse.json())).toEqual(
        referenceBody,
      );

      const deleteResponse = await deleteClient(app, clientBId, tokenA);
      expect(deleteResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await deleteResponse.json())).toEqual(
        referenceBody,
      );

      // A cliente de B continua intacta: o escopo não deixou A alterá-la.
      const stillThere = await getClient(app, clientBId, tokenA);
      expect(stillThere.status).toBe(HTTP_NOT_FOUND);
      const survivors = await ctx.db.select().from(clients);
      expect(survivors).toHaveLength(1);
      expect(survivors[0]?.name).toBe("Cliente da B");
    });
  });

  describe("id malformado (RF-05)", () => {
    it("GET /clients/nao-uuid ⇒ 404 (não 422 nem 500)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getClient(app, "nao-uuid", token);
      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(response.status).not.toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(response.status).not.toBe(HTTP_INTERNAL_ERROR);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(CLIENT_NOT_FOUND_CODE);
    });
  });

  describe("guard default-deny (RF-04)", () => {
    it("sem token ⇒ 401 nas 5 rotas do módulo", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        getClients(app, ""),
        postClient(app, VALID_CLIENT_BODY),
        getClient(app, NONEXISTENT_UUID),
        patchClient(app, NONEXISTENT_UUID, { name: "X" }),
        deleteClient(app, NONEXISTENT_UUID),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(HTTP_UNAUTHORIZED);
        const body = apiErrorSchema.parse(await response.json());
        expect(body.error.code).toBe(UNAUTHORIZED_CODE);
        expect(body.error.message).toBe(UNAUTHORIZED_MESSAGE);
      }
    });
  });

  describe("validação de body (RF-05)", () => {
    it("POST com nome curto ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postClient(
        app,
        { ...VALID_CLIENT_BODY, name: "A" },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/nome/i);
      expect(body.error.message).not.toMatch(
        /expected|invalid input|at least/i,
      );
    });

    it("POST com whatsapp inválido ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postClient(
        app,
        { ...VALID_CLIENT_BODY, whatsapp: "123" },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/whatsapp/i);
    });

    it("POST com birthday futuro ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postClient(
        app,
        { ...VALID_CLIENT_BODY, birthday: "2999-01-01" },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/futura/i);
    });

    it("PATCH com body vazio ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const created = await createValidClient(app, token);

      const response = await patchClient(app, created.id, {}, token);
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/atualizar|campo/i);
    });
  });
});
