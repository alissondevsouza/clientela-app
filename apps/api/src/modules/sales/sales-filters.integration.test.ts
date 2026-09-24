import {
  apiErrorSchema,
  paginated,
  receivableListItemSchema,
  receivableSchema,
  receivablesSummarySchema,
  saleListItemSchema,
  saleSchema,
} from "@clientela/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createClient,
  createConsultant,
  createConsultantSession,
  createSale,
  type SaleFactoryReceivable,
  type SaleFactorySpec,
} from "../../../test/factories";
import { testPasswordHasher } from "../../../test/factories/consultants";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
import { receivables } from "../../db/schema";
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
import { createDashboardService } from "../dashboard/dashboard.service";
import { createDashboardPerformanceRepository } from "../dashboard/dashboard-performance.repository";
import { createDashboardTodayRepository } from "../dashboard/dashboard-today.repository";
import { createLeadsRepository } from "../leads/leads.repository";
import { createLeadsService } from "../leads/leads.service";
import { createOrdersRepository } from "../orders/orders.repository";
import { createOrdersService } from "../orders/orders.service";
import { createProductsRepository } from "../products/products.repository";
import { createProductsService } from "../products/products.service";
import { createSalesRepository } from "./sales.repository";
import { createSalesService } from "./sales.service";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

// Fuso da aplicação: America/Sao_Paulo, UTC-3 o ano inteiro (sem DST desde
// 2019 — ADR-0018). 2026-09-24T01:00:00Z = 2026-09-23 22:00 local (ainda
// "hoje" = 23/09 no fuso da app); 2026-09-24T15:00:00Z = 2026-09-24 12:00
// local (já "amanhã" — o dia seguinte local). O mesmo instante em UTC (dia
// 24) cai em dias LOCAIS diferentes conforme a hora — exatamente a borda que
// RF-04 exige acertar sem depender da data corrente do servidor Postgres (UTC).
const CLOCK_BEFORE_LOCAL_MIDNIGHT = new Date("2026-09-24T01:00:00.000Z");
const CLOCK_AFTER_LOCAL_MIDNIGHT = new Date("2026-09-24T15:00:00.000Z");
const BOUNDARY_DUE_DATE = "2026-09-23";
// Vencimento bem no futuro: nunca atrasado em nenhum dos dois cenários de
// relógio acima — usado como "outra parcela da mesma venda" (baixa/estorno)
// sem contaminar as contagens de atraso do cenário sob teste.
const OTHER_INSTALLMENT_DUE_DATE = "2027-01-01";

const HTTP_OK = 200;

const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

// Suíte dedicada da Task 3.1 (crm-home-period-and-daily-hub): prova que
// `overdue` de cobrança é calculado no dia LOCAL (relógio injetado no
// service de vendas), nunca na data corrente do servidor Postgres (fuso do
// container, UTC) — em TODAS as leituras do módulo `sales` que projetam a
// cobrança (RF-04). Contra o código antigo (que usava a data corrente do
// servidor no SQL), este teste falha: aquela data é o dia real do container
// no instante da execução, alheia ao relógio injetado aqui — não consegue
// mostrar "não atrasado" E "atrasado" para a MESMA due_date sob os dois
// relógios fixos abaixo, o que este teste exige das quatro leituras.
describe("sales — overdue no fuso local (RF-04, Task 3.1)", () => {
  let ctx: PgTestContext;
  // Relógio injetado MUTÁVEL: o mesmo app/service é reusado entre as duas
  // fases do teste (antes/depois da virada do dia local) só trocando este
  // valor — testing.md: sem depender do relógio real, com controle total do
  // instante "agora" que o service enxerga.
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

  // App real (mesmo padrão de sales.integration.test.ts), com o clock do
  // salesService amarrado à variável mutável `clockNow` — os demais services
  // não participam do recorte de "hoje" testado aqui.
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

  it("parcela com vencimento hoje não está atrasada às 22h locais e fica atrasada no dia seguinte — em GET /receivables/summary, GET /receivables, GET /sales/:id e na resposta de PATCH /receivables/:id (baixa/estorno de outra parcela da mesma venda)", async () => {
    clockNow = CLOCK_BEFORE_LOCAL_MIDNIGHT;
    const app = buildApp();

    const consultant = await createConsultant(ctx.db);
    const session = await createConsultantSession(ctx.db, consultant.id);
    const headers = bearer(session.token);

    // Venda em aberto, entregue, com DUAS cobranças pendentes: a parcela sob
    // teste (vence hoje, no limite da virada) e "outra parcela da mesma
    // venda" com vencimento bem no futuro — usada para a baixa/estorno do
    // quarto cenário, sem contaminar as contagens de atraso.
    const sale = await createSale(ctx.db, consultant.id, {
      status: "open",
      soldAt: new Date("2026-09-01T12:00:00.000Z"),
      delivered: true,
      items: [
        {
          productName: "Base Líquida",
          qty: 1,
          unitPriceCents: 20_000,
          costCents: 8_000,
        },
      ],
      receivables: [
        {
          amountCents: 10_000,
          dueKind: "scheduled",
          dueDate: BOUNDARY_DUE_DATE,
        },
        {
          amountCents: 10_000,
          dueKind: "scheduled",
          dueDate: OTHER_INSTALLMENT_DUE_DATE,
        },
      ],
    });

    const [boundaryRow] = await ctx.db
      .select({ id: receivables.id })
      .from(receivables)
      .where(
        and(
          eq(receivables.saleId, sale.id),
          eq(receivables.dueDate, BOUNDARY_DUE_DATE),
        ),
      );
    const [otherRow] = await ctx.db
      .select({ id: receivables.id })
      .from(receivables)
      .where(
        and(
          eq(receivables.saleId, sale.id),
          eq(receivables.dueDate, OTHER_INSTALLMENT_DUE_DATE),
        ),
      );
    if (!boundaryRow || !otherRow) {
      throw new Error("Falha ao semear as cobranças do cenário de teste");
    }

    // --- Fase 1: 22h locais de 23/09 (ainda "hoje" no fuso da app) --------
    const summaryBefore = await app.handle(
      new Request("http://localhost/receivables/summary", { headers }),
    );
    expect(summaryBefore.status).toBe(HTTP_OK);
    const summaryBeforeBody = receivablesSummarySchema.parse(
      await summaryBefore.json(),
    );
    expect(summaryBeforeBody.overdueCount).toBe(0);
    expect(summaryBeforeBody.overdueCents).toBe(0);

    const listBefore = await app.handle(
      new Request("http://localhost/receivables", { headers }),
    );
    expect(listBefore.status).toBe(HTTP_OK);
    const listBeforeBody = paginated(receivableListItemSchema).parse(
      await listBefore.json(),
    );
    const boundaryInListBefore = listBeforeBody.data.find(
      (row) => row.id === boundaryRow.id,
    );
    expect(boundaryInListBefore?.overdue).toBe(false);

    const saleBefore = await app.handle(
      new Request(`http://localhost/sales/${sale.id}`, { headers }),
    );
    expect(saleBefore.status).toBe(HTTP_OK);
    const saleBeforeBody = saleSchema.parse(await saleBefore.json());
    const boundaryInSaleBefore = saleBeforeBody.receivables.find(
      (row) => row.id === boundaryRow.id,
    );
    expect(boundaryInSaleBefore?.overdue).toBe(false);

    // Baixa de OUTRA parcela da mesma venda (não a testada): prova que a
    // mutação de uma cobrança irmã não corrompe o `overdue` da parcela sob
    // teste, relido logo em seguida no detalhe da venda.
    const patchPaid = await app.handle(
      new Request(`http://localhost/receivables/${otherRow.id}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ paid: true }),
      }),
    );
    expect(patchPaid.status).toBe(HTTP_OK);
    const patchPaidBody = receivableSchema.parse(await patchPaid.json());
    expect(patchPaidBody.id).toBe(otherRow.id);
    expect(patchPaidBody.status).toBe("paid");

    const saleAfterPatchBefore = await app.handle(
      new Request(`http://localhost/sales/${sale.id}`, { headers }),
    );
    const saleAfterPatchBeforeBody = saleSchema.parse(
      await saleAfterPatchBefore.json(),
    );
    const boundaryAfterPatchBefore = saleAfterPatchBeforeBody.receivables.find(
      (row) => row.id === boundaryRow.id,
    );
    expect(boundaryAfterPatchBefore?.overdue).toBe(false);

    // --- Fase 2: 12h locais de 24/09 (dia seguinte local) -----------------
    clockNow = CLOCK_AFTER_LOCAL_MIDNIGHT;

    const summaryAfter = await app.handle(
      new Request("http://localhost/receivables/summary", { headers }),
    );
    const summaryAfterBody = receivablesSummarySchema.parse(
      await summaryAfter.json(),
    );
    expect(summaryAfterBody.overdueCount).toBe(1);
    expect(summaryAfterBody.overdueCents).toBe(10_000);

    const listAfter = await app.handle(
      new Request("http://localhost/receivables", { headers }),
    );
    const listAfterBody = paginated(receivableListItemSchema).parse(
      await listAfter.json(),
    );
    const boundaryInListAfter = listAfterBody.data.find(
      (row) => row.id === boundaryRow.id,
    );
    expect(boundaryInListAfter?.overdue).toBe(true);

    const saleAfter = await app.handle(
      new Request(`http://localhost/sales/${sale.id}`, { headers }),
    );
    const saleAfterBody = saleSchema.parse(await saleAfter.json());
    const boundaryInSaleAfter = saleAfterBody.receivables.find(
      (row) => row.id === boundaryRow.id,
    );
    expect(boundaryInSaleAfter?.overdue).toBe(true);

    // Estorno da OUTRA parcela (agora já paga) — de novo, uma mutação numa
    // cobrança irmã não pode corromper a parcela sob teste, agora atrasada.
    const patchVoid = await app.handle(
      new Request(`http://localhost/receivables/${otherRow.id}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ paid: false }),
      }),
    );
    expect(patchVoid.status).toBe(HTTP_OK);
    const patchVoidBody = receivableSchema.parse(await patchVoid.json());
    expect(patchVoidBody.id).toBe(otherRow.id);
    expect(patchVoidBody.status).toBe("pending");

    const saleAfterPatchAfter = await app.handle(
      new Request(`http://localhost/sales/${sale.id}`, { headers }),
    );
    const saleAfterPatchAfterBody = saleSchema.parse(
      await saleAfterPatchAfter.json(),
    );
    const boundaryAfterPatchAfter = saleAfterPatchAfterBody.receivables.find(
      (row) => row.id === boundaryRow.id,
    );
    expect(boundaryAfterPatchAfter?.overdue).toBe(true);
  });
});

const HTTP_UNPROCESSABLE_ENTITY = 422;
const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";

// Item mínimo cujo total bate exatamente com o valor pedido — usado só para
// satisfazer a invariante da factory (Σ cobranças = total dos itens); o preço
// unitário em si é irrelevante para os filtros sob teste aqui.
const singleItem = (unitPriceCents: number) => [
  {
    productName: "Item de teste",
    qty: 1,
    unitPriceCents,
    costCents: Math.floor(unitPriceCents / 2),
  },
];

// Task 3.2 (RF-14): soldFrom/soldTo (dias locais inclusivos, independentes),
// status=sold (escopo Vendido) e delivery (pending/delivered) em GET /sales.
// Container próprio (mesmo padrão da suíte acima) — os bounds de soldFrom/
// soldTo são função pura da data pedida; não dependem do relógio do service,
// só do `APP_TIME_ZONE` (ADR-0018/RF-04).
describe("GET /sales — soldFrom/soldTo/status/delivery (RF-14, Task 3.2)", () => {
  let ctx: PgTestContext;

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

  const seedConsultantSession = async () => {
    const consultant = await createConsultant(ctx.db);
    const session = await createConsultantSession(ctx.db, consultant.id);
    return { consultantId: consultant.id, token: session.token };
  };

  const openSale = (
    soldAt: Date,
    overrides: Partial<SaleFactorySpec> = {},
  ): SaleFactorySpec => ({
    status: "open",
    soldAt,
    items: [],
    receivables: [],
    ...overrides,
  });

  const getSales = async (
    app: ReturnType<typeof buildApp>,
    token: string,
    query: string,
  ) =>
    app.handle(
      new Request(`http://localhost/sales${query}`, { headers: bearer(token) }),
    );

  it("soldTo inclui o dia local e soldFrom exclui — borda do dia local (venda às 23:30 locais de 31/08 conta em 31/08, não em 01/09)", async () => {
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    // 2026-09-01T02:30:00.000Z = 2026-08-31 23:30 BRT (fuso fixo, sem DST
    // desde 2019 — ADR-0018): o dia LOCAL da venda é 31/08, não 01/09.
    const sale = await createSale(
      ctx.db,
      consultantId,
      openSale(new Date("2026-09-01T02:30:00.000Z")),
    );

    const includedByTo = await getSales(app, token, "?soldTo=2026-08-31");
    expect(includedByTo.status).toBe(HTTP_OK);
    const includedByToBody = paginated(saleListItemSchema).parse(
      await includedByTo.json(),
    );
    expect(includedByToBody.data.map((row) => row.id)).toContain(sale.id);

    const excludedByFrom = await getSales(app, token, "?soldFrom=2026-09-01");
    const excludedByFromBody = paginated(saleListItemSchema).parse(
      await excludedByFrom.json(),
    );
    expect(excludedByFromBody.data.map((row) => row.id)).not.toContain(sale.id);

    const includedByFrom = await getSales(app, token, "?soldFrom=2026-08-31");
    const includedByFromBody = paginated(saleListItemSchema).parse(
      await includedByFrom.json(),
    );
    expect(includedByFromBody.data.map((row) => row.id)).toContain(sale.id);

    const excludedByTo = await getSales(app, token, "?soldTo=2026-08-30");
    const excludedByToBody = paginated(saleListItemSchema).parse(
      await excludedByTo.json(),
    );
    expect(excludedByToBody.data.map((row) => row.id)).not.toContain(sale.id);
  });

  it("soldFrom e soldTo funcionam isolados um do outro", async () => {
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const early = await createSale(
      ctx.db,
      consultantId,
      openSale(new Date("2026-09-01T15:00:00.000Z")),
    );
    const late = await createSale(
      ctx.db,
      consultantId,
      openSale(new Date("2026-09-10T15:00:00.000Z")),
    );

    const fromOnly = await getSales(app, token, "?soldFrom=2026-09-05");
    const fromOnlyBody = paginated(saleListItemSchema).parse(
      await fromOnly.json(),
    );
    const fromOnlyIds = fromOnlyBody.data.map((row) => row.id);
    expect(fromOnlyIds).toContain(late.id);
    expect(fromOnlyIds).not.toContain(early.id);

    const toOnly = await getSales(app, token, "?soldTo=2026-09-05");
    const toOnlyBody = paginated(saleListItemSchema).parse(await toOnly.json());
    const toOnlyIds = toOnlyBody.data.map((row) => row.id);
    expect(toOnlyIds).toContain(early.id);
    expect(toOnlyIds).not.toContain(late.id);
  });

  it("status=sold é o escopo Vendido (open ∪ completed): exclui canceladas", async () => {
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-09-05T15:00:00.000Z");
    const open = await createSale(ctx.db, consultantId, openSale(soldAt));
    const completed = await createSale(
      ctx.db,
      consultantId,
      openSale(soldAt, { status: "completed", delivered: true }),
    );
    const canceled = await createSale(
      ctx.db,
      consultantId,
      openSale(soldAt, { status: "canceled" }),
    );

    const response = await getSales(app, token, "?status=sold");
    expect(response.status).toBe(HTTP_OK);
    const body = paginated(saleListItemSchema).parse(await response.json());
    const ids = body.data.map((row) => row.id);
    expect(ids).toContain(open.id);
    expect(ids).toContain(completed.id);
    expect(ids).not.toContain(canceled.id);
    expect(body.total).toBe(2);
  });

  it("delivery=pending/delivered filtra por entrega", async () => {
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-09-05T15:00:00.000Z");
    const pending = await createSale(ctx.db, consultantId, openSale(soldAt));
    const delivered = await createSale(
      ctx.db,
      consultantId,
      openSale(soldAt, { delivered: true }),
    );

    const pendingResponse = await getSales(app, token, "?delivery=pending");
    const pendingBody = paginated(saleListItemSchema).parse(
      await pendingResponse.json(),
    );
    const pendingIds = pendingBody.data.map((row) => row.id);
    expect(pendingIds).toContain(pending.id);
    expect(pendingIds).not.toContain(delivered.id);

    const deliveredResponse = await getSales(app, token, "?delivery=delivered");
    const deliveredBody = paginated(saleListItemSchema).parse(
      await deliveredResponse.json(),
    );
    const deliveredIds = deliveredBody.data.map((row) => row.id);
    expect(deliveredIds).toContain(delivered.id);
    expect(deliveredIds).not.toContain(pending.id);
  });

  it("combina com clientId dentro do período pedido", async () => {
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const clientA = await createClient(ctx.db, consultantId, {
      name: "Cliente A",
    });
    const clientB = await createClient(ctx.db, consultantId, {
      name: "Cliente B",
    });
    const soldAt = new Date("2026-09-05T15:00:00.000Z");
    const saleA = await createSale(
      ctx.db,
      consultantId,
      openSale(soldAt, { clientId: clientA.id }),
    );
    await createSale(
      ctx.db,
      consultantId,
      openSale(soldAt, { clientId: clientB.id }),
    );
    await createSale(ctx.db, consultantId, openSale(soldAt));

    const response = await getSales(
      app,
      token,
      `?clientId=${clientA.id}&soldFrom=2026-09-01&soldTo=2026-09-10`,
    );
    expect(response.status).toBe(HTTP_OK);
    const body = paginated(saleListItemSchema).parse(await response.json());
    expect(body.total).toBe(1);
    expect(body.data[0]?.id).toBe(saleA.id);
  });

  it("paginação e total corretos com filtro ativo", async () => {
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-09-05T15:00:00.000Z");
    const created = await Promise.all(
      [0, 1, 2].map(() => createSale(ctx.db, consultantId, openSale(soldAt))),
    );

    const page1 = await getSales(app, token, "?status=sold&page=1&perPage=2");
    const page1Body = paginated(saleListItemSchema).parse(await page1.json());
    expect(page1Body.total).toBe(3);
    expect(page1Body.data).toHaveLength(2);

    const page2 = await getSales(app, token, "?status=sold&page=2&perPage=2");
    const page2Body = paginated(saleListItemSchema).parse(await page2.json());
    expect(page2Body.total).toBe(3);
    expect(page2Body.data).toHaveLength(1);

    const seenIds = new Set([
      ...page1Body.data.map((row) => row.id),
      ...page2Body.data.map((row) => row.id),
    ]);
    expect(seenIds).toEqual(new Set(created.map((sale) => sale.id)));
  });

  it("soldFrom > soldTo é rejeitado com 422 pt-BR", async () => {
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const response = await getSales(
      app,
      token,
      "?soldFrom=2026-09-10&soldTo=2026-09-01",
    );
    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
    expect(body.error.message).toMatch(/não pode ser depois da data final/i);
  });

  // A3 (rodada 2): "9999-12-31" passa no formato `z.iso.date()`, mas fazia o
  // service quebrar em 500 ao calcular o dia SEGUINTE ("10000-01-01", que o
  // parser de `time.ts` rejeita) — o piso/teto do schema compartilhado barra
  // isso ainda na fronteira, sempre 422, nunca 500.
  it("soldFrom/soldTo muito no futuro (ex.: 9999-12-31) é rejeitado com 422 pt-BR, nunca 500", async () => {
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const fromResponse = await getSales(app, token, "?soldFrom=9999-12-31");
    expect(fromResponse.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const fromBody = apiErrorSchema.parse(await fromResponse.json());
    expect(fromBody.error.code).toBe(VALIDATION_ERROR_CODE);

    const toResponse = await getSales(app, token, "?soldTo=9999-12-31");
    expect(toResponse.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const toBody = apiErrorSchema.parse(await toResponse.json());
    expect(toBody.error.code).toBe(VALIDATION_ERROR_CODE);
  });

  it("escopa por consultora: soldFrom/soldTo/status nunca vazam venda de outra consultora", async () => {
    const app = buildApp();
    const { token: tokenA } = await seedConsultantSession();
    const { consultantId: consultantB } = await seedConsultantSession();
    const soldAt = new Date("2026-09-05T15:00:00.000Z");
    await createSale(ctx.db, consultantB, openSale(soldAt));

    const response = await getSales(
      app,
      tokenA,
      "?status=sold&soldFrom=2026-09-01&soldTo=2026-09-10",
    );
    const body = paginated(saleListItemSchema).parse(await response.json());
    expect(body.total).toBe(0);
  });
});

// Task 3.3 (RF-15): overdue (só com pending=true), paidFrom/paidTo (só com
// pending=false, dias locais inclusivos, independentes) e a ordenação por
// paid_at desc em GET /receivables. Container próprio (mesmo padrão acima).
describe("GET /receivables — overdue/paidFrom/paidTo (RF-15, Task 3.3)", () => {
  let ctx: PgTestContext;
  // Relógio injetado mutável (mesmo padrão da suíte RF-04 acima): controla o
  // "hoje" que o service calcula para `overdue`.
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

  const seedConsultantSession = async () => {
    const consultant = await createConsultant(ctx.db);
    const session = await createConsultantSession(ctx.db, consultant.id);
    return { consultantId: consultant.id, token: session.token };
  };

  // Venda com UMA cobrança cujo valor bate com o item único (invariante da
  // factory: Σ cobranças = total dos itens) — o preço em si é irrelevante
  // para os filtros de data/atraso sob teste.
  const saleWithReceivable = (
    soldAt: Date,
    receivable: SaleFactoryReceivable,
    overrides: Partial<SaleFactorySpec> = {},
  ): SaleFactorySpec => ({
    status: "open",
    soldAt,
    items: singleItem(receivable.amountCents),
    receivables: [receivable],
    ...overrides,
  });

  const getReceivables = async (
    app: ReturnType<typeof buildApp>,
    token: string,
    query: string,
  ) =>
    app.handle(
      new Request(`http://localhost/receivables${query}`, {
        headers: bearer(token),
      }),
    );

  it("overdue=true retorna só as pendentes atrasadas no fuso local — vencimento de hoje fica fora às 22h locais, o de ontem fica dentro", async () => {
    // 2026-09-25T01:00:00.000Z = 2026-09-24 22:00 BRT ⇒ "hoje" local = 24/09.
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-09-01T15:00:00.000Z");

    const dueToday = await createSale(
      ctx.db,
      consultantId,
      saleWithReceivable(soldAt, {
        amountCents: 10_000,
        dueKind: "scheduled",
        dueDate: "2026-09-24",
      }),
    );
    const dueYesterday = await createSale(
      ctx.db,
      consultantId,
      saleWithReceivable(soldAt, {
        amountCents: 15_000,
        dueKind: "scheduled",
        dueDate: "2026-09-23",
      }),
    );

    const overdueResponse = await getReceivables(app, token, "?overdue=true");
    expect(overdueResponse.status).toBe(HTTP_OK);
    const overdueBody = paginated(receivableListItemSchema).parse(
      await overdueResponse.json(),
    );
    expect(overdueBody.total).toBe(1);
    expect(overdueBody.data[0]?.saleId).toBe(dueYesterday.id);

    const allPendingResponse = await getReceivables(app, token, "");
    const allPendingBody = paginated(receivableListItemSchema).parse(
      await allPendingResponse.json(),
    );
    expect(allPendingBody.total).toBe(2);
    expect(allPendingBody.data.map((row) => row.saleId)).toEqual(
      expect.arrayContaining([dueToday.id, dueYesterday.id]),
    );
  });

  it("cobrança anulada nunca aparece em overdue=true, mesmo com vencimento no passado", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-09-01T15:00:00.000Z");

    await createSale(
      ctx.db,
      consultantId,
      saleWithReceivable(
        soldAt,
        {
          amountCents: 10_000,
          dueKind: "scheduled",
          dueDate: "2026-09-01",
          voidedAt: new Date("2026-09-02T15:00:00.000Z"),
        },
        { status: "canceled" },
      ),
    );

    const response = await getReceivables(app, token, "?overdue=true");
    const body = paginated(receivableListItemSchema).parse(
      await response.json(),
    );
    expect(body.total).toBe(0);
  });

  it("paidFrom/paidTo respeitam as bordas do dia local, cada uma isolada", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-08-01T12:00:00.000Z");
    // 2026-09-02T02:30:00.000Z = 2026-09-01 23:30 BRT: pago no fim do dia
    // LOCAL de 01/09, ainda antes da virada UTC do dia 02/09.
    const paidBoundary = new Date("2026-09-02T02:30:00.000Z");
    const sale = await createSale(
      ctx.db,
      consultantId,
      saleWithReceivable(soldAt, {
        amountCents: 10_000,
        dueKind: "on_delivery",
        dueDate: null,
        paidAt: paidBoundary,
      }),
    );

    const includedByTo = await getReceivables(
      app,
      token,
      "?pending=false&paidTo=2026-09-01",
    );
    const includedByToBody = paginated(receivableListItemSchema).parse(
      await includedByTo.json(),
    );
    expect(includedByToBody.data.map((row) => row.saleId)).toContain(sale.id);

    const excludedByFrom = await getReceivables(
      app,
      token,
      "?pending=false&paidFrom=2026-09-02",
    );
    const excludedByFromBody = paginated(receivableListItemSchema).parse(
      await excludedByFrom.json(),
    );
    expect(excludedByFromBody.data.map((row) => row.saleId)).not.toContain(
      sale.id,
    );

    const includedByFrom = await getReceivables(
      app,
      token,
      "?pending=false&paidFrom=2026-09-01",
    );
    const includedByFromBody = paginated(receivableListItemSchema).parse(
      await includedByFrom.json(),
    );
    expect(includedByFromBody.data.map((row) => row.saleId)).toContain(sale.id);

    const excludedByTo = await getReceivables(
      app,
      token,
      "?pending=false&paidTo=2026-08-31",
    );
    const excludedByToBody = paginated(receivableListItemSchema).parse(
      await excludedByTo.json(),
    );
    expect(excludedByToBody.data.map((row) => row.saleId)).not.toContain(
      sale.id,
    );
  });

  it("com paidFrom/paidTo, ordena por paid_at desc (depois id desc)", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-08-01T12:00:00.000Z");
    const later = await createSale(
      ctx.db,
      consultantId,
      saleWithReceivable(soldAt, {
        amountCents: 20_000,
        dueKind: "on_delivery",
        dueDate: null,
        paidAt: new Date("2026-09-05T15:00:00.000Z"),
      }),
    );
    const earlier = await createSale(
      ctx.db,
      consultantId,
      saleWithReceivable(soldAt, {
        amountCents: 15_000,
        dueKind: "on_delivery",
        dueDate: null,
        paidAt: new Date("2026-09-03T15:00:00.000Z"),
      }),
    );

    const response = await getReceivables(
      app,
      token,
      "?pending=false&paidFrom=2026-09-01&paidTo=2026-09-10",
    );
    const body = paginated(receivableListItemSchema).parse(
      await response.json(),
    );
    expect(body.data.map((row) => row.saleId)).toEqual([later.id, earlier.id]);
  });

  it("overdue=true junto com pending=false é rejeitado com 422 pt-BR", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const response = await getReceivables(
      app,
      token,
      "?overdue=true&pending=false",
    );
    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
    expect(body.error.message).toMatch(/atrasadas.*pendentes/i);
  });

  it("paidFrom com pending no padrão (true) é rejeitado com 422 pt-BR", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const response = await getReceivables(app, token, "?paidFrom=2026-09-01");
    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
    expect(body.error.message).toMatch(/pending=false/);
  });

  it("paidFrom > paidTo é rejeitado com 422 pt-BR", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const response = await getReceivables(
      app,
      token,
      "?pending=false&paidFrom=2026-09-10&paidTo=2026-09-01",
    );
    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe(VALIDATION_ERROR_CODE);
    expect(body.error.message).toMatch(/não pode ser depois da data final/i);
  });

  // A3 (rodada 2): mesma proteção de GET /sales — nunca 500 por uma
  // data-limite aceita pelo formato.
  it("paidFrom/paidTo muito no futuro (ex.: 9999-12-31) é rejeitado com 422 pt-BR, nunca 500", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const fromResponse = await getReceivables(
      app,
      token,
      "?pending=false&paidFrom=9999-12-31",
    );
    expect(fromResponse.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const fromBody = apiErrorSchema.parse(await fromResponse.json());
    expect(fromBody.error.code).toBe(VALIDATION_ERROR_CODE);

    const toResponse = await getReceivables(
      app,
      token,
      "?pending=false&paidTo=9999-12-31",
    );
    expect(toResponse.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    const toBody = apiErrorSchema.parse(await toResponse.json());
    expect(toBody.error.code).toBe(VALIDATION_ERROR_CODE);
  });

  it("total/paginação corretos com paidFrom/paidTo", async () => {
    clockNow = new Date("2026-09-25T01:00:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const soldAt = new Date("2026-08-01T12:00:00.000Z");
    const created = await Promise.all(
      [
        new Date("2026-09-02T15:00:00.000Z"),
        new Date("2026-09-04T15:00:00.000Z"),
        new Date("2026-09-06T15:00:00.000Z"),
      ].map((paidAt) =>
        createSale(
          ctx.db,
          consultantId,
          saleWithReceivable(soldAt, {
            amountCents: 10_000,
            dueKind: "on_delivery",
            dueDate: null,
            paidAt,
          }),
        ),
      ),
    );

    const page1 = await getReceivables(
      app,
      token,
      "?pending=false&paidFrom=2026-09-01&paidTo=2026-09-10&page=1&perPage=2",
    );
    const page1Body = paginated(receivableListItemSchema).parse(
      await page1.json(),
    );
    expect(page1Body.total).toBe(3);
    expect(page1Body.data).toHaveLength(2);

    const page2 = await getReceivables(
      app,
      token,
      "?pending=false&paidFrom=2026-09-01&paidTo=2026-09-10&page=2&perPage=2",
    );
    const page2Body = paginated(receivableListItemSchema).parse(
      await page2.json(),
    );
    expect(page2Body.total).toBe(3);
    expect(page2Body.data).toHaveLength(1);

    const seenSaleIds = new Set([
      ...page1Body.data.map((row) => row.saleId),
      ...page2Body.data.map((row) => row.saleId),
    ]);
    expect(seenSaleIds).toEqual(new Set(created.map((sale) => sale.id)));
  });
});
