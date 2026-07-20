import { describe, expect, it } from "vitest";
import {
  createOrderSchema,
  ORDER_STATUS_LABELS,
  orderListItemSchema,
  orderSchema,
  orderStatusValues,
  ordersListQuerySchema,
  replaceOrderItemsSchema,
} from "./orders";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";

const validItem = { productId: VALID_UUID, qty: 2 } as const;

const firstMessage = (
  result:
    | ReturnType<typeof createOrderSchema.safeParse>
    | ReturnType<typeof replaceOrderItemsSchema.safeParse>
    | ReturnType<typeof ordersListQuerySchema.safeParse>,
): string => {
  if (result.success) {
    throw new Error("esperava falha de validação");
  }
  return result.error.issues[0]?.message ?? "";
};

describe("enums e labels", () => {
  it("expõe os valores de status", () => {
    expect(orderStatusValues).toEqual([
      "draft",
      "placed",
      "delivered",
      "canceled",
    ]);
  });

  it("mapeia labels pt-BR de status", () => {
    expect(ORDER_STATUS_LABELS.draft).toBe("Rascunho");
    expect(ORDER_STATUS_LABELS.placed).toBe("Pedido");
    expect(ORDER_STATUS_LABELS.delivered).toBe("Entregue");
    expect(ORDER_STATUS_LABELS.canceled).toBe("Cancelado");
  });
});

describe("createOrderSchema", () => {
  it("aceita corpo vazio: pedido nasce em rascunho sem itens", () => {
    const result = createOrderSchema.parse({});
    expect(result.items).toEqual([]);
  });

  it("aceita items explicitamente vazio", () => {
    const result = createOrderSchema.parse({ items: [] });
    expect(result.items).toEqual([]);
  });

  it("aceita item sem unitCostCents (override ausente ⇒ custo do produto)", () => {
    const result = createOrderSchema.parse({ items: [validItem] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.productId).toBe(VALID_UUID);
    expect(result.items[0]?.qty).toBe(2);
    expect(result.items[0]?.unitCostCents).toBeUndefined();
  });

  it("aceita item com unitCostCents (override explícito)", () => {
    const result = createOrderSchema.parse({
      items: [{ productId: VALID_UUID, qty: 3, unitCostCents: 1250 }],
    });
    expect(result.items[0]?.unitCostCents).toBe(1250);
  });

  it("não possui campo de total no contrato de entrada", () => {
    const result = createOrderSchema.parse({
      items: [validItem],
      totalCents: 999_999,
    } as unknown as Record<string, unknown>);
    expect("totalCents" in result).toBe(false);
  });

  it("rejeita qty zero com mensagem pt-BR", () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: VALID_UUID, qty: 0 }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("A quantidade deve ser no mínimo 1");
  });

  it("rejeita qty acima de 1000 com mensagem pt-BR", () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: VALID_UUID, qty: 1001 }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("A quantidade deve ser no máximo 1.000");
  });

  it("rejeita unitCostCents negativo com mensagem pt-BR", () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: VALID_UUID, qty: 1, unitCostCents: -1 }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("O custo unitário não pode ser negativo");
  });

  it("rejeita unitCostCents acima do teto com mensagem pt-BR", () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: VALID_UUID, qty: 1, unitCostCents: 100_000_001 }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "O custo unitário deve ser no máximo R$ 1.000.000,00",
    );
  });

  it("rejeita mais de 50 itens com mensagem pt-BR", () => {
    const items = Array.from({ length: 51 }, () => validItem);
    const result = createOrderSchema.safeParse({ items });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("O pedido deve ter no máximo 50 itens");
  });

  it("aceita exatamente 50 itens", () => {
    const items = Array.from({ length: 50 }, () => validItem);
    const result = createOrderSchema.safeParse({ items });
    expect(result.success).toBe(true);
  });

  it("dá mensagem pt-BR quando productId está ausente no item", () => {
    const result = createOrderSchema.safeParse({ items: [{ qty: 1 }] });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Produto inválido");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });

  it("dá mensagem pt-BR quando qty está ausente no item", () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: VALID_UUID }],
    });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Informe a quantidade (número inteiro)");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });

  it("dá mensagem pt-BR quando o item é um objeto vazio (ambos campos ausentes)", () => {
    const result = createOrderSchema.safeParse({ items: [{}] });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Produto inválido");
  });

  it("rejeita productId inválido (não-uuid) com mensagem pt-BR", () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: "not-a-uuid", qty: 1 }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Produto inválido");
  });

  it("aceita item com clientId válido (encomenda de cliente)", () => {
    const result = createOrderSchema.parse({
      items: [{ ...validItem, clientId: OTHER_UUID }],
    });
    expect(result.items[0]?.clientId).toBe(OTHER_UUID);
  });

  it("aceita item sem clientId (item de reposição): chave fica ausente na saída", () => {
    const result = createOrderSchema.parse({ items: [validItem] });
    expect(result.items[0]?.clientId).toBeUndefined();
    expect("clientId" in (result.items[0] ?? {})).toBe(false);
  });

  it("aceita clientId explicitamente null (item de reposição)", () => {
    const result = createOrderSchema.parse({
      items: [{ ...validItem, clientId: null }],
    });
    expect(result.items[0]?.clientId).toBeNull();
  });

  it("rejeita clientId inválido (não-uuid) com mensagem pt-BR", () => {
    const result = createOrderSchema.safeParse({
      items: [{ ...validItem, clientId: "not-a-uuid" }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Cliente inválida");
  });
});

describe("replaceOrderItemsSchema", () => {
  it("aceita lista vazia (esvaziar o rascunho é válido — RF-02)", () => {
    const result = replaceOrderItemsSchema.parse({ items: [] });
    expect(result.items).toEqual([]);
  });

  it("aceita lista com itens válidos", () => {
    const result = replaceOrderItemsSchema.parse({ items: [validItem] });
    expect(result.items).toHaveLength(1);
  });

  it("rejeita corpo sem a chave items (obrigatória, mesmo que vazia) com mensagem pt-BR", () => {
    const result = replaceOrderItemsSchema.safeParse({});
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Informe a lista de itens do pedido (pode ser vazia)");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });

  it("rejeita mais de 50 itens com mensagem pt-BR", () => {
    const items = Array.from({ length: 51 }, () => validItem);
    const result = replaceOrderItemsSchema.safeParse({ items });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("O pedido deve ter no máximo 50 itens");
  });

  it("não aplica default: items não vira [] quando ausente (fica inválido)", () => {
    const result = replaceOrderItemsSchema.safeParse({ items: undefined });
    expect(result.success).toBe(false);
  });

  it("aceita item com clientId válido", () => {
    const result = replaceOrderItemsSchema.parse({
      items: [{ ...validItem, clientId: OTHER_UUID }],
    });
    expect(result.items[0]?.clientId).toBe(OTHER_UUID);
  });

  it("aceita item com clientId null", () => {
    const result = replaceOrderItemsSchema.parse({
      items: [{ ...validItem, clientId: null }],
    });
    expect(result.items[0]?.clientId).toBeNull();
  });

  it("rejeita clientId inválido (não-uuid) com mensagem pt-BR", () => {
    const result = replaceOrderItemsSchema.safeParse({
      items: [{ ...validItem, clientId: "not-a-uuid" }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Cliente inválida");
  });
});

describe("ordersListQuerySchema", () => {
  it("aplica defaults de paginação sem filtro de status", () => {
    const result = ordersListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.status).toBeUndefined();
  });

  it("aceita filtro de status válido", () => {
    const result = ordersListQuerySchema.parse({ status: "placed" });
    expect(result.status).toBe("placed");
  });

  it("rejeita status fora do enum com mensagem pt-BR", () => {
    const result = ordersListQuerySchema.safeParse({ status: "pending" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Status de pedido inválido");
  });
});

describe("orderSchema / orderListItemSchema", () => {
  const validOrder = {
    id: VALID_UUID,
    totalCents: 4000,
    status: "draft" as const,
    placedAt: null,
    deliveredAt: null,
    canceledAt: null,
    createdAt: new Date().toISOString(),
    items: [
      {
        id: OTHER_UUID,
        productId: VALID_UUID,
        productName: "Base Líquida",
        clientId: null,
        clientName: null,
        qty: 2,
        unitCostCents: 2000,
      },
    ],
  };

  it("aceita um pedido completo com item e datas de transição nullable", () => {
    const result = orderSchema.parse(validOrder);
    expect(result.items).toHaveLength(1);
    expect(result.placedAt).toBeNull();
  });

  it("aceita productId nulo no item (produto excluído, SET NULL)", () => {
    const result = orderSchema.parse({
      ...validOrder,
      items: [{ ...validOrder.items[0], productId: null }],
    });
    expect(result.items[0]?.productId).toBeNull();
  });

  it("aceita item com cliente vinculada (clientId/clientName preenchidos)", () => {
    const result = orderSchema.parse({
      ...validOrder,
      items: [
        { ...validOrder.items[0], clientId: VALID_UUID, clientName: "Maria" },
      ],
    });
    expect(result.items[0]?.clientId).toBe(VALID_UUID);
    expect(result.items[0]?.clientName).toBe("Maria");
  });

  it("aceita item de reposição (clientId e clientName nulos)", () => {
    const result = orderSchema.parse(validOrder);
    expect(result.items[0]?.clientId).toBeNull();
    expect(result.items[0]?.clientName).toBeNull();
  });

  it("orderListItemSchema não expõe nem aceita o campo items", () => {
    const { items: _items, ...withoutItems } = validOrder;
    const result = orderListItemSchema.parse(withoutItems);
    expect("items" in result).toBe(false);

    const withItems = orderListItemSchema.safeParse(validOrder);
    expect(withItems.success).toBe(true);
    if (withItems.success) {
      expect("items" in withItems.data).toBe(false);
    }
  });
});
