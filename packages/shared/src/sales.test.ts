import { describe, expect, it, vi } from "vitest";
import {
  addMonthsClamped,
  CARD_TYPE_LABELS,
  createSaleSchema,
  DELIVERY_STATUS_LABELS,
  DUE_KIND_LABELS,
  PAYMENT_CONDITION_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  RECEIVABLE_STATUS_LABELS,
  receivableSchema,
  SALE_STATUS_LABELS,
  saleSchema,
  splitInstallmentAmounts,
  TOTAL_CENTS_INSTALLMENTS_MESSAGE,
  validateSaleTotalCents,
} from "./sales";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_INSTANT = "2026-09-10T12:00:00.000Z";
const validItem = { productId: VALID_UUID, qty: 2 } as const;

const createInput = (overrides: Record<string, unknown> = {}) => ({
  items: [validItem],
  paymentMethod: "cash",
  deliveryStatus: "pending",
  paymentCondition: "received",
  installments: 1,
  ...overrides,
});

const issueFor = (input: unknown, field: string): string => {
  const result = createSaleSchema.safeParse(input);
  if (result.success) {
    throw new Error("esperava falha de validação");
  }
  return (
    result.error.issues.find((issue) => issue.path[0] === field)?.message ?? ""
  );
};

describe("enums e labels do ciclo de venda", () => {
  it("expõe labels pt-BR para todos os estados e dimensões", () => {
    expect(SALE_STATUS_LABELS).toEqual({
      open: "Em aberto",
      completed: "Concluída",
      canceled: "Cancelada",
    });
    expect(DELIVERY_STATUS_LABELS).toEqual({
      pending: "Aguardando entrega",
      delivered: "Entregue",
    });
    expect(PAYMENT_STATUS_LABELS).toEqual({
      pending: "Pendente",
      partial: "Parcialmente paga",
      paid: "Paga",
      voided: "Anulada",
    });
    expect(PAYMENT_CONDITION_LABELS).toEqual({
      received: "Já recebi",
      on_delivery: "Receber na entrega",
      installments: "Parcelado",
    });
    expect(PAYMENT_METHOD_LABELS.credit).toBe("A prazo");
    expect(CARD_TYPE_LABELS).toEqual({ debit: "Débito", credit: "Crédito" });
    expect(DUE_KIND_LABELS).toEqual({
      scheduled: "Agendado",
      on_delivery: "Na entrega",
      unknown: "Data histórica indisponível",
    });
    expect(RECEIVABLE_STATUS_LABELS).toEqual({
      pending: "Pendente",
      paid: "Paga",
      voided: "Anulada",
    });
  });
});

describe("createSaleSchema — matriz de pagamento", () => {
  it("aceita todas as combinações válidas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));

    const validCombinations = [
      { paymentMethod: "cash", paymentCondition: "received", installments: 1 },
      {
        paymentMethod: "cash",
        paymentCondition: "on_delivery",
        installments: 1,
      },
      { paymentMethod: "pix", paymentCondition: "received", installments: 1 },
      {
        paymentMethod: "pix",
        paymentCondition: "on_delivery",
        installments: 1,
      },
      {
        paymentMethod: "pix",
        paymentCondition: "installments",
        installments: 2,
        firstDueDate: "2026-09-10",
      },
      {
        paymentMethod: "card",
        cardType: "debit",
        paymentCondition: "received",
        installments: 1,
      },
      {
        paymentMethod: "card",
        cardType: "debit",
        paymentCondition: "on_delivery",
        installments: 1,
      },
      {
        paymentMethod: "card",
        cardType: "credit",
        paymentCondition: "received",
        installments: 24,
      },
      {
        paymentMethod: "card",
        cardType: "credit",
        paymentCondition: "on_delivery",
        installments: 3,
      },
      {
        paymentMethod: "card",
        cardType: "credit",
        paymentCondition: "installments",
        installments: 2,
        firstDueDate: "2026-10-10",
      },
    ];

    for (const combination of validCombinations) {
      expect(createSaleSchema.safeParse(createInput(combination)).success).toBe(
        true,
      );
    }
    vi.useRealTimers();
  });

  it("rejeita métodos legados e combinações contraditórias no campo acionável", () => {
    expect(
      issueFor(createInput({ paymentMethod: "credit" }), "paymentMethod"),
    ).toBe("Escolha a forma de pagamento");
    expect(
      issueFor(
        createInput({
          paymentCondition: "installments",
          installments: 2,
          firstDueDate: "2026-10-10",
        }),
        "paymentCondition",
      ),
    ).toBe("Esta forma de pagamento não permite parcelamento");
    expect(
      issueFor(
        createInput({
          paymentMethod: "card",
          cardType: "debit",
          paymentCondition: "installments",
          installments: 2,
          firstDueDate: "2026-10-10",
        }),
        "paymentCondition",
      ),
    ).toBe("Esta forma de pagamento não permite parcelamento");
    expect(issueFor(createInput({ cardType: "credit" }), "cardType")).toBe(
      "Tipo de cartão só pode ser informado para pagamento com cartão",
    );
    expect(issueFor(createInput({ paymentMethod: "card" }), "cardType")).toBe(
      "Escolha o tipo do cartão",
    );
  });

  it("exige e limita os campos específicos de parcelamento", () => {
    expect(
      issueFor(
        createInput({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 1,
        }),
        "installments",
      ),
    ).toBe("Informe ao menos 2 parcelas para pagamento parcelado");
    expect(
      issueFor(
        createInput({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 2,
        }),
        "firstDueDate",
      ),
    ).toBe("Informe o primeiro vencimento para pagamento parcelado");
    expect(issueFor(createInput({ installments: 2 }), "installments")).toBe(
      "Esta condição de pagamento permite somente 1 parcela",
    );
    expect(
      issueFor(createInput({ firstDueDate: "2026-10-10" }), "firstDueDate"),
    ).toBe(
      "O primeiro vencimento só pode ser informado para pagamento parcelado",
    );
  });

  it("rejeita vencimento no passado usando a data local da aplicação", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T02:00:00.000Z"));
    expect(
      issueFor(
        createInput({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 2,
          firstDueDate: "2026-09-08",
        }),
        "firstDueDate",
      ),
    ).toBe("O primeiro vencimento não pode ser no passado");
    vi.useRealTimers();
  });
});

describe("validateSaleTotalCents", () => {
  it("aceita total zero, limites comerciais e valor acima", () => {
    expect(validateSaleTotalCents(0, 24).success).toBe(true);
    expect(validateSaleTotalCents(1, 2).success).toBe(false);
    expect(validateSaleTotalCents(2, 2).success).toBe(true);
    expect(validateSaleTotalCents(10_000, 3).success).toBe(true);
  });

  it("associa a violação de total × parcelas ao campo e mensagem pt-BR", () => {
    const result = validateSaleTotalCents(1, 2);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["installments"],
        message: TOTAL_CENTS_INSTALLMENTS_MESSAGE,
      }),
    );
  });
});

describe("contratos de resposta", () => {
  it("exige o plano, ciclo, totais e timestamps da venda", () => {
    const result = saleSchema.safeParse({
      id: VALID_UUID,
      clientId: null,
      clientName: "Cliente removida",
      totalCents: 10_000,
      paymentMethod: "card",
      paymentCondition: "installments",
      cardType: "credit",
      installments: 3,
      paymentPlanKnown: true,
      status: "open",
      deliveryStatus: "pending",
      paymentStatus: "partial",
      paidCents: 3334,
      outstandingCents: 6666,
      soldAt: VALID_INSTANT,
      deliveredAt: null,
      completedAt: null,
      canceledAt: null,
      createdAt: VALID_INSTANT,
      updatedAt: VALID_INSTANT,
      items: [],
      receivables: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          saleId: VALID_UUID,
          amountCents: 3334,
          dueDate: "2026-10-10",
          dueKind: "scheduled",
          paidAt: VALID_INSTANT,
          voidedAt: null,
          status: "paid",
          overdue: false,
          createdAt: VALID_INSTANT,
          updatedAt: VALID_INSTANT,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("mantém dueKind e dueDate coerentes", () => {
    const base = {
      id: "22222222-2222-4222-8222-222222222222",
      saleId: VALID_UUID,
      amountCents: 100,
      paidAt: null,
      voidedAt: null,
      status: "pending",
      overdue: false,
      createdAt: VALID_INSTANT,
      updatedAt: VALID_INSTANT,
    };
    expect(
      receivableSchema.safeParse({
        ...base,
        dueKind: "scheduled",
        dueDate: null,
      }).success,
    ).toBe(false);
    expect(
      receivableSchema.safeParse({
        ...base,
        dueKind: "on_delivery",
        dueDate: "2026-10-10",
      }).success,
    ).toBe(false);
  });
});

describe("helpers financeiros existentes", () => {
  it("divide centavos sem perda e rejeita parcela de zero centavo", () => {
    expect(splitInstallmentAmounts(10_000, 3)).toEqual([3334, 3333, 3333]);
    expect(() => splitInstallmentAmounts(1, 2)).toThrow();
  });

  it("mantém vencimentos mensais ancorados", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
  });
});
