import { dashboardTodaySchema } from "@clientela/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createAppointment,
  createClient,
  createConsultant,
  createConsultantSession,
  createLead,
  createProduct,
  createSale,
} from "../../../test/factories";
import { testPasswordHasher } from "../../../test/factories/consultants";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { createApp } from "../../app";
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

// "Hoje" local = 2026-09-20, com o relógio às 22h LOCAIS (RF-04/RF-12): o
// instante em UTC já cai no dia seguinte (2026-09-21T01:00:00Z), mas o dia
// local da app (UTC-3, sem DST desde 2019 — ADR-0018) continua sendo 20/09 —
// a borda exata que o critério pede ("vencimento de hoje não é atrasado às
// 22h locais").
const CLOCK_TODAY_22H_LOCAL = new Date("2026-09-21T01:00:00.000Z");
const TODAY_LOCAL = "2026-09-20";

// Companheiro do relógio acima (RF-04/A3c): o MESMO vencimento (2026-09-20),
// visto no dia SEGUINTE local (21/09, meio-dia) — a parcela que não estava
// atrasada às 22h de ontem passa a estar atrasada hoje, também no painel
// (o par "não atrasada"/"atrasada" já existia para summary/lista/detalhe em
// `sales-filters.integration.test.ts`; faltava o lado `/dashboard/today`).
const CLOCK_NEXT_DAY_LOCAL = new Date("2026-09-21T15:00:00.000Z");
const NEXT_DAY_LOCAL = "2026-09-21";

const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

describe("GET /dashboard/today (crm-home-period-and-daily-hub, Task 4.4, RF-12)", () => {
  let ctx: PgTestContext;
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

  const getToday = async (app: App, token: string) => {
    const response = await app.handle(
      new Request("http://localhost/dashboard/today", {
        headers: bearer(token),
      }),
    );
    expect(response.status).toBe(HTTP_OK);
    return dashboardTodaySchema.parse(await response.json());
  };

  it("sem token ⇒ 401", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();

    const response = await app.handle(
      new Request("http://localhost/dashboard/today"),
    );

    expect(response.status).toBe(401);
  });

  it("cobranças: grupo por cliente (2 parcelas atrasadas), grupo por venda sem cliente (vence hoje, não atrasada), próximos 7 dias só soma, on_delivery fora de tudo", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const debtor = await createClient(ctx.db, consultantId, {
      name: "Cliente Devedora",
      whatsapp: "11911112222",
    });

    // Duas parcelas ATRASADAS da mesma cliente ⇒ UM grupo (por client_id).
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-08-01T12:00:00.000Z"),
      delivered: true,
      clientId: debtor.id,
      items: [
        {
          productName: "Item atrasado",
          qty: 1,
          unitPriceCents: 20_000,
          costCents: 8_000,
        },
      ],
      receivables: [
        { amountCents: 8_000, dueKind: "scheduled", dueDate: "2026-09-01" },
        { amountCents: 12_000, dueKind: "scheduled", dueDate: "2026-09-10" },
      ],
    });

    // Venda SEM cliente, parcela vencendo HOJE (due_date = hoje, não
    // atrasada às 22h locais) ⇒ grupo por sale_id.
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-09-05T12:00:00.000Z"),
      delivered: true,
      clientName: "Cliente Anônima",
      items: [
        {
          productName: "Item vence hoje",
          qty: 1,
          unitPriceCents: 5_000,
          costCents: 2_000,
        },
      ],
      receivables: [
        { amountCents: 5_000, dueKind: "scheduled", dueDate: TODAY_LOCAL },
      ],
    });

    // Parcela nos PRÓXIMOS 7 dias: só soma/contagem, nunca vira grupo.
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-09-15T12:00:00.000Z"),
      delivered: true,
      items: [
        {
          productName: "Item próximos 7 dias",
          qty: 1,
          unitPriceCents: 3_000,
          costCents: 1_000,
        },
      ],
      receivables: [
        { amountCents: 3_000, dueKind: "scheduled", dueDate: "2026-09-25" },
      ],
    });

    // on_delivery: nunca conta nem vira grupo (sem due_date).
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-09-16T12:00:00.000Z"),
      delivered: true,
      items: [
        {
          productName: "Item na entrega",
          qty: 1,
          unitPriceCents: 9_999,
          costCents: 1_000,
        },
      ],
      receivables: [{ amountCents: 9_999, dueKind: "on_delivery" }],
    });

    const today = await getToday(app, token);

    expect(today.today).toBe(TODAY_LOCAL);
    expect(today.collections.overdueCount).toBe(2);
    expect(today.collections.overdueCents).toBe(20_000);
    expect(today.collections.dueTodayCount).toBe(1);
    expect(today.collections.dueTodayCents).toBe(5_000);
    expect(today.collections.next7Count).toBe(1);
    expect(today.collections.next7Cents).toBe(3_000);
    expect(today.collections.groupsTotal).toBe(2);
    expect(today.collections.groups).toHaveLength(2);

    const [debtorGroup, anonymousGroup] = today.collections.groups;
    expect(debtorGroup).toMatchObject({
      clientId: debtor.id,
      saleId: null,
      name: "Cliente Devedora",
      whatsapp: "11911112222",
      amountCents: 20_000,
      installmentsCount: 2,
      oldestDueDate: "2026-09-01",
      overdue: true,
    });
    expect(anonymousGroup).toMatchObject({
      clientId: null,
      name: "Cliente Anônima",
      amountCents: 5_000,
      installmentsCount: 1,
      oldestDueDate: TODAY_LOCAL,
      overdue: false,
    });
    expect(anonymousGroup?.saleId).not.toBeNull();
  });

  it("cobranças: a mesma parcela que vence hoje (não atrasada às 22h locais) está atrasada no painel no dia SEGUINTE (RF-04/A3c)", async () => {
    const { consultantId, token } = await seedConsultantSession();
    const client = await createClient(ctx.db, consultantId, {
      name: "Cliente Vencimento",
      whatsapp: "11944445555",
    });
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-09-01T12:00:00.000Z"),
      delivered: true,
      clientId: client.id,
      items: [
        {
          productName: "Item vencimento",
          qty: 1,
          unitPriceCents: 7_000,
          costCents: 3_000,
        },
      ],
      receivables: [
        { amountCents: 7_000, dueKind: "scheduled", dueDate: TODAY_LOCAL },
      ],
    });

    // Ainda às 22h de HOJE (TODAY_LOCAL): vence hoje, não é atrasada.
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const appToday = buildApp();
    const todayResult = await getToday(appToday, token);
    expect(todayResult.today).toBe(TODAY_LOCAL);
    expect(todayResult.collections.overdueCount).toBe(0);
    expect(todayResult.collections.dueTodayCount).toBe(1);
    const [todayGroup] = todayResult.collections.groups;
    expect(todayGroup).toMatchObject({ overdue: false });

    // No dia SEGUINTE: a mesma parcela virou atrasada.
    clockNow = CLOCK_NEXT_DAY_LOCAL;
    const appNextDay = buildApp();
    const nextDayResult = await getToday(appNextDay, token);
    expect(nextDayResult.today).toBe(NEXT_DAY_LOCAL);
    expect(nextDayResult.collections.overdueCount).toBe(1);
    expect(nextDayResult.collections.dueTodayCount).toBe(0);
    const [overdueGroup] = nextDayResult.collections.groups;
    expect(overdueGroup).toMatchObject({
      clientId: client.id,
      oldestDueDate: TODAY_LOCAL,
      overdue: true,
    });
  });

  it("cobranças: com 6 grupos atrasados/de hoje, groupsTotal conta os 6 mas só os 5 mais antigos (por oldestDueDate) entram na lista (A3b: limite 5)", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const clientNames: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      const name = `Devedora ${index}`;
      const client = await createClient(ctx.db, consultantId, { name });
      clientNames.push(name);
      await createSale(ctx.db, consultantId, {
        status: "open",
        soldAt: new Date("2026-08-01T12:00:00.000Z"),
        delivered: true,
        clientId: client.id,
        items: [
          {
            productName: `Item ${index}`,
            qty: 1,
            unitPriceCents: 1_000 * index,
            costCents: 100,
          },
        ],
        receivables: [
          {
            amountCents: 1_000 * index,
            dueKind: "scheduled",
            // Vencimentos crescentes: a devedora 1 é a mais antiga (atrasada
            // há mais tempo) e deve estar entre os 5 retornados; a devedora 6
            // é a mais recente e fica de fora do LIMIT 5.
            dueDate: `2026-09-0${index}`,
          },
        ],
      });
    }

    const today = await getToday(app, token);

    expect(today.collections.groupsTotal).toBe(6);
    expect(today.collections.groups).toHaveLength(5);
    expect(today.collections.groups.map((group) => group.name)).toEqual(
      clientNames.slice(0, 5),
    );
    expect(
      today.collections.groups.some((group) => group.name === "Devedora 6"),
    ).toBe(false);
  });

  it("compromissos: só scheduled dentro do dia local, em ordem de horário, com whatsapp de cliente ou de lead", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();
    const client = await createClient(ctx.db, consultantId, {
      name: "Cliente da Agenda",
      whatsapp: "11922223333",
    });
    const lead = await createLead(ctx.db, {
      name: "Lead da Agenda",
      whatsapp: "11933334444",
    });

    const clientAppointment = await createAppointment(ctx.db, consultantId, {
      startsAt: new Date("2026-09-20T12:00:00.000Z"), // 09:00 local
      status: "scheduled",
      clientId: client.id,
      kind: "demo",
    });
    const leadAppointment = await createAppointment(ctx.db, consultantId, {
      startsAt: new Date("2026-09-20T14:00:00.000Z"), // 11:00 local
      status: "scheduled",
      leadId: lead.id,
      kind: "follow_up",
    });
    // Excluído: mesmo dia local, mas NÃO scheduled.
    await createAppointment(ctx.db, consultantId, {
      startsAt: new Date("2026-09-20T11:00:00.000Z"),
      status: "done",
      clientId: client.id,
    });
    // Excluído: scheduled, mas dia local SEGUINTE.
    await createAppointment(ctx.db, consultantId, {
      startsAt: new Date("2026-09-21T14:00:00.000Z"),
      status: "scheduled",
      clientId: client.id,
    });

    const today = await getToday(app, token);

    expect(today.appointments.total).toBe(2);
    expect(today.appointments.items.map((item) => item.id)).toEqual([
      clientAppointment.id,
      leadAppointment.id,
    ]);
    expect(today.appointments.items[0]).toMatchObject({
      clientId: client.id,
      clientName: "Cliente da Agenda",
      clientWhatsapp: "11922223333",
      leadId: null,
      leadName: null,
      leadWhatsapp: null,
    });
    expect(today.appointments.items[1]).toMatchObject({
      clientId: null,
      clientName: null,
      clientWhatsapp: null,
      leadId: lead.id,
      leadName: "Lead da Agenda",
      leadWhatsapp: "11933334444",
    });
  });

  it("compromissos: com 6 no dia local, total conta os 6 mas só os 5 mais cedo entram na lista (A3b: limite 5)", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const appointmentIds: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      // 08:00, 09:00, ... 13:00 locais (UTC-3 ⇒ 11:00Z, 12:00Z, ...).
      const appointment = await createAppointment(ctx.db, consultantId, {
        startsAt: new Date(`2026-09-20T${11 + index}:00:00.000Z`),
        status: "scheduled",
        kind: "demo",
      });
      appointmentIds.push(appointment.id);
    }

    const today = await getToday(app, token);

    expect(today.appointments.total).toBe(6);
    expect(today.appointments.items).toHaveLength(5);
    expect(today.appointments.items.map((item) => item.id)).toEqual(
      appointmentIds.slice(0, 5),
    );
  });

  it("entregas pendentes: só open sem delivered_at, exclui entregues e canceladas, limite 5 com total/totalCents completos", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const pendingSaleIds: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      const sale = await createSale(ctx.db, consultantId, {
        status: "open",
        soldAt: new Date(`2026-09-0${index}T12:00:00.000Z`),
        clientName: `Entrega ${index}`,
        items: [
          {
            productName: `Item ${index}`,
            qty: 1,
            unitPriceCents: index * 1_000,
            costCents: 100,
          },
        ],
        receivables: [
          {
            amountCents: index * 1_000,
            dueKind: "scheduled",
            dueDate: "2026-12-01",
          },
        ],
      });
      pendingSaleIds.push(sale.id);
    }

    // Excluído: já entregue.
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-09-10T12:00:00.000Z"),
      delivered: true,
      items: [
        {
          productName: "Já entregue",
          qty: 1,
          unitPriceCents: 999_000,
          costCents: 1,
        },
      ],
      receivables: [
        {
          amountCents: 999_000,
          dueKind: "scheduled",
          dueDate: "2026-12-01",
        },
      ],
    });

    // Excluído: cancelada, mesmo sem entrega.
    await createSale(ctx.db, consultantId, {
      status: "canceled",
      soldAt: new Date("2026-09-11T12:00:00.000Z"),
      items: [
        {
          productName: "Cancelada",
          qty: 1,
          unitPriceCents: 888_000,
          costCents: 1,
        },
      ],
      receivables: [
        {
          amountCents: 888_000,
          dueKind: "scheduled",
          dueDate: "2026-12-01",
          voidedAt: new Date("2026-09-11T12:00:00.000Z"),
        },
      ],
    });

    const today = await getToday(app, token);

    expect(today.deliveries.total).toBe(6);
    expect(today.deliveries.totalCents).toBe(21_000); // 1000+2000+...+6000
    expect(today.deliveries.items).toHaveLength(5);
    expect(today.deliveries.items.map((item) => item.saleId)).toEqual(
      pendingSaleIds.slice(0, 5),
    );
    expect(today.deliveries.items.map((item) => item.totalCents)).toEqual([
      1_000, 2_000, 3_000, 4_000, 5_000,
    ]);
  });

  it("leads novos: só status=new (leads não têm escopo por consultora — drift aceito, RF-26)", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const newLead = await createLead(ctx.db, {
      name: "Lead Novo",
      whatsapp: "11955556666",
      interest: "Perfumaria",
      createdAt: new Date("2026-09-19T12:00:00.000Z"),
    });
    await createLead(ctx.db, {
      name: "Lead Já Contatado",
      status: "contacted",
    });

    const today = await getToday(app, token);

    expect(today.newLeads.total).toBe(1);
    expect(today.newLeads.items).toHaveLength(1);
    expect(today.newLeads.items[0]).toMatchObject({
      id: newLead.id,
      name: "Lead Novo",
      whatsapp: "11955556666",
      interest: "Perfumaria",
    });
  });

  it("leads novos: com 6 status=new, total conta os 6 mas só os 5 mais recentes entram na lista (A3b: limite 5)", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { token } = await seedConsultantSession();

    const leadIds: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      const lead = await createLead(ctx.db, {
        name: `Lead ${index}`,
        createdAt: new Date(`2026-09-1${index}T12:00:00.000Z`),
      });
      leadIds.push(lead.id);
    }

    const today = await getToday(app, token);

    expect(today.newLeads.total).toBe(6);
    expect(today.newLeads.items).toHaveLength(5);
    // Mais recente primeiro (createdAt desc) — o lead 1 (mais antigo) fica de
    // fora do LIMIT 5.
    expect(today.newLeads.items.map((item) => item.id)).toEqual(
      [...leadIds].reverse().slice(0, 5),
    );
  });

  it("encomendas sem estoque: só disponível negativo (reserva > estoque); estoque 0 sem reserva não aparece", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const shortProduct = await createProduct(ctx.db, consultantId, {
      name: "Produto Sem Estoque",
      stockQty: 2,
    });
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-09-10T12:00:00.000Z"),
      items: [
        {
          productId: shortProduct.id,
          productName: "Produto Sem Estoque",
          qty: 5,
          unitPriceCents: 10_000,
          costCents: 4_000,
        },
      ],
      receivables: [
        { amountCents: 50_000, dueKind: "scheduled", dueDate: "2026-12-01" },
      ],
    });

    // Estoque zerado, SEM reserva: disponível = 0, não é "sem estoque" (só
    // fica no bloco Posição — RF-25 — nunca no Hoje).
    await createProduct(ctx.db, consultantId, {
      name: "Produto Zerado Sem Reserva",
      stockQty: 0,
    });

    // Reserva dentro do estoque: disponível positivo, não aparece.
    const okProduct = await createProduct(ctx.db, consultantId, {
      name: "Produto OK",
      stockQty: 5,
    });
    await createSale(ctx.db, consultantId, {
      status: "open",
      soldAt: new Date("2026-09-12T12:00:00.000Z"),
      items: [
        {
          productId: okProduct.id,
          productName: "Produto OK",
          qty: 3,
          unitPriceCents: 10_000,
          costCents: 4_000,
        },
      ],
      receivables: [
        { amountCents: 30_000, dueKind: "scheduled", dueDate: "2026-12-01" },
      ],
    });

    const today = await getToday(app, token);

    expect(today.restock.shortCount).toBe(1);
    expect(today.restock.items).toHaveLength(1);
    expect(today.restock.items[0]).toMatchObject({
      productId: shortProduct.id,
      name: "Produto Sem Estoque",
      availableQty: -3,
      missingQty: 3,
    });
  });

  it("encomendas sem estoque: com 6 produtos em falta, shortCount conta os 6 mas só os 5 com MENOR disponível entram na lista (A3b: limite 5)", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const productIds: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      const product = await createProduct(ctx.db, consultantId, {
        name: `Produto ${index}`,
        stockQty: 1,
      });
      productIds.push(product.id);
      // Reserva `index + 1` unidades com só 1 em estoque ⇒ disponível = -index
      // (produto 1 ⇒ -1, produto 6 ⇒ -6 — o mais negativo).
      await createSale(ctx.db, consultantId, {
        status: "open",
        soldAt: new Date("2026-09-10T12:00:00.000Z"),
        items: [
          {
            productId: product.id,
            productName: `Produto ${index}`,
            qty: index + 1,
            unitPriceCents: 1_000,
            costCents: 400,
          },
        ],
        receivables: [
          {
            amountCents: 1_000 * (index + 1),
            dueKind: "scheduled",
            dueDate: "2026-12-01",
          },
        ],
      });
    }

    const today = await getToday(app, token);

    expect(today.restock.shortCount).toBe(6);
    expect(today.restock.items).toHaveLength(5);
    // Menor disponível primeiro (mais negativo): produtos 6,5,4,3,2 — o
    // produto 1 (disponível -1, o "menos em falta") fica de fora do LIMIT 5.
    expect(today.restock.items.map((item) => item.productId)).toEqual(
      [...productIds].reverse().slice(0, 5),
    );
    expect(
      today.restock.items.some((item) => item.productId === productIds[0]),
    ).toBe(false);
    // QA Emenda M8/C1: `missingQtyTotal` soma missingQty 1..6 (=21), incluindo
    // o produto 1 que ficou de fora de `items` — a soma dos 5 itens exibidos
    // (6+5+4+3+2=20) NÃO é o total.
    const itemsSum = today.restock.items.reduce(
      (sum, item) => sum + item.missingQty,
      0,
    );
    expect(itemsSum).toBe(20);
    expect(today.restock.missingQtyTotal).toBe(21);
  });

  it("aniversariantes: janela cruza a virada do ano (27/12 ⇒ 03/01)", async () => {
    // "Hoje" local = 27/12/2026; janela de 7 dias vai até 03/01/2027.
    clockNow = new Date("2026-12-27T15:00:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const birthdayClient = await createClient(ctx.db, consultantId, {
      name: "Aniversariante Virada",
      whatsapp: "11966667777",
      birthday: "1985-01-02",
    });
    await createClient(ctx.db, consultantId, {
      name: "Fora da Janela",
      birthday: "1990-06-15",
    });

    const today = await getToday(app, token);

    expect(today.today).toBe("2026-12-27");
    expect(today.birthdays).toHaveLength(1);
    expect(today.birthdays[0]).toMatchObject({
      clientId: birthdayClient.id,
      name: "Aniversariante Virada",
      birthday: "1985-01-02",
      nextOn: "2027-01-02",
    });
  });

  it("aniversariantes: 29/02 em ano não bissexto é lembrada em 28/02", async () => {
    // "Hoje" local = 21/02/2027 (2027 não é bissexto); janela de 7 dias vai
    // até 28/02/2027 — inclui a borda que ativa a regra de 29/02.
    clockNow = new Date("2027-02-21T15:00:00.000Z");
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const leapClient = await createClient(ctx.db, consultantId, {
      name: "Nascida em 29 de Fevereiro",
      birthday: "1992-02-29",
    });

    const today = await getToday(app, token);

    expect(today.today).toBe("2027-02-21");
    expect(today.birthdays).toHaveLength(1);
    expect(today.birthdays[0]).toMatchObject({
      clientId: leapClient.id,
      birthday: "1992-02-29",
      nextOn: "2027-02-28",
    });
  });

  it("aniversariantes: com mais de 20 na janela, os de HOJE nunca ficam de fora do LIMIT (A1: ordem por rank cronológico, não por nome)", async () => {
    // Regressão do bug A1: o repository antigo fazia `ORDER BY name LIMIT 20`
    // ANTES de saber quem fazia aniversário hoje — com 21 clientes "A0x"
    // (alfabeticamente antes de qualquer "Z") aniversariando em 27/09 e só 2
    // clientes fazendo aniversário HOJE (20/09) com nome começando em "Z", a
    // ordem alfabética pura preenchia o LIMIT 20 só com "A0x" e OMITIA as
    // duas aniversariantes de HOJE — o pior caso possível (RF-12: "ordenados
    // por nextOn e nome").
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { consultantId, token } = await seedConsultantSession();

    const todayClientNames = ["Zelia Hoje", "Zulmira Hoje"];
    for (const name of todayClientNames) {
      await createClient(ctx.db, consultantId, {
        name,
        birthday: "1990-09-20", // mesmo dia/mês de TODAY_LOCAL
      });
    }

    // 21 clientes aniversariando no ÚLTIMO dia da janela (27/09, rank pior
    // que hoje) — mais que os 18 espaços que sobram depois das 2 de hoje.
    const laterClientCount = 21;
    for (let index = 1; index <= laterClientCount; index += 1) {
      await createClient(ctx.db, consultantId, {
        name: `A${String(index).padStart(2, "0")} Aniversariante`,
        birthday: "1985-09-27",
      });
    }

    const today = await getToday(app, token);

    expect(today.birthdays).toHaveLength(20);
    const names = today.birthdays.map((item) => item.name);

    // As de HOJE sempre sobrevivem ao LIMIT, nunca omitidas pela ordem
    // alfabética (A1).
    expect(names).toEqual(expect.arrayContaining(todayClientNames));
    expect(
      today.birthdays.filter((item) => item.nextOn === TODAY_LOCAL),
    ).toHaveLength(2);

    // As 18 primeiras (alfabeticamente) de 27/09 preenchem o resto das vagas;
    // as 3 últimas (A19–A21) ficam de fora.
    expect(names).toEqual(
      expect.arrayContaining(["A01 Aniversariante", "A18 Aniversariante"]),
    );
    expect(names).not.toContain("A19 Aniversariante");
    expect(names).not.toContain("A20 Aniversariante");
    expect(names).not.toContain("A21 Aniversariante");
  });

  it("escopo por consultora: cobranças, agenda, entregas, estoque e aniversariantes de outra consultora nunca aparecem", async () => {
    clockNow = CLOCK_TODAY_22H_LOCAL;
    const app = buildApp();
    const { token } = await seedConsultantSession();
    const { consultantId: otherConsultantId } = await seedConsultantSession();

    const otherClient = await createClient(ctx.db, otherConsultantId, {
      name: "Cliente da Outra Consultora",
      birthday: "2000-09-21",
    });
    await createSale(ctx.db, otherConsultantId, {
      status: "open",
      soldAt: new Date("2026-08-01T12:00:00.000Z"),
      clientId: otherClient.id,
      items: [
        {
          productName: "Item de outra consultora",
          qty: 1,
          unitPriceCents: 999_000,
          costCents: 1,
        },
      ],
      receivables: [
        { amountCents: 999_000, dueKind: "scheduled", dueDate: "2026-09-01" },
      ],
    });
    await createAppointment(ctx.db, otherConsultantId, {
      startsAt: new Date("2026-09-20T12:00:00.000Z"),
      status: "scheduled",
      clientId: otherClient.id,
    });
    const otherProduct = await createProduct(ctx.db, otherConsultantId, {
      name: "Produto de outra consultora",
      stockQty: 1,
    });
    await createSale(ctx.db, otherConsultantId, {
      status: "open",
      soldAt: new Date("2026-09-05T12:00:00.000Z"),
      items: [
        {
          productId: otherProduct.id,
          productName: "Produto de outra consultora",
          qty: 5,
          unitPriceCents: 10_000,
          costCents: 4_000,
        },
      ],
      receivables: [
        { amountCents: 50_000, dueKind: "scheduled", dueDate: "2026-12-01" },
      ],
    });

    const today = await getToday(app, token);

    expect(today.collections.groupsTotal).toBe(0);
    expect(today.collections.overdueCount).toBe(0);
    expect(today.appointments.total).toBe(0);
    expect(today.deliveries.total).toBe(0);
    expect(today.restock.shortCount).toBe(0);
    expect(today.birthdays).toHaveLength(0);
  });
});
