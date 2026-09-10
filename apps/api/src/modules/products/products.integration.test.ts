import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  apiErrorSchema,
  calculateDiscountedCostCents,
  loginResponseSchema,
  type Product,
  paginated,
  productSchema,
  productsSummarySchema,
} from "@clientela/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { consultants, products, saleItems, sales } from "../../db/schema";
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
import { createDashboardRepository } from "../dashboard/dashboard.repository";
import { createDashboardService } from "../dashboard/dashboard.service";
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createOrdersRepository } from "../orders/orders.repository";
import { createOrdersService } from "../orders/orders.service";
import { createSalesRepository } from "../sales/sales.repository";
import { createSalesService } from "../sales/sales.service";
import { createProductsRepository } from "./products.repository";
import { createProductsService } from "./products.service";

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
const PRODUCT_NOT_FOUND_CODE = "PRODUCT_NOT_FOUND";

// SQLSTATE do Postgres para violação de CHECK constraint. Prova que o payload
// malicioso (que burla o Zod ao ir direto ao banco) ainda esbarra no CHECK do
// schema — a invariante de domínio é defendida em duas camadas (RF-01).
const POSTGRES_CHECK_VIOLATION = "23514";

// Teto monetário do contrato (R$ 1.000.000,00 em centavos): o primeiro valor
// ACIMA do teto deve virar 422 pt-BR na fronteira, nunca o erro 22003 do
// Postgres (overflow de integer) — RF-02.
const MONEY_MAX_CENTS = 100_000_000;
const ABOVE_MONEY_MAX_CENTS = MONEY_MAX_CENTS + 1;

const DEFAULT_PER_PAGE = 20;

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

// uuid v4 sintaticamente válido porém inexistente no banco: prova que "não
// existe" e "não é seu" respondem o MESMO 404 (RF-03/RF-05).
const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

// Contrato de saída da listagem paginada, montado a partir do schema público
// (mesma forma que o front consome). Parse real = prova de aderência ao contrato.
const productListSchema = paginated(productSchema);

// Hasher real de KDF do Node (scrypt) espelhando o padrão do auth/clients: os
// workers do Vitest rodam sob Node, onde o global `Bun` (argon2id) não existe.
// Round-trip real (hash na semeadura, verify no login) prova o login de verdade.
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

// Corpo de criação válido: estoque acima do limiar ⇒ `lowStock` derivado falso.
const VALID_PRODUCT_BODY = {
  name: "Batom Matte",
  brandCode: "MK-1234",
  costCents: 1500,
  priceCents: 3990,
  stockQty: 8,
  lowStockThreshold: 3,
} as const;

const DISCOUNTED_PRODUCT_BODY = {
  name: "Base com Desconto",
  brandCode: "MK-5678",
  priceCents: 9990,
  purchaseDiscountBps: 3500,
  stockQty: 4,
  lowStockThreshold: 1,
} as const;

// Extrai o SQLSTATE de um erro do driver Postgres. O drizzle envolve o erro do
// postgres-js (que carrega `.code`) num wrapper com `.cause` — percorremos a
// cadeia de causas até achar o `.code` string do SQLSTATE.
const pgErrorCode = (error: unknown): string | undefined => {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === "string") {
      return code;
    }
    current = cause;
  }
  return undefined;
};

describe("products (integração)", () => {
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

  // Login real (POST /auth/login) ⇒ token opaco de sessão, revalidado pelas
  // rotas de products via authService.
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
    brandCode?: string | null;
    costCents: number;
    priceCents: number;
    stockQty?: number;
    lowStockThreshold?: number;
  };

  // Semeadura direta de produtos (setup de listagem/busca/escopo/summary): o
  // comportamento sob teste é o GET/summary, não o POST.
  const seedProducts = async (
    consultantId: string,
    values: readonly SeedProductValues[],
  ): Promise<void> => {
    await ctx.db
      .insert(products)
      .values(values.map((value) => ({ consultantId, ...value })));
  };

  const seedSaleItem = async (input: {
    consultantId: string;
    productId: string;
    qty: number;
    status?: "open" | "completed";
    delivered?: boolean;
  }): Promise<void> => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const deliveredAt = input.delivered ? now : null;
    const completedAt = input.status === "completed" ? now : null;
    const [sale] = await ctx.db
      .insert(sales)
      .values({
        consultantId: input.consultantId,
        clientName: "Cliente da reserva",
        totalCents: 0,
        paymentMethod: "cash",
        status: input.status ?? "open",
        soldAt: now,
        deliveredAt,
        completedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: sales.id });

    if (!sale) {
      throw new Error("falha ao semear venda de teste");
    }

    await ctx.db.insert(saleItems).values({
      saleId: sale.id,
      productId: input.productId,
      productName: "Produto reservado",
      qty: input.qty,
      unitPriceCents: 100,
      costCents: 50,
    });
  };

  const getProducts = (
    app: App,
    token: string,
    queryString = "",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/products${queryString}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const getSummary = (app: App, token?: string): Promise<Response> =>
    app.handle(
      new Request("http://localhost/products/summary", {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const postProduct = (
    app: App,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/products", {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const getProduct = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/products/${id}`, {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const patchProduct = (
    app: App,
    id: string,
    body: unknown,
    token?: string,
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
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/products/${id}`, {
        method: "DELETE",
        headers: token ? bearer(token) : {},
      }),
    );

  const createValidProduct = async (
    app: App,
    token: string,
  ): Promise<Product> => {
    const response = await postProduct(app, VALID_PRODUCT_BODY, token);
    expect(response.status).toBe(HTTP_CREATED);
    return productSchema.parse(await response.json());
  };

  describe("fluxo CRUD com sessão real (RF-03/RF-05)", () => {
    it("POST 201 → lista → detalhe → PATCH parcial → PATCH null limpa → DELETE 204 → 404", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      // POST 201 aderente ao productSchema; `lowStock` derivado (8 > 3 ⇒ false).
      const created = await createValidProduct(app, token);
      expect(created.name).toBe(VALID_PRODUCT_BODY.name);
      expect(created.brandCode).toBe(VALID_PRODUCT_BODY.brandCode);
      expect(created.costCents).toBe(VALID_PRODUCT_BODY.costCents);
      expect(created.purchaseDiscountBps).toBeNull();
      expect(created.priceCents).toBe(VALID_PRODUCT_BODY.priceCents);
      expect(created.stockQty).toBe(VALID_PRODUCT_BODY.stockQty);
      expect(created.lowStockThreshold).toBe(
        VALID_PRODUCT_BODY.lowStockThreshold,
      );
      expect(created.lowStock).toBe(false);

      // GET lista paginada: total 1, o produto recém-criado.
      const listResponse = await getProducts(app, token);
      expect(listResponse.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await listResponse.json());
      expect(list.total).toBe(1);
      expect(list.page).toBe(1);
      expect(list.perPage).toBe(DEFAULT_PER_PAGE);
      expect(list.data).toHaveLength(1);
      expect(list.data[0]?.id).toBe(created.id);
      expect(list.data[0]?.purchaseDiscountBps).toBeNull();

      // GET :id 200 — mesma linha, idêntica ao retorno do POST.
      const detailResponse = await getProduct(app, created.id, token);
      expect(detailResponse.status).toBe(HTTP_OK);
      expect(productSchema.parse(await detailResponse.json())).toEqual(created);

      // PATCH parcial: baixa o estoque para 2 (≤ limiar 3) ⇒ `lowStock` vira
      // true. Só `stockQty` muda; os demais permanecem.
      const patchResponse = await patchProduct(
        app,
        created.id,
        { stockQty: 2 },
        token,
      );
      expect(patchResponse.status).toBe(HTTP_OK);
      const patched = productSchema.parse(await patchResponse.json());
      expect(patched.stockQty).toBe(2);
      expect(patched.lowStock).toBe(true);
      expect(patched.name).toBe(created.name);
      expect(patched.costCents).toBe(created.costCents);
      expect(patched.purchaseDiscountBps).toBeNull();
      expect(patched.priceCents).toBe(created.priceCents);
      expect(patched.lowStockThreshold).toBe(created.lowStockThreshold);
      expect(patched.id).toBe(created.id);

      // PATCH { brandCode: null }: limpa o campo nullable; `name` (não enviado)
      // segue como estava.
      const clearResponse = await patchProduct(
        app,
        created.id,
        { brandCode: null },
        token,
      );
      expect(clearResponse.status).toBe(HTTP_OK);
      const cleared = productSchema.parse(await clearResponse.json());
      expect(cleared.brandCode).toBeNull();
      expect(cleared.name).toBe(created.name);

      // DELETE 204 sem corpo.
      const deleteResponse = await deleteProduct(app, created.id, token);
      expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);
      expect(await deleteResponse.text()).toBe("");

      // GET :id após exclusão ⇒ 404 pt-BR no envelope padrão.
      const goneResponse = await getProduct(app, created.id, token);
      expect(goneResponse.status).toBe(HTTP_NOT_FOUND);
      const goneBody = apiErrorSchema.parse(await goneResponse.json());
      expect(goneBody.error.code).toBe(PRODUCT_NOT_FOUND_CODE);
      expect(goneBody.error.message).toMatch(/não encontrado/i);
    });

    it("POST sem estoque/limiar aplica defaults (0 e 1) ⇒ lowStock true", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postProduct(
        app,
        { name: "Sem Estoque", costCents: 1000, priceCents: 2000 },
        token,
      );
      expect(response.status).toBe(HTTP_CREATED);
      const created = productSchema.parse(await response.json());
      // Defaults do contrato: estoque 0, limiar 1 ⇒ 0 ≤ 1 ⇒ lowStock true.
      expect(created.stockQty).toBe(0);
      expect(created.lowStockThreshold).toBe(1);
      expect(created.lowStock).toBe(true);
      expect(created.brandCode).toBeNull();
    });
  });

  describe("precificação autoritativa e concorrência (CRM-11/RF-02/RF-03/RF-04)", () => {
    it("POST manual e por desconto persistem e expõem custo/taxa coerentes em criação, lista e detalhe", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const manualResponse = await postProduct(app, VALID_PRODUCT_BODY, token);
      expect(manualResponse.status).toBe(HTTP_CREATED);
      const manual = productSchema.parse(await manualResponse.json());
      expect(manual).toMatchObject({
        costCents: VALID_PRODUCT_BODY.costCents,
        purchaseDiscountBps: null,
        priceCents: VALID_PRODUCT_BODY.priceCents,
      });

      const discountedResponse = await postProduct(
        app,
        DISCOUNTED_PRODUCT_BODY,
        token,
      );
      expect(discountedResponse.status).toBe(HTTP_CREATED);
      const discounted = productSchema.parse(await discountedResponse.json());
      expect(discounted).toMatchObject({
        costCents: 6494,
        purchaseDiscountBps: DISCOUNTED_PRODUCT_BODY.purchaseDiscountBps,
        priceCents: DISCOUNTED_PRODUCT_BODY.priceCents,
      });
      expect(discounted.costCents).toBe(
        calculateDiscountedCostCents(
          DISCOUNTED_PRODUCT_BODY.priceCents,
          DISCOUNTED_PRODUCT_BODY.purchaseDiscountBps,
        ),
      );

      const listResponse = await getProducts(app, token);
      expect(listResponse.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await listResponse.json());
      expect(list.total).toBe(2);
      expect(list.data.find((product) => product.id === manual.id)).toEqual(
        manual,
      );
      expect(list.data.find((product) => product.id === discounted.id)).toEqual(
        discounted,
      );

      const manualDetail = await getProduct(app, manual.id, token);
      expect(manualDetail.status).toBe(HTTP_OK);
      expect(productSchema.parse(await manualDetail.json())).toEqual(manual);

      const discountedDetail = await getProduct(app, discounted.id, token);
      expect(discountedDetail.status).toBe(HTTP_OK);
      expect(productSchema.parse(await discountedDetail.json())).toEqual(
        discounted,
      );
    });

    it("PATCH alterna entre modos, recalcula pelo preço efetivo e preserva o custo manual", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const createResponse = await postProduct(
        app,
        {
          name: "Produto com Transições",
          costCents: 7200,
          priceCents: 9990,
          stockQty: 5,
        },
        token,
      );
      expect(createResponse.status).toBe(HTTP_CREATED);
      const created = productSchema.parse(await createResponse.json());
      expect(created.purchaseDiscountBps).toBeNull();

      const enterDiscountResponse = await patchProduct(
        app,
        created.id,
        { purchaseDiscountBps: 3750 },
        token,
      );
      expect(enterDiscountResponse.status).toBe(HTTP_OK);
      const enteredDiscount = productSchema.parse(
        await enterDiscountResponse.json(),
      );
      expect(enteredDiscount.purchaseDiscountBps).toBe(3750);
      expect(enteredDiscount.costCents).toBe(
        calculateDiscountedCostCents(created.priceCents, 3750),
      );

      const newPriceCents = 12_345;
      const priceResponse = await patchProduct(
        app,
        created.id,
        { priceCents: newPriceCents },
        token,
      );
      expect(priceResponse.status).toBe(HTTP_OK);
      const repriced = productSchema.parse(await priceResponse.json());
      expect(repriced.priceCents).toBe(newPriceCents);
      expect(repriced.purchaseDiscountBps).toBe(3750);
      expect(repriced.costCents).toBe(
        calculateDiscountedCostCents(newPriceCents, 3750),
      );

      const discountedDetailResponse = await getProduct(app, created.id, token);
      expect(discountedDetailResponse.status).toBe(HTTP_OK);
      expect(
        productSchema.parse(await discountedDetailResponse.json()),
      ).toEqual(repriced);

      const discountedListResponse = await getProducts(app, token);
      expect(discountedListResponse.status).toBe(HTTP_OK);
      const discountedList = productListSchema.parse(
        await discountedListResponse.json(),
      );
      expect(
        discountedList.data.find((product) => product.id === created.id),
      ).toEqual(repriced);

      const stockResponse = await patchProduct(
        app,
        created.id,
        { stockQty: 2 },
        token,
      );
      expect(stockResponse.status).toBe(HTTP_OK);
      const stockUpdated = productSchema.parse(await stockResponse.json());
      expect(stockUpdated.stockQty).toBe(2);
      expect(stockUpdated.priceCents).toBe(repriced.priceCents);
      expect(stockUpdated.costCents).toBe(repriced.costCents);
      expect(stockUpdated.purchaseDiscountBps).toBe(
        repriced.purchaseDiscountBps,
      );

      const directCostResponse = await patchProduct(
        app,
        created.id,
        { costCents: 8000 },
        token,
      );
      expect(directCostResponse.status).toBe(HTTP_OK);
      const manual = productSchema.parse(await directCostResponse.json());
      expect(manual.costCents).toBe(8000);
      expect(manual.purchaseDiscountBps).toBeNull();

      const manualPriceResponse = await patchProduct(
        app,
        created.id,
        { priceCents: 15_000 },
        token,
      );
      expect(manualPriceResponse.status).toBe(HTTP_OK);
      const manualRepriced = productSchema.parse(
        await manualPriceResponse.json(),
      );
      expect(manualRepriced.priceCents).toBe(15_000);
      expect(manualRepriced.costCents).toBe(8000);
      expect(manualRepriced.purchaseDiscountBps).toBeNull();

      const discountAgainResponse = await patchProduct(
        app,
        created.id,
        { purchaseDiscountBps: 4000 },
        token,
      );
      expect(discountAgainResponse.status).toBe(HTTP_OK);
      const discountAgain = productSchema.parse(
        await discountAgainResponse.json(),
      );
      expect(discountAgain.costCents).toBe(9000);
      expect(discountAgain.purchaseDiscountBps).toBe(4000);

      const clearDiscountResponse = await patchProduct(
        app,
        created.id,
        { purchaseDiscountBps: null },
        token,
      );
      expect(clearDiscountResponse.status).toBe(HTTP_OK);
      const clearedDiscount = productSchema.parse(
        await clearDiscountResponse.json(),
      );
      expect(clearedDiscount.costCents).toBe(discountAgain.costCents);
      expect(clearedDiscount.purchaseDiscountBps).toBeNull();

      const detailResponse = await getProduct(app, created.id, token);
      expect(detailResponse.status).toBe(HTTP_OK);
      expect(productSchema.parse(await detailResponse.json())).toEqual(
        clearedDiscount,
      );
    });

    it("serializa PATCHes concorrentes de preço e taxa sem estado obsoleto ou 500", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const createResponse = await postProduct(
        app,
        {
          name: "Produto concorrente",
          priceCents: 10_000,
          purchaseDiscountBps: 3000,
        },
        token,
      );
      expect(createResponse.status).toBe(HTTP_CREATED);
      const created = productSchema.parse(await createResponse.json());
      expect(created.costCents).toBe(7000);
      expect(created.purchaseDiscountBps).toBe(3000);

      const responses = await Promise.all([
        patchProduct(app, created.id, { priceCents: 12_000 }, token),
        patchProduct(app, created.id, { purchaseDiscountBps: 4000 }, token),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(HTTP_OK);
        expect(response.status).not.toBe(HTTP_INTERNAL_ERROR);
      }

      const observed = await Promise.all(
        responses.map(async (response) =>
          productSchema.parse(await response.json()),
        ),
      );
      for (const product of observed) {
        expect(product.purchaseDiscountBps).not.toBeNull();
        if (product.purchaseDiscountBps === null) {
          throw new Error("esperava produto em modo desconto");
        }
        expect(product.costCents).toBe(
          calculateDiscountedCostCents(
            product.priceCents,
            product.purchaseDiscountBps,
          ),
        );
      }

      const isFinalState = (product: Product): boolean =>
        product.priceCents === 12_000 &&
        product.purchaseDiscountBps === 4000 &&
        product.costCents === 7200;
      const isLegalIntermediateState = (product: Product): boolean =>
        (product.priceCents === 12_000 &&
          product.purchaseDiscountBps === 3000 &&
          product.costCents === 8400) ||
        (product.priceCents === 10_000 &&
          product.purchaseDiscountBps === 4000 &&
          product.costCents === 6000);

      expect(observed.filter(isFinalState)).toHaveLength(1);
      expect(observed.some(isLegalIntermediateState)).toBe(true);

      const detailResponse = await getProduct(app, created.id, token);
      expect(detailResponse.status).toBe(HTTP_OK);
      const persisted = productSchema.parse(await detailResponse.json());
      expect(isFinalState(persisted)).toBe(true);
    });
  });

  describe("validação de body (RF-02/RF-05)", () => {
    it("costCents fracionário (12.34) ⇒ 422 pt-BR orientando centavos", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postProduct(
        app,
        { ...VALID_PRODUCT_BODY, costCents: 12.34 },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/centavos/i);
      expect(body.error.message).not.toMatch(/expected|invalid input|integer/i);
    });

    it("costCents negativo ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postProduct(
        app,
        { ...VALID_PRODUCT_BODY, costCents: -1 },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/negativo/i);
    });

    it("costCents acima do teto ⇒ 422 pt-BR (nunca 22003 do Postgres)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postProduct(
        app,
        { ...VALID_PRODUCT_BODY, costCents: ABOVE_MONEY_MAX_CENTS },
        token,
      );
      // 422 na fronteira — não deixa o valor absurdo chegar ao integer do banco.
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(response.status).not.toBe(HTTP_INTERNAL_ERROR);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/máximo/i);
    });

    it("PATCH com body vazio ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const created = await createValidProduct(app, token);

      const response = await patchProduct(app, created.id, {}, token);
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/atualizar|campo/i);
    });

    it("POST com custo direto e desconto simultâneos ⇒ 422 pt-BR sem persistir", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await postProduct(
        app,
        { ...VALID_PRODUCT_BODY, purchaseDiscountBps: 3500 },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/custo.*desconto|desconto.*custo/i);
      expect(body.error.message).toMatch(/não os dois/i);
      expect(body.error.message).not.toMatch(/expected|invalid input/i);

      const list = productListSchema.parse(
        await (await getProducts(app, token)).json(),
      );
      expect(list.total).toBe(0);
    });

    it("PATCH com custo direto e desconto não nulo simultâneos ⇒ 422 pt-BR e preserva o produto", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const created = await createValidProduct(app, token);

      const response = await patchProduct(
        app,
        created.id,
        { costCents: 999, purchaseDiscountBps: 3500 },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/custo.*desconto|desconto.*custo/i);
      expect(body.error.message).toMatch(/não os dois/i);
      expect(body.error.message).not.toMatch(/expected|invalid input/i);

      const detailResponse = await getProduct(app, created.id, token);
      expect(detailResponse.status).toBe(HTTP_OK);
      expect(productSchema.parse(await detailResponse.json())).toEqual(created);
    });

    it("PATCH rejeita desconto fracionário e fora de 0..100% com 422 acionável em pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);
      const created = await createValidProduct(app, token);
      const invalidDiscounts = [
        { value: 12.34, message: /pontos-base.*inteiro/i },
        { value: -1, message: /desconto.*não pode ser negativo/i },
        { value: 10_001, message: /desconto.*máximo 100%/i },
      ] as const;

      for (const invalid of invalidDiscounts) {
        const response = await patchProduct(
          app,
          created.id,
          { purchaseDiscountBps: invalid.value },
          token,
        );
        expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
        const body = apiErrorSchema.parse(await response.json());
        expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
        expect(body.error.message).toMatch(invalid.message);
        expect(body.error.message).not.toMatch(/expected|invalid input/i);
      }

      const detailResponse = await getProduct(app, created.id, token);
      expect(detailResponse.status).toBe(HTTP_OK);
      expect(productSchema.parse(await detailResponse.json())).toEqual(created);
    });

    it("insert direto no banco com cost_cents -1 viola o CHECK (SQLSTATE 23514)", async () => {
      // Burla o Zod indo direto ao banco: a invariante ainda é defendida pelo
      // CHECK do schema. Prova a segunda camada de proteção (RF-01).
      const consultantId = await seedConsultant(CONSULTANT_A);

      const error = await ctx.db
        .insert(products)
        .values({
          consultantId,
          name: "Custo Negativo",
          costCents: -1,
          priceCents: 0,
        })
        .then(
          () => undefined,
          (cause: unknown) => cause,
        );

      expect(error).toBeDefined();
      expect(pgErrorCode(error)).toBe(POSTGRES_CHECK_VIOLATION);
    });
  });

  describe("busca com escape de curingas (RF-03 — não repetir BUG-001)", () => {
    const SEARCH_FIXTURES: readonly SeedProductValues[] = [
      {
        name: "Batom Vermelho",
        brandCode: "MK-1001",
        costCents: 1000,
        priceCents: 2000,
      },
      {
        name: "Base Liquida",
        brandCode: "MK-2002",
        costCents: 1500,
        priceCents: 3000,
      },
      {
        name: "Mascara Cilios",
        brandCode: "BB-3003",
        costCents: 2000,
        priceCents: 4000,
      },
    ];

    it("filtra por fragmento de nome case-insensitive", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedProducts(consultantId, SEARCH_FIXTURES);

      const lower = productListSchema.parse(
        await (await getProducts(app, token, "?search=batom")).json(),
      );
      expect(lower.total).toBe(1);
      expect(lower.data.map((p) => p.name)).toEqual(["Batom Vermelho"]);

      // Mesmo produto encontrado com o fragmento em caixa alta ⇒ ILIKE.
      const upper = productListSchema.parse(
        await (await getProducts(app, token, "?search=BATOM")).json(),
      );
      expect(upper.total).toBe(1);
      expect(upper.data.map((p) => p.name)).toEqual(["Batom Vermelho"]);
    });

    it("filtra por fragmento de brand_code case-insensitive", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedProducts(consultantId, SEARCH_FIXTURES);

      const lower = productListSchema.parse(
        await (await getProducts(app, token, "?search=mk-10")).json(),
      );
      expect(lower.total).toBe(1);
      expect(lower.data.map((p) => p.name)).toEqual(["Batom Vermelho"]);

      const upper = productListSchema.parse(
        await (await getProducts(app, token, "?search=MK-10")).json(),
      );
      expect(upper.total).toBe(1);
      expect(upper.data.map((p) => p.name)).toEqual(["Batom Vermelho"]);
    });

    it("?search=% NÃO retorna tudo (curinga escapado ⇒ literal ⇒ 0)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedProducts(consultantId, SEARCH_FIXTURES);

      // Sem escape, `%` no ILIKE casaria com tudo (BUG-001). Com escape vira um
      // literal `%` que nenhum nome/brand_code contém ⇒ total 0.
      const response = await getProducts(app, token, "?search=%25");
      expect(response.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await response.json());
      expect(list.total).toBe(0);
      expect(list.data).toEqual([]);
    });

    it("?search=_ NÃO retorna tudo (curinga de um caractere escapado ⇒ 0)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedProducts(consultantId, SEARCH_FIXTURES);

      const response = await getProducts(app, token, "?search=_");
      expect(response.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await response.json());
      expect(list.total).toBe(0);
      expect(list.data).toEqual([]);
    });

    it("search com mais de 100 caracteres ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const longSearch = "a".repeat(101);
      const response = await getProducts(app, token, `?search=${longSearch}`);
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/busca|100/i);
    });
  });

  describe("filtro lowStock (RF-03)", () => {
    it("só retorna produtos com estoque ≤ limiar; limiar 0 alerta só com estoque 0", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedProducts(consultantId, [
        // 2 ≤ 5 ⇒ aparece.
        {
          name: "Alerta Baixo",
          costCents: 100,
          priceCents: 200,
          stockQty: 2,
          lowStockThreshold: 5,
        },
        // 10 > 5 ⇒ não aparece.
        {
          name: "Estoque Cheio",
          costCents: 100,
          priceCents: 200,
          stockQty: 10,
          lowStockThreshold: 5,
        },
        // limiar 0 com estoque 0 ⇒ 0 ≤ 0 ⇒ aparece.
        {
          name: "Zerado Limiar Zero",
          costCents: 100,
          priceCents: 200,
          stockQty: 0,
          lowStockThreshold: 0,
        },
      ]);

      const response = await getProducts(app, token, "?lowStock=true");
      expect(response.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await response.json());
      expect(list.total).toBe(2);
      expect(list.data.map((p) => p.name).toSorted()).toEqual([
        "Alerta Baixo",
        "Zerado Limiar Zero",
      ]);
      // O produto de estoque cheio nunca aparece no filtro.
      expect(list.data.map((p) => p.name)).not.toContain("Estoque Cheio");
      // Todos os retornados têm `lowStock` derivado verdadeiro.
      for (const product of list.data) {
        expect(product.lowStock).toBe(true);
      }
    });

    it("filtro lowStock combinado com paginação respeita a janela", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const lowStockRows = Array.from({ length: 5 }, (_, idx) => {
        const padded = String(idx + 1).padStart(2, "0");
        return {
          name: `Baixo ${padded}`,
          costCents: 100,
          priceCents: 200,
          stockQty: 1,
          lowStockThreshold: 5,
        };
      });
      const fullStockRows = Array.from({ length: 3 }, (_, idx) => {
        const padded = String(idx + 1).padStart(2, "0");
        return {
          name: `Cheio ${padded}`,
          costCents: 100,
          priceCents: 200,
          stockQty: 50,
          lowStockThreshold: 5,
        };
      });
      await seedProducts(consultantId, [...lowStockRows, ...fullStockRows]);

      const response = await getProducts(
        app,
        token,
        "?lowStock=true&perPage=2&page=2",
      );
      expect(response.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await response.json());
      // Total conta só os 5 de estoque baixo; janela pedida = 2 por página.
      expect(list.total).toBe(5);
      expect(list.page).toBe(2);
      expect(list.perPage).toBe(2);
      expect(list.data).toHaveLength(2);
      // Ordenação name asc: página 2 (offset 2) ⇒ Baixo 03, Baixo 04.
      expect(list.data.map((p) => p.name)).toEqual(["Baixo 03", "Baixo 04"]);
    });
  });

  describe("paginação (RF-03)", () => {
    const seedManyProducts = async (consultantId: string): Promise<number> => {
      const total = 25;
      const rows = Array.from({ length: total }, (_, idx) => {
        const padded = String(idx + 1).padStart(2, "0");
        return {
          name: `Produto ${padded}`,
          costCents: 1000,
          priceCents: 2000,
          stockQty: 10,
          lowStockThreshold: 1,
        };
      });
      await seedProducts(consultantId, rows);
      return total;
    };

    it("default retorna 20 na página 1 com total correto", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const total = await seedManyProducts(consultantId);

      const response = await getProducts(app, token);
      expect(response.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await response.json());

      expect(list.total).toBe(total);
      expect(list.page).toBe(1);
      expect(list.perPage).toBe(DEFAULT_PER_PAGE);
      expect(list.data).toHaveLength(DEFAULT_PER_PAGE);
      expect(list.data[0]?.name).toBe("Produto 01");
      expect(list.data[19]?.name).toBe("Produto 20");
    });

    it("?perPage=5&page=2 respeita a janela pedida", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const total = await seedManyProducts(consultantId);

      const response = await getProducts(app, token, "?perPage=5&page=2");
      expect(response.status).toBe(HTTP_OK);
      const list = productListSchema.parse(await response.json());

      expect(list.total).toBe(total);
      expect(list.page).toBe(2);
      expect(list.perPage).toBe(5);
      expect(list.data).toHaveLength(5);
      expect(list.data[0]?.name).toBe("Produto 06");
      expect(list.data[4]?.name).toBe("Produto 10");
    });

    it("?perPage=101 (acima do máximo) ⇒ 422 pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getProducts(app, token, "?perPage=101");
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/máximo/i);
    });
  });

  describe("reserva e disponibilidade (CRM-12 RF-05/RF-13)", () => {
    it("deriva reserva nas projeções, usa disponibilidade no estoque baixo e preserva capital físico", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const { consultantId: otherConsultantId } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const [reservedProduct] = await ctx.db
        .insert(products)
        .values({
          consultantId,
          name: "Produto reservado",
          costCents: 100,
          priceCents: 200,
          stockQty: 3,
          lowStockThreshold: 1,
        })
        .returning({ id: products.id });
      const [physicalProduct] = await ctx.db
        .insert(products)
        .values({
          consultantId,
          name: "Produto físico",
          costCents: 500,
          priceCents: 900,
          stockQty: 10,
          lowStockThreshold: 5,
        })
        .returning({ id: products.id });

      if (!reservedProduct || !physicalProduct) {
        throw new Error("falha ao semear produtos de reserva");
      }

      await seedSaleItem({
        consultantId,
        productId: reservedProduct.id,
        qty: 5,
      });
      await seedSaleItem({
        consultantId,
        productId: physicalProduct.id,
        qty: 4,
      });
      await seedSaleItem({
        consultantId,
        productId: physicalProduct.id,
        qty: 2,
        delivered: true,
      });
      await seedSaleItem({
        consultantId,
        productId: physicalProduct.id,
        qty: 3,
        status: "completed",
        delivered: true,
      });
      // Mesmo product_id em uma venda de outro tenant não pode compor reserva.
      await seedSaleItem({
        consultantId: otherConsultantId,
        productId: physicalProduct.id,
        qty: 7,
      });

      const detail = productSchema.parse(
        await (await getProduct(app, reservedProduct.id, token)).json(),
      );
      expect(detail).toMatchObject({
        stockQty: 3,
        reservedQty: 5,
        availableQty: -2,
        lowStock: true,
      });

      const list = productListSchema.parse(
        await (await getProducts(app, token)).json(),
      );
      expect(list.data[0]).toMatchObject({
        id: physicalProduct.id,
        stockQty: 10,
        reservedQty: 4,
        availableQty: 6,
        lowStock: false,
      });

      const lowStockList = productListSchema.parse(
        await (await getProducts(app, token, "?lowStock=true")).json(),
      );
      expect(lowStockList.data.map((product) => product.id)).toEqual([
        reservedProduct.id,
      ]);

      const summary = productsSummarySchema.parse(
        await (await getSummary(app, token)).json(),
      );
      expect(summary).toEqual({
        stockCostCents: 5300,
        stockPriceCents: 9600,
        lowStockCount: 1,
      });
    });
  });

  describe("summary agregado (RF-04)", () => {
    it("calcula stockCost/stockPrice/lowStockCount de fixtures conhecidas", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      await seedProducts(consultantId, [
        // A: custo 1000 × 3 = 3000; preço 2000 × 3 = 6000; 3 ≤ 5 ⇒ baixo.
        {
          name: "Produto A",
          costCents: 1000,
          priceCents: 2000,
          stockQty: 3,
          lowStockThreshold: 5,
        },
        // B: custo 2500 × 2 = 5000; preço 4000 × 2 = 8000; 2 > 1 ⇒ não baixo.
        {
          name: "Produto B",
          costCents: 2500,
          priceCents: 4000,
          stockQty: 2,
          lowStockThreshold: 1,
        },
      ]);

      const response = await getSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      const summary = productsSummarySchema.parse(await response.json());
      expect(summary.stockCostCents).toBe(8000); // 3000 + 5000
      expect(summary.stockPriceCents).toBe(14000); // 6000 + 8000
      expect(summary.lowStockCount).toBe(1); // só o Produto A
    });

    it("sem produtos ⇒ zeros (COALESCE)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      const summary = productsSummarySchema.parse(await response.json());
      expect(summary.stockCostCents).toBe(0);
      expect(summary.stockPriceCents).toBe(0);
      expect(summary.lowStockCount).toBe(0);
    });

    it("é escopado por consultora (A não soma os produtos de B)", async () => {
      const app = buildApp();
      const { consultantId: idA, token: tokenA } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );

      await seedProducts(idA, [
        {
          name: "Da A",
          costCents: 1000,
          priceCents: 2000,
          stockQty: 2,
          lowStockThreshold: 1,
        },
      ]);
      await seedProducts(idB, [
        {
          name: "Da B",
          costCents: 9999,
          priceCents: 9999,
          stockQty: 100,
          lowStockThreshold: 1,
        },
      ]);

      const summary = productsSummarySchema.parse(
        await (await getSummary(app, tokenA)).json(),
      );
      // Só o produto de A entra na conta (custo 1000 × 2 = 2000).
      expect(summary.stockCostCents).toBe(2000);
      expect(summary.stockPriceCents).toBe(4000);
      expect(summary.lowStockCount).toBe(0); // 2 > 1
    });

    it("valores grandes não estouram integer (cast ::bigint provado)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      // Teto monetário (1e8 centavos) × estoque máximo (1e6) = 1e14 por linha.
      // Sem o cast ::bigint antes do SUM, o integer (máx ~2,1e9) estouraria com
      // erro 22003. O resultado exato prova que o cast funciona.
      await seedProducts(consultantId, [
        {
          name: "Capital Alto",
          costCents: MONEY_MAX_CENTS,
          priceCents: MONEY_MAX_CENTS,
          stockQty: 1_000_000,
          lowStockThreshold: 1,
        },
      ]);

      const response = await getSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      expect(response.status).not.toBe(HTTP_INTERNAL_ERROR);
      const summary = productsSummarySchema.parse(await response.json());
      // 100_000_000 × 1_000_000 = 100_000_000_000_000 (1e14), exato.
      expect(summary.stockCostCents).toBe(100_000_000_000_000);
      expect(summary.stockPriceCents).toBe(100_000_000_000_000);
    });

    it("GET /products/summary responde summary (não cai no 404 do :id)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getSummary(app, token);
      // "summary" não é uuid: se caísse na rota `:id`, viraria 404. A ordem de
      // registro garante o agregado (RF-04).
      expect(response.status).toBe(HTTP_OK);
      expect(response.status).not.toBe(HTTP_NOT_FOUND);
      const summary = productsSummarySchema.parse(await response.json());
      expect(summary.stockCostCents).toBe(0);
    });
  });

  describe("escopo multi-consultora (RF-03)", () => {
    it("sessões listam apenas seus próprios produtos manual e por desconto", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { token: tokenB } = await seedConsultantSession(app, CONSULTANT_B);

      const productAResponse = await postProduct(
        app,
        { name: "Produto Manual da A", costCents: 100, priceCents: 200 },
        tokenA,
      );
      expect(productAResponse.status).toBe(HTTP_CREATED);
      const productA = productSchema.parse(await productAResponse.json());

      const productBResponse = await postProduct(
        app,
        {
          name: "Produto com Desconto da B",
          priceCents: 9990,
          purchaseDiscountBps: 3500,
        },
        tokenB,
      );
      expect(productBResponse.status).toBe(HTTP_CREATED);
      const productB = productSchema.parse(await productBResponse.json());

      const listA = productListSchema.parse(
        await (await getProducts(app, tokenA)).json(),
      );
      expect(listA.total).toBe(1);
      expect(listA.data).toEqual([productA]);
      expect(listA.data[0]?.purchaseDiscountBps).toBeNull();
      expect(listA.data.map((product) => product.id)).not.toContain(
        productB.id,
      );

      const listB = productListSchema.parse(
        await (await getProducts(app, tokenB)).json(),
      );
      expect(listB.total).toBe(1);
      expect(listB.data).toEqual([productB]);
      expect(listB.data[0]?.purchaseDiscountBps).toBe(3500);
      expect(listB.data[0]?.costCents).toBe(6494);
      expect(listB.data.map((product) => product.id)).not.toContain(
        productA.id,
      );
    });

    it("GET/PATCH/DELETE do id de B com sessão A ⇒ 404 idêntico ao inexistente", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );

      const [productOfB] = await ctx.db
        .insert(products)
        .values({
          consultantId: idB,
          name: "Produto da B",
          costCents: 130,
          purchaseDiscountBps: 3500,
          priceCents: 200,
        })
        .returning({ id: products.id });
      const productBId = productOfB?.id;
      if (!productBId) {
        throw new Error("falha ao semear o produto da consultora B");
      }

      // Corpo de referência: 404 de um id válido porém inexistente.
      const referenceResponse = await getProduct(app, NONEXISTENT_UUID, tokenA);
      expect(referenceResponse.status).toBe(HTTP_NOT_FOUND);
      const referenceBody = apiErrorSchema.parse(
        await referenceResponse.json(),
      );

      const getResponse = await getProduct(app, productBId, tokenA);
      expect(getResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await getResponse.json())).toEqual(
        referenceBody,
      );

      const patchResponse = await patchProduct(
        app,
        productBId,
        { purchaseDiscountBps: 4000 },
        tokenA,
      );
      expect(patchResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await patchResponse.json())).toEqual(
        referenceBody,
      );

      const deleteResponse = await deleteProduct(app, productBId, tokenA);
      expect(deleteResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await deleteResponse.json())).toEqual(
        referenceBody,
      );

      // O produto de B continua intacto: o escopo não deixou A alterá-lo.
      const survivors = await ctx.db.select().from(products);
      expect(survivors).toHaveLength(1);
      expect(survivors[0]?.name).toBe("Produto da B");
      expect(survivors[0]?.costCents).toBe(130);
      expect(survivors[0]?.purchaseDiscountBps).toBe(3500);
    });
  });

  describe("id malformado (RF-05)", () => {
    it("GET /products/nao-uuid ⇒ 404 (não 422 nem 500)", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getProduct(app, "nao-uuid", token);
      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(response.status).not.toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(response.status).not.toBe(HTTP_INTERNAL_ERROR);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(PRODUCT_NOT_FOUND_CODE);
    });
  });

  describe("guard default-deny (RF-03)", () => {
    it("sem token ⇒ 401 nas 6 rotas do módulo", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        getProducts(app, ""),
        getSummary(app),
        postProduct(app, VALID_PRODUCT_BODY),
        getProduct(app, NONEXISTENT_UUID),
        patchProduct(app, NONEXISTENT_UUID, { name: "X" }),
        deleteProduct(app, NONEXISTENT_UUID),
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
