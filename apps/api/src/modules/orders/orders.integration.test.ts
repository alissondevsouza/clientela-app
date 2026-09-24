import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  apiErrorSchema,
  loginResponseSchema,
  type Order,
  orderListItemSchema,
  orderSchema,
  paginated,
  productSchema,
} from "@clientela/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { clients, consultants, products } from "../../db/schema";
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
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createProductsRepository } from "../products/products.repository";
import { createProductsService } from "../products/products.service";
import { createSalesRepository } from "../sales/sales.repository";
import { createSalesService } from "../sales/sales.service";
import { createOrdersRepository } from "./orders.repository";
import { createOrdersService } from "./orders.service";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const UNAUTHORIZED_CODE = "UNAUTHORIZED";
const ORDER_NOT_FOUND_CODE = "ORDER_NOT_FOUND";
const ORDER_STATE_CODE = "ORDER_STATE";
const INVALID_ORDER_ITEM_CODE = "INVALID_ORDER_ITEM";
const INVALID_ORDER_CLIENT_CODE = "INVALID_ORDER_CLIENT";

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
// existe" e "não é seu" respondem o MESMO 404/422 (RF-01/RF-06).
const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

const orderListSchema = paginated(orderListItemSchema);

// Hasher real de KDF do Node (scrypt): os workers do Vitest rodam sob Node,
// onde o global `Bun` (argon2id) não existe. Round-trip real (hash na
// semeadura, verify no login) prova o login de verdade. Espelha sales/products.
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

describe("orders (integração)", () => {
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
  // guard e rate limiters reais.
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

  type SeedProductValues = {
    name: string;
    costCents?: number;
    purchaseDiscountBps?: number | null;
    priceCents: number;
    stockQty?: number;
  };

  // Semeadura direta de produtos: o comportamento sob teste é o pedido, não
  // o CRUD de produtos.
  const seedProduct = async (
    consultantId: string,
    values: SeedProductValues,
  ): Promise<string> => {
    const [row] = await ctx.db
      .insert(products)
      .values({ consultantId, costCents: 1000, ...values })
      .returning({ id: products.id });
    if (!row) {
      throw new Error("falha ao semear o produto de teste");
    }
    return row.id;
  };

  type SeedClientValues = {
    name: string;
    whatsapp: string;
  };

  // Semeadura direta de clientes (setup do vínculo item↔cliente): o
  // comportamento sob teste é o pedido, não o CRUD de clientes (mesmo padrão
  // de seedProduct).
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

  // ------------------------- requesters HTTP -------------------------

  const postOrder = (
    app: App,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/orders", {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const getOrders = (
    app: App,
    token: string,
    queryString = "",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/orders${queryString}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const getOrder = (app: App, id: string, token?: string): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/orders/${id}`, {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const putOrderItems = (
    app: App,
    id: string,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/orders/${id}/items`, {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const placeOrder = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/orders/${id}/place`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const deliverOrder = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/orders/${id}/deliver`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const cancelOrder = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/orders/${id}/cancel`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const getProduct = (app: App, id: string, token: string): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/products/${id}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const patchProduct = (
    app: App,
    id: string,
    body: unknown,
    token: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/products/${id}`, {
        method: "PATCH",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const deleteProduct = (
    app: App,
    id: string,
    token: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/products/${id}`, {
        method: "DELETE",
        headers: bearer(token),
      }),
    );

  const patchClient = (
    app: App,
    id: string,
    body: unknown,
    token: string,
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
    token: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/clients/${id}`, {
        method: "DELETE",
        headers: bearer(token),
      }),
    );

  const stockOf = async (
    app: App,
    id: string,
    token: string,
  ): Promise<number> => {
    const response = await getProduct(app, id, token);
    expect(response.status).toBe(HTTP_OK);
    return productSchema.parse(await response.json()).stockQty;
  };

  const createOrderOk = async (
    app: App,
    body: unknown,
    token: string,
  ): Promise<Order> => {
    const response = await postOrder(app, body, token);
    expect(response.status).toBe(HTTP_CREATED);
    return orderSchema.parse(await response.json());
  };

  const getOrderOk = async (
    app: App,
    id: string,
    token: string,
  ): Promise<Order> => {
    const response = await getOrder(app, id, token);
    expect(response.status).toBe(HTTP_OK);
    return orderSchema.parse(await response.json());
  };

  // -------------------------------------------------------------------------
  // RF-01 — criação
  // -------------------------------------------------------------------------
  describe("criação (RF-01)", () => {
    it("sem itens ⇒ 201 draft com totalCents 0", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const order = await createOrderOk(app, {}, token);

      expect(order.status).toBe("draft");
      expect(order.totalCents).toBe(0);
      expect(order.items).toEqual([]);
      expect(order.placedAt).toBeNull();
      expect(order.deliveredAt).toBeNull();
      expect(order.canceledAt).toBeNull();
    });

    it("com itens: total calculado no servidor (qty × custo), snapshot de nome, default e override de custo", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productDefault = await seedProduct(consultantId, {
        name: "Batom Vermelho",
        costCents: 1_500,
        priceCents: 3_990,
        stockQty: 10,
      });
      const productOverride = await seedProduct(consultantId, {
        name: "Base Líquida",
        costCents: 2_000,
        priceCents: 5_000,
        stockQty: 5,
      });

      const order = await createOrderOk(
        app,
        {
          items: [
            { productId: productDefault, qty: 2 },
            { productId: productOverride, qty: 3, unitCostCents: 1_800 },
          ],
        },
        token,
      );

      // Total = 2×1500 (default = costCents atual) + 3×1800 (override) = 8400.
      expect(order.totalCents).toBe(8_400);
      expect(order.status).toBe("draft");
      expect(order.items).toHaveLength(2);

      const itemDefault = order.items.find(
        (item) => item.productId === productDefault,
      );
      expect(itemDefault?.productName).toBe("Batom Vermelho");
      expect(itemDefault?.qty).toBe(2);
      expect(itemDefault?.unitCostCents).toBe(1_500); // default = costCents atual

      const itemOverride = order.items.find(
        (item) => item.productId === productOverride,
      );
      expect(itemOverride?.productName).toBe("Base Líquida");
      expect(itemOverride?.qty).toBe(3);
      expect(itemOverride?.unitCostCents).toBe(1_800); // override respeitado
    });

    it("usa o custo calculado por desconto como default e não reescreve o snapshot do pedido após mudar a taxa", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto com Desconto",
        costCents: 2_594,
        purchaseDiscountBps: 3_500,
        priceCents: 3_990,
        stockQty: 5,
      });

      const firstOrder = await createOrderOk(
        app,
        { items: [{ productId, qty: 2 }] },
        token,
      );
      expect(firstOrder.totalCents).toBe(5_188);
      expect(firstOrder.items[0]?.unitCostCents).toBe(2_594);

      const patchResponse = await patchProduct(
        app,
        productId,
        { purchaseDiscountBps: 4_000 },
        token,
      );
      expect(patchResponse.status).toBe(HTTP_OK);
      const updatedProduct = productSchema.parse(await patchResponse.json());
      expect(updatedProduct.costCents).toBe(2_394);
      expect(updatedProduct.purchaseDiscountBps).toBe(4_000);

      const persistedFirstOrder = await getOrderOk(app, firstOrder.id, token);
      expect(persistedFirstOrder.totalCents).toBe(5_188);
      expect(persistedFirstOrder.items[0]?.unitCostCents).toBe(2_594);

      const secondOrder = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      expect(secondOrder.totalCents).toBe(2_394);
      expect(secondOrder.items[0]?.unitCostCents).toBe(2_394);
    });

    it("item com productId inexistente ⇒ 422 e nada é persistido", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postOrder(
        app,
        { items: [{ productId: NONEXISTENT_UUID, qty: 1 }] },
        token,
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_ORDER_ITEM_CODE);

      const list = orderListSchema.parse(
        await (await getOrders(app, token)).json(),
      );
      expect(list.total).toBe(0);
    });

    it("item de produto de OUTRA consultora ⇒ 422 e nada é persistido", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const productOfB = await seedProduct(idB, {
        name: "Produto da B",
        priceCents: 1_000,
        stockQty: 5,
      });

      const response = await postOrder(
        app,
        { items: [{ productId: productOfB, qty: 1 }] },
        tokenA,
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_ORDER_ITEM_CODE);

      const list = orderListSchema.parse(
        await (await getOrders(app, tokenA)).json(),
      );
      expect(list.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // RF-02 — substituição de itens
  // -------------------------------------------------------------------------
  describe("replace de itens (RF-02)", () => {
    it("em draft: substitui os itens e recalcula o total", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productA = await seedProduct(consultantId, {
        name: "Produto A",
        costCents: 1_000,
        priceCents: 2_000,
      });
      const productB = await seedProduct(consultantId, {
        name: "Produto B",
        costCents: 2_000,
        priceCents: 3_000,
      });

      const order = await createOrderOk(
        app,
        { items: [{ productId: productA, qty: 1 }] },
        token,
      );
      expect(order.totalCents).toBe(1_000);

      const response = await putOrderItems(
        app,
        order.id,
        { items: [{ productId: productB, qty: 4 }] },
        token,
      );
      expect(response.status).toBe(HTTP_OK);
      const replaced = orderSchema.parse(await response.json());
      expect(replaced.totalCents).toBe(8_000);
      expect(replaced.items).toHaveLength(1);
      expect(replaced.items[0]?.productId).toBe(productB);
      expect(replaced.items[0]?.qty).toBe(4);
    });

    it("lista vazia é válida em draft ⇒ esvazia o rascunho com total 0", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productA = await seedProduct(consultantId, {
        name: "Produto A",
        costCents: 1_000,
        priceCents: 2_000,
      });
      const order = await createOrderOk(
        app,
        { items: [{ productId: productA, qty: 1 }] },
        token,
      );

      const response = await putOrderItems(app, order.id, { items: [] }, token);
      expect(response.status).toBe(HTTP_OK);
      const replaced = orderSchema.parse(await response.json());
      expect(replaced.totalCents).toBe(0);
      expect(replaced.items).toEqual([]);
    });

    it("fora de draft (placed/delivered/canceled) ⇒ 409 sem alterar itens/total", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productA = await seedProduct(consultantId, {
        name: "Produto A",
        costCents: 1_000,
        priceCents: 2_000,
      });
      const productB = await seedProduct(consultantId, {
        name: "Produto B",
        costCents: 5_000,
        priceCents: 6_000,
      });

      const placedOrder = await createOrderOk(
        app,
        { items: [{ productId: productA, qty: 2 }] },
        token,
      );
      expect((await placeOrder(app, placedOrder.id, token)).status).toBe(
        HTTP_OK,
      );

      const attempt = await putOrderItems(
        app,
        placedOrder.id,
        { items: [{ productId: productB, qty: 9 }] },
        token,
      );
      expect(attempt.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await attempt.json());
      expect(body.error.code).toBe(ORDER_STATE_CODE);
      expect(body.error.message).toMatch(/rascunho/i);

      const after = await getOrderOk(app, placedOrder.id, token);
      expect(after.totalCents).toBe(2_000);
      expect(after.items).toHaveLength(1);
      expect(after.items[0]?.productId).toBe(productA);

      const deliveredOrder = await getOrderOk(app, placedOrder.id, token);
      expect((await deliverOrder(app, deliveredOrder.id, token)).status).toBe(
        HTTP_OK,
      );
      const attemptDelivered = await putOrderItems(
        app,
        deliveredOrder.id,
        { items: [] },
        token,
      );
      expect(attemptDelivered.status).toBe(HTTP_CONFLICT);

      const canceledOrder = await createOrderOk(app, {}, token);
      expect((await cancelOrder(app, canceledOrder.id, token)).status).toBe(
        HTTP_OK,
      );
      const attemptCanceled = await putOrderItems(
        app,
        canceledOrder.id,
        { items: [] },
        token,
      );
      expect(attemptCanceled.status).toBe(HTTP_CONFLICT);
    });
  });

  // -------------------------------------------------------------------------
  // RF-03 — matriz de transições
  // -------------------------------------------------------------------------
  describe("matriz de transições (RF-03)", () => {
    it("draft → placed → delivered: timestamps não-nulos em ordem relativa createdAt ≤ placedAt ≤ deliveredAt", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Item",
        priceCents: 1_000,
        stockQty: 5,
      });
      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      expect(order.placedAt).toBeNull();

      const placeResponse = await placeOrder(app, order.id, token);
      expect(placeResponse.status).toBe(HTTP_OK);
      const placed = orderSchema.parse(await placeResponse.json());
      expect(placed.status).toBe("placed");
      expect(placed.placedAt).not.toBeNull();
      expect(placed.deliveredAt).toBeNull();
      expect(placed.canceledAt).toBeNull();
      // Ordem relativa (nunca valor exato — determinismo, testing.md).
      expect(new Date(placed.createdAt).getTime()).toBeLessThanOrEqual(
        new Date(placed.placedAt as string).getTime(),
      );

      const deliverResponse = await deliverOrder(app, order.id, token);
      expect(deliverResponse.status).toBe(HTTP_OK);
      const delivered = orderSchema.parse(await deliverResponse.json());
      expect(delivered.status).toBe("delivered");
      expect(delivered.deliveredAt).not.toBeNull();
      expect(
        new Date(delivered.placedAt as string).getTime(),
      ).toBeLessThanOrEqual(
        new Date(delivered.deliveredAt as string).getTime(),
      );
    });

    it("draft → canceled: canceledAt não-nulo, sem placedAt/deliveredAt", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const order = await createOrderOk(app, {}, token);

      const response = await cancelOrder(app, order.id, token);
      expect(response.status).toBe(HTTP_OK);
      const canceled = orderSchema.parse(await response.json());
      expect(canceled.status).toBe("canceled");
      expect(canceled.canceledAt).not.toBeNull();
      expect(canceled.placedAt).toBeNull();
      expect(canceled.deliveredAt).toBeNull();
    });

    it("placed → canceled: canceledAt não-nulo, deliveredAt permanece nulo", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Item",
        priceCents: 1_000,
        stockQty: 5,
      });
      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      expect((await placeOrder(app, order.id, token)).status).toBe(HTTP_OK);

      const response = await cancelOrder(app, order.id, token);
      expect(response.status).toBe(HTTP_OK);
      const canceled = orderSchema.parse(await response.json());
      expect(canceled.status).toBe("canceled");
      expect(canceled.canceledAt).not.toBeNull();
      expect(canceled.deliveredAt).toBeNull();
    });

    it("transições inválidas ⇒ 409 sem efeito: deliver de draft, cancel de delivered, place repetido, deliver repetido, place de canceled", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Item",
        priceCents: 1_000,
        stockQty: 5,
      });

      // deliver de draft ⇒ 409.
      const draftOrder = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      const deliverDraftResponse = await deliverOrder(
        app,
        draftOrder.id,
        token,
      );
      expect(deliverDraftResponse.status).toBe(HTTP_CONFLICT);
      expect(
        apiErrorSchema.parse(await deliverDraftResponse.json()).error.code,
      ).toBe(ORDER_STATE_CODE);
      expect((await getOrderOk(app, draftOrder.id, token)).status).toBe(
        "draft",
      );

      // place repetido ⇒ 409, cancel de delivered ⇒ 409, deliver repetido ⇒ 409.
      const flowOrder = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      expect((await placeOrder(app, flowOrder.id, token)).status).toBe(HTTP_OK);

      const placeAgainResponse = await placeOrder(app, flowOrder.id, token);
      expect(placeAgainResponse.status).toBe(HTTP_CONFLICT);
      expect(
        apiErrorSchema.parse(await placeAgainResponse.json()).error.code,
      ).toBe(ORDER_STATE_CODE);

      expect((await deliverOrder(app, flowOrder.id, token)).status).toBe(
        HTTP_OK,
      );

      const cancelDeliveredResponse = await cancelOrder(
        app,
        flowOrder.id,
        token,
      );
      expect(cancelDeliveredResponse.status).toBe(HTTP_CONFLICT);
      expect(
        apiErrorSchema.parse(await cancelDeliveredResponse.json()).error.code,
      ).toBe(ORDER_STATE_CODE);

      const deliverAgainResponse = await deliverOrder(app, flowOrder.id, token);
      expect(deliverAgainResponse.status).toBe(HTTP_CONFLICT);
      expect(
        apiErrorSchema.parse(await deliverAgainResponse.json()).error.code,
      ).toBe(ORDER_STATE_CODE);

      const afterFlow = await getOrderOk(app, flowOrder.id, token);
      expect(afterFlow.status).toBe("delivered");

      // place de canceled ⇒ 409.
      const canceledOrder = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      expect((await cancelOrder(app, canceledOrder.id, token)).status).toBe(
        HTTP_OK,
      );
      const placeCanceledResponse = await placeOrder(
        app,
        canceledOrder.id,
        token,
      );
      expect(placeCanceledResponse.status).toBe(HTTP_CONFLICT);
      expect(
        apiErrorSchema.parse(await placeCanceledResponse.json()).error.code,
      ).toBe(ORDER_STATE_CODE);
    });

    it("place de rascunho sem itens ⇒ 409 e estado inalterado", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const emptyOrder = await createOrderOk(app, {}, token);

      const response = await placeOrder(app, emptyOrder.id, token);
      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(ORDER_STATE_CODE);
      expect(body.error.message).toMatch(/itens/i);

      const after = await getOrderOk(app, emptyOrder.id, token);
      expect(after.status).toBe("draft");
      expect(after.placedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // RF-04 — estoque na entrega
  // -------------------------------------------------------------------------
  describe("estoque (RF-04)", () => {
    it("deliver credita stock_qty += qty de cada item na mesma transação", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productA = await seedProduct(consultantId, {
        name: "Produto A",
        priceCents: 1_000,
        stockQty: 3,
      });
      const productB = await seedProduct(consultantId, {
        name: "Produto B",
        priceCents: 2_000,
        stockQty: 10,
      });

      const order = await createOrderOk(
        app,
        {
          items: [
            { productId: productA, qty: 5 },
            { productId: productB, qty: 2 },
          ],
        },
        token,
      );
      expect((await placeOrder(app, order.id, token)).status).toBe(HTTP_OK);

      // Antes: estoque original.
      expect(await stockOf(app, productA, token)).toBe(3);
      expect(await stockOf(app, productB, token)).toBe(10);

      const response = await deliverOrder(app, order.id, token);
      expect(response.status).toBe(HTTP_OK);

      // Depois: crédito exato (3+5=8, 10+2=12).
      expect(await stockOf(app, productA, token)).toBe(8);
      expect(await stockOf(app, productB, token)).toBe(12);
    });

    it("item cujo produto foi excluído após o place (SET NULL) não credita e não falha a entrega", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const toDelete = await seedProduct(consultantId, {
        name: "Será Excluído",
        priceCents: 1_000,
        stockQty: 4,
      });
      const toKeep = await seedProduct(consultantId, {
        name: "Vai Ficar",
        priceCents: 2_000,
        stockQty: 6,
      });

      const order = await createOrderOk(
        app,
        {
          items: [
            { productId: toDelete, qty: 3 },
            { productId: toKeep, qty: 1 },
          ],
        },
        token,
      );
      expect((await placeOrder(app, order.id, token)).status).toBe(HTTP_OK);

      const deleteResponse = await deleteProduct(app, toDelete, token);
      expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);

      const deliverResponse = await deliverOrder(app, order.id, token);
      expect(deliverResponse.status).toBe(HTTP_OK);

      // Produto vivo recebeu o crédito; produto excluído não existe mais (sem
      // erro na entrega, item permanece no histórico).
      expect(await stockOf(app, toKeep, token)).toBe(7);
      expect((await getProduct(app, toDelete, token)).status).toBe(
        HTTP_NOT_FOUND,
      );

      const delivered = await getOrderOk(app, order.id, token);
      expect(delivered.status).toBe("delivered");
      const deletedItem = delivered.items.find(
        (item) => item.productName === "Será Excluído",
      );
      expect(deletedItem?.productId).toBeNull();
    });

    it("cancel (de draft ou placed) não altera estoque", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productDraft = await seedProduct(consultantId, {
        name: "Item Draft",
        priceCents: 1_000,
        stockQty: 5,
      });
      const draftOrder = await createOrderOk(
        app,
        { items: [{ productId: productDraft, qty: 2 }] },
        token,
      );
      expect((await cancelOrder(app, draftOrder.id, token)).status).toBe(
        HTTP_OK,
      );
      expect(await stockOf(app, productDraft, token)).toBe(5);

      const productPlaced = await seedProduct(consultantId, {
        name: "Item Placed",
        priceCents: 1_000,
        stockQty: 8,
      });
      const placedOrder = await createOrderOk(
        app,
        { items: [{ productId: productPlaced, qty: 3 }] },
        token,
      );
      expect((await placeOrder(app, placedOrder.id, token)).status).toBe(
        HTTP_OK,
      );
      expect((await cancelOrder(app, placedOrder.id, token)).status).toBe(
        HTTP_OK,
      );
      expect(await stockOf(app, productPlaced, token)).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // RF-03/RF-04 — concorrência
  // -------------------------------------------------------------------------
  describe("concorrência (RF-03/RF-04)", () => {
    it("duas chamadas deliver simultâneas ⇒ exatamente uma 200 e uma 409, estoque creditado uma única vez", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Disputa Deliver",
        priceCents: 1_000,
        stockQty: 10,
      });
      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 7 }] },
        token,
      );
      expect((await placeOrder(app, order.id, token)).status).toBe(HTTP_OK);

      const [first, second] = await Promise.all([
        deliverOrder(app, order.id, token),
        deliverOrder(app, order.id, token),
      ]);

      const statuses = [first.status, second.status].toSorted((a, b) => a - b);
      expect(statuses).toEqual([HTTP_OK, HTTP_CONFLICT]);

      const conflict = first.status === HTTP_CONFLICT ? first : second;
      expect(apiErrorSchema.parse(await conflict.json()).error.code).toBe(
        ORDER_STATE_CODE,
      );

      // Crédito de estoque UMA única vez (10+7=17, nunca 24).
      expect(await stockOf(app, productId, token)).toBe(17);
      const finalOrder = await getOrderOk(app, order.id, token);
      expect(finalOrder.status).toBe("delivered");
    });

    // Critério emendado (Decisions Log — ver spec.md RF-03): exclusividade
    // estrita ("exatamente uma vence") só é exigida onde há efeito colateral
    // (deliver, testado acima). Para place×cancel, a história serial
    // draft→placed→canceled é uma sequência LEGAL da matriz de transições (sem
    // efeito de estoque) — então dois desfechos são válidos:
    //   A) exatamente uma vence (200) e a outra 409 — estado final coerente
    //      com a vencedora (placed OU canceled, respectivamente).
    //   B) as DUAS vencem (200) — equivalente a place seguido de cancel em
    //      sequência: estado final OBRIGATORIAMENTE `canceled`, com
    //      `placedAt` E `canceledAt` não-nulos.
    // Em qualquer desfecho: nenhuma mudança de estoque (cancel não afeta
    // estoque em nenhum estado de origem) e o estado final nunca sai de
    // {placed, canceled}.
    it("corrida place × cancel no mesmo draft ⇒ um dos dois desfechos legais da matriz, sem efeito de estoque", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      const ROUNDS = 6;
      for (let round = 0; round < ROUNDS; round += 1) {
        const productId = await seedProduct(consultantId, {
          name: `Disputa Place x Cancel ${round}`,
          priceCents: 1_000,
          stockQty: 5,
        });
        const order = await createOrderOk(
          app,
          { items: [{ productId, qty: 1 }] },
          token,
        );

        const [placeResponse, cancelResponse] = await Promise.all([
          placeOrder(app, order.id, token),
          cancelOrder(app, order.id, token),
        ]);

        const okCount = [placeResponse.status, cancelResponse.status].filter(
          (status) => status === HTTP_OK,
        ).length;
        // Rejeita qualquer desfecho fora dos dois legais (0 ou "erro em
        // ambas" nunca deveria acontecer).
        expect([1, 2]).toContain(okCount);

        const final = await getOrderOk(app, order.id, token);
        expect(["placed", "canceled"]).toContain(final.status);

        if (okCount === 1) {
          // Desfecho A: exclusividade — a vencedora corresponde ao estado final.
          if (final.status === "placed") {
            expect(placeResponse.status).toBe(HTTP_OK);
            expect(cancelResponse.status).toBe(HTTP_CONFLICT);
            expect(final.canceledAt).toBeNull();
          } else {
            expect(cancelResponse.status).toBe(HTTP_OK);
            expect(placeResponse.status).toBe(HTTP_CONFLICT);
            expect(final.placedAt).toBeNull();
          }
        } else {
          // Desfecho B: história serial legal draft→placed→canceled — as
          // duas venceram, então o estado final é SEMPRE canceled com os
          // dois timestamps preenchidos.
          expect(placeResponse.status).toBe(HTTP_OK);
          expect(cancelResponse.status).toBe(HTTP_OK);
          expect(final.status).toBe("canceled");
          expect(final.placedAt).not.toBeNull();
          expect(final.canceledAt).not.toBeNull();
        }

        // Em qualquer desfecho: cancel nunca afeta estoque (draft OU placed
        // como origem) — estoque permanece intacto.
        expect(await stockOf(app, productId, token)).toBe(5);
      }
    });
  });

  // -------------------------------------------------------------------------
  // RF-05 — snapshot
  // -------------------------------------------------------------------------
  describe("snapshot do item (RF-05)", () => {
    it("excluir produto usado em pedido: item mantém productName e productId vira null no GET", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Delineador",
        priceCents: 1_500,
        stockQty: 5,
      });
      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 2 }] },
        token,
      );

      expect((await deleteProduct(app, productId, token)).status).toBe(
        HTTP_NO_CONTENT,
      );

      const after = await getOrderOk(app, order.id, token);
      expect(after.items).toHaveLength(1);
      expect(after.items[0]?.productId).toBeNull();
      expect(after.items[0]?.productName).toBe("Delineador");
      expect(after.items[0]?.qty).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // RF-01 — vínculo cliente↔item (encomendas)
  // -------------------------------------------------------------------------
  describe("vínculo cliente↔item (RF-01)", () => {
    it("POST /orders: item vinculado a cliente traz clientId/clientName; item sem cliente no MESMO pedido traz nulls", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productEncomenda = await seedProduct(consultantId, {
        name: "Batom Encomendado",
        priceCents: 2_000,
        stockQty: 5,
      });
      const productReposicao = await seedProduct(consultantId, {
        name: "Produto Reposição",
        priceCents: 1_000,
        stockQty: 5,
      });
      const clientId = await seedClient(consultantId, {
        name: "Maria Encomenda",
        whatsapp: "11999990000",
      });

      const order = await createOrderOk(
        app,
        {
          items: [
            { productId: productEncomenda, qty: 1, clientId },
            { productId: productReposicao, qty: 1 },
          ],
        },
        token,
      );

      const itemComCliente = order.items.find(
        (item) => item.productId === productEncomenda,
      );
      expect(itemComCliente?.clientId).toBe(clientId);
      expect(itemComCliente?.clientName).toBe("Maria Encomenda");

      const itemSemCliente = order.items.find(
        (item) => item.productId === productReposicao,
      );
      expect(itemSemCliente?.clientId).toBeNull();
      expect(itemSemCliente?.clientName).toBeNull();
    });

    it("PUT /orders/:id/items troca o vínculo (cliente A → cliente B → null) e reflete na resposta", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto",
        priceCents: 1_000,
      });
      const clientA = await seedClient(consultantId, {
        name: "Cliente A",
        whatsapp: "11911110000",
      });
      const clientB = await seedClient(consultantId, {
        name: "Cliente B",
        whatsapp: "11922220000",
      });

      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 1, clientId: clientA }] },
        token,
      );
      expect(order.items[0]?.clientId).toBe(clientA);
      expect(order.items[0]?.clientName).toBe("Cliente A");

      const toB = await putOrderItems(
        app,
        order.id,
        { items: [{ productId, qty: 1, clientId: clientB }] },
        token,
      );
      expect(toB.status).toBe(HTTP_OK);
      const replacedB = orderSchema.parse(await toB.json());
      expect(replacedB.items[0]?.clientId).toBe(clientB);
      expect(replacedB.items[0]?.clientName).toBe("Cliente B");

      const toNull = await putOrderItems(
        app,
        order.id,
        { items: [{ productId, qty: 1, clientId: null }] },
        token,
      );
      expect(toNull.status).toBe(HTTP_OK);
      const replacedNull = orderSchema.parse(await toNull.json());
      expect(replacedNull.items[0]?.clientId).toBeNull();
      expect(replacedNull.items[0]?.clientName).toBeNull();
    });

    it("renomear a cliente (PATCH /clients/:id) reflete o nome NOVO no GET do pedido (derivado, não snapshot)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto",
        priceCents: 1_000,
      });
      const clientId = await seedClient(consultantId, {
        name: "Nome Antigo",
        whatsapp: "11933330000",
      });
      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 1, clientId }] },
        token,
      );
      expect(order.items[0]?.clientName).toBe("Nome Antigo");

      const patchResponse = await patchClient(
        app,
        clientId,
        { name: "Nome Novo" },
        token,
      );
      expect(patchResponse.status).toBe(HTTP_OK);

      const after = await getOrderOk(app, order.id, token);
      expect(after.items[0]?.clientId).toBe(clientId);
      expect(after.items[0]?.clientName).toBe("Nome Novo");
    });
  });

  // -------------------------------------------------------------------------
  // RF-02 — validação do vínculo de cliente
  // -------------------------------------------------------------------------
  describe("vínculo com cliente inválido (RF-02)", () => {
    it("clientId inexistente na criação ⇒ 422 e nada é persistido", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto",
        priceCents: 1_000,
      });

      const response = await postOrder(
        app,
        { items: [{ productId, qty: 1, clientId: NONEXISTENT_UUID }] },
        token,
      );

      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_ORDER_CLIENT_CODE);

      const list = orderListSchema.parse(
        await (await getOrders(app, token)).json(),
      );
      expect(list.total).toBe(0);
    });

    it("clientId de OUTRA consultora ⇒ 422 com a MESMA mensagem de um id inexistente (não vaza existência); nada persiste", async () => {
      const app = buildApp();
      const { consultantId, token: tokenA } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto",
        priceCents: 1_000,
      });
      const clientOfB = await seedClient(idB, {
        name: "Cliente da B",
        whatsapp: "11944440000",
      });

      const withNonexistent = await postOrder(
        app,
        { items: [{ productId, qty: 1, clientId: NONEXISTENT_UUID }] },
        tokenA,
      );
      const withOthers = await postOrder(
        app,
        { items: [{ productId, qty: 1, clientId: clientOfB }] },
        tokenA,
      );

      expect(withNonexistent.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(withOthers.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const bodyNonexistent = apiErrorSchema.parse(
        await withNonexistent.json(),
      );
      const bodyOthers = apiErrorSchema.parse(await withOthers.json());
      expect(bodyNonexistent.error.code).toBe(INVALID_ORDER_CLIENT_CODE);
      expect(bodyOthers.error.code).toBe(INVALID_ORDER_CLIENT_CODE);
      expect(bodyOthers.error.message).toBe(bodyNonexistent.error.message);

      const list = orderListSchema.parse(
        await (await getOrders(app, tokenA)).json(),
      );
      expect(list.total).toBe(0);
    });

    it("clientId inexistente no replace de itens ⇒ 422 e itens/total permanecem inalterados", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto",
        costCents: 1_000,
        priceCents: 2_000,
      });
      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      expect(order.totalCents).toBe(1_000);

      const attempt = await putOrderItems(
        app,
        order.id,
        {
          items: [{ productId, qty: 3, clientId: NONEXISTENT_UUID }],
        },
        token,
      );
      expect(attempt.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await attempt.json());
      expect(body.error.code).toBe(INVALID_ORDER_CLIENT_CODE);

      const after = await getOrderOk(app, order.id, token);
      expect(after.totalCents).toBe(1_000);
      expect(after.items).toHaveLength(1);
      expect(after.items[0]?.qty).toBe(1);
      expect(after.items[0]?.clientId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // RF-03 — exclusão da cliente apaga o vínculo (LGPD)
  // -------------------------------------------------------------------------
  describe("exclusão da cliente apaga o vínculo (RF-03)", () => {
    it("DELETE da cliente após criar pedido com item vinculado ⇒ GET com clientId/clientName null; pedido íntegro; transições seguem funcionando", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto Encomendado",
        costCents: 1_000,
        priceCents: 2_000,
        stockQty: 5,
      });
      const clientId = await seedClient(consultantId, {
        name: "Cliente a Excluir",
        whatsapp: "11955550000",
      });

      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 2, clientId }] },
        token,
      );
      expect(order.items[0]?.clientId).toBe(clientId);
      expect(order.items[0]?.clientName).toBe("Cliente a Excluir");

      const deleteResponse = await deleteClient(app, clientId, token);
      expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);

      const after = await getOrderOk(app, order.id, token);
      expect(after.items).toHaveLength(1);
      expect(after.items[0]?.clientId).toBeNull();
      expect(after.items[0]?.clientName).toBeNull();
      // Demais campos do pedido permanecem íntegros — o vínculo some, o resto
      // não muda.
      expect(after.items[0]?.productId).toBe(productId);
      expect(after.items[0]?.qty).toBe(2);
      expect(after.totalCents).toBe(order.totalCents);
      expect(after.status).toBe("draft");

      // Transições seguem funcionando com o vínculo já apagado.
      expect((await placeOrder(app, after.id, token)).status).toBe(HTTP_OK);
      const deliverResponse = await deliverOrder(app, after.id, token);
      expect(deliverResponse.status).toBe(HTTP_OK);
      const delivered = await getOrderOk(app, after.id, token);
      expect(delivered.status).toBe("delivered");
      expect(delivered.items[0]?.clientId).toBeNull();
      expect(delivered.items[0]?.clientName).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // RF-04 — sanidade: vínculo não muda o comportamento de estoque
  // -------------------------------------------------------------------------
  describe("estoque com item vinculado a cliente (RF-04 — sanidade)", () => {
    it("entrega de pedido com item vinculado a cliente credita estoque normalmente (vínculo é informativo)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto Encomendado",
        priceCents: 1_000,
        stockQty: 3,
      });
      const clientId = await seedClient(consultantId, {
        name: "Cliente Encomenda",
        whatsapp: "11966660000",
      });

      const order = await createOrderOk(
        app,
        { items: [{ productId, qty: 4, clientId }] },
        token,
      );
      expect((await placeOrder(app, order.id, token)).status).toBe(HTTP_OK);

      const response = await deliverOrder(app, order.id, token);
      expect(response.status).toBe(HTTP_OK);

      // Crédito idêntico ao de um item sem cliente (RF-04 do CRM-09 intocado).
      expect(await stockOf(app, productId, token)).toBe(7); // 3 + 4
      const delivered = await getOrderOk(app, order.id, token);
      expect(delivered.items[0]?.clientId).toBe(clientId);
      expect(delivered.items[0]?.clientName).toBe("Cliente Encomenda");
    });
  });

  // -------------------------------------------------------------------------
  // RF-06/RF-09 — listagem, escopo e segurança
  // -------------------------------------------------------------------------
  describe("listagem e escopo (RF-06/RF-09)", () => {
    it("GET /orders pagina (mais pedidos que perPage)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      for (let index = 0; index < 3; index += 1) {
        await createOrderOk(app, {}, token);
      }

      const firstPage = orderListSchema.parse(
        await (await getOrders(app, token, "?page=1&perPage=2")).json(),
      );
      expect(firstPage.total).toBe(3);
      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.page).toBe(1);
      expect(firstPage.perPage).toBe(2);

      const secondPage = orderListSchema.parse(
        await (await getOrders(app, token, "?page=2&perPage=2")).json(),
      );
      expect(secondPage.data).toHaveLength(1);
    });

    it("filtra por status", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Item",
        priceCents: 1_000,
        stockQty: 5,
      });
      const draftOrder = await createOrderOk(app, {}, token);
      const placedOrder = await createOrderOk(
        app,
        { items: [{ productId, qty: 1 }] },
        token,
      );
      expect((await placeOrder(app, placedOrder.id, token)).status).toBe(
        HTTP_OK,
      );

      const draftList = orderListSchema.parse(
        await (await getOrders(app, token, "?status=draft")).json(),
      );
      expect(draftList.total).toBe(1);
      expect(draftList.data[0]?.id).toBe(draftOrder.id);

      const placedList = orderListSchema.parse(
        await (await getOrders(app, token, "?status=placed")).json(),
      );
      expect(placedList.total).toBe(1);
      expect(placedList.data[0]?.id).toBe(placedOrder.id);
    });

    it("nunca retorna pedidos de outra consultora; GET /:id de pedido alheio ⇒ 404", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { token: tokenB } = await seedConsultantSession(app, CONSULTANT_B);

      await createOrderOk(app, {}, tokenA);
      const orderB = await createOrderOk(app, {}, tokenB);

      const listA = orderListSchema.parse(
        await (await getOrders(app, tokenA)).json(),
      );
      expect(listA.total).toBe(1);
      expect(listA.data.every((order) => order.id !== orderB.id)).toBe(true);

      const getResponse = await getOrder(app, orderB.id, tokenA);
      expect(getResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await getResponse.json()).error.code).toBe(
        ORDER_NOT_FOUND_CODE,
      );
    });

    it("id malformado ⇒ 404", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getOrder(app, "nao-uuid", token);
      expect(response.status).toBe(HTTP_NOT_FOUND);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(ORDER_NOT_FOUND_CODE);
    });

    it("todas as rotas sem token ⇒ 401 (uma asserção por rota)", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        postOrder(app, {}),
        getOrders(app, ""),
        getOrder(app, NONEXISTENT_UUID),
        putOrderItems(app, NONEXISTENT_UUID, { items: [] }),
        placeOrder(app, NONEXISTENT_UUID),
        deliverOrder(app, NONEXISTENT_UUID),
        cancelOrder(app, NONEXISTENT_UUID),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(HTTP_UNAUTHORIZED);
        const body = apiErrorSchema.parse(await response.json());
        expect(body.error.code).toBe(UNAUTHORIZED_CODE);
        expect(body.error.message).toBe(UNAUTHORIZED_MESSAGE);
      }
    });
  });
});
