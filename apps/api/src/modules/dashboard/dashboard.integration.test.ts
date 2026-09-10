import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  apiErrorSchema,
  dashboardSummarySchema,
  loginResponseSchema,
  productSchema,
  receivablesSummarySchema,
} from "@clientela/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import {
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
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createOrdersRepository } from "../orders/orders.repository";
import { createOrdersService } from "../orders/orders.service";
import { createProductsRepository } from "../products/products.repository";
import { createProductsService } from "../products/products.service";
import { createSalesRepository } from "../sales/sales.repository";
import { createSalesService } from "../sales/sales.service";
import { createDashboardRepository } from "./dashboard.repository";
import { createDashboardService } from "./dashboard.service";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";
const UNAUTHORIZED_CODE = "UNAUTHORIZED";

const CORRECT_PASSWORD = "senha-super-secreta";
const CONSULTANT_A = {
  name: "Consultora A",
  email: "consultora-a-dashboard@example.com",
  whatsapp: "11987654321",
  ip: "203.0.113.10",
} as const;
const CONSULTANT_B = {
  name: "Consultora B",
  email: "consultora-b-dashboard@example.com",
  whatsapp: "11912345678",
  ip: "203.0.113.20",
} as const;

const FUTURE_DUE_DATE = "2027-03-01";
const OVERDUE_DATE_EARLY = "2020-01-01";
const OVERDUE_DATE_LATE = "2020-06-01";

// Fora do mês corrente sob qualquer data real de execução do teste: retrodata
// mais de 2 anos, bem além de qualquer borda de mês/fuso (RF-04).
const PAST_MONTH_SOLD_AT = new Date("2020-03-15T12:00:00.000Z");

// Hasher real de KDF do Node (scrypt): os workers do Vitest rodam sob Node,
// onde o global `Bun` (argon2id) não existe. Espelha sales/products/clients.
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

describe("dashboard (integração)", () => {
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

  type SeedSaleValues = {
    totalCents: number;
    status?: "completed" | "canceled";
    soldAt?: Date;
  };

  // Semeadura direta de venda: o comportamento sob teste é o agregado do
  // painel, não o POST /sales — controle total de status/soldAt.
  const seedSale = async (
    consultantId: string,
    values: SeedSaleValues,
  ): Promise<string> => {
    const timestamp = values.soldAt ?? new Date();
    const status = values.status ?? "completed";
    const [row] = await ctx.db
      .insert(sales)
      .values({
        consultantId,
        clientId: null,
        clientName: "Cliente Semeada",
        totalCents: values.totalCents,
        paymentMethod: "cash",
        paymentCondition: "received",
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

  type SeedSaleItemValues = {
    productName: string;
    qty: number;
    unitPriceCents: number;
    costCents: number;
  };

  const seedSaleItem = async (
    saleId: string,
    values: SeedSaleItemValues,
  ): Promise<void> => {
    await ctx.db.insert(saleItems).values({
      saleId,
      productId: null,
      productName: values.productName,
      qty: values.qty,
      unitPriceCents: values.unitPriceCents,
      costCents: values.costCents,
    });
  };

  const seedReceivable = async (
    saleId: string,
    values: {
      amountCents: number;
      dueDate: string;
      paidAt?: Date | null;
      voidedAt?: Date | null;
    },
  ): Promise<void> => {
    const timestamp = values.paidAt ?? values.voidedAt ?? new Date();
    await ctx.db.insert(receivables).values({
      saleId,
      amountCents: values.amountCents,
      dueDate: values.dueDate,
      paidAt: values.paidAt ?? null,
      voidedAt: values.voidedAt ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };

  type SeedProductValues = {
    name: string;
    costCents: number;
    purchaseDiscountBps?: number | null;
    priceCents: number;
    stockQty: number;
  };

  const seedProduct = async (
    consultantId: string,
    values: SeedProductValues,
  ): Promise<string> => {
    const [row] = await ctx.db
      .insert(products)
      .values({ consultantId, ...values })
      .returning({ id: products.id });
    if (!row) {
      throw new Error("falha ao semear o produto de teste");
    }
    return row.id;
  };

  // ------------------------- requesters HTTP -------------------------

  const getSummary = (app: App, token?: string): Promise<Response> =>
    app.handle(
      new Request("http://localhost/dashboard/summary", {
        method: "GET",
        headers: token ? bearer(token) : {},
      }),
    );

  const putGoal = (
    app: App,
    body: unknown,
    token?: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/dashboard/goal", {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      }),
    );

  const postSale = (
    app: App,
    body: unknown,
    token: string,
  ): Promise<Response> =>
    app.handle(
      new Request("http://localhost/sales", {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
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

  const getReceivablesSummary = (app: App, token: string): Promise<Response> =>
    app.handle(
      new Request("http://localhost/receivables/summary", {
        method: "GET",
        headers: bearer(token),
      }),
    );

  // -------------------------------------------------------------------------
  // RF-04 — agregados do mês
  // -------------------------------------------------------------------------
  describe("GET /dashboard/summary — agregados do mês (RF-04)", () => {
    it("sem dados ⇒ zeros e monthlyGoalCents null", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const response = await getSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      const summary = dashboardSummarySchema.parse(await response.json());

      expect(summary).toMatchObject({
        monthSalesCents: 0,
        monthSalesCount: 0,
        monthProfitCents: 0,
        pendingReceivablesCents: 0,
        overdueReceivablesCents: 0,
        overdueReceivablesCount: 0,
        monthlyGoalCents: null,
      });
      expect(summary.monthLabel.length).toBeGreaterThan(0);
    });

    it("soma vendas/itens do mês corrente com fixtures exatas; exclui cancelada, mês anterior e outra consultora", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const { consultantId: consultantB } = await seedConsultantSession(
        app,
        CONSULTANT_B,
      );

      // Venda 1 (mês corrente, completed): 2 itens.
      const sale1 = await seedSale(consultantId, { totalCents: 13_000 });
      await seedSaleItem(sale1, {
        productName: "Batom",
        qty: 2,
        unitPriceCents: 5_000,
        costCents: 2_000,
      });
      await seedSaleItem(sale1, {
        productName: "Base",
        qty: 1,
        unitPriceCents: 3_000,
        costCents: 1_000,
      });

      // Venda 2 (mês corrente, completed): 1 item.
      const sale2 = await seedSale(consultantId, { totalCents: 3_000 });
      await seedSaleItem(sale2, {
        productName: "Rímel",
        qty: 3,
        unitPriceCents: 1_000,
        costCents: 400,
      });

      // Venda cancelada no mês corrente: fora das somas (RF-06).
      const canceledSale = await seedSale(consultantId, {
        totalCents: 999_999,
        status: "canceled",
      });
      await seedSaleItem(canceledSale, {
        productName: "Não Deve Contar",
        qty: 10,
        unitPriceCents: 99_999,
        costCents: 1,
      });

      // Venda de mês anterior (retrodatada): fora das somas.
      const pastSale = await seedSale(consultantId, {
        totalCents: 50_000,
        soldAt: PAST_MONTH_SOLD_AT,
      });
      await seedSaleItem(pastSale, {
        productName: "Mês Anterior",
        qty: 1,
        unitPriceCents: 50_000,
        costCents: 10_000,
      });

      // Venda de outra consultora no mês corrente: fora do escopo de A.
      const saleB = await seedSale(consultantB, { totalCents: 77_000 });
      await seedSaleItem(saleB, {
        productName: "Da Consultora B",
        qty: 1,
        unitPriceCents: 77_000,
        costCents: 1_000,
      });

      const response = await getSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      const summary = dashboardSummarySchema.parse(await response.json());

      // totalCents: 13000 + 3000 = 16000; contagem = 2 vendas.
      expect(summary.monthSalesCents).toBe(16_000);
      expect(summary.monthSalesCount).toBe(2);
      // lucro: (5000-2000)*2 + (3000-1000)*1 + (1000-400)*3 = 6000+2000+1800=9800.
      expect(summary.monthProfitCents).toBe(9_800);
    });

    it("venda com unitPriceCents ABAIXO do custo ⇒ monthProfitCents negativo serializa sem erro", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Perfume Premium",
        costCents: 4_000,
        priceCents: 9_990,
        stockQty: 10,
      });

      const saleResponse = await postSale(
        app,
        {
          items: [{ productId, qty: 1, unitPriceCents: 3_000 }],
          paymentMethod: "cash",
        },
        token,
      );
      expect(saleResponse.status).toBe(HTTP_CREATED);

      const response = await getSummary(app, token);
      expect(response.status).toBe(HTTP_OK);
      const summary = dashboardSummarySchema.parse(await response.json());

      // (3000 - 4000) * 1 = -1000.
      expect(summary.monthProfitCents).toBe(-1_000);
      expect(summary.monthSalesCents).toBe(3_000);
    });

    it("lucro permanece baseado no snapshot da venda após mudar o desconto do produto", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const productId = await seedProduct(consultantId, {
        name: "Produto com Desconto",
        costCents: 6_494,
        purchaseDiscountBps: 3_500,
        priceCents: 9_990,
        stockQty: 10,
      });

      const saleResponse = await postSale(
        app,
        {
          items: [{ productId, qty: 1 }],
          paymentMethod: "cash",
        },
        token,
      );
      expect(saleResponse.status).toBe(HTTP_CREATED);

      const before = dashboardSummarySchema.parse(
        await (await getSummary(app, token)).json(),
      );
      expect(before.monthSalesCents).toBe(9_990);
      expect(before.monthProfitCents).toBe(3_496);

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

      const after = dashboardSummarySchema.parse(
        await (await getSummary(app, token)).json(),
      );
      expect(after.monthSalesCents).toBe(9_990);
      expect(after.monthProfitCents).toBe(3_496);
    });

    it("recebíveis do summary batem com o endpoint /receivables/summary existente", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const sale = await seedSale(consultantId, { totalCents: 100_000 });
      // Pendente futura: 4000 (não atrasada).
      await seedReceivable(sale, {
        amountCents: 4_000,
        dueDate: FUTURE_DUE_DATE,
      });
      // Pendentes atrasadas: 3000 + 2500 = 5500 (2 contagens).
      await seedReceivable(sale, {
        amountCents: 3_000,
        dueDate: OVERDUE_DATE_EARLY,
      });
      await seedReceivable(sale, {
        amountCents: 2_500,
        dueDate: OVERDUE_DATE_LATE,
      });
      // Paga atrasada: fora de pendente/atrasado.
      await seedReceivable(sale, {
        amountCents: 9_999,
        dueDate: OVERDUE_DATE_EARLY,
        paidAt: new Date("2020-02-01T10:00:00Z"),
      });

      const dashboardResponse = await getSummary(app, token);
      const summary = dashboardSummarySchema.parse(
        await dashboardResponse.json(),
      );
      const receivablesResponse = await getReceivablesSummary(app, token);
      const receivablesTotals = receivablesSummarySchema.parse(
        await receivablesResponse.json(),
      );

      expect(summary.pendingReceivablesCents).toBe(
        receivablesTotals.pendingCents,
      );
      expect(summary.overdueReceivablesCents).toBe(
        receivablesTotals.overdueCents,
      );
      expect(summary.overdueReceivablesCount).toBe(
        receivablesTotals.overdueCount,
      );
      expect(summary.pendingReceivablesCents).toBe(9_500);
      expect(summary.overdueReceivablesCents).toBe(5_500);
      expect(summary.overdueReceivablesCount).toBe(2);
    });

    it("parcela ANULADA de venda cancelada fica fora de pendente e de atrasado", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );
      const activeSale = await seedSale(consultantId, { totalCents: 10_000 });
      await seedReceivable(activeSale, {
        amountCents: 4_000,
        dueDate: OVERDUE_DATE_EARLY,
      });
      // Venda cancelada: a cobrança é ANULADA, não apagada (CRM-12/RF-08).
      // Dívida anulada não é dívida — não pode inflar "a receber" nem "atrasado".
      const canceledSale = await seedSale(consultantId, {
        totalCents: 50_000,
        status: "canceled",
      });
      await seedReceivable(canceledSale, {
        amountCents: 50_000,
        dueDate: OVERDUE_DATE_EARLY,
        voidedAt: new Date("2020-02-01T10:00:00Z"),
      });

      const summary = dashboardSummarySchema.parse(
        await (await getSummary(app, token)).json(),
      );
      const receivablesTotals = receivablesSummarySchema.parse(
        await (await getReceivablesSummary(app, token)).json(),
      );

      expect(summary.pendingReceivablesCents).toBe(4_000);
      expect(summary.overdueReceivablesCents).toBe(4_000);
      expect(summary.overdueReceivablesCount).toBe(1);
      expect(summary.pendingReceivablesCents).toBe(
        receivablesTotals.pendingCents,
      );
      expect(summary.overdueReceivablesCount).toBe(
        receivablesTotals.overdueCount,
      );
    });
  });

  // -------------------------------------------------------------------------
  // RF-04 — meta mensal
  // -------------------------------------------------------------------------
  describe("PUT /dashboard/goal — meta mensal (RF-04)", () => {
    it("grava a meta e reflete no summary; remover com null limpa a meta", async () => {
      const app = buildApp();
      const { consultantId, token } = await seedConsultantSession(
        app,
        CONSULTANT_A,
      );

      const setResponse = await putGoal(
        app,
        { monthlyGoalCents: 150_000 },
        token,
      );
      expect(setResponse.status).toBe(HTTP_OK);
      expect(await setResponse.json()).toEqual({ monthlyGoalCents: 150_000 });

      const afterSet = dashboardSummarySchema.parse(
        await (await getSummary(app, token)).json(),
      );
      expect(afterSet.monthlyGoalCents).toBe(150_000);

      const [row] = await ctx.db
        .select({ monthlyGoalCents: consultants.monthlyGoalCents })
        .from(consultants)
        .where(eq(consultants.id, consultantId));
      expect(row?.monthlyGoalCents).toBe(150_000);

      const removeResponse = await putGoal(
        app,
        { monthlyGoalCents: null },
        token,
      );
      expect(removeResponse.status).toBe(HTTP_OK);
      expect(await removeResponse.json()).toEqual({ monthlyGoalCents: null });

      const afterRemove = dashboardSummarySchema.parse(
        await (await getSummary(app, token)).json(),
      );
      expect(afterRemove.monthlyGoalCents).toBeNull();
    });

    it("0, negativo e acima do teto ⇒ 422 VALIDATION_ERROR pt-BR", async () => {
      const app = buildApp();
      const { token } = await seedConsultantSession(app, CONSULTANT_A);

      const zero = await putGoal(app, { monthlyGoalCents: 0 }, token);
      expect(zero.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const zeroBody = apiErrorSchema.parse(await zero.json());
      expect(zeroBody.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(zeroBody.error.message).toMatch(/maior que zero/i);

      const negative = await putGoal(app, { monthlyGoalCents: -100 }, token);
      expect(negative.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      expect(apiErrorSchema.parse(await negative.json()).error.code).toBe(
        VALIDATION_ERROR_CODE,
      );

      const aboveCap = await putGoal(
        app,
        { monthlyGoalCents: 100_000_001 },
        token,
      );
      expect(aboveCap.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
      const aboveCapBody = apiErrorSchema.parse(await aboveCap.json());
      expect(aboveCapBody.error.code).toBe(VALIDATION_ERROR_CODE);
      expect(aboveCapBody.error.message).toMatch(/1\.000\.000/);
    });
  });

  // -------------------------------------------------------------------------
  // Guard default-deny
  // -------------------------------------------------------------------------
  describe("guard default-deny", () => {
    it("sem token ⇒ 401 nas duas rotas novas", async () => {
      const app = buildApp();

      const responses = await Promise.all([
        getSummary(app),
        putGoal(app, { monthlyGoalCents: 1_000 }),
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
