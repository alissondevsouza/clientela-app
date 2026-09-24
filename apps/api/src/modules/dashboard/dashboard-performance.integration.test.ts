import {
  apiErrorSchema,
  dashboardPerformanceSchema,
  daysRemainingInMonth,
  paginated,
  receivableListItemSchema,
  saleListItemSchema,
  updateGoalResponseSchema,
} from "@clientela/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createClient,
  createConsultant,
  createConsultantSession,
  createMonthlyGoal,
  createSale,
} from "../../../test/factories";
import { testPasswordHasher } from "../../../test/factories/consultants";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { monthlyGoals } from "../../db/schema";
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
import { createAuthService, generateSecureToken } from "../auth/auth.service";
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
import { createDashboardService } from "./dashboard.service";
import { createDashboardPerformanceRepository } from "./dashboard-performance.repository";
import { createDashboardTodayRepository } from "./dashboard-today.repository";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";
const SALES_MAX_PER_PAGE = 100;

// "Hoje" fixo (RF-04/testing.md): meio-dia local de 23/09/2026 — mês corrente
// para a maioria dos casos. 2026-08 (mês anterior) fica FECHADO sob este
// relógio (endDate = último dia do mês, sem a truncagem de "em andamento"),
// o que simplifica os cálculos de agregados exatos.
const CLOCK_MID_SEPTEMBER = new Date("2026-09-23T15:00:00.000Z");

const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

const jsonHeaders = (token?: string): Record<string, string> => ({
  "content-type": "application/json",
  ...(token ? bearer(token) : {}),
});

describe("GET /dashboard/performance, PUT /dashboard/goal (crm-home-period-and-daily-hub, Task 4.4)", () => {
  let ctx: PgTestContext;
  // Relógio mutável (mesmo padrão de sales-filters.integration.test.ts): cada
  // teste ajusta ANTES de `buildApp()` — dashboard e sales compartilham o
  // mesmo relógio injetado (RF-04: "hoje" é uma decisão só, nunca duas).
  let clockNow: Date;

  beforeAll(async () => {
    ctx = await startPgContainer();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterEach(async () => {
    await ctx.truncateAll();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  const buildApp = () => {
    const authService = createAuthService({
      repository: createAuthRepository(ctx.db),
      clock: () => new Date(),
      hasher: testPasswordHasher,
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
      clock: () => clockNow,
    });
    const ordersService = createOrdersService({
      repository: createOrdersRepository(ctx.db),
    });
    const dashboardService = createDashboardService({
      performanceRepository: createDashboardPerformanceRepository(ctx.db),
      todayRepository: createDashboardTodayRepository(ctx.db),
      clock: () => clockNow,
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

  const seedConsultantSession = async (): Promise<{
    consultantId: string;
    token: string;
  }> => {
    const consultant = await createConsultant(ctx.db);
    const session = await createConsultantSession(ctx.db, consultant.id);
    return { consultantId: consultant.id, token: session.token };
  };

  const getPerformance = (
    app: App,
    token: string | undefined,
    query = "",
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/dashboard/performance${query}`, {
        headers: token ? bearer(token) : {},
      }),
    );

  const getToday = (app: App, token?: string): Promise<Response> =>
    app.handle(
      new Request("http://localhost/dashboard/today", {
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

  const deleteSale = (
    app: App,
    saleId: string,
    token: string,
  ): Promise<Response> =>
    app.handle(
      new Request(`http://localhost/sales/${saleId}`, {
        method: "DELETE",
        headers: bearer(token),
      }),
    );

  // Soma/contagem de TODAS as páginas de `GET /sales` (invariante RF-14): o
  // teste nunca assume que os fixtures cabem numa página só.
  const sumAllSales = async (
    app: App,
    token: string,
    query: string,
  ): Promise<{ totalCents: number; count: number }> => {
    let page = 1;
    let totalCents = 0;
    let count = 0;
    for (;;) {
      const response = await app.handle(
        new Request(
          `http://localhost/sales?${query}&page=${page}&perPage=${SALES_MAX_PER_PAGE}`,
          { headers: bearer(token) },
        ),
      );
      expect(response.status).toBe(HTTP_OK);
      const body = paginated(saleListItemSchema).parse(await response.json());
      totalCents += body.data.reduce((sum, item) => sum + item.totalCents, 0);
      count += body.data.length;
      if (body.data.length < body.perPage) {
        break;
      }
      page += 1;
    }
    return { totalCents, count };
  };

  // Soma de TODAS as páginas de `GET /receivables` (invariante RF-15).
  const sumAllReceivables = async (
    app: App,
    token: string,
    query: string,
  ): Promise<number> => {
    let page = 1;
    let amountCents = 0;
    for (;;) {
      const response = await app.handle(
        new Request(
          `http://localhost/receivables?${query}&page=${page}&perPage=${SALES_MAX_PER_PAGE}`,
          { headers: bearer(token) },
        ),
      );
      expect(response.status).toBe(HTTP_OK);
      const body = paginated(receivableListItemSchema).parse(
        await response.json(),
      );
      amountCents += body.data.reduce((sum, item) => sum + item.amountCents, 0);
      if (body.data.length < body.perPage) {
        break;
      }
      page += 1;
    }
    return amountCents;
  };

  // ---------------------------------------------------------------------
  // RF-04 — fuso: venda às 23:30 locais de 31/08 conta em agosto, não em
  // setembro (o instante em UTC já cai em 01/09).
  // ---------------------------------------------------------------------
  it("RF-04: venda às 23:30 locais de 31/08 conta no Vendido de agosto, não no de setembro", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    // 2026-09-01T02:30:00.000Z = 2026-08-31 23:30 no fuso da app (UTC-3, sem
    // DST desde 2019 — ADR-0018): o dia LOCAL da venda é 31/08.
    await createSale(ctx.db, consultantId, {
      status: "completed",
      soldAt: new Date("2026-09-01T02:30:00.000Z"),
      delivered: true,
      items: [
        {
          productName: "Item de borda",
          qty: 1,
          unitPriceCents: 10_000,
          costCents: 4_000,
        },
      ],
      receivables: [
        {
          amountCents: 10_000,
          dueKind: "scheduled",
          dueDate: "2026-08-31",
          paidAt: new Date("2026-09-01T02:30:00.000Z"),
        },
      ],
    });

    const august = dashboardPerformanceSchema.parse(
      await (
        await getPerformance(app, token, "?period=month&month=2026-08")
      ).json(),
    );
    expect(august.current.soldCents).toBe(10_000);
    expect(august.current.soldCount).toBe(1);

    const september = dashboardPerformanceSchema.parse(
      await (
        await getPerformance(app, token, "?period=month&month=2026-09")
      ).json(),
    );
    expect(september.current.soldCents).toBe(0);
    expect(september.current.soldCount).toBe(0);
  });

  // ---------------------------------------------------------------------
  // RF-05 — escopo Vendido/Lucro/Recebido/Clientes atendidas, num mês
  // FECHADO (agosto) com dados mistos: aberta não entregue, aberta entregue
  // com parcela pendente, concluída, cancelada e excluída. As mesmas somas
  // são conferidas contra a invariante lista = cartão (RF-14/RF-15).
  // ---------------------------------------------------------------------
  it("RF-05: Vendido/Lucro/Recebido/clientesCount do mês fechado batem com fixtures mistas e com a invariante lista = cartão", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const clientX = await createClient(ctx.db, consultantId, {
      name: "Cliente X",
    });
    const clientY = await createClient(ctx.db, consultantId, {
      name: "Cliente Y",
    });

    // Sale 1 — ABERTA, NÃO entregue, com cliente X. Uma parcela paga fora do
    // período (setembro) e outra pendente — o Recebido de agosto NÃO soma a
    // parcela paga em setembro (RF-05: "exclui baixa fora do período").
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-08-03T12:00:00.000Z"),
      clientId: clientX.id,
      items: [
        {
          productName: "Batom Vermelho",
          qty: 1,
          unitPriceCents: 20_000,
          costCents: 8_000,
        },
      ],
      receivables: [
        {
          amountCents: 12_000,
          dueKind: "scheduled",
          dueDate: "2026-08-20",
        },
        {
          amountCents: 8_000,
          dueKind: "scheduled",
          dueDate: "2026-08-05",
          paidAt: new Date("2026-09-05T12:00:00.000Z"),
        },
      ],
    });

    // Sale 2 — ABERTA, entregue, SEM cliente (anônima), com uma parcela paga
    // DENTRO do período e outra pendente ("aberta entregue com parcela
    // pendente" — RF-05).
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-08-10T12:00:00.000Z"),
      delivered: true,
      clientName: "Cliente Anônima",
      items: [
        {
          productName: "Base Facial",
          qty: 1,
          unitPriceCents: 15_000,
          costCents: 5_000,
        },
      ],
      receivables: [
        {
          amountCents: 8_000,
          dueKind: "scheduled",
          dueDate: "2026-08-08",
          paidAt: new Date("2026-08-20T12:00:00.000Z"),
        },
        {
          amountCents: 7_000,
          dueKind: "scheduled",
          dueDate: "2026-12-01",
        },
      ],
    });

    // Sale 3 — CONCLUÍDA, cliente Y (distinta de X), tudo pago dentro do
    // período.
    await createSale(ctx.db, consultantId, {
      status: "completed",
      soldAt: new Date("2026-08-05T12:00:00.000Z"),
      delivered: true,
      clientId: clientY.id,
      items: [
        {
          productName: "Perfume Floral",
          qty: 1,
          unitPriceCents: 30_000,
          costCents: 10_000,
        },
      ],
      receivables: [
        {
          amountCents: 30_000,
          dueKind: "scheduled",
          dueDate: "2026-08-05",
          paidAt: new Date("2026-08-25T12:00:00.000Z"),
        },
      ],
    });

    // Sale 4 — CANCELADA: fora do Vendido/Lucro; a parcela anulada nunca foi
    // paga, então também não entra no Recebido.
    await createSale(ctx.db, consultantId, {
      status: "canceled",
      soldAt: new Date("2026-08-12T12:00:00.000Z"),
      clientId: clientX.id,
      items: [
        {
          productName: "Não deve contar (cancelada)",
          qty: 1,
          unitPriceCents: 50_000,
          costCents: 1,
        },
      ],
      receivables: [
        {
          amountCents: 50_000,
          dueKind: "scheduled",
          dueDate: "2026-08-12",
          voidedAt: new Date("2026-08-12T12:00:00.000Z"),
        },
      ],
    });

    // Sale 5 — EXCLUÍDA (DELETE /sales/:id): some de tudo, inclusive do
    // Recebido, por cascata.
    const deletedSale = await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-08-08T12:00:00.000Z"),
      items: [
        {
          productName: "Não deve contar (excluída)",
          qty: 1,
          unitPriceCents: 99_999,
          costCents: 1,
        },
      ],
      receivables: [
        {
          amountCents: 99_999,
          dueKind: "scheduled",
          dueDate: "2026-12-01",
        },
      ],
    });
    const deleteResponse = await deleteSale(app, deletedSale.id, token);
    expect(deleteResponse.status).toBe(204);

    const august = dashboardPerformanceSchema.parse(
      await (
        await getPerformance(app, token, "?period=month&month=2026-08")
      ).json(),
    );

    expect(august.current).toEqual({
      soldCents: 65_000, // 20_000 + 15_000 + 30_000
      soldCount: 3,
      profitCents: 42_000, // 12_000 + 10_000 + 20_000
      receivedCents: 38_000, // 8_000 (sale 2) + 30_000 (sale 3)
      clientsCount: 2, // clientX (sale 1) e clientY (sale 3) — sale 2 é anônima
    });

    // topProducts: mesma qty (1) para os três — desempate por soldCents desc.
    expect(august.topProducts.map((item) => item.name)).toEqual([
      "Perfume Floral",
      "Batom Vermelho",
      "Base Facial",
    ]);
    // topClients: só vendas com cliente, ordenadas por soldCents desc.
    expect(august.topClients.map((item) => item.name)).toEqual([
      "Cliente Y",
      "Cliente X",
    ]);

    // Série de 12 meses terminando em agosto: só agosto tem movimento.
    expect(august.series).toHaveLength(12);
    const augustSeriesEntry = august.series.find(
      (entry) => entry.month === "2026-08",
    );
    expect(augustSeriesEntry).toEqual({
      month: "2026-08",
      soldCents: 65_000,
      profitCents: 42_000,
    });
    const otherMonths = august.series.filter(
      (entry) => entry.month !== "2026-08",
    );
    for (const entry of otherMonths) {
      expect(entry.soldCents).toBe(0);
      expect(entry.profitCents).toBe(0);
    }

    // A parcela de sale 1 paga em SETEMBRO conta no Recebido de setembro,
    // não no de agosto (mesmo de venda fora do escopo Vendido do período).
    const september = dashboardPerformanceSchema.parse(
      await (
        await getPerformance(app, token, "?period=month&month=2026-09")
      ).json(),
    );
    expect(september.current.receivedCents).toBe(8_000);
    expect(september.current.soldCents).toBe(0);

    // Invariante RF-14: soma/contagem de TODAS as páginas de
    // `GET /sales?status=sold&soldFrom=<startDate>&soldTo=<endDate>` = cartão.
    const salesInvariant = await sumAllSales(
      app,
      token,
      "status=sold&soldFrom=2026-08-01&soldTo=2026-08-31",
    );
    expect(salesInvariant.totalCents).toBe(august.current.soldCents);
    expect(salesInvariant.count).toBe(august.current.soldCount);

    // Invariante RF-15: soma de `GET /receivables?pending=false&paidFrom=…
    // &paidTo=…` = Recebido do cartão.
    const receivedInvariant = await sumAllReceivables(
      app,
      token,
      "pending=false&paidFrom=2026-08-01&paidTo=2026-08-31",
    );
    expect(receivedInvariant).toBe(august.current.receivedCents);
  });

  it("RF-05: lucro pode ser negativo e serializa sem 500 (venda com preço abaixo do custo)", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-08-15T12:00:00.000Z"),
      items: [
        {
          productName: "Item no prejuízo",
          qty: 1,
          unitPriceCents: 3_000,
          costCents: 10_000,
        },
      ],
      receivables: [
        { amountCents: 3_000, dueKind: "scheduled", dueDate: "2026-09-01" },
      ],
    });

    const response = await getPerformance(
      app,
      token,
      "?period=month&month=2026-08",
    );
    expect(response.status).toBe(HTTP_OK);
    const august = dashboardPerformanceSchema.parse(await response.json());

    expect(august.current.profitCents).toBe(-7_000);
  });

  it("RF-05: escopo por consultora — vendas de outra consultora nunca aparecem", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const { consultantId: otherConsultantId } = await seedConsultantSession();

    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-08-10T12:00:00.000Z"),
      items: [
        {
          productName: "Item da consultora A",
          qty: 1,
          unitPriceCents: 10_000,
          costCents: 4_000,
        },
      ],
      receivables: [
        { amountCents: 10_000, dueKind: "scheduled", dueDate: "2026-09-01" },
      ],
    });
    await createSale(ctx.db, otherConsultantId, {
      status: "open",
      soldAt: new Date("2026-08-11T12:00:00.000Z"),
      items: [
        {
          productName: "Item da consultora B",
          qty: 1,
          unitPriceCents: 999_999,
          costCents: 1,
        },
      ],
      receivables: [
        { amountCents: 999_999, dueKind: "scheduled", dueDate: "2026-09-01" },
      ],
    });

    const august = dashboardPerformanceSchema.parse(
      await (
        await getPerformance(app, token, "?period=month&month=2026-08")
      ).json(),
    );

    expect(august.current.soldCents).toBe(10_000);
    expect(august.current.soldCount).toBe(1);
  });

  it("RF-11/A3a: current e previous exatos via HTTP, no MESMO trecho (mês em andamento vs. mesmo trecho do mês anterior)", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { consultantId: ownerId, token: ownerToken } =
      await seedConsultantSession();

    // Current (1–23/09, em andamento): uma venda dentro do trecho.
    await createSale(ctx.db, ownerId, {
      status: "open",
      soldAt: new Date("2026-09-10T12:00:00.000Z"),
      items: [
        {
          productName: "Item de setembro",
          qty: 1,
          unitPriceCents: 40_000,
          costCents: 15_000,
        },
      ],
      receivables: [{ amountCents: 40_000, dueKind: "on_delivery" }],
    });

    // Previous (1–23/08, MESMO trecho): uma venda DENTRO do trecho...
    await createSale(ctx.db, ownerId, {
      status: "completed",
      soldAt: new Date("2026-08-15T12:00:00.000Z"),
      delivered: true,
      items: [
        {
          productName: "Item de agosto (dentro do trecho)",
          qty: 2,
          unitPriceCents: 10_000,
          costCents: 4_000,
        },
      ],
      receivables: [
        {
          amountCents: 20_000,
          dueKind: "scheduled",
          dueDate: "2026-08-15",
          paidAt: new Date("2026-08-15T12:00:00.000Z"),
        },
      ],
    });
    // ...e outra FORA do trecho (24–31/08) — prova que "previous" é o MESMO
    // trecho, não o mês de agosto inteiro.
    await createSale(ctx.db, ownerId, {
      status: "open",
      soldAt: new Date("2026-08-28T12:00:00.000Z"),
      items: [
        {
          productName: "Fora do trecho de comparação",
          qty: 1,
          unitPriceCents: 99_000,
          costCents: 1,
        },
      ],
      receivables: [{ amountCents: 99_000, dueKind: "on_delivery" }],
    });

    const response = await getPerformance(app, ownerToken, "?period=month");
    const performance = dashboardPerformanceSchema.parse(await response.json());

    expect(performance.current).toEqual({
      soldCents: 40_000,
      soldCount: 1,
      profitCents: 25_000,
      receivedCents: 0,
      clientsCount: 0,
    });
    expect(performance.previous).toEqual({
      soldCents: 20_000, // só a venda de 15/08 (dentro de 1–23/08)
      soldCount: 1,
      profitCents: 12_000, // (10_000 - 4_000) * 2
      receivedCents: 20_000,
      clientsCount: 0,
    });
  });

  // ---------------------------------------------------------------------
  // RF-11 — validação do período/401
  // ---------------------------------------------------------------------
  it("RF-11: mês futuro ⇒ 422 VALIDATION_ERROR (nunca 500 cru)", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const response = await getPerformance(
      app,
      token,
      "?period=month&month=2026-10",
    );

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
  });

  it("RF-11: parâmetro que não pertence ao period escolhido ⇒ 422", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const response = await getPerformance(
      app,
      token,
      "?period=year&month=2026-09",
    );

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
  });

  it("RF-11/RF-26: sem token ⇒ 401 em performance, today e goal", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();

    const responses = await Promise.all([
      getPerformance(app, undefined),
      getToday(app, undefined),
      putGoal(app, { monthlyGoalCents: 1_000 }, undefined),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
    }
  });

  // ---------------------------------------------------------------------
  // RF-07/RF-09/RF-10 — meta por mês
  // ---------------------------------------------------------------------
  it("RF-09: PUT grava o mês corrente pelo relógio do servidor, inclusive às 23h30 locais do último dia do mês; segundo PUT atualiza sem duplicar; null remove", async () => {
    // 2026-10-01T02:30:00.000Z = 2026-09-30 23:30 no fuso da app: a virada de
    // mês local só acontece à meia-noite local, não à meia-noite UTC.
    clockNow = new Date("2026-10-01T02:30:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const firstPut = await putGoal(app, { monthlyGoalCents: 100_000 }, token);
    expect(firstPut.status).toBe(HTTP_OK);
    expect(updateGoalResponseSchema.parse(await firstPut.json())).toEqual({
      month: "2026-09",
      monthlyGoalCents: 100_000,
    });

    const rowsAfterFirst = await ctx.db
      .select({
        goalCents: monthlyGoals.goalCents,
        monthStart: monthlyGoals.monthStart,
      })
      .from(monthlyGoals)
      .where(eq(monthlyGoals.consultantId, consultantId));
    expect(rowsAfterFirst).toHaveLength(1);
    expect(rowsAfterFirst[0]).toEqual({
      goalCents: 100_000,
      monthStart: "2026-09-01",
    });

    const secondPut = await putGoal(app, { monthlyGoalCents: 150_000 }, token);
    expect(secondPut.status).toBe(HTTP_OK);
    expect(updateGoalResponseSchema.parse(await secondPut.json())).toEqual({
      month: "2026-09",
      monthlyGoalCents: 150_000,
    });

    const rowsAfterSecond = await ctx.db
      .select({ goalCents: monthlyGoals.goalCents })
      .from(monthlyGoals)
      .where(eq(monthlyGoals.consultantId, consultantId));
    expect(rowsAfterSecond).toHaveLength(1);
    expect(rowsAfterSecond[0]?.goalCents).toBe(150_000);

    const removePut = await putGoal(app, { monthlyGoalCents: null }, token);
    expect(removePut.status).toBe(HTTP_OK);
    expect(updateGoalResponseSchema.parse(await removePut.json())).toEqual({
      month: "2026-09",
      monthlyGoalCents: null,
    });

    const rowsAfterRemove = await ctx.db
      .select({ goalCents: monthlyGoals.goalCents })
      .from(monthlyGoals)
      .where(eq(monthlyGoals.consultantId, consultantId));
    expect(rowsAfterRemove).toHaveLength(1);
    expect(rowsAfterRemove[0]?.goalCents).toBeNull();

    // A6: depois de remover, o mês corrente tem uma linha PRÓPRIA com
    // `goal_cents = NULL` — o contrato nunca pode dizer "explicit"/"inherited"
    // com `goalCents: null` (RF-07: NULL = "sem meta a partir deste mês").
    const afterRemoveResponse = await getPerformance(
      app,
      token,
      "?period=month",
    );
    const afterRemove = dashboardPerformanceSchema.parse(
      await afterRemoveResponse.json(),
    );
    expect(afterRemove.goal).toEqual({
      month: "2026-09",
      goalCents: null,
      source: "none",
      inheritedFromMonth: null,
      editable: true,
      daysRemaining: daysRemainingInMonth("2026-09-30"),
    });
  });

  it("RF-07/A6: mês seguinte sem linha própria herda a remoção do mês anterior ⇒ source 'none' (nunca 'inherited' com goalCents null)", async () => {
    clockNow = new Date("2026-10-15T12:00:00.000Z"); // 15/10 local
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    // Linha de setembro com goal_cents NULL: uma remoção explícita feita em
    // setembro — outubro não tem linha própria e por herança "normal" cairia
    // na linha de setembro.
    await createMonthlyGoal(ctx.db, consultantId, "2026-09-01", null);

    const response = await getPerformance(
      app,
      token,
      "?period=month&month=2026-10",
    );
    const october = dashboardPerformanceSchema.parse(await response.json());

    expect(october.goal).toEqual({
      month: "2026-10",
      goalCents: null,
      source: "none",
      inheritedFromMonth: null,
      editable: true,
      daysRemaining: daysRemainingInMonth("2026-10-15"),
    });
  });

  it("RF-09: 0, negativo e acima do teto ⇒ 422 VALIDATION_ERROR pt-BR", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const zero = await putGoal(app, { monthlyGoalCents: 0 }, token);
    expect(zero.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    expect(apiErrorSchema.parse(await zero.json()).error.code).toBe(
      VALIDATION_ERROR_CODE,
    );

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
    expect(apiErrorSchema.parse(await aboveCap.json()).error.code).toBe(
      VALIDATION_ERROR_CODE,
    );
  });

  it("RF-07/RF-10: meta de agosto herda em setembro sem linha própria; goal só existe para period=month, com source/inheritedFromMonth/editable/daysRemaining corretos", async () => {
    clockNow = CLOCK_MID_SEPTEMBER;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    await createMonthlyGoal(ctx.db, consultantId, "2026-08-01", 80_000);

    const septemberResponse = await getPerformance(
      app,
      token,
      "?period=month&month=2026-09",
    );
    expect(septemberResponse.status).toBe(HTTP_OK);
    const september = dashboardPerformanceSchema.parse(
      await septemberResponse.json(),
    );

    expect(september.goal).toEqual({
      month: "2026-09",
      goalCents: 80_000,
      source: "inherited",
      inheritedFromMonth: "2026-08",
      editable: true,
      daysRemaining: daysRemainingInMonth("2026-09-23"),
    });

    const yearResponse = await getPerformance(app, token, "?period=year");
    const year = dashboardPerformanceSchema.parse(await yearResponse.json());
    expect(year.goal).toBeNull();

    const allResponse = await getPerformance(app, token, "?period=all");
    const all = dashboardPerformanceSchema.parse(await allResponse.json());
    expect(all.goal).toBeNull();
  });
});
