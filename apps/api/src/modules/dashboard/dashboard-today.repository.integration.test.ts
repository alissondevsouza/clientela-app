import { appLocalDayRangeUtc, birthdayWindowRanked } from "@clientela/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createAppointment,
  createClient,
  createConsultant,
  createLead,
  createProduct,
  createSale,
} from "../../../test/factories";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import type { DashboardTodayQueryInput } from "./dashboard.service";
import { createDashboardTodayRepository } from "./dashboard-today.repository";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

const TODAY_ISO = "2026-09-20";
const { startUtc: DAY_START_UTC, endUtc: DAY_END_UTC } =
  appLocalDayRangeUtc(TODAY_ISO);
const NEXT7_END_ISO = "2026-09-27";
const BIRTHDAY_ENTRIES = birthdayWindowRanked(TODAY_ISO, 7);

const baseInput = (
  overrides: Partial<DashboardTodayQueryInput> = {},
): DashboardTodayQueryInput => ({
  todayIso: TODAY_ISO,
  dayStartUtc: DAY_START_UTC,
  dayEndUtc: DAY_END_UTC,
  next7EndIso: NEXT7_END_ISO,
  birthdayEntries: BIRTHDAY_ENTRIES,
  ...overrides,
});

describe("dashboard-today.repository (integração)", () => {
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

  const repository = () => createDashboardTodayRepository(ctx.db);

  describe("collections", () => {
    it("agrupa duas parcelas atrasadas da mesma cliente num único grupo e conta atrasadas/hoje/próximos 7 dias", async () => {
      const consultant = await createConsultant(ctx.db);
      const client = await createClient(ctx.db, consultant.id, {
        name: "Cliente Devedora",
        whatsapp: "11911112222",
      });

      // Duas parcelas atrasadas (due_date < hoje) da MESMA venda/cliente.
      await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-08-01T12:00:00.000Z"),
        delivered: true,
        clientId: client.id,
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

      // Parcela vencendo hoje, de outra venda sem cliente — grupo por venda.
      const anonymousSale = await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-01T12:00:00.000Z"),
        delivered: true,
        clientName: "Cliente não identificada",
        items: [
          {
            productName: "Item hoje",
            qty: 1,
            unitPriceCents: 5_000,
            costCents: 2_000,
          },
        ],
        receivables: [
          { amountCents: 5_000, dueKind: "scheduled", dueDate: TODAY_ISO },
        ],
      });

      // Parcela nos próximos 7 dias (não deve virar grupo, só contagem).
      await createSale(ctx.db, consultant.id, {
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

      // on_delivery — nunca entra em nenhuma contagem/grupo (sem due_date).
      await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-18T12:00:00.000Z"),
        items: [
          {
            productName: "Item on_delivery",
            qty: 1,
            unitPriceCents: 9_000,
            costCents: 3_000,
          },
        ],
        receivables: [{ amountCents: 9_000, dueKind: "on_delivery" }],
      });

      const result = await repository().today(consultant.id, baseInput());

      // As duas parcelas do cliente (09-01 e 09-10) estão ANTES de hoje
      // (09-20) — ambas atrasadas; o grupo soma as duas (RF-12).
      expect(result.collections.overdueCount).toBe(2);
      expect(result.collections.overdueCents).toBe(20_000);
      expect(result.collections.dueTodayCount).toBe(1);
      expect(result.collections.dueTodayCents).toBe(5_000);
      expect(result.collections.next7Count).toBe(1);
      expect(result.collections.next7Cents).toBe(3_000);
      expect(result.collections.groupsTotal).toBe(2);

      const groups = result.collections.groups;
      expect(groups).toHaveLength(2);

      const clientGroup = groups.find((group) => group.clientId === client.id);
      expect(clientGroup).toMatchObject({
        clientId: client.id,
        saleId: null,
        name: "Cliente Devedora",
        whatsapp: "11911112222",
        amountCents: 20_000,
        installmentsCount: 2,
        oldestDueDate: "2026-09-01",
        overdue: true,
      });

      const saleGroup = groups.find((group) => group.saleId !== null);
      expect(saleGroup).toMatchObject({
        clientId: null,
        saleId: anonymousSale.id,
        name: "Cliente não identificada",
        whatsapp: null,
        amountCents: 5_000,
        installmentsCount: 1,
        oldestDueDate: TODAY_ISO,
        overdue: false,
      });

      // Ordem: oldestDueDate asc — o grupo atrasado (01/09) vem antes do de
      // hoje (20/09).
      expect(groups[0]?.clientId).toBe(client.id);
    });

    it("escopa por consultora", async () => {
      const consultantA = await createConsultant(ctx.db);
      const consultantB = await createConsultant(ctx.db);
      await createSale(ctx.db, consultantB.id, {
        status: "open",
        soldAt: new Date("2026-08-01T12:00:00.000Z"),
        delivered: true,
        items: [
          {
            productName: "Item de outra consultora",
            qty: 1,
            unitPriceCents: 40_000,
            costCents: 10_000,
          },
        ],
        receivables: [
          { amountCents: 40_000, dueKind: "scheduled", dueDate: "2026-09-01" },
        ],
      });

      const result = await repository().today(consultantA.id, baseInput());

      expect(result.collections.overdueCount).toBe(0);
      expect(result.collections.groups).toHaveLength(0);
    });
  });

  describe("appointments", () => {
    it("só compromissos scheduled dentro do dia local, em ordem de horário, com whatsapp de cliente ou lead", async () => {
      const consultant = await createConsultant(ctx.db);
      const client = await createClient(ctx.db, consultant.id, {
        name: "Cliente Agenda",
        whatsapp: "11955556666",
      });
      const lead = await createLead(ctx.db, {
        name: "Lead Agenda",
        whatsapp: "11977778888",
      });

      const later = await createAppointment(ctx.db, consultant.id, {
        startsAt: new Date("2026-09-20T18:00:00.000Z"),
        clientId: client.id,
        kind: "delivery",
      });
      const earlier = await createAppointment(ctx.db, consultant.id, {
        startsAt: new Date("2026-09-20T14:00:00.000Z"),
        leadId: lead.id,
        kind: "demo",
      });
      // Fora do dia local (21h BRT do dia 19 = 00h UTC do dia 20... este é
      // ainda dentro do dia 20 UTC, mas ANTES do início do dia local do
      // dia 20 em America/Sao_Paulo, cujo início é 03:00 UTC).
      await createAppointment(ctx.db, consultant.id, {
        startsAt: new Date("2026-09-20T01:00:00.000Z"),
        clientId: client.id,
      });
      // done — fora (só scheduled).
      await createAppointment(ctx.db, consultant.id, {
        startsAt: new Date("2026-09-20T15:00:00.000Z"),
        status: "done",
        clientId: client.id,
      });

      const result = await repository().today(consultant.id, baseInput());

      expect(result.appointments.total).toBe(2);
      expect(result.appointments.items.map((item) => item.id)).toEqual([
        earlier.id,
        later.id,
      ]);
      expect(result.appointments.items[0]).toMatchObject({
        leadId: lead.id,
        leadName: "Lead Agenda",
        leadWhatsapp: "11977778888",
        clientId: null,
      });
      expect(result.appointments.items[1]).toMatchObject({
        clientId: client.id,
        clientName: "Cliente Agenda",
        clientWhatsapp: "11955556666",
      });
    });
  });

  describe("deliveries", () => {
    it("só vendas open sem entrega, mais antigas primeiro", async () => {
      const consultant = await createConsultant(ctx.db);
      const older = await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-01T12:00:00.000Z"),
        clientName: "Entrega Antiga",
        items: [
          {
            productName: "Item entrega",
            qty: 1,
            unitPriceCents: 4_000,
            costCents: 1_000,
          },
        ],
        receivables: [{ amountCents: 4_000, dueKind: "on_delivery" }],
      });
      const newer = await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-10T12:00:00.000Z"),
        clientName: "Entrega Nova",
        items: [
          {
            productName: "Item entrega 2",
            qty: 1,
            unitPriceCents: 6_000,
            costCents: 2_000,
          },
        ],
        receivables: [{ amountCents: 6_000, dueKind: "on_delivery" }],
      });
      // Já entregue — não entra.
      const deliveredAt = new Date("2026-09-05T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: new Date("2026-09-03T12:00:00.000Z"),
        delivered: deliveredAt,
        items: [
          {
            productName: "Item entregue",
            qty: 1,
            unitPriceCents: 2_000,
            costCents: 500,
          },
        ],
        receivables: [
          {
            amountCents: 2_000,
            dueKind: "scheduled",
            dueDate: "2026-09-03",
            paidAt: deliveredAt,
          },
        ],
      });
      // Cancelada — não entra.
      await createSale(ctx.db, consultant.id, {
        status: "canceled",
        soldAt: new Date("2026-09-04T12:00:00.000Z"),
        items: [
          {
            productName: "Item cancelado",
            qty: 1,
            unitPriceCents: 1_000,
            costCents: 300,
          },
        ],
        receivables: [
          {
            amountCents: 1_000,
            dueKind: "scheduled",
            dueDate: "2026-09-04",
            voidedAt: new Date("2026-09-04T13:00:00.000Z"),
          },
        ],
      });

      const result = await repository().today(consultant.id, baseInput());

      expect(result.deliveries.total).toBe(2);
      expect(result.deliveries.totalCents).toBe(10_000);
      expect(result.deliveries.items.map((item) => item.saleId)).toEqual([
        older.id,
        newer.id,
      ]);
    });
  });

  describe("newLeads", () => {
    it("só leads status=new, mais recentes primeiro", async () => {
      await createLead(ctx.db, {
        name: "Lead Antigo",
        status: "new",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
      });
      const recent = await createLead(ctx.db, {
        name: "Lead Recente",
        status: "new",
        createdAt: new Date("2026-09-15T10:00:00.000Z"),
      });
      await createLead(ctx.db, {
        name: "Lead Contatado",
        status: "contacted",
        createdAt: new Date("2026-09-16T10:00:00.000Z"),
      });

      const consultant = await createConsultant(ctx.db);
      const result = await repository().today(consultant.id, baseInput());

      expect(result.newLeads.total).toBe(2);
      expect(result.newLeads.items[0]?.id).toBe(recent.id);
    });
  });

  describe("restock", () => {
    it("só produtos com disponível negativo (reserva > estoque), nunca por estoque baixo comum", async () => {
      const consultant = await createConsultant(ctx.db);
      const shortProduct = await createProduct(ctx.db, consultant.id, {
        name: "Produto em falta",
        stockQty: 1,
      });
      const zeroStockNoReservation = await createProduct(
        ctx.db,
        consultant.id,
        {
          name: "Sem estoque mas sem reserva",
          stockQty: 0,
        },
      );

      // Reserva 3 unidades de um produto com só 1 em estoque — disponível -2.
      await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-10T12:00:00.000Z"),
        items: [
          {
            productId: shortProduct.id,
            productName: "Produto em falta",
            qty: 3,
            unitPriceCents: 1_000,
            costCents: 400,
          },
        ],
        receivables: [{ amountCents: 3_000, dueKind: "on_delivery" }],
      });

      const result = await repository().today(consultant.id, baseInput());

      expect(result.restock.shortCount).toBe(1);
      expect(result.restock.missingQtyTotal).toBe(2);
      expect(result.restock.items).toHaveLength(1);
      expect(result.restock.items[0]).toMatchObject({
        productId: shortProduct.id,
        name: "Produto em falta",
        availableQty: -2,
        missingQty: 2,
      });
      expect(
        result.restock.items.some(
          (item) => item.productId === zeroStockNoReservation.id,
        ),
      ).toBe(false);
    });

    // QA Emenda M8/C1: `missingQtyTotal` soma TODOS os produtos em falta, não
    // só os até 5 que entram em `items` — com mais de 5 produtos em falta, a
    // soma dos itens exibidos (9+8+7+6+5=35) já subestimava o total real
    // (42), sem indicar que era parcial.
    it("com mais de 5 produtos em falta, missingQtyTotal soma TODOS (não só os 5 exibidos)", async () => {
      const consultant = await createConsultant(ctx.db);
      // Reservas de 3..9 un. com 1 unidade em estoque ⇒ disponível -2..-8,
      // missingQty 2..8 — total real 2+3+4+5+6+7+8 = 35, mas só os 5 maiores
      // entram em `items` (8,7,6,5,4 = 30).
      for (let index = 0; index < 7; index += 1) {
        const qty = index + 3;
        const product = await createProduct(ctx.db, consultant.id, {
          name: `Produto ${index + 1}`,
          stockQty: 1,
        });
        await createSale(ctx.db, consultant.id, {
          status: "open",
          soldAt: new Date("2026-09-10T12:00:00.000Z"),
          items: [
            {
              productId: product.id,
              productName: `Produto ${index + 1}`,
              qty,
              unitPriceCents: 1_000,
              costCents: 400,
            },
          ],
          receivables: [{ amountCents: 1_000 * qty, dueKind: "on_delivery" }],
        });
      }

      const result = await repository().today(consultant.id, baseInput());

      expect(result.restock.shortCount).toBe(7);
      expect(result.restock.items).toHaveLength(5);
      const itemsSum = result.restock.items.reduce(
        (sum, item) => sum + item.missingQty,
        0,
      );
      expect(itemsSum).toBe(30);
      expect(result.restock.missingQtyTotal).toBe(35);
    });
  });

  describe("birthdays", () => {
    it("clientes com aniversário na janela de MM-DD informada, escopadas pela consultora", async () => {
      const consultant = await createConsultant(ctx.db);
      const inWindow = await createClient(ctx.db, consultant.id, {
        name: "Aniversariante",
        whatsapp: "11933334444",
        birthday: "1990-09-22",
      });
      await createClient(ctx.db, consultant.id, {
        name: "Fora da janela",
        birthday: "1990-01-01",
      });
      await createClient(ctx.db, consultant.id, { name: "Sem aniversário" });

      const otherConsultant = await createConsultant(ctx.db);
      await createClient(ctx.db, otherConsultant.id, {
        name: "Aniversariante de outra consultora",
        birthday: "1990-09-22",
      });

      const result = await repository().today(consultant.id, baseInput());

      expect(result.birthdays).toHaveLength(1);
      expect(result.birthdays[0]).toMatchObject({
        clientId: inWindow.id,
        name: "Aniversariante",
        whatsapp: "11933334444",
        birthday: "1990-09-22",
      });
    });
  });
});
