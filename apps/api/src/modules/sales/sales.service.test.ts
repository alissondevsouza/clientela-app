import type { CreateSale } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { InvalidSaleCreditError, InvalidSaleDateError } from "./sales.errors";
import {
  composeSaleCreation,
  derivePaymentProjection,
  deriveReceivableStatus,
  type SaleProductSnapshot,
} from "./sales.service";

const PRODUCT_ID = "11111111-1111-7111-8111-111111111111";
// 2026-09-10T02:30:00.000Z = 2026-09-09 23:30 BRT (fuso da aplicação):
// dia local de "hoje" para efeito dos testes é "2026-09-09".
const TRANSACTION_NOW = new Date("2026-09-10T02:30:00.000Z");
const TODAY_LOCAL_DATE = "2026-09-09";

const product = (priceCents = 10_000): SaleProductSnapshot => ({
  id: PRODUCT_ID,
  name: "Base Líquida",
  priceCents,
  costCents: 2_500,
});

const input = (overrides: Partial<CreateSale> = {}): CreateSale => ({
  items: [{ productId: PRODUCT_ID, qty: 1 }],
  paymentMethod: "cash",
  deliveryStatus: "pending",
  paymentCondition: "received",
  installments: 1,
  ...overrides,
});

describe("composeSaleCreation", () => {
  it.each([
    {
      name: "dinheiro recebido",
      value: input({ paymentMethod: "cash", paymentCondition: "received" }),
      receivableCount: 1,
      dueKind: "scheduled",
      paymentStatus: "paid",
    },
    {
      name: "dinheiro na entrega",
      value: input({
        paymentMethod: "cash",
        paymentCondition: "on_delivery",
      }),
      receivableCount: 1,
      dueKind: "on_delivery",
      paymentStatus: "pending",
    },
    {
      name: "PIX recebido",
      value: input({ paymentMethod: "pix", paymentCondition: "received" }),
      receivableCount: 1,
      dueKind: "scheduled",
      paymentStatus: "paid",
    },
    {
      name: "PIX na entrega",
      value: input({ paymentMethod: "pix", paymentCondition: "on_delivery" }),
      receivableCount: 1,
      dueKind: "on_delivery",
      paymentStatus: "pending",
    },
    {
      name: "PIX parcelado",
      value: input({
        paymentMethod: "pix",
        paymentCondition: "installments",
        installments: 3,
        firstDueDate: "2026-09-30",
      }),
      receivableCount: 3,
      dueKind: "scheduled",
      paymentStatus: "pending",
    },
    {
      name: "cartão débito recebido",
      value: input({
        paymentMethod: "card",
        cardType: "debit",
        paymentCondition: "received",
      }),
      receivableCount: 1,
      dueKind: "scheduled",
      paymentStatus: "paid",
    },
    {
      name: "cartão débito na entrega",
      value: input({
        paymentMethod: "card",
        cardType: "debit",
        paymentCondition: "on_delivery",
      }),
      receivableCount: 1,
      dueKind: "on_delivery",
      paymentStatus: "pending",
    },
    {
      name: "cartão crédito recebido em três parcelas comerciais",
      value: input({
        paymentMethod: "card",
        cardType: "credit",
        paymentCondition: "received",
        installments: 3,
      }),
      receivableCount: 1,
      dueKind: "scheduled",
      paymentStatus: "paid",
    },
    {
      name: "cartão crédito na entrega",
      value: input({
        paymentMethod: "card",
        cardType: "credit",
        paymentCondition: "on_delivery",
        installments: 3,
      }),
      receivableCount: 1,
      dueKind: "on_delivery",
      paymentStatus: "pending",
    },
    {
      name: "cartão crédito parcelado",
      value: input({
        paymentMethod: "card",
        cardType: "credit",
        paymentCondition: "installments",
        installments: 3,
        firstDueDate: "2026-09-30",
      }),
      receivableCount: 3,
      dueKind: "scheduled",
      paymentStatus: "pending",
    },
  ])("compõe $name conforme a matriz", ({ value, ...expected }) => {
    const composed = composeSaleCreation(value, [product()], TRANSACTION_NOW);

    expect(composed.receivables).toHaveLength(expected.receivableCount);
    expect(
      composed.receivables.every((row) => row.dueKind === expected.dueKind),
    ).toBe(true);
    expect(composed.paymentStatus).toBe(expected.paymentStatus);
    expect(composed.sale.status).toBe("open");
    expect(composed.sale.paymentPlanKnown).toBe(true);
    expect(composed.items).toEqual([
      {
        productId: PRODUCT_ID,
        productName: "Base Líquida",
        qty: 1,
        unitPriceCents: 10_000,
        costCents: 2_500,
      },
    ]);
  });

  it("divide parcelamento sem perda e preserva a âncora mensal", () => {
    const composed = composeSaleCreation(
      input({
        paymentMethod: "pix",
        paymentCondition: "installments",
        installments: 3,
        firstDueDate: "2026-01-31",
      }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(composed.receivables.map((row) => row.amountCents)).toEqual([
      3334, 3333, 3333,
    ]);
    expect(composed.receivables.map((row) => row.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("materializa vencimento na criação já entregue e conclui somente quando paga", () => {
    const received = composeSaleCreation(
      input({ deliveryStatus: "delivered" }),
      [product()],
      TRANSACTION_NOW,
    );
    const onDelivery = composeSaleCreation(
      input({ paymentCondition: "on_delivery", deliveryStatus: "delivered" }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(received.sale.status).toBe("completed");
    expect(received.sale.deliveredAt).toBe(TRANSACTION_NOW);
    expect(received.sale.completedAt).toBe(TRANSACTION_NOW);
    expect(received.receivables[0]).toMatchObject({
      dueDate: "2026-09-09",
      dueKind: "scheduled",
      paidAt: TRANSACTION_NOW,
    });
    expect(onDelivery.sale.status).toBe("open");
    expect(onDelivery.receivables[0]).toMatchObject({
      dueDate: "2026-09-09",
      dueKind: "scheduled",
      paidAt: null,
    });
  });

  it("aceita total positivo igual às parcelas e rejeita total menor no campo installments", () => {
    const equal = composeSaleCreation(
      input({
        paymentMethod: "pix",
        paymentCondition: "installments",
        installments: 3,
        firstDueDate: "2026-10-01",
      }),
      [product(3)],
      TRANSACTION_NOW,
    );
    expect(equal.receivables.map((row) => row.amountCents)).toEqual([1, 1, 1]);

    expect(() =>
      composeSaleCreation(
        input({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 3,
          firstDueDate: "2026-10-01",
        }),
        [product(2)],
        TRANSACTION_NOW,
      ),
    ).toThrow(InvalidSaleCreditError);
    expect(() =>
      composeSaleCreation(
        input({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 3,
          firstDueDate: "2026-10-01",
        }),
        [product(2)],
        TRANSACTION_NOW,
      ),
    ).toThrow("O total da venda precisa ter ao menos R$ 0,01 por parcela");
  });

  it.each([
    input({ paymentCondition: "received" }),
    input({ paymentCondition: "on_delivery" }),
    input({
      paymentMethod: "pix",
      paymentCondition: "installments",
      installments: 2,
      firstDueDate: "2026-10-01",
    }),
    input({
      paymentMethod: "card",
      cardType: "credit",
      paymentCondition: "installments",
      installments: 2,
      firstDueDate: "2026-10-01",
    }),
  ])("total zero não cria cobrança e só conclui após entrega", (value) => {
    const pending = composeSaleCreation(value, [product(0)], TRANSACTION_NOW);
    const delivered = composeSaleCreation(
      { ...value, deliveryStatus: "delivered" },
      [product(0)],
      TRANSACTION_NOW,
    );

    expect(pending.receivables).toEqual([]);
    expect(pending.paymentStatus).toBe("paid");
    expect(pending.sale).toMatchObject({ status: "open", completedAt: null });
    expect(delivered.sale).toMatchObject({
      status: "completed",
      completedAt: TRANSACTION_NOW,
    });
  });

  it("propaga o mesmo instante canônico para todo timestamp da criação", () => {
    const composed = composeSaleCreation(input(), [product()], TRANSACTION_NOW);
    const [receivable] = composed.receivables;

    expect(composed.sale.soldAt).toBe(TRANSACTION_NOW);
    expect(composed.sale.createdAt).toBe(TRANSACTION_NOW);
    expect(composed.sale.updatedAt).toBe(TRANSACTION_NOW);
    expect(receivable?.createdAt).toBe(TRANSACTION_NOW);
    expect(receivable?.updatedAt).toBe(TRANSACTION_NOW);
    expect(receivable?.paidAt).toBe(TRANSACTION_NOW);
  });
});

describe("composeSaleCreation — data retroativa (RF-02/RF-03/RF-04/RF-05)", () => {
  const PAST_LOCAL_DATE = "2026-08-15";
  // 12:00 BRT (fuso fixo, sem DST em 2026) = 15:00 UTC.
  const PAST_SALE_INSTANT = new Date("2026-08-15T15:00:00.000Z");

  it("soldOn ausente preserva transactionNow exatamente (caminho quente)", () => {
    const composed = composeSaleCreation(
      input({ deliveryStatus: "delivered" }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(composed.sale.soldAt).toBe(TRANSACTION_NOW);
    expect(composed.sale.deliveredAt).toBe(TRANSACTION_NOW);
    expect(composed.sale.completedAt).toBe(TRANSACTION_NOW);
  });

  it("soldOn igual ao dia local de hoje preserva transactionNow exatamente", () => {
    const composed = composeSaleCreation(
      input({ soldOn: TODAY_LOCAL_DATE, deliveryStatus: "delivered" }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(composed.sale.soldAt).toBe(TRANSACTION_NOW);
    expect(composed.sale.deliveredAt).toBe(TRANSACTION_NOW);
    expect(composed.sale.completedAt).toBe(TRANSACTION_NOW);
  });

  it("soldOn passado grava soldAt ao meio-dia local do dia escolhido (fuso da aplicação, não UTC)", () => {
    const composed = composeSaleCreation(
      input({ soldOn: PAST_LOCAL_DATE }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(composed.sale.soldAt).toEqual(PAST_SALE_INSTANT);
  });

  it("venda retroativa entregue: delivered_at e completed_at acompanham soldAt; created_at/updated_at continuam no relógio", () => {
    const composed = composeSaleCreation(
      input({ soldOn: PAST_LOCAL_DATE, deliveryStatus: "delivered" }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(composed.sale.soldAt).toEqual(PAST_SALE_INSTANT);
    expect(composed.sale.deliveredAt).toEqual(PAST_SALE_INSTANT);
    expect(composed.sale.completedAt).toEqual(PAST_SALE_INSTANT);
    expect(composed.sale.createdAt).toBe(TRANSACTION_NOW);
    expect(composed.sale.updatedAt).toBe(TRANSACTION_NOW);
  });

  it("soldOn futuro (relativo ao dia local de transactionNow) lança InvalidSaleDateError", () => {
    expect(() =>
      composeSaleCreation(
        input({ soldOn: "2026-09-10" }),
        [product()],
        TRANSACTION_NOW,
      ),
    ).toThrow(InvalidSaleDateError);
  });

  it.each([
    {
      name: "recebido (à vista)",
      condition: { paymentCondition: "received" as const },
    },
    {
      name: "a receber na entrega",
      condition: {
        paymentCondition: "on_delivery" as const,
        deliveryStatus: "delivered" as const,
      },
    },
    {
      name: "parcelado",
      condition: {
        paymentMethod: "pix" as const,
        paymentCondition: "installments" as const,
        installments: 2,
        firstDueDate: PAST_LOCAL_DATE,
      },
    },
  ])(
    "venda retroativa $name: cobrança sintética acompanha a data da venda",
    ({ condition }) => {
      const composed = composeSaleCreation(
        input({ soldOn: PAST_LOCAL_DATE, ...condition }),
        [product()],
        TRANSACTION_NOW,
      );

      for (const receivable of composed.receivables) {
        expect(receivable.createdAt).toBe(TRANSACTION_NOW);
        expect(receivable.updatedAt).toBe(TRANSACTION_NOW);
      }
    },
  );

  it("venda retroativa recebida: due_date/paid_at na data da venda; venda de hoje: due_date/paid_at hoje", () => {
    const retroactive = composeSaleCreation(
      input({ soldOn: PAST_LOCAL_DATE, paymentCondition: "received" }),
      [product()],
      TRANSACTION_NOW,
    );
    const today = composeSaleCreation(
      input({ paymentCondition: "received" }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(retroactive.receivables[0]).toMatchObject({
      dueDate: PAST_LOCAL_DATE,
      paidAt: PAST_SALE_INSTANT,
    });
    expect(today.receivables[0]).toMatchObject({
      dueDate: TODAY_LOCAL_DATE,
      paidAt: TRANSACTION_NOW,
    });
  });

  it("venda retroativa a receber na entrega (entregue): due_date na data da venda, paid_at continua nulo", () => {
    const composed = composeSaleCreation(
      input({
        soldOn: PAST_LOCAL_DATE,
        paymentCondition: "on_delivery",
        deliveryStatus: "delivered",
      }),
      [product()],
      TRANSACTION_NOW,
    );

    expect(composed.receivables[0]).toMatchObject({
      dueDate: PAST_LOCAL_DATE,
      paidAt: null,
    });
  });
});

describe("projeções de pagamento", () => {
  it("deriva pending, partial, paid e voided sem contar cobranças anuladas", () => {
    expect(
      derivePaymentProjection(100, "open", [
        { amountCents: 100, paidAt: null, voidedAt: null },
      ]),
    ).toEqual({
      paymentStatus: "pending",
      paidCents: 0,
      outstandingCents: 100,
    });
    expect(
      derivePaymentProjection(100, "open", [
        { amountCents: 50, paidAt: TRANSACTION_NOW, voidedAt: null },
        { amountCents: 50, paidAt: null, voidedAt: null },
      ]),
    ).toEqual({
      paymentStatus: "partial",
      paidCents: 50,
      outstandingCents: 50,
    });
    expect(
      derivePaymentProjection(100, "completed", [
        { amountCents: 100, paidAt: TRANSACTION_NOW, voidedAt: null },
      ]),
    ).toEqual({ paymentStatus: "paid", paidCents: 100, outstandingCents: 0 });
    expect(
      derivePaymentProjection(100, "canceled", [
        { amountCents: 100, paidAt: null, voidedAt: TRANSACTION_NOW },
      ]),
    ).toEqual({ paymentStatus: "voided", paidCents: 0, outstandingCents: 0 });
  });

  it("prioriza anulação ao projetar o estado de uma cobrança histórica", () => {
    expect(deriveReceivableStatus({ paidAt: null, voidedAt: null })).toBe(
      "pending",
    );
    expect(
      deriveReceivableStatus({ paidAt: TRANSACTION_NOW, voidedAt: null }),
    ).toBe("paid");
    expect(
      deriveReceivableStatus({ paidAt: null, voidedAt: TRANSACTION_NOW }),
    ).toBe("voided");
  });
});
