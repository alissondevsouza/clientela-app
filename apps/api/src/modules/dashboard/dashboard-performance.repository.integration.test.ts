import {
  lastDayOfYearMonth,
  monthsEndingAt,
  periodBoundsUtc,
} from "@clientela/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createClient,
  createConsultant,
  createMonthlyGoal,
  createProduct,
  createSale,
} from "../../../test/factories";
import {
  type PgTestContext,
  startPgContainer,
} from "../../../test/helpers/pg-container";
import { products } from "../../db/schema";
import {
  createDashboardPerformanceRepository,
  effectiveGoal,
  metrics,
  series,
  topClients,
  topProducts,
  upsertGoal,
} from "./dashboard-performance.repository";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

// Bounds do mês de setembro/2026 — mesmo padrão usado nos testes de
// dashboard.service.test.ts (relógio fixo), aqui em Postgres real.
const SEPTEMBER_BOUNDS = periodBoundsUtc("2026-09-01", "2026-09-30");
const AUGUST_BOUNDS = periodBoundsUtc("2026-08-01", "2026-08-31");

describe("dashboard-performance.repository (integração)", () => {
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

  describe("metrics", () => {
    it("soma Vendido/lucro/clientes do escopo Vendido (aberta e concluída) e ignora cancelada e fora do período", async () => {
      const consultant = await createConsultant(ctx.db);
      const client = await createClient(ctx.db, consultant.id);

      // Aberta, não entregue — entra.
      await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-05T12:00:00.000Z"),
        clientId: client.id,
        items: [
          {
            productName: "Item A",
            qty: 2,
            unitPriceCents: 5_000,
            costCents: 2_000,
          },
        ],
        receivables: [{ amountCents: 10_000, dueKind: "on_delivery" }],
      });

      // Aberta, entregue, com parcela pendente — entra.
      await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-10T12:00:00.000Z"),
        delivered: true,
        clientId: client.id,
        items: [
          {
            productName: "Item B",
            qty: 1,
            unitPriceCents: 8_000,
            costCents: 3_000,
          },
        ],
        receivables: [
          {
            amountCents: 4_000,
            dueKind: "scheduled",
            dueDate: "2026-09-10",
            paidAt: new Date("2026-09-10T12:00:00.000Z"),
          },
          { amountCents: 4_000, dueKind: "scheduled", dueDate: "2026-10-10" },
        ],
      });

      // Concluída — entra.
      const soldAtCompleted = new Date("2026-09-15T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAtCompleted,
        delivered: soldAtCompleted,
        items: [
          {
            productName: "Item C",
            qty: 1,
            unitPriceCents: 12_000,
            costCents: 5_000,
          },
        ],
        receivables: [
          {
            amountCents: 12_000,
            dueKind: "scheduled",
            dueDate: "2026-09-15",
            paidAt: soldAtCompleted,
          },
        ],
      });

      // Cancelada dentro do período — NÃO entra.
      await createSale(ctx.db, consultant.id, {
        status: "canceled",
        soldAt: new Date("2026-09-20T12:00:00.000Z"),
        items: [
          {
            productName: "Item D",
            qty: 1,
            unitPriceCents: 3_000,
            costCents: 1_000,
          },
        ],
        receivables: [
          {
            amountCents: 3_000,
            dueKind: "scheduled",
            dueDate: "2026-09-25",
            voidedAt: new Date("2026-09-21T12:00:00.000Z"),
          },
        ],
      });

      // Fora do período (agosto) — NÃO entra.
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: new Date("2026-08-20T12:00:00.000Z"),
        delivered: new Date("2026-08-20T12:00:00.000Z"),
        items: [
          {
            productName: "Item E",
            qty: 1,
            unitPriceCents: 9_000,
            costCents: 4_000,
          },
        ],
        receivables: [
          {
            amountCents: 9_000,
            dueKind: "scheduled",
            dueDate: "2026-08-20",
            paidAt: new Date("2026-08-20T12:00:00.000Z"),
          },
        ],
      });

      const result = await metrics(ctx.db, consultant.id, SEPTEMBER_BOUNDS);

      // Vendido: 10_000 + 8_000 + 12_000 = 30_000; contagem 3.
      expect(result.soldCents).toBe(30_000);
      expect(result.soldCount).toBe(3);
      // Lucro: (5000-2000)*2 + (8000-3000)*1 + (12000-5000)*1 = 6000+5000+7000=18000
      expect(result.profitCents).toBe(18_000);
      // Clientes distintas: só 1 cliente (as duas primeiras vendas), a
      // terceira venda não tem cliente.
      expect(result.clientsCount).toBe(1);
    });

    it("Recebido soma só cobranças com paid_at no período e voided_at nulo, mesmo de venda fora do escopo Vendido do período", async () => {
      const consultant = await createConsultant(ctx.db);

      // Venda de agosto, cobrança paga em setembro — conta em setembro
      // (Recebido é por paid_at, não por sold_at — RF-05).
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: new Date("2026-08-01T12:00:00.000Z"),
        delivered: new Date("2026-08-01T12:00:00.000Z"),
        items: [
          {
            productName: "Item F",
            qty: 1,
            unitPriceCents: 7_000,
            costCents: 3_000,
          },
        ],
        receivables: [
          {
            amountCents: 7_000,
            dueKind: "scheduled",
            dueDate: "2026-08-05",
            paidAt: new Date("2026-09-02T09:00:00.000Z"),
          },
        ],
      });

      // Venda de setembro, cobrança paga em outubro — NÃO conta em setembro.
      await createSale(ctx.db, consultant.id, {
        status: "open",
        soldAt: new Date("2026-09-03T12:00:00.000Z"),
        delivered: true,
        items: [
          {
            productName: "Item G",
            qty: 1,
            unitPriceCents: 6_000,
            costCents: 2_000,
          },
        ],
        receivables: [
          {
            amountCents: 6_000,
            dueKind: "scheduled",
            dueDate: "2026-10-03",
          },
        ],
      });

      const result = await metrics(ctx.db, consultant.id, SEPTEMBER_BOUNDS);

      expect(result.receivedCents).toBe(7_000);
      // O Vendido de setembro é só a venda "aberta" (a de agosto não conta,
      // sold_at fora do período).
      expect(result.soldCents).toBe(6_000);
    });

    it("lucro pode ser negativo (venda no prejuízo)", async () => {
      const consultant = await createConsultant(ctx.db);
      const soldAt = new Date("2026-09-08T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt,
        delivered: soldAt,
        items: [
          {
            productName: "Item Prejuízo",
            qty: 1,
            unitPriceCents: 1_000,
            costCents: 4_000,
          },
        ],
        receivables: [
          {
            amountCents: 1_000,
            dueKind: "scheduled",
            dueDate: "2026-09-08",
            paidAt: soldAt,
          },
        ],
      });

      const result = await metrics(ctx.db, consultant.id, SEPTEMBER_BOUNDS);

      expect(result.profitCents).toBe(-3_000);
    });

    it("escopo por consultora: vendas de outra consultora nunca aparecem", async () => {
      const consultantA = await createConsultant(ctx.db);
      const consultantB = await createConsultant(ctx.db);
      const soldAt = new Date("2026-09-08T12:00:00.000Z");
      await createSale(ctx.db, consultantB.id, {
        status: "completed",
        soldAt,
        delivered: soldAt,
        items: [
          {
            productName: "Item de outra consultora",
            qty: 1,
            unitPriceCents: 50_000,
            costCents: 10_000,
          },
        ],
        receivables: [
          {
            amountCents: 50_000,
            dueKind: "scheduled",
            dueDate: "2026-09-08",
            paidAt: soldAt,
          },
        ],
      });

      const result = await metrics(ctx.db, consultantA.id, SEPTEMBER_BOUNDS);

      expect(result.soldCents).toBe(0);
      expect(result.soldCount).toBe(0);
      expect(result.receivedCents).toBe(0);
    });
  });

  describe("series", () => {
    it("devolve 12 meses na ordem de entrada, com zeros onde não há venda, sem multiplicar o Vendido pelos itens", async () => {
      const consultant = await createConsultant(ctx.db);
      const soldAt = new Date("2026-09-12T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt,
        delivered: soldAt,
        items: [
          {
            productName: "Item H1",
            qty: 1,
            unitPriceCents: 4_000,
            costCents: 1_500,
          },
          {
            productName: "Item H2",
            qty: 1,
            unitPriceCents: 6_000,
            costCents: 2_000,
          },
        ],
        receivables: [
          {
            amountCents: 10_000,
            dueKind: "scheduled",
            dueDate: "2026-09-12",
            paidAt: soldAt,
          },
        ],
      });

      const months = monthsEndingAt("2026-09", 12).map((month) => {
        const bounds = periodBoundsUtc(
          `${month}-01`,
          lastDayOfYearMonth(month),
        );
        return { month, startUtc: bounds.startUtc, endUtc: bounds.endUtc };
      });

      const result = await series(ctx.db, consultant.id, months);

      expect(result).toHaveLength(12);
      expect(result.map((row) => row.month)).toEqual(
        months.map((m) => m.month),
      );
      const september = result.find((row) => row.month === "2026-09");
      expect(september?.soldCents).toBe(10_000);
      expect(september?.profitCents).toBe(2_500 + 4_000);
      const otherMonths = result.filter((row) => row.month !== "2026-09");
      for (const month of otherMonths) {
        expect(month.soldCents).toBe(0);
        expect(month.profitCents).toBe(0);
      }
    });
  });

  describe("topProducts", () => {
    it("agrupa por produto com desempates (qty desc, soldCents desc, nome asc) e respeita o limite", async () => {
      const consultant = await createConsultant(ctx.db);
      const productA = await createProduct(ctx.db, consultant.id, {
        name: "Produto A",
      });
      const productB = await createProduct(ctx.db, consultant.id, {
        name: "Produto B",
      });

      const soldAt1 = new Date("2026-09-02T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt1,
        delivered: soldAt1,
        items: [
          {
            productId: productA.id,
            productName: "Produto A",
            qty: 3,
            unitPriceCents: 1_000,
            costCents: 400,
          },
        ],
        receivables: [
          {
            amountCents: 3_000,
            dueKind: "scheduled",
            dueDate: "2026-09-02",
            paidAt: soldAt1,
          },
        ],
      });

      const soldAt2 = new Date("2026-09-05T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt2,
        delivered: soldAt2,
        items: [
          {
            productId: productA.id,
            productName: "Produto A",
            qty: 2,
            unitPriceCents: 1_000,
            costCents: 400,
          },
        ],
        receivables: [
          {
            amountCents: 2_000,
            dueKind: "scheduled",
            dueDate: "2026-09-05",
            paidAt: soldAt2,
          },
        ],
      });

      const soldAt3 = new Date("2026-09-06T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt3,
        delivered: soldAt3,
        items: [
          {
            productId: productB.id,
            productName: "Produto B",
            qty: 5,
            unitPriceCents: 500,
            costCents: 200,
          },
        ],
        receivables: [
          {
            amountCents: 2_500,
            dueKind: "scheduled",
            dueDate: "2026-09-06",
            paidAt: soldAt3,
          },
        ],
      });

      const result = await topProducts(
        ctx.db,
        consultant.id,
        SEPTEMBER_BOUNDS,
        5,
      );

      // Produto A: qty total 5 (3+2), soldCents 5_000; Produto B: qty 5,
      // soldCents 2_500 — mesmo qty (5), desempate por soldCents desc.
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        productId: productA.id,
        name: "Produto A",
        qty: 5,
        soldCents: 5_000,
      });
      expect(result[1]).toMatchObject({
        productId: productB.id,
        name: "Produto B",
        qty: 5,
        soldCents: 2_500,
      });
    });

    // S6 (rodada 2): dois produtos DISTINTOS (grupos diferentes) empatados em
    // qty, soldCents E nome não tinham desempate final — a ordem podia variar
    // entre execuções. `groupKey ASC` (o id do produto, como texto) fecha o
    // empate de forma estável.
    it("desempate final por groupKey quando qty, soldCents e nome empatam entre produtos distintos", async () => {
      const consultant = await createConsultant(ctx.db);
      const productA = await createProduct(ctx.db, consultant.id, {
        name: "Produto Igual",
      });
      const productB = await createProduct(ctx.db, consultant.id, {
        name: "Produto Igual",
      });

      const soldAt1 = new Date("2026-09-02T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt1,
        delivered: soldAt1,
        items: [
          {
            productId: productA.id,
            productName: "Produto Igual",
            qty: 2,
            unitPriceCents: 1_000,
            costCents: 400,
          },
        ],
        receivables: [
          {
            amountCents: 2_000,
            dueKind: "scheduled",
            dueDate: "2026-09-02",
            paidAt: soldAt1,
          },
        ],
      });

      const soldAt2 = new Date("2026-09-03T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt2,
        delivered: soldAt2,
        items: [
          {
            productId: productB.id,
            productName: "Produto Igual",
            qty: 2,
            unitPriceCents: 1_000,
            costCents: 400,
          },
        ],
        receivables: [
          {
            amountCents: 2_000,
            dueKind: "scheduled",
            dueDate: "2026-09-03",
            paidAt: soldAt2,
          },
        ],
      });

      const [firstRun, secondRun] = await Promise.all([
        topProducts(ctx.db, consultant.id, SEPTEMBER_BOUNDS, 5),
        topProducts(ctx.db, consultant.id, SEPTEMBER_BOUNDS, 5),
      ]);

      const expectedOrder = [productA.id, productB.id].toSorted((a, b) =>
        a < b ? -1 : 1,
      );

      expect(firstRun.map((row) => row.productId)).toEqual(expectedOrder);
      expect(secondRun.map((row) => row.productId)).toEqual(expectedOrder);
    });

    it("produto excluído agrupa pelo nome snapshot (productId nulo)", async () => {
      const consultant = await createConsultant(ctx.db);
      const product = await createProduct(ctx.db, consultant.id, {
        name: "Produto Removível",
      });

      const soldAt = new Date("2026-09-07T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt,
        delivered: soldAt,
        items: [
          {
            productId: product.id,
            productName: "Produto Removível",
            qty: 1,
            unitPriceCents: 2_000,
            costCents: 800,
          },
        ],
        receivables: [
          {
            amountCents: 2_000,
            dueKind: "scheduled",
            dueDate: "2026-09-07",
            paidAt: soldAt,
          },
        ],
      });

      await ctx.db.delete(products).where(eq(products.id, product.id));

      const result = await topProducts(
        ctx.db,
        consultant.id,
        SEPTEMBER_BOUNDS,
        5,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.productId).toBeNull();
      expect(result[0]?.name).toBe("Produto Removível");
    });

    it("respeita o limite informado", async () => {
      const consultant = await createConsultant(ctx.db);
      for (let index = 0; index < 6; index += 1) {
        const product = await createProduct(ctx.db, consultant.id, {
          name: `Produto ${index}`,
        });
        const soldAt = new Date(`2026-09-0${index + 1}T12:00:00.000Z`);
        await createSale(ctx.db, consultant.id, {
          status: "completed",
          soldAt,
          delivered: soldAt,
          items: [
            {
              productId: product.id,
              productName: `Produto ${index}`,
              qty: 6 - index,
              unitPriceCents: 1_000,
              costCents: 400,
            },
          ],
          receivables: [
            {
              amountCents: (6 - index) * 1_000,
              dueKind: "scheduled",
              dueDate: `2026-09-0${index + 1}`,
              paidAt: soldAt,
            },
          ],
        });
      }

      const result = await topProducts(
        ctx.db,
        consultant.id,
        SEPTEMBER_BOUNDS,
        5,
      );

      expect(result).toHaveLength(5);
    });
  });

  describe("topClients", () => {
    it("só considera vendas com cliente, agrupa e ordena por soldCents desc, salesCount desc, nome asc", async () => {
      const consultant = await createConsultant(ctx.db);
      const clientA = await createClient(ctx.db, consultant.id, {
        name: "Cliente A",
      });
      const clientB = await createClient(ctx.db, consultant.id, {
        name: "Cliente B",
      });

      const soldAt1 = new Date("2026-09-02T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt1,
        delivered: soldAt1,
        clientId: clientA.id,
        items: [
          {
            productName: "Item X",
            qty: 1,
            unitPriceCents: 10_000,
            costCents: 4_000,
          },
        ],
        receivables: [
          {
            amountCents: 10_000,
            dueKind: "scheduled",
            dueDate: "2026-09-02",
            paidAt: soldAt1,
          },
        ],
      });

      const soldAt2 = new Date("2026-09-03T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt2,
        delivered: soldAt2,
        clientId: clientB.id,
        items: [
          {
            productName: "Item Y",
            qty: 1,
            unitPriceCents: 6_000,
            costCents: 2_000,
          },
        ],
        receivables: [
          {
            amountCents: 6_000,
            dueKind: "scheduled",
            dueDate: "2026-09-03",
            paidAt: soldAt2,
          },
        ],
      });

      // Venda anônima — não entra no ranking de clientes.
      const soldAt3 = new Date("2026-09-04T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt: soldAt3,
        delivered: soldAt3,
        items: [
          {
            productName: "Item Z",
            qty: 1,
            unitPriceCents: 90_000,
            costCents: 1_000,
          },
        ],
        receivables: [
          {
            amountCents: 90_000,
            dueKind: "scheduled",
            dueDate: "2026-09-04",
            paidAt: soldAt3,
          },
        ],
      });

      const result = await topClients(
        ctx.db,
        consultant.id,
        SEPTEMBER_BOUNDS,
        5,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        clientId: clientA.id,
        name: "Cliente A",
        salesCount: 1,
        soldCents: 10_000,
      });
      expect(result[1]).toMatchObject({
        clientId: clientB.id,
        name: "Cliente B",
        salesCount: 1,
        soldCents: 6_000,
      });
    });
  });

  describe("effectiveGoal / upsertGoal", () => {
    it("meta de um mês vale para o mês seguinte sem linha própria (herança)", async () => {
      const consultant = await createConsultant(ctx.db);
      await createMonthlyGoal(ctx.db, consultant.id, "2026-09-01", 100_000);

      const result = await effectiveGoal(ctx.db, consultant.id, "2026-10-01");

      expect(result).toEqual({ goalCents: 100_000, monthStart: "2026-09-01" });
    });

    it("linha nula remove a meta a partir daquele mês", async () => {
      const consultant = await createConsultant(ctx.db);
      await createMonthlyGoal(ctx.db, consultant.id, "2026-09-01", 100_000);
      await createMonthlyGoal(ctx.db, consultant.id, "2026-11-01", null);

      const october = await effectiveGoal(ctx.db, consultant.id, "2026-10-01");
      const november = await effectiveGoal(ctx.db, consultant.id, "2026-11-01");

      expect(october).toEqual({ goalCents: 100_000, monthStart: "2026-09-01" });
      expect(november).toEqual({ goalCents: null, monthStart: "2026-11-01" });
    });

    it("mês anterior à primeira linha não tem meta (null)", async () => {
      const consultant = await createConsultant(ctx.db);
      await createMonthlyGoal(ctx.db, consultant.id, "2026-09-01", 100_000);

      const result = await effectiveGoal(ctx.db, consultant.id, "2026-08-01");

      expect(result).toBeNull();
    });

    it("upsert grava, atualiza (sem duplicar) e remove com null", async () => {
      const consultant = await createConsultant(ctx.db);

      const created = await upsertGoal(
        ctx.db,
        consultant.id,
        "2026-09-01",
        50_000,
      );
      expect(created).toBe(50_000);

      const updated = await upsertGoal(
        ctx.db,
        consultant.id,
        "2026-09-01",
        70_000,
      );
      expect(updated).toBe(70_000);

      const afterUpdate = await effectiveGoal(
        ctx.db,
        consultant.id,
        "2026-09-01",
      );
      expect(afterUpdate).toEqual({
        goalCents: 70_000,
        monthStart: "2026-09-01",
      });

      const removed = await upsertGoal(
        ctx.db,
        consultant.id,
        "2026-09-01",
        null,
      );
      expect(removed).toBeNull();

      const afterRemoval = await effectiveGoal(
        ctx.db,
        consultant.id,
        "2026-09-01",
      );
      expect(afterRemoval).toEqual({
        goalCents: null,
        monthStart: "2026-09-01",
      });
    });
  });

  describe("performance (função de alto nível)", () => {
    it("compõe métricas atuais/comparação, série, tops e meta numa única chamada", async () => {
      const consultant = await createConsultant(ctx.db);
      await createMonthlyGoal(ctx.db, consultant.id, "2026-09-01", 20_000);
      const soldAt = new Date("2026-09-10T12:00:00.000Z");
      await createSale(ctx.db, consultant.id, {
        status: "completed",
        soldAt,
        delivered: soldAt,
        items: [
          {
            productName: "Item Performance",
            qty: 1,
            unitPriceCents: 15_000,
            costCents: 5_000,
          },
        ],
        receivables: [
          {
            amountCents: 15_000,
            dueKind: "scheduled",
            dueDate: "2026-09-10",
            paidAt: soldAt,
          },
        ],
      });

      const repository = createDashboardPerformanceRepository(ctx.db);
      const months = monthsEndingAt("2026-09", 12).map((month) => {
        const bounds = periodBoundsUtc(
          `${month}-01`,
          lastDayOfYearMonth(month),
        );
        return { month, startUtc: bounds.startUtc, endUtc: bounds.endUtc };
      });

      const result = await repository.performance(consultant.id, {
        current: SEPTEMBER_BOUNDS,
        previous: AUGUST_BOUNDS,
        series: months,
        topLimit: 5,
        goalMonthStart: "2026-09-01",
      });

      expect(result.current.soldCents).toBe(15_000);
      expect(result.previous).toEqual({
        soldCents: 0,
        soldCount: 0,
        profitCents: 0,
        receivedCents: 0,
        clientsCount: 0,
      });
      expect(result.series).toHaveLength(12);
      expect(result.topProducts).toHaveLength(1);
      expect(result.goal).toEqual({
        goalCents: 20_000,
        monthStart: "2026-09-01",
      });
    });
  });
});
