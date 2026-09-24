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
  receivablesListQuerySchema,
  SALE_STATUS_LABELS,
  SALES_LIST_STATUS_FILTER_LABELS,
  saleSchema,
  saleStatusValues,
  salesListQuerySchema,
  salesListStatusFilterValues,
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
    ).toBe("O primeiro vencimento não pode ser anterior à data da venda");
    vi.useRealTimers();
  });
});

describe("createSaleSchema — soldOn (data da venda)", () => {
  it("aceita ausência de soldOn (compatibilidade com chamadores atuais)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(VALID_INSTANT));
    expect(createSaleSchema.safeParse(createInput()).success).toBe(true);
    vi.useRealTimers();
  });

  it("aceita soldOn de data passada", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    expect(
      createSaleSchema.safeParse(createInput({ soldOn: "2026-01-15" })).success,
    ).toBe(true);
    vi.useRealTimers();
  });

  it("rejeita soldOn no futuro com a mensagem exata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    expect(issueFor(createInput({ soldOn: "2026-09-11" }), "soldOn")).toBe(
      "A data da venda não pode ser no futuro",
    );
    vi.useRealTimers();
  });

  it("rejeita soldOn anterior ao piso 01/01/2015 com a mensagem exata, e aceita o próprio piso", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    expect(issueFor(createInput({ soldOn: "2014-12-31" }), "soldOn")).toBe(
      "A data da venda não pode ser anterior a 01/01/2015",
    );
    expect(
      createSaleSchema.safeParse(createInput({ soldOn: "2015-01-01" })).success,
    ).toBe(true);
    vi.useRealTimers();
  });

  it("rejeita soldOn com formato inválido", () => {
    expect(
      createSaleSchema.safeParse(createInput({ soldOn: "15/01/2026" })).success,
    ).toBe(false);
  });

  it("aceita venda retroativa com firstDueDate entre a data da venda e hoje", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    expect(
      createSaleSchema.safeParse(
        createInput({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 2,
          soldOn: "2026-08-01",
          firstDueDate: "2026-08-15",
        }),
      ).success,
    ).toBe(true);
    vi.useRealTimers();
  });

  it("rejeita firstDueDate anterior à data da venda", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    expect(
      issueFor(
        createInput({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 2,
          soldOn: "2026-08-01",
          firstDueDate: "2026-07-31",
        }),
        "firstDueDate",
      ),
    ).toBe("O primeiro vencimento não pode ser anterior à data da venda");
    vi.useRealTimers();
  });

  it("venda de hoje mantém o comportamento atual de firstDueDate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    expect(
      createSaleSchema.safeParse(
        createInput({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 2,
          soldOn: "2026-09-10",
          firstDueDate: "2026-09-10",
        }),
      ).success,
    ).toBe(true);
    expect(
      issueFor(
        createInput({
          paymentMethod: "pix",
          paymentCondition: "installments",
          installments: 2,
          soldOn: "2026-09-10",
          firstDueDate: "2026-09-09",
        }),
        "firstDueDate",
      ),
    ).toBe("O primeiro vencimento não pode ser anterior à data da venda");
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

describe("salesListQuerySchema — filtros novos (RF-14)", () => {
  const issueForSalesQuery = (input: unknown, field: string): string => {
    const result = salesListQuerySchema.safeParse(input);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    return (
      result.error.issues.find((issue) => issue.path[0] === field)?.message ??
      ""
    );
  };

  it("sem parâmetros novos, resolve igual ao contrato atual (page/perPage default, sem filtros)", () => {
    const result = salesListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        page: 1,
        perPage: 20,
        status: undefined,
        clientId: undefined,
        soldFrom: undefined,
        soldTo: undefined,
        delivery: undefined,
      });
    }
  });

  it("expõe salesListStatusFilterValues como saleStatusValues + sold, com rótulo pt-BR", () => {
    expect(salesListStatusFilterValues).toEqual([...saleStatusValues, "sold"]);
    expect(SALES_LIST_STATUS_FILTER_LABELS).toEqual({
      open: "Em aberto",
      completed: "Concluída",
      canceled: "Cancelada",
      sold: "Vendidas",
    });
  });

  it("aceita cada status do filtro, inclusive o escopo Vendido (status=sold)", () => {
    for (const status of salesListStatusFilterValues) {
      expect(salesListQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejeita status fora do enum com a mensagem pt-BR", () => {
    expect(issueForSalesQuery({ status: "refunded" }, "status")).toBe(
      "Status de venda inválido",
    );
  });

  it("aceita soldFrom e soldTo isoladamente (independentes entre si)", () => {
    expect(
      salesListQuerySchema.safeParse({ soldFrom: "2026-09-01" }).success,
    ).toBe(true);
    expect(
      salesListQuerySchema.safeParse({ soldTo: "2026-09-30" }).success,
    ).toBe(true);
  });

  it("aceita soldFrom igual a soldTo (borda do mesmo dia)", () => {
    expect(
      salesListQuerySchema.safeParse({
        soldFrom: "2026-09-15",
        soldTo: "2026-09-15",
      }).success,
    ).toBe(true);
  });

  it("rejeita soldFrom posterior a soldTo com mensagem pt-BR no campo soldTo", () => {
    expect(
      issueForSalesQuery(
        { soldFrom: "2026-09-20", soldTo: "2026-09-10" },
        "soldTo",
      ),
    ).toBe("A data inicial da venda não pode ser depois da data final");
  });

  it("rejeita soldFrom/soldTo com formato inválido", () => {
    expect(
      salesListQuerySchema.safeParse({ soldFrom: "15/09/2026" }).success,
    ).toBe(false);
    expect(
      salesListQuerySchema.safeParse({ soldTo: "2026-13-01" }).success,
    ).toBe(false);
  });

  // A3 (rodada 2): "9999-12-31" passa no formato `z.iso.date()`, mas fazia o
  // service quebrar em 500 ao calcular o dia SEGUINTE ("10000-01-01", que o
  // parser de `time.ts` rejeita) — piso/teto barram isso ainda no Zod, com
  // 422 e mensagem pt-BR, nunca 500.
  it("rejeita soldFrom/soldTo muito no futuro (ex.: 9999-12-31) com mensagem pt-BR", () => {
    expect(issueForSalesQuery({ soldFrom: "9999-12-31" }, "soldFrom")).toBe(
      "A data inicial da venda deve estar entre 01/01/2015 e 31/12/2099",
    );
    expect(issueForSalesQuery({ soldTo: "9999-12-31" }, "soldTo")).toBe(
      "A data final da venda deve estar entre 01/01/2015 e 31/12/2099",
    );
  });

  it("rejeita soldFrom/soldTo anterior a 2015-01-01 (ano digitado errado)", () => {
    expect(issueForSalesQuery({ soldFrom: "0099-01-01" }, "soldFrom")).toBe(
      "A data inicial da venda deve estar entre 01/01/2015 e 31/12/2099",
    );
  });

  it("aceita soldFrom/soldTo exatamente nos limites (2015-01-01 e 2099-12-31)", () => {
    expect(
      salesListQuerySchema.safeParse({
        soldFrom: "2015-01-01",
        soldTo: "2099-12-31",
      }).success,
    ).toBe(true);
  });

  it("aceita delivery pending/delivered e rejeita valor fora do enum", () => {
    expect(
      salesListQuerySchema.safeParse({ delivery: "pending" }).success,
    ).toBe(true);
    expect(
      salesListQuerySchema.safeParse({ delivery: "delivered" }).success,
    ).toBe(true);
    expect(issueForSalesQuery({ delivery: "shipped" }, "delivery")).toBe(
      "Situação de entrega inválida",
    );
  });

  it("combina status=sold, soldFrom/soldTo e delivery sem conflito", () => {
    expect(
      salesListQuerySchema.safeParse({
        status: "sold",
        soldFrom: "2026-09-01",
        soldTo: "2026-09-30",
        delivery: "pending",
      }).success,
    ).toBe(true);
  });
});

describe("receivablesListQuerySchema — filtros novos (RF-15)", () => {
  const issueForReceivablesQuery = (input: unknown, field: string): string => {
    const result = receivablesListQuerySchema.safeParse(input);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    return (
      result.error.issues.find((issue) => issue.path[0] === field)?.message ??
      ""
    );
  };

  it("sem parâmetros novos, resolve igual ao contrato atual (pending=true, sem os demais)", () => {
    const result = receivablesListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        page: 1,
        perPage: 20,
        pending: true,
        overdue: false,
        paidFrom: undefined,
        paidTo: undefined,
      });
    }
  });

  it("aceita overdue=true junto com pending=true (padrão)", () => {
    const result = receivablesListQuerySchema.safeParse({ overdue: "true" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overdue).toBe(true);
      expect(result.data.pending).toBe(true);
    }
  });

  it("rejeita overdue=true com pending=false, mensagem pt-BR no campo overdue", () => {
    expect(
      issueForReceivablesQuery(
        { overdue: "true", pending: "false" },
        "overdue",
      ),
    ).toBe(
      "O filtro de atrasadas só pode ser usado junto com as cobranças pendentes",
    );
  });

  it("rejeita valor de overdue fora de true/false com mensagem pt-BR", () => {
    expect(issueForReceivablesQuery({ overdue: "amanha" }, "overdue")).toBe(
      "Informe se deseja somente as cobranças atrasadas (true ou false)",
    );
  });

  it("aceita paidFrom e paidTo isoladamente, só com pending=false", () => {
    expect(
      receivablesListQuerySchema.safeParse({
        pending: "false",
        paidFrom: "2026-09-01",
      }).success,
    ).toBe(true);
    expect(
      receivablesListQuerySchema.safeParse({
        pending: "false",
        paidTo: "2026-09-30",
      }).success,
    ).toBe(true);
  });

  it("aceita paidFrom igual a paidTo (borda do mesmo dia)", () => {
    expect(
      receivablesListQuerySchema.safeParse({
        pending: "false",
        paidFrom: "2026-09-15",
        paidTo: "2026-09-15",
      }).success,
    ).toBe(true);
  });

  it("rejeita paidFrom/paidTo com pending=true (explícito ou pelo default), mensagem pt-BR", () => {
    expect(
      issueForReceivablesQuery(
        { pending: "true", paidFrom: "2026-09-01" },
        "paidFrom",
      ),
    ).toBe(
      "O filtro de período recebido só pode ser usado com as cobranças já pagas (pending=false)",
    );
    expect(issueForReceivablesQuery({ paidTo: "2026-09-30" }, "paidFrom")).toBe(
      "O filtro de período recebido só pode ser usado com as cobranças já pagas (pending=false)",
    );
  });

  it("rejeita paidFrom posterior a paidTo com mensagem pt-BR no campo paidTo", () => {
    expect(
      issueForReceivablesQuery(
        { pending: "false", paidFrom: "2026-09-20", paidTo: "2026-09-10" },
        "paidTo",
      ),
    ).toBe("A data inicial do recebimento não pode ser depois da data final");
  });

  it("rejeita paidFrom/paidTo com formato inválido", () => {
    expect(
      receivablesListQuerySchema.safeParse({
        pending: "false",
        paidFrom: "01/09/2026",
      }).success,
    ).toBe(false);
  });

  // A3 (rodada 2): mesma proteção de soldFrom/soldTo — nunca 500 por causa de
  // uma data-limite aceita pelo formato.
  it("rejeita paidFrom/paidTo muito no futuro (ex.: 9999-12-31) com mensagem pt-BR", () => {
    expect(
      issueForReceivablesQuery(
        { pending: "false", paidFrom: "9999-12-31" },
        "paidFrom",
      ),
    ).toBe(
      "A data inicial do recebimento deve estar entre 01/01/2015 e 31/12/2099",
    );
    expect(
      issueForReceivablesQuery(
        { pending: "false", paidTo: "9999-12-31" },
        "paidTo",
      ),
    ).toBe(
      "A data final do recebimento deve estar entre 01/01/2015 e 31/12/2099",
    );
  });

  it("aceita paidFrom/paidTo exatamente nos limites (2015-01-01 e 2099-12-31)", () => {
    expect(
      receivablesListQuerySchema.safeParse({
        pending: "false",
        paidFrom: "2015-01-01",
        paidTo: "2099-12-31",
      }).success,
    ).toBe(true);
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
