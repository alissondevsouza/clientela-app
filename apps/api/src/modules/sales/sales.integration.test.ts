import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  apiErrorSchema,
  loginResponseSchema,
  paginated,
  productSchema,
  receivableListItemSchema,
  receivableSchema,
  receivablesSummarySchema,
  type Sale,
  saleListItemSchema,
  saleSchema,
} from "@clientela/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import {
  clients,
  consultants,
  products,
  receivables,
  saleItems,
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
import { createDashboardRepository } from "../dashboard/dashboard.repository";
import { createDashboardService } from "../dashboard/dashboard.service";
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createOrdersRepository } from "../orders/orders.repository";
import { createOrdersService } from "../orders/orders.service";
import { createProductsRepository } from "../products/products.repository";
import { createProductsService } from "../products/products.service";
import { createSalesRepository } from "./sales.repository";
import { createSalesService } from "./sales.service";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_INTERNAL_ERROR = 500;

const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";
const UNAUTHORIZED_CODE = "UNAUTHORIZED";
const SALE_NOT_FOUND_CODE = "SALE_NOT_FOUND";
const RECEIVABLE_NOT_FOUND_CODE = "RECEIVABLE_NOT_FOUND";
const INSUFFICIENT_STOCK_CODE = "INSUFFICIENT_STOCK";
const SALE_STATE_CONFLICT_CODE = "SALE_STATE_CONFLICT";
const INVALID_SALE_CREDIT_CODE = "INVALID_SALE_CREDIT";

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
// existe" e "não é sua" respondem o MESMO 404 (RF-04/RF-05/RF-06).
const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

// O próximo janeiro mantém o vencimento sempre futuro e preserva a prova de
// clamp mensal: 31/jan ⇒ último dia de fevereiro ⇒ 31/mar, sem drift.
const FIRST_DUE_YEAR = new Date().getFullYear() + 1;
const FIRST_DUE_FEBRUARY_DAY =
  (FIRST_DUE_YEAR % 4 === 0 && FIRST_DUE_YEAR % 100 !== 0) ||
  FIRST_DUE_YEAR % 400 === 0
    ? 29
    : 28;
const FIRST_DUE_DATE = `${FIRST_DUE_YEAR}-01-31`;
const FIRST_DUE_DATE_M1 = `${FIRST_DUE_YEAR}-02-${FIRST_DUE_FEBRUARY_DAY}`;
const FIRST_DUE_DATE_M2 = `${FIRST_DUE_YEAR}-03-31`;
// Data claramente no passado: rejeitada pela fronteira (firstDueDate < ontem).
const PAST_DUE_DATE = "2020-01-01";
// due_dates de fixtures de recebíveis semeados diretamente.
const OVERDUE_DATE_EARLY = "2020-01-01";
const OVERDUE_DATE_LATE = "2020-06-01";
const FUTURE_DATE = "2027-03-01";

const salesListSchema = paginated(saleListItemSchema);
const receivablesListSchema = paginated(receivableListItemSchema);

// Hasher real de KDF do Node (scrypt): os workers do Vitest rodam sob Node, onde
// o global `Bun` (argon2id) não existe. Round-trip real (hash na semeadura,
// verify no login) prova o login de verdade. Espelha clients/products.
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

describe("sales (integração)", () => {
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
    costCents?: number;
    purchaseDiscountBps?: number | null;
    priceCents: number;
    stockQty?: number;
  };

  // Semeadura direta de produtos: o comportamento sob teste é a venda/estoque,
  // não o POST /products.
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

  const seedClient = async (
    consultantId: string,
    name: string,
    whatsapp: string,
  ): Promise<string> => {
    const [row] = await ctx.db
      .insert(clients)
      .values({ consultantId, name, whatsapp })
      .returning({ id: clients.id });
    if (!row) {
      throw new Error("falha ao semear a cliente de teste");
    }
    return row.id;
  };

  type SeedSaleValues = {
    clientId?: string | null;
    clientName?: string;
    totalCents: number;
    paymentMethod?: "cash" | "pix" | "card" | "credit";
    status?: "completed" | "canceled";
  };

  // Semeadura direta de venda (setup de recebíveis/summary/cross-tenant com
  // controle total de status e vencimentos). O comportamento sob teste é a rota
  // de recebíveis, não o POST /sales.
  const seedSale = async (
    consultantId: string,
    values: SeedSaleValues,
  ): Promise<string> => {
    const seededAt = new Date();
    const status = values.status ?? "completed";
    const [row] = await ctx.db
      .insert(sales)
      .values({
        consultantId,
        clientId: values.clientId ?? null,
        clientName: values.clientName ?? "Cliente Semeada",
        totalCents: values.totalCents,
        paymentMethod: values.paymentMethod ?? "credit",
        paymentCondition:
          (values.paymentMethod ?? "credit") === "credit"
            ? "installments"
            : "received",
        installments: 1,
        status,
        soldAt: seededAt,
        createdAt: seededAt,
        updatedAt: seededAt,
        ...(status === "completed"
          ? { deliveredAt: seededAt, completedAt: seededAt }
          : {}),
        ...(status === "canceled" ? { canceledAt: seededAt } : {}),
      })
      .returning({ id: sales.id });
    if (!row) {
      throw new Error("falha ao semear a venda de teste");
    }
    return row.id;
  };

  const seedReceivable = async (
    saleId: string,
    values: { amountCents: number; dueDate: string; paidAt?: Date | null },
  ): Promise<string> => {
    const timestamp = values.paidAt ?? new Date();
    const [row] = await ctx.db
      .insert(receivables)
      .values({
        saleId,
        amountCents: values.amountCents,
        dueDate: values.dueDate,
        paidAt: values.paidAt ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning({ id: receivables.id });
    if (!row) {
      throw new Error("falha ao semear o recebível de teste");
    }
    return row.id;
  };

  // ------------------------- requesters HTTP -------------------------

  // Os cenários CRM-06 usavam `credit` e não expressavam entrega/condição.
  // O helper preserva a intenção deles (venda entregue, ainda a receber) no
  // contrato CRM-12; novos testes devem enviar o payload explícito diretamente.
  const lifecyclePayload = (body: unknown): unknown => {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return body;
    }
    const value = body as Record<string, unknown>;
    const legacyCredit = value.paymentMethod === "credit";
    const legacySingleInstallment = legacyCredit && value.installments === 1;
    return {
      ...value,
      paymentMethod: legacySingleInstallment
        ? "card"
        : legacyCredit
          ? "pix"
          : value.paymentMethod,
      deliveryStatus: value.deliveryStatus ?? "delivered",
      paymentCondition:
        value.paymentCondition ??
        (legacySingleInstallment
          ? "on_delivery"
          : legacyCredit
            ? "installments"
            : "on_delivery"),
      installments: value.installments ?? 1,
      ...(legacySingleInstallment ? { cardType: "credit" } : {}),
      ...(legacySingleInstallment ? { firstDueDate: undefined } : {}),
    };
  };

  const postSale = (
    app: App,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/sales", {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(lifecyclePayload(body)),
      }),
    );

  const getSales = (
    app: App,
    token: string,
    queryString = "",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/sales${queryString}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const getSale = (app: App, id: string, token?: string): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/sales/${id}`, {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const cancelSale = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/sales/${id}/cancel`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const deliverSale = (
    app: App,
    id: string,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/sales/${id}/deliver`, {
        method: "POST",
        headers: token ? bearer(token) : {},
      }),
    );

  const getReceivables = (
    app: App,
    token: string,
    queryString = "",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/receivables${queryString}`, {
        method: "GET",
        headers: bearer(token),
      }),
    );

  const getReceivablesSummary = (app: App, token?: string): Promise<Response> =>
    app.handle(
      new Request("http://localhost/receivables/summary", {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const patchReceivable = (
    app: App,
    id: string,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/receivables/${id}`, {
        method: "PATCH",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
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

  const stockOf = async (
    app: App,
    id: string,
    token: string,
  ): Promise<number> => {
    const response = await getProduct(app, id, token);
    expect(response.status).toBe(HTTP_OK);
    return productSchema.parse(await response.json()).stockQty;
  };

  const createSaleOk = async (
    app: App,
    body: unknown,
    token: string,
  ): Promise<Sale> => {
    const response = await postSale(app, body, token);
    expect(response.status).toBe(HTTP_CREATED);
    return saleSchema.parse(await response.json());
  };

  const itemByProduct = (sale: Sale, productId: string) => {
    const item = sale.items.find((entry) => entry.productId === productId);
    if (!item) {
      throw new Error(`item do produto ${productId} não encontrado na venda`);
    }
    return item;
  };

  // -------------------------------------------------------------------------
  // RF-03 — venda à vista
  // -------------------------------------------------------------------------
  describe("venda à vista (RF-03)", () => {
    it("2 itens com cliente: baixa estoque exato, total do servidor, snapshot, sem recebíveis, override e default de preço", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productA = await seedProduct(consultantId, {
        name: "Batom Vermelho",
        priceCents: 3990,
        stockQty: 10,
      });
      const productB = await seedProduct(consultantId, {
        name: "Base Líquida",
        priceCents: 5000,
        stockQty: 5,
      });
      const clientId = await seedClient(
        consultantId,
        "Ana Maria",
        "11988887777",
      );

      // `totalCents` forjado no payload: deve ser IGNORADO (strip do Zod) — o
      // total sai calculado no servidor. Item A com override de preço; item B
      // sem preço ⇒ default = preço atual do produto.
      const sale = await createSaleOk(
        app,
        {
          clientId,
          items: [
            { productId: productA, qty: 2, unitPriceCents: 3000 },
            { productId: productB, qty: 1 },
          ],
          paymentMethod: "cash",
          totalCents: 999_999,
        },
        token,
      );

      // Total = 2×3000 (override) + 1×5000 (default) = 11000 — nunca o forjado.
      expect(sale.totalCents).toBe(11_000);
      expect(sale.paymentMethod).toBe("cash");
      expect(sale.status).toBe("open");
      expect(sale.clientId).toBe(clientId);
      expect(sale.clientName).toBe("Ana Maria");
      // Método à vista não gera recebíveis.
      expect(sale.receivables).toHaveLength(1);
      expect(sale.receivables[0]?.status).toBe("pending");

      // Snapshot de nome/preço por item.
      const soldA = itemByProduct(sale, productA);
      expect(soldA.productName).toBe("Batom Vermelho");
      expect(soldA.qty).toBe(2);
      expect(soldA.unitPriceCents).toBe(3000); // override respeitado
      const soldB = itemByProduct(sale, productB);
      expect(soldB.productName).toBe("Base Líquida");
      expect(soldB.qty).toBe(1);
      expect(soldB.unitPriceCents).toBe(5000); // default = preço atual

      // Estoque baixado exatamente: 10-2=8, 5-1=4.
      expect(await stockOf(app, productA, token)).toBe(8);
      expect(await stockOf(app, productB, token)).toBe(4);
    });

    it("congela no item o custo calculado por desconto; mudar a taxa do produto depois não altera a venda (CRM-11/RF-07)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Perfume Floral",
        costCents: 6_494,
        purchaseDiscountBps: 3_500,
        priceCents: 9_990,
        stockQty: 10,
      });

      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "cash",
        },
        token,
      );

      // O item persistido carrega o custo do produto no momento da venda — não
      // exposto no contrato público (Sale/SaleItem), então lido direto no banco.
      const [itemRow] = await ctx.db
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, sale.id));
      expect(itemRow?.costCents).toBe(6_494);

      // Alterar a taxa pela API recalcula o custo vivo do produto, mas não
      // reescreve o snapshot de custo da venda já concluída.
      const patchResponse = await patchProduct(
        app,
        productId,
        { purchaseDiscountBps: 4_000 },
        token,
      );
      expect(patchResponse.status).toBe(HTTP_OK);
      const updatedProduct = productSchema.parse(await patchResponse.json());
      expect(updatedProduct.costCents).toBe(5_994);
      expect(updatedProduct.purchaseDiscountBps).toBe(4_000);

      const [itemAfterCostChange] = await ctx.db
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, sale.id));
      expect(itemAfterCostChange?.costCents).toBe(6_494);
    });
  });

  // -------------------------------------------------------------------------
  // RF-03 — concorrência de estoque e atomicidade
  // -------------------------------------------------------------------------
  describe("estoque: concorrência e atomicidade (RF-03)", () => {
    it("dois POSTs paralelos do último item ⇒ exatamente um 201 e um 409, estoque final 0, uma venda só", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Última Unidade",
        priceCents: 1000,
        stockQty: 1,
      });

      const body = {
        items: [{ productId, qty: 1 }],
        paymentMethod: "cash",
      };

      const [first, second] = await Promise.all([
        postSale(app, body, token),
        postSale(app, body, token),
      ]);

      const statuses = [first.status, second.status].toSorted((a, b) => a - b);
      expect(statuses).toEqual([HTTP_CREATED, HTTP_CONFLICT]);

      const conflict = first.status === HTTP_CONFLICT ? first : second;
      const errorBody = apiErrorSchema.parse(await conflict.json());
      expect(errorBody.error.code).toBe(INSUFFICIENT_STOCK_CODE);
      expect(errorBody.error.message).toMatch(/estoque insuficiente/i);
      // Mensagem pt-BR com o nome do produto (snapshot) — não é dado pessoal.
      expect(errorBody.error.message).toContain("Última Unidade");

      // Nunca-negativo: estoque final exatamente 0.
      expect(await stockOf(app, productId, token)).toBe(0);
      // Só UMA venda foi persistida.
      const list = salesListSchema.parse(
        await (await getSales(app, token)).json(),
      );
      expect(list.total).toBe(1);
    });

    it("venda de 2 itens onde o 2º não tem estoque ⇒ 409 e NADA persiste (atomicidade)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const withStock = await seedProduct(consultantId, {
        name: "Com Estoque",
        priceCents: 1000,
        stockQty: 10,
      });
      const noStock = await seedProduct(consultantId, {
        name: "Sem Estoque",
        priceCents: 2000,
        stockQty: 0,
      });

      const response = await postSale(
        app,
        {
          items: [
            { productId: withStock, qty: 2 },
            { productId: noStock, qty: 1 },
          ],
          paymentMethod: "cash",
        },
        token,
      );
      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INSUFFICIENT_STOCK_CODE);
      expect(body.error.message).toContain("Sem Estoque");

      // Rollback total: estoque do 1º item intacto e nenhuma venda persistida.
      expect(await stockOf(app, withStock, token)).toBe(10);
      const list = salesListSchema.parse(
        await (await getSales(app, token)).json(),
      );
      expect(list.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // RF-03 — parcelamento / venda a prazo
  // -------------------------------------------------------------------------
  describe("parcelamento a prazo (RF-03)", () => {
    it("total 10000 em 3× ⇒ [3334,3333,3333] com vencimentos mensais e clamp de mês", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Kit Completo",
        priceCents: 10_000,
        stockQty: 5,
      });

      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1, unitPriceCents: 10_000 }],
          paymentMethod: "credit",
          installments: 3,
          firstDueDate: FIRST_DUE_DATE,
        },
        token,
      );

      expect(sale.totalCents).toBe(10_000);
      // Σ das parcelas = total; resto de centavos vai na primeira.
      expect(sale.receivables.map((r) => r.amountCents)).toEqual([
        3334, 3333, 3333,
      ]);
      const sum = sale.receivables.reduce((acc, r) => acc + r.amountCents, 0);
      expect(sum).toBe(10_000);
      // Vencimentos mensais ancorados no dia 31 (clamp p/ 30/09; sem drift em 31/10).
      expect(sale.receivables.map((r) => r.dueDate)).toEqual([
        FIRST_DUE_DATE,
        FIRST_DUE_DATE_M1,
        FIRST_DUE_DATE_M2,
      ]);
      // Todas pendentes (paidAt null); futuras ⇒ overdue false.
      for (const receivable of sale.receivables) {
        expect(receivable.paidAt).toBeNull();
        expect(receivable.overdue).toBe(false);
      }
    });

    it("fiado 1× ⇒ 1 recebível no vencimento com o total", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Perfume",
        priceCents: 7_777,
        stockQty: 3,
      });

      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "credit",
          installments: 1,
          firstDueDate: FIRST_DUE_DATE,
        },
        token,
      );

      expect(sale.receivables).toHaveLength(1);
      expect(sale.receivables[0]?.amountCents).toBe(7_777);
      expect(sale.receivables[0]?.dueKind).toBe("scheduled");
    });

    it("credit com total < installments ⇒ 422 INVALID_SALE_CREDIT pt-BR", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      // total = 2 centavos, 3 parcelas ⇒ geraria parcela de 0 (viola CHECK).
      const productId = await seedProduct(consultantId, {
        name: "Amostra",
        priceCents: 2,
        stockQty: 5,
      });

      const response = await postSale(
        app,
        {
          items: [{ productId, qty: 1, unitPriceCents: 2 }],
          paymentMethod: "credit",
          installments: 3,
          firstDueDate: FIRST_DUE_DATE,
        },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(INVALID_SALE_CREDIT_CODE);
      expect(body.error.message).toMatch(/parcela/i);
    });

    it("firstDueDate no passado ⇒ 422 pt-BR na fronteira", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Item",
        priceCents: 5_000,
        stockQty: 5,
      });

      const response = await postSale(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "credit",
          installments: 2,
          firstDueDate: PAST_DUE_DATE,
        },
        token,
      );
      expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(body.error.message).toMatch(/passado/i);
    });
  });

  // -------------------------------------------------------------------------
  // RF-05 — cancelamento
  // -------------------------------------------------------------------------
  describe("cancelamento (RF-05)", () => {
    it("cancela venda à vista: devolve estoque e mantém itens/total (histórico)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Hidratante",
        priceCents: 2_500,
        stockQty: 10,
      });

      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 3, unitPriceCents: 2_500 }],
          paymentMethod: "pix",
        },
        token,
      );
      expect(await stockOf(app, productId, token)).toBe(7); // 10-3

      const cancelResponse = await cancelSale(app, sale.id, token);
      expect(cancelResponse.status).toBe(HTTP_OK);
      const canceled = saleSchema.parse(await cancelResponse.json());
      expect(canceled.status).toBe("canceled");
      // Histórico preservado: itens e total intactos após cancelar.
      expect(canceled.totalCents).toBe(7_500);
      expect(canceled.items).toHaveLength(1);
      expect(canceled.items[0]?.qty).toBe(3);
      expect(canceled.items[0]?.unitPriceCents).toBe(2_500);

      // Estoque devolvido.
      expect(await stockOf(app, productId, token)).toBe(10);
    });

    it("cancela venda a prazo: recebíveis pendentes somem", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Sérum",
        priceCents: 9_000,
        stockQty: 4,
      });

      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "credit",
          installments: 3,
          firstDueDate: FIRST_DUE_DATE,
        },
        token,
      );
      expect(sale.receivables).toHaveLength(3);

      const cancelResponse = await cancelSale(app, sale.id, token);
      expect(cancelResponse.status).toBe(HTTP_OK);
      const canceled = saleSchema.parse(await cancelResponse.json());
      expect(canceled.status).toBe("canceled");
      // Pendentes são anulados para preservar a auditoria.
      expect(
        canceled.receivables.every(
          (receivable) => receivable.status === "voided",
        ),
      ).toBe(true);

      // A lista "quem me deve" não mostra mais nada dessa venda.
      const list = receivablesListSchema.parse(
        await (await getReceivables(app, token)).json(),
      );
      expect(list.total).toBe(0);
    });

    it("cancela venda com parcela paga ⇒ 409 e nada muda", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Máscara",
        priceCents: 6_000,
        stockQty: 4,
      });

      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "credit",
          installments: 2,
          firstDueDate: FIRST_DUE_DATE,
        },
        token,
      );
      const firstReceivable = sale.receivables[0];
      if (!firstReceivable) {
        throw new Error("recebível esperado ausente");
      }
      // Baixa a primeira parcela.
      const payResponse = await patchReceivable(
        app,
        firstReceivable.id,
        { paid: true },
        token,
      );
      expect(payResponse.status).toBe(HTTP_OK);

      // Cancelar agora é bloqueado (409).
      const cancelResponse = await cancelSale(app, sale.id, token);
      expect(cancelResponse.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await cancelResponse.json());
      expect(body.error.code).toBe(SALE_STATE_CONFLICT_CODE);
      expect(body.error.message).toMatch(/estorne|paga/i);

      // Nada mudou: venda segue completed, parcela segue paga, estoque baixado.
      const after = saleSchema.parse(
        await (await getSale(app, sale.id, token)).json(),
      );
      expect(after.status).toBe("open");
      expect(after.receivables).toHaveLength(2);
      const paid = after.receivables.find((r) => r.id === firstReceivable.id);
      expect(paid?.paidAt).not.toBeNull();
      expect(await stockOf(app, productId, token)).toBe(3); // 4-1, não devolvido
    });

    it("cancela venda já cancelada ⇒ 409", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Loção",
        priceCents: 1_000,
        stockQty: 5,
      });
      const sale = await createSaleOk(
        app,
        { items: [{ productId, qty: 1 }], paymentMethod: "cash" },
        token,
      );

      const first = await cancelSale(app, sale.id, token);
      expect(first.status).toBe(HTTP_OK);

      const second = await cancelSale(app, sale.id, token);
      expect(second.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await second.json());
      expect(body.error.code).toBe(SALE_STATE_CONFLICT_CODE);
      expect(body.error.message).toMatch(/cancelada/i);
    });
  });

  // -------------------------------------------------------------------------
  // RF-05/RF-06 — concorrência cancelar × pagar
  // -------------------------------------------------------------------------
  describe("concorrência cancelar × pagar (RF-05/RF-06)", () => {
    it("paralelos sobre a mesma venda credit 1× ⇒ exatamente um vence, estado final coerente", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Disputa",
        priceCents: 4_000,
        stockQty: 100,
      });

      const ROUNDS = 6;
      for (let round = 0; round < ROUNDS; round += 1) {
        const sale = await createSaleOk(
          app,
          {
            items: [{ productId, qty: 1 }],
            paymentMethod: "credit",
            installments: 1,
            firstDueDate: FIRST_DUE_DATE,
          },
          token,
        );
        const receivableId = sale.receivables[0]?.id;
        if (!receivableId) {
          throw new Error("recebível 1× esperado ausente");
        }

        const [cancelResponse, payResponse] = await Promise.all([
          cancelSale(app, sale.id, token),
          patchReceivable(app, receivableId, { paid: true }, token),
        ]);

        // Exatamente um 200 (o vencedor); o perdedor é 409 ou 404 (a parcela
        // pode já ter sido removida pelo cancelamento vencedor).
        const okCount = [cancelResponse.status, payResponse.status].filter(
          (status) => status === HTTP_OK,
        ).length;
        expect(okCount).toBe(1);

        const final = saleSchema.parse(
          await (await getSale(app, sale.id, token)).json(),
        );
        if (final.status === "canceled") {
          // Cancelamento venceu: parcela pendente removida, nunca cancelada+paga.
          expect(cancelResponse.status).toBe(HTTP_OK);
          expect(payResponse.status).not.toBe(HTTP_OK);
          expect(
            final.receivables.every(
              (receivable) => receivable.status === "voided",
            ),
          ).toBe(true);
        } else {
          // Pagamento venceu: venda segue completed com a parcela paga.
          expect(final.status).toBe("completed");
          expect(payResponse.status).toBe(HTTP_OK);
          expect(cancelResponse.status).toBe(HTTP_CONFLICT);
          expect(final.receivables[0]?.paidAt).not.toBeNull();
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // RF-06 — recebíveis: lista, baixa/estorno, summary
  // -------------------------------------------------------------------------
  describe("recebíveis (RF-06)", () => {
    it("lista só pendentes ordenada por vencimento com overdue correto; pending=false inclui pagos", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId, { totalCents: 30_000 });
      // Ordem de insert propositalmente fora de ordem de vencimento.
      await seedReceivable(saleId, {
        amountCents: 10_000,
        dueDate: FUTURE_DATE,
      });
      await seedReceivable(saleId, {
        amountCents: 10_000,
        dueDate: OVERDUE_DATE_EARLY,
      });
      await seedReceivable(saleId, {
        amountCents: 10_000,
        dueDate: OVERDUE_DATE_LATE,
        paidAt: new Date("2020-06-02T10:00:00Z"),
      });

      // Default pending=true: só as não pagas, ordenadas por due_date asc.
      const pending = receivablesListSchema.parse(
        await (await getReceivables(app, token)).json(),
      );
      expect(pending.total).toBe(2);
      expect(pending.data.map((r) => r.dueDate)).toEqual([
        OVERDUE_DATE_EARLY,
        FUTURE_DATE,
      ]);
      // overdue derivado: vencida no passado ⇒ true; futura ⇒ false.
      expect(pending.data[0]?.overdue).toBe(true);
      expect(pending.data[1]?.overdue).toBe(false);

      // pending=false: inclui a paga; paga nunca é overdue.
      const all = receivablesListSchema.parse(
        await (await getReceivables(app, token, "?pending=false")).json(),
      );
      expect(all.total).toBe(3);
      expect(all.data.map((r) => r.dueDate)).toEqual([
        OVERDUE_DATE_EARLY,
        OVERDUE_DATE_LATE,
        FUTURE_DATE,
      ]);
      const paid = all.data.find((r) => r.dueDate === OVERDUE_DATE_LATE);
      expect(paid?.paidAt).not.toBeNull();
      expect(paid?.overdue).toBe(false);
    });

    it("baixa seta paid_at e estorno limpa; pagar pago e estornar pendente ⇒ 409", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId, { totalCents: 10_000 });
      const receivableId = await seedReceivable(saleId, {
        amountCents: 10_000,
        dueDate: FUTURE_DATE,
      });

      // Estornar pendente ⇒ 409.
      const reverseWhilePending = await patchReceivable(
        app,
        receivableId,
        { paid: false },
        token,
      );
      expect(reverseWhilePending.status).toBe(HTTP_CONFLICT);
      expect(
        apiErrorSchema.parse(await reverseWhilePending.json()).error.code,
      ).toBe(SALE_STATE_CONFLICT_CODE);

      // Baixa ⇒ 200 e paid_at setado.
      const pay = await patchReceivable(
        app,
        receivableId,
        { paid: true },
        token,
      );
      expect(pay.status).toBe(HTTP_OK);
      const paid = receivableSchema.parse(await pay.json());
      expect(paid.paidAt).not.toBeNull();
      expect(paid.overdue).toBe(false);

      // Pagar pago ⇒ 409.
      const payAgain = await patchReceivable(
        app,
        receivableId,
        { paid: true },
        token,
      );
      expect(payAgain.status).toBe(HTTP_CONFLICT);
      expect(apiErrorSchema.parse(await payAgain.json()).error.code).toBe(
        SALE_STATE_CONFLICT_CODE,
      );

      // Estorno ⇒ 200 e paid_at limpo.
      const reverse = await patchReceivable(
        app,
        receivableId,
        { paid: false },
        token,
      );
      expect(reverse.status).toBe(HTTP_OK);
      expect(receivableSchema.parse(await reverse.json()).paidAt).toBeNull();
    });

    it("pagar recebível de venda cancelada ⇒ 409", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      // Venda cancelada com recebível remanescente (semeada direta).
      const saleId = await seedSale(consultantId, {
        totalCents: 5_000,
        status: "canceled",
      });
      const receivableId = await seedReceivable(saleId, {
        amountCents: 5_000,
        dueDate: FUTURE_DATE,
      });

      const response = await patchReceivable(
        app,
        receivableId,
        { paid: true },
        token,
      );
      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe(SALE_STATE_CONFLICT_CODE);
      expect(body.error.message).toMatch(/cancelada/i);
    });

    it("summary agrega pendente/atrasado exatos de fixtures conhecidas", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const saleId = await seedSale(consultantId, { totalCents: 100_000 });
      // Pendente futura: 4000 (não atrasada).
      await seedReceivable(saleId, {
        amountCents: 4_000,
        dueDate: FUTURE_DATE,
      });
      // Pendentes atrasadas: 3000 + 2500 = 5500 (2 contagens).
      await seedReceivable(saleId, {
        amountCents: 3_000,
        dueDate: OVERDUE_DATE_EARLY,
      });
      await seedReceivable(saleId, {
        amountCents: 2_500,
        dueDate: OVERDUE_DATE_LATE,
      });
      // Paga atrasada: NÃO entra em pendente nem atrasado.
      await seedReceivable(saleId, {
        amountCents: 9_999,
        dueDate: OVERDUE_DATE_EARLY,
        paidAt: new Date("2020-02-01T10:00:00Z"),
      });

      const response = await getReceivablesSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      const summary = receivablesSummarySchema.parse(await response.json());
      // pendente = 4000 + 3000 + 2500 = 9500.
      expect(summary.pendingCents).toBe(9_500);
      // atrasado = 3000 + 2500 = 5500 (pagos e futuros fora).
      expect(summary.overdueCents).toBe(5_500);
      expect(summary.overdueCount).toBe(2);
    });

    it("summary sem recebíveis ⇒ zeros", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getReceivablesSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      const summary = receivablesSummarySchema.parse(await response.json());
      expect(summary.pendingCents).toBe(0);
      expect(summary.overdueCents).toBe(0);
      expect(summary.overdueCount).toBe(0);
    });

    it("summary é escopado por consultora (A não soma recebíveis de B)", async () => {
      const app = buildApp();
      const { consultantId: idA, token: tokenA } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const saleA = await seedSale(idA, { totalCents: 2_000 });
      await seedReceivable(saleA, { amountCents: 2_000, dueDate: FUTURE_DATE });
      const saleB = await seedSale(idB, { totalCents: 90_000 });
      await seedReceivable(saleB, {
        amountCents: 90_000,
        dueDate: OVERDUE_DATE_EARLY,
      });

      const summary = receivablesSummarySchema.parse(
        await (await getReceivablesSummary(app, tokenA)).json(),
      );
      expect(summary.pendingCents).toBe(2_000);
      expect(summary.overdueCents).toBe(0);
      expect(summary.overdueCount).toBe(0);
    });

    it("clientWhatsapp presente na lista e vira null após excluir a cliente", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(
        consultantId,
        "Bruna Lima",
        "11955554444",
      );
      const productId = await seedProduct(consultantId, {
        name: "Kit Presente",
        priceCents: 8_000,
        stockQty: 3,
      });
      const sale = await createSaleOk(
        app,
        {
          clientId,
          items: [{ productId, qty: 1 }],
          paymentMethod: "credit",
          installments: 1,
          firstDueDate: FIRST_DUE_DATE,
        },
        token,
      );
      expect(sale.receivables).toHaveLength(1);

      const before = receivablesListSchema.parse(
        await (await getReceivables(app, token)).json(),
      );
      expect(before.total).toBe(1);
      expect(before.data[0]?.clientId).toBe(clientId);
      expect(before.data[0]?.clientName).toBe("Bruna Lima");
      expect(before.data[0]?.clientWhatsapp).toBe("11955554444");

      // Exclusão da cliente (LGPD): SET NULL preserva o snapshot na venda.
      const deleteResponse = await deleteClient(app, clientId, token);
      expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);

      const after = receivablesListSchema.parse(
        await (await getReceivables(app, token)).json(),
      );
      expect(after.total).toBe(1);
      expect(after.data[0]?.clientId).toBeNull();
      expect(after.data[0]?.clientWhatsapp).toBeNull();
      // Snapshot do nome permanece legível.
      expect(after.data[0]?.clientName).toBe("Bruna Lima");
    });
  });

  // -------------------------------------------------------------------------
  // RF-07 — exclusões preservam o histórico (snapshot)
  // -------------------------------------------------------------------------
  describe("exclusões preservam histórico (RF-07)", () => {
    it("excluir a cliente ⇒ venda intacta com clientId null e clientName do snapshot", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const clientId = await seedClient(
        consultantId,
        "Carla Souza",
        "11944443333",
      );
      const productId = await seedProduct(consultantId, {
        name: "Batom Nude",
        priceCents: 3_000,
        stockQty: 5,
      });
      const sale = await createSaleOk(
        app,
        {
          clientId,
          items: [{ productId, qty: 2, unitPriceCents: 3_000 }],
          paymentMethod: "cash",
        },
        token,
      );

      const deleteResponse = await deleteClient(app, clientId, token);
      expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);

      const after = saleSchema.parse(
        await (await getSale(app, sale.id, token)).json(),
      );
      expect(after.clientId).toBeNull();
      expect(after.clientName).toBe("Carla Souza"); // snapshot
      expect(after.totalCents).toBe(6_000);
      expect(after.items).toHaveLength(1);
      expect(after.items[0]?.productName).toBe("Batom Nude");
    });

    it("excluir o produto vendido ⇒ item intacto com productId null e productName do snapshot", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Delineador",
        priceCents: 4_500,
        stockQty: 5,
      });
      const sale = await createSaleOk(
        app,
        { items: [{ productId, qty: 1 }], paymentMethod: "pix" },
        token,
      );

      const deleteResponse = await deleteProduct(app, productId, token);
      expect(deleteResponse.status).toBe(HTTP_NO_CONTENT);

      const after = saleSchema.parse(
        await (await getSale(app, sale.id, token)).json(),
      );
      expect(after.items).toHaveLength(1);
      expect(after.items[0]?.productId).toBeNull();
      expect(after.items[0]?.productName).toBe("Delineador"); // snapshot
      expect(after.items[0]?.unitPriceCents).toBe(4_500);
    });

    it("cancelamento pós-exclusão de produto não devolve estoque daquele item", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const deleted = await seedProduct(consultantId, {
        name: "A Excluir",
        priceCents: 2_000,
        stockQty: 10,
      });
      const kept = await seedProduct(consultantId, {
        name: "Permanece",
        priceCents: 3_000,
        stockQty: 10,
      });
      const sale = await createSaleOk(
        app,
        {
          items: [
            { productId: deleted, qty: 4 },
            { productId: kept, qty: 2 },
          ],
          paymentMethod: "cash",
        },
        token,
      );
      expect(await stockOf(app, kept, token)).toBe(8); // 10-2

      // Exclui um dos produtos vendidos (item vira productId null via SET NULL).
      expect((await deleteProduct(app, deleted, token)).status).toBe(
        HTTP_NO_CONTENT,
      );

      const cancelResponse = await cancelSale(app, sale.id, token);
      expect(cancelResponse.status).toBe(HTTP_OK);

      // O produto ainda existente recebe o estoque de volta...
      expect(await stockOf(app, kept, token)).toBe(10);
      // ...e o excluído continua inexistente (não recebeu estoque de volta).
      expect((await getProduct(app, deleted, token)).status).toBe(
        HTTP_NOT_FOUND,
      );
    });
  });

  // -------------------------------------------------------------------------
  // RF-04/05/06 — cross-tenant, escopo, 401 e id malformado
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // CRM-12 — ciclo de venda: entrega, projeção financeira e tempo canônico
  // -------------------------------------------------------------------------
  describe("ciclo de venda (CRM-12)", () => {
    it("listagem devolve o estado financeiro REAL de cada venda (paga, parcial e pendente)", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Hidratante",
        priceCents: 5_000,
        stockQty: 50,
      });

      // (a) Já recebida e entregue ⇒ paga, sem saldo.
      const paidSale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 2 }],
          paymentMethod: "cash",
          paymentCondition: "received",
          deliveryStatus: "delivered",
        },
        token,
      );
      // (b) Parcelada em 2×, uma parcela baixada ⇒ parcialmente paga.
      const partialSale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 4 }],
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 2,
          firstDueDate: FIRST_DUE_DATE,
          deliveryStatus: "delivered",
        },
        token,
      );
      const firstReceivable = partialSale.receivables[0];
      if (!firstReceivable) {
        throw new Error("venda parcelada sem recebível");
      }
      expect(
        (await patchReceivable(app, firstReceivable.id, { paid: true }, token))
          .status,
      ).toBe(HTTP_OK);
      // (c) A receber na entrega, ainda não entregue ⇒ pendente integral.
      const pendingSale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "pix",
          paymentCondition: "on_delivery",
          deliveryStatus: "pending",
        },
        token,
      );

      const list = salesListSchema.parse(
        await (await getSales(app, token)).json(),
      );
      const byId = new Map(list.data.map((sale) => [sale.id, sale]));

      const paid = byId.get(paidSale.id);
      expect(paid?.paymentStatus).toBe("paid");
      expect(paid?.paidCents).toBe(paidSale.totalCents);
      expect(paid?.outstandingCents).toBe(0);

      const partial = byId.get(partialSale.id);
      expect(partial?.paymentStatus).toBe("partial");
      expect(partial?.paidCents).toBe(firstReceivable.amountCents);
      expect(partial?.outstandingCents).toBe(
        partialSale.totalCents - firstReceivable.amountCents,
      );

      const pending = byId.get(pendingSale.id);
      expect(pending?.paymentStatus).toBe("pending");
      expect(pending?.paidCents).toBe(0);
      expect(pending?.outstandingCents).toBe(pendingSale.totalCents);
      expect(pending?.deliveryStatus).toBe("pending");

      // A lista concorda com o detalhe — a projeção é a MESMA regra.
      const detail = saleSchema.parse(
        await (await getSale(app, partialSale.id, token)).json(),
      );
      expect(detail.paymentStatus).toBe(partial?.paymentStatus);
      expect(detail.paidCents).toBe(partial?.paidCents);
      expect(detail.outstandingCents).toBe(partial?.outstandingCents);
    });

    it("venda cancelada não exibe dívida nem crédito cobrável na listagem", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Máscara",
        priceCents: 4_000,
        stockQty: 10,
      });
      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "pix",
          paymentCondition: "on_delivery",
          deliveryStatus: "pending",
        },
        token,
      );
      expect((await cancelSale(app, sale.id, token)).status).toBe(HTTP_OK);

      const list = salesListSchema.parse(
        await (await getSales(app, token)).json(),
      );
      const canceled = list.data.find((entry) => entry.id === sale.id);
      expect(canceled?.status).toBe("canceled");
      expect(canceled?.paymentStatus).toBe("voided");
      expect(canceled?.paidCents).toBe(0);
      expect(canceled?.outstandingCents).toBe(0);
    });

    it("criação recebida e entregue grava UM instante canônico em todos os campos correlatos", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Perfume",
        priceCents: 12_000,
        stockQty: 3,
      });

      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "cash",
          paymentCondition: "received",
          deliveryStatus: "delivered",
        },
        token,
      );

      // Todos os terminais desta criação vêm do MESMO transaction_timestamp()
      // do Postgres — nenhum depende do relógio da aplicação nem de default.
      expect(sale.createdAt).toBe(sale.soldAt);
      expect(sale.updatedAt).toBe(sale.soldAt);
      expect(sale.deliveredAt).toBe(sale.soldAt);
      expect(sale.completedAt).toBe(sale.soldAt);
      const receivable = sale.receivables[0];
      expect(receivable?.createdAt).toBe(sale.soldAt);
      expect(receivable?.updatedAt).toBe(sale.soldAt);
      expect(receivable?.paidAt).toBe(sale.soldAt);
    });

    it("entrega baixa o estoque uma vez, materializa o vencimento e conclui a venda já paga", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Sabonete",
        priceCents: 2_500,
        stockQty: 4,
      });
      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 2 }],
          paymentMethod: "pix",
          paymentCondition: "received",
          deliveryStatus: "pending",
        },
        token,
      );
      expect(sale.status).toBe("open");
      expect(sale.receivables[0]?.dueKind).toBe("scheduled");
      // Venda aberta RESERVA, não baixa: o estoque físico segue intacto.
      const beforeDelivery = productSchema.parse(
        await (await getProduct(app, productId, token)).json(),
      );
      expect(beforeDelivery.stockQty).toBe(4);
      expect(beforeDelivery.reservedQty).toBe(2);
      expect(beforeDelivery.availableQty).toBe(2);

      const delivered = saleSchema.parse(
        await (await deliverSale(app, sale.id, token)).json(),
      );
      expect(delivered.status).toBe("completed");
      expect(delivered.deliveryStatus).toBe("delivered");
      expect(delivered.completedAt).toBe(delivered.deliveredAt);

      const afterDelivery = productSchema.parse(
        await (await getProduct(app, productId, token)).json(),
      );
      expect(afterDelivery.stockQty).toBe(2);
      expect(afterDelivery.reservedQty).toBe(0);

      // Segunda entrega é conflito e NÃO debita de novo.
      expect((await deliverSale(app, sale.id, token)).status).toBe(
        HTTP_CONFLICT,
      );
      const afterSecondAttempt = productSchema.parse(
        await (await getProduct(app, productId, token)).json(),
      );
      expect(afterSecondAttempt.stockQty).toBe(2);
    });

    it("entrega sem estoque suficiente informa a quantidade REAL restante e não altera nada", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Delineador",
        priceCents: 3_000,
        stockQty: 5,
      });
      const sale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 4 }],
          paymentMethod: "pix",
          paymentCondition: "on_delivery",
          deliveryStatus: "pending",
        },
        token,
      );
      // Estoque cai para 2 depois da venda aberta (ajuste físico é permitido).
      expect(
        (await patchProduct(app, productId, { stockQty: 2 }, token)).status,
      ).toBe(HTTP_OK);

      const response = await deliverSale(app, sale.id, token);
      expect(response.status).toBe(HTTP_CONFLICT);
      const body = apiErrorSchema.parse(await response.json());
      // Mensagem acionável: precisa dizer o que REALMENTE resta (2), não "0".
      expect(body.error.message).toContain("restam 2 unidades");
      expect(body.error.message).toContain("Delineador");

      const product = productSchema.parse(
        await (await getProduct(app, productId, token)).json(),
      );
      expect(product.stockQty).toBe(2);
      const unchanged = saleSchema.parse(
        await (await getSale(app, sale.id, token)).json(),
      );
      expect(unchanged.status).toBe("open");
      expect(unchanged.deliveredAt).toBeNull();
    });
  });

  describe("quem me deve com o novo plano (CRM-12/RF-09)", () => {
    it("cobrança na entrega entra na lista sem data e sem atraso; anulada nunca aparece", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Creme",
        priceCents: 7_000,
        stockQty: 10,
      });
      const onDeliverySale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "pix",
          paymentCondition: "on_delivery",
          deliveryStatus: "pending",
        },
        token,
      );
      const canceledSale = await createSaleOk(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "pix",
          paymentCondition: "on_delivery",
          deliveryStatus: "pending",
        },
        token,
      );
      expect((await cancelSale(app, canceledSale.id, token)).status).toBe(
        HTTP_OK,
      );

      const pendingList = receivablesListSchema.parse(
        await (await getReceivables(app, token)).json(),
      );
      expect(pendingList.data).toHaveLength(1);
      const [entry] = pendingList.data;
      expect(entry?.saleId).toBe(onDeliverySale.id);
      expect(entry?.dueDate).toBeNull();
      expect(entry?.dueKind).toBe("on_delivery");
      // Sem data não há atraso: `overdue` precisa ser boolean, nunca nulo.
      expect(entry?.overdue).toBe(false);

      // Mesmo no modo histórico a cobrança anulada fica fora da cobrança.
      const allList = receivablesListSchema.parse(
        await (await getReceivables(app, token, "?pending=false")).json(),
      );
      expect(allList.data.some((row) => row.saleId === canceledSale.id)).toBe(
        false,
      );
      // Ela continua visível no detalhe da venda, como histórico anulado.
      const canceledDetail = saleSchema.parse(
        await (await getSale(app, canceledSale.id, token)).json(),
      );
      expect(canceledDetail.receivables[0]?.status).toBe("voided");

      const summary = receivablesSummarySchema.parse(
        await (await getReceivablesSummary(app, token)).json(),
      );
      expect(summary.pendingCents).toBe(onDeliverySale.totalCents);
      expect(summary.overdueCount).toBe(0);
    });
  });

  describe("cross-tenant e escopo (RF-04/05/06)", () => {
    it("GET /sales/:id, cancel e PATCH /receivables de outra consultora ⇒ 404 idêntico ao inexistente", async () => {
      const app = buildApp();
      const { token: tokenA } = await seedConsultantSession(app, CONSULTANT_A);
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const saleB = await seedSale(idB, { totalCents: 5_000 });
      const receivableB = await seedReceivable(saleB, {
        amountCents: 5_000,
        dueDate: FUTURE_DATE,
      });

      // Referências: 404 de ids válidos porém inexistentes no escopo de A.
      const saleReference = apiErrorSchema.parse(
        await (await getSale(app, NONEXISTENT_UUID, tokenA)).json(),
      );
      const cancelReference = apiErrorSchema.parse(
        await (await cancelSale(app, NONEXISTENT_UUID, tokenA)).json(),
      );
      const receivableReference = apiErrorSchema.parse(
        await (
          await patchReceivable(app, NONEXISTENT_UUID, { paid: true }, tokenA)
        ).json(),
      );

      const getResponse = await getSale(app, saleB, tokenA);
      expect(getResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await getResponse.json())).toEqual(
        saleReference,
      );

      const cancelResponse = await cancelSale(app, saleB, tokenA);
      expect(cancelResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await cancelResponse.json())).toEqual(
        cancelReference,
      );

      const patchResponse = await patchReceivable(
        app,
        receivableB,
        { paid: true },
        tokenA,
      );
      expect(patchResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await patchResponse.json())).toEqual(
        receivableReference,
      );

      // A venda/recebível de B seguem intactos (o escopo barrou A).
      const survivors = await ctx.db.select().from(sales);
      expect(survivors).toHaveLength(1);
      expect(survivors[0]?.status).toBe("completed");
    });

    it("GET /sales e /receivables não vazam dados de outra consultora", async () => {
      const app = buildApp();
      const { consultantId: idA, token: tokenA } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const { consultantId: idB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );
      const saleA = await seedSale(idA, {
        totalCents: 1_000,
        clientName: "Da A",
      });
      await seedReceivable(saleA, { amountCents: 1_000, dueDate: FUTURE_DATE });
      const saleB = await seedSale(idB, {
        totalCents: 2_000,
        clientName: "Da B",
      });
      await seedReceivable(saleB, { amountCents: 2_000, dueDate: FUTURE_DATE });

      const sales_ = salesListSchema.parse(
        await (await getSales(app, tokenA)).json(),
      );
      expect(sales_.total).toBe(1);
      expect(sales_.data[0]?.clientName).toBe("Da A");

      const receivablesA = receivablesListSchema.parse(
        await (await getReceivables(app, tokenA)).json(),
      );
      expect(receivablesA.total).toBe(1);
      expect(receivablesA.data[0]?.amountCents).toBe(1_000);
    });

    it("id malformado ⇒ 404 (não 422 nem 500) nas rotas por id", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const getResponse = await getSale(app, "nao-uuid", token);
      expect(getResponse.status).toBe(HTTP_NOT_FOUND);
      expect(getResponse.status).not.toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(getResponse.status).not.toBe(HTTP_INTERNAL_ERROR);
      expect(apiErrorSchema.parse(await getResponse.json()).error.code).toBe(
        SALE_NOT_FOUND_CODE,
      );

      const cancelResponse = await cancelSale(app, "nao-uuid", token);
      expect(cancelResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await cancelResponse.json()).error.code).toBe(
        SALE_NOT_FOUND_CODE,
      );

      const patchResponse = await patchReceivable(
        app,
        "nao-uuid",
        { paid: true },
        token,
      );
      expect(patchResponse.status).toBe(HTTP_NOT_FOUND);
      expect(apiErrorSchema.parse(await patchResponse.json()).error.code).toBe(
        RECEIVABLE_NOT_FOUND_CODE,
      );
    });
  });

  describe("guard default-deny (RF-03/RF-05/RF-06)", () => {
    it("sem token ⇒ 401 nas 7 rotas do módulo", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        postSale(app, { items: [], paymentMethod: "cash" }),
        getSales(app, ""),
        getSale(app, NONEXISTENT_UUID),
        cancelSale(app, NONEXISTENT_UUID),
        getReceivables(app, ""),
        getReceivablesSummary(app),
        patchReceivable(app, NONEXISTENT_UUID, { paid: true }),
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
