import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  createSaleSchema,
  PAYMENT_METHOD_LABELS,
  paymentMethodValues,
  receivablesListQuerySchema,
  SALE_STATUS_LABELS,
  saleStatusValues,
  salesListQuerySchema,
  splitInstallmentAmounts,
} from "./sales";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";

// Data ISO derivada da data corrente REAL com deslocamento de dias — evita flake
// (o schema compara com "ontem" do runtime). Local, casando com a leitura do
// schema (que usa componentes locais do relógio).
const isoWithDayOffset = (offsetDays: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const firstMessage = (
  result: ReturnType<typeof createSaleSchema.safeParse>,
): string => {
  if (result.success) {
    throw new Error("esperava falha de validação");
  }
  return result.error.issues[0]?.message ?? "";
};

const validItem = { productId: VALID_UUID, qty: 2 } as const;

describe("enums e labels", () => {
  it("expõe os valores de forma de pagamento e status", () => {
    expect(paymentMethodValues).toEqual(["cash", "pix", "card", "credit"]);
    expect(saleStatusValues).toEqual(["completed", "canceled"]);
  });

  it("mapeia labels pt-BR de forma de pagamento", () => {
    expect(PAYMENT_METHOD_LABELS.cash).toBe("Dinheiro");
    expect(PAYMENT_METHOD_LABELS.pix).toBe("PIX");
    expect(PAYMENT_METHOD_LABELS.card).toBe("Cartão");
    expect(PAYMENT_METHOD_LABELS.credit).toBe("A prazo");
  });

  it("mapeia labels pt-BR de status", () => {
    expect(SALE_STATUS_LABELS.completed).toBe("Concluída");
    expect(SALE_STATUS_LABELS.canceled).toBe("Cancelada");
  });
});

describe("splitInstallmentAmounts", () => {
  it("distribui o resto +1 nas primeiras parcelas (10000 em 3×)", () => {
    const result = splitInstallmentAmounts(10000, 3);
    expect(result).toEqual([3334, 3333, 3333]);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(10000);
  });

  it("distribui centavos com total pequeno (10 em 3×)", () => {
    const result = splitInstallmentAmounts(10, 3);
    expect(result).toEqual([4, 3, 3]);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it("resto zero ⇒ parcelas iguais", () => {
    expect(splitInstallmentAmounts(9000, 3)).toEqual([3000, 3000, 3000]);
  });

  it("uma única parcela recebe o total inteiro", () => {
    expect(splitInstallmentAmounts(5000, 1)).toEqual([5000]);
  });

  it("total igual ao número de parcelas ⇒ todas 1 centavo", () => {
    expect(splitInstallmentAmounts(3, 3)).toEqual([1, 1, 1]);
  });

  it("mantém a soma exata para restos arbitrários (1..n-1)", () => {
    for (let installments = 1; installments <= 24; installments += 1) {
      for (let remainder = 0; remainder < installments; remainder += 1) {
        const total = installments * 100 + remainder;
        const parts = splitInstallmentAmounts(total, installments);
        expect(parts).toHaveLength(installments);
        expect(parts.reduce((sum, value) => sum + value, 0)).toBe(total);
      }
    }
  });

  it("lança para número de parcelas < 1", () => {
    expect(() => splitInstallmentAmounts(1000, 0)).toThrow();
    expect(() => splitInstallmentAmounts(1000, -1)).toThrow();
  });

  it("lança quando total < número de parcelas", () => {
    expect(() => splitInstallmentAmounts(2, 3)).toThrow();
  });

  it("lança para inputs não-inteiros", () => {
    expect(() => splitInstallmentAmounts(1000.5, 3)).toThrow();
    expect(() => splitInstallmentAmounts(1000, 2.5)).toThrow();
  });
});

describe("addMonthsClamped", () => {
  it("31/jan +1 ⇒ 28/fev (clamp ao último dia)", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("31/jan +2 ⇒ 31/mar (sem drift, ancorado no dia original)", () => {
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
  });

  it("31/jan +1 em ano bissexto ⇒ 29/fev", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("31/dez +1 ⇒ 31/jan do ano seguinte", () => {
    expect(addMonthsClamped("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("30/jan +1 ⇒ 28/fev", () => {
    expect(addMonthsClamped("2026-01-30", 1)).toBe("2026-02-28");
  });

  it("dia que existe no mês alvo é preservado", () => {
    expect(addMonthsClamped("2026-03-15", 1)).toBe("2026-04-15");
  });

  it("somar 0 meses devolve a mesma data", () => {
    expect(addMonthsClamped("2026-07-18", 0)).toBe("2026-07-18");
  });

  it("vencimentos mensais consecutivos a partir de 31/jan não driftam", () => {
    const base = "2026-01-31";
    expect(addMonthsClamped(base, 0)).toBe("2026-01-31");
    expect(addMonthsClamped(base, 1)).toBe("2026-02-28");
    expect(addMonthsClamped(base, 2)).toBe("2026-03-31");
    expect(addMonthsClamped(base, 3)).toBe("2026-04-30");
  });

  it("lança para data ISO inválida", () => {
    expect(() => addMonthsClamped("18/07/2026", 1)).toThrow();
    expect(() => addMonthsClamped("2026-7-8", 1)).toThrow();
  });
});

describe("createSaleSchema", () => {
  it("aceita venda à vista sem primeiro vencimento e aplica installments default 1", () => {
    const result = createSaleSchema.parse({
      items: [validItem],
      paymentMethod: "pix",
    });
    expect(result.installments).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.qty).toBe(2);
    expect(result.items[0]?.unitPriceCents).toBeUndefined();
  });

  it("aceita clientId nullable e unitPriceCents opcional", () => {
    const result = createSaleSchema.parse({
      clientId: null,
      items: [{ productId: VALID_UUID, qty: 1, unitPriceCents: 5990 }],
      paymentMethod: "cash",
    });
    expect(result.clientId).toBeNull();
    expect(result.items[0]?.unitPriceCents).toBe(5990);
  });

  it("aceita venda a prazo com firstDueDate a partir de ontem", () => {
    const yesterday = createSaleSchema.safeParse({
      items: [validItem],
      paymentMethod: "credit",
      installments: 3,
      firstDueDate: isoWithDayOffset(-1),
    });
    expect(yesterday.success).toBe(true);

    const today = createSaleSchema.safeParse({
      items: [validItem],
      paymentMethod: "credit",
      firstDueDate: isoWithDayOffset(0),
    });
    expect(today.success).toBe(true);

    const future = createSaleSchema.safeParse({
      items: [validItem],
      paymentMethod: "credit",
      firstDueDate: isoWithDayOffset(30),
    });
    expect(future.success).toBe(true);
  });

  it("rejeita venda a prazo sem firstDueDate com mensagem pt-BR", () => {
    const result = createSaleSchema.safeParse({
      items: [validItem],
      paymentMethod: "credit",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "Informe o primeiro vencimento para venda a prazo",
    );
  });

  it("rejeita firstDueDate de anteontem (anterior a ontem)", () => {
    const result = createSaleSchema.safeParse({
      items: [validItem],
      paymentMethod: "credit",
      firstDueDate: isoWithDayOffset(-2),
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "O primeiro vencimento não pode ser no passado",
    );
  });

  it("rejeita lista de itens vazia com mensagem pt-BR", () => {
    const result = createSaleSchema.safeParse({
      items: [],
      paymentMethod: "cash",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Informe ao menos um item da venda");
  });

  it("rejeita mais de 50 itens", () => {
    const items = Array.from({ length: 51 }, () => validItem);
    const result = createSaleSchema.safeParse({ items, paymentMethod: "cash" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("A venda deve ter no máximo 50 itens");
  });

  it("rejeita installments acima de 24", () => {
    const result = createSaleSchema.safeParse({
      items: [validItem],
      paymentMethod: "credit",
      installments: 25,
      firstDueDate: isoWithDayOffset(1),
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "O número de parcelas deve ser no máximo 24",
    );
  });

  it("rejeita forma de pagamento inválida", () => {
    const result = createSaleSchema.safeParse({
      items: [validItem],
      paymentMethod: "boleto",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Forma de pagamento inválida");
  });

  it("rejeita corpo vazio com mensagem pt-BR (não em inglês)", () => {
    const result = createSaleSchema.safeParse({});
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Informe ao menos um item da venda");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });
});

describe("salesListQuerySchema", () => {
  it("aplica defaults de paginação sem filtros", () => {
    const result = salesListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.status).toBeUndefined();
    expect(result.clientId).toBeUndefined();
  });

  it("aceita filtros de status e clientId", () => {
    const result = salesListQuerySchema.parse({
      status: "canceled",
      clientId: OTHER_UUID,
    });
    expect(result.status).toBe("canceled");
    expect(result.clientId).toBe(OTHER_UUID);
  });

  it("rejeita status fora do enum", () => {
    const result = salesListQuerySchema.safeParse({ status: "pending" });
    expect(result.success).toBe(false);
  });
});

describe("receivablesListQuerySchema", () => {
  it("pending default true quando ausente", () => {
    const result = receivablesListQuerySchema.parse({});
    expect(result.pending).toBe(true);
  });

  it("coage a string 'false' da query para boolean false", () => {
    const result = receivablesListQuerySchema.parse({ pending: "false" });
    expect(result.pending).toBe(false);
  });

  it("coage a string 'true' da query para boolean true", () => {
    const result = receivablesListQuerySchema.parse({ pending: "true" });
    expect(result.pending).toBe(true);
  });
});
