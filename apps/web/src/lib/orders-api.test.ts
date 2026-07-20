import type {
  CreateOrderInput,
  Order,
  OrderListItem,
  ReplaceOrderItemsInput,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  cancelOrder,
  createOrder,
  deliverOrder,
  getOrder,
  listOrders,
  type OrdersApiDeps,
  placeOrder,
  replaceOrderItems,
} from "./orders-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";
const ORDER_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const PRODUCT_ID = "018f9c2e-3333-7b3d-9e21-0a1b2c3d4e5f";

const sampleOrder: Order = {
  id: ORDER_ID,
  totalCents: 7100,
  status: "draft",
  placedAt: null,
  deliveredAt: null,
  canceledAt: null,
  createdAt: "2026-07-20T12:00:00.000Z",
  items: [
    {
      id: "018f9c2e-4444-7b3d-9e21-0a1b2c3d4e5f",
      productId: PRODUCT_ID,
      productName: "Batom Matte Vermelho",
      clientId: null,
      clientName: null,
      qty: 2,
      unitCostCents: 3550,
    },
    {
      id: "018f9c2e-5555-7b3d-9e21-0a1b2c3d4e5f",
      productId: PRODUCT_ID,
      productName: "Batom Matte Vermelho",
      clientId: "018f9c2e-6666-7b3d-9e21-0a1b2c3d4e5f",
      clientName: "Maria Souza",
      qty: 1,
      unitCostCents: 3550,
    },
  ],
};

const sampleListItem: OrderListItem = {
  id: ORDER_ID,
  totalCents: 7100,
  status: "draft",
  placedAt: null,
  deliveredAt: null,
  canceledAt: null,
  createdAt: "2026-07-20T12:00:00.000Z",
};

const validCreateValues: CreateOrderInput = {
  items: [{ productId: PRODUCT_ID, qty: 2 }],
};

const validReplaceValues: ReplaceOrderItemsInput = {
  items: [{ productId: PRODUCT_ID, qty: 3, unitCostCents: 4000 }],
};

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

// Fetch fake que registra a chamada e delega a resposta a um responder
// (testing.md: fake explícito injetado, sem vi.mock).
const stubFetch = (
  responder: () => Response,
): { fetchImpl: FetchImpl; calls: FetchCall[] } => {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchImpl = async (input, init) => {
    calls.push({ url: String(input), init });
    return responder();
  };
  return { fetchImpl, calls };
};

const headerValue = (
  init: RequestInit | undefined,
  key: string,
): string | null => {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    return null;
  }
  return headers[key] ?? null;
};

const depsWith = (fetchImpl: FetchImpl): OrdersApiDeps => ({
  fetchImpl,
  apiUrl: API_URL,
  token: TOKEN,
});

const errorEnvelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message } });

describe("listOrders", () => {
  it("faz GET /orders com Bearer e monta a query com page/perPage/status", async () => {
    const body = JSON.stringify({
      data: [sampleListItem],
      page: 2,
      perPage: 10,
      total: 1,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await listOrders(
      { page: 2, perPage: 10, status: "placed" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: true,
      data: [sampleListItem],
      page: 2,
      perPage: 10,
      total: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      "http://localhost:3001/orders?page=2&perPage=10&status=placed",
    );
  });

  it("omite status quando ausente", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listOrders({ page: 1 }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/orders?page=1");
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Filtro inválido"), {
          status: 422,
        }),
    );

    const result = await listOrders({}, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Filtro inválido" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await listOrders({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await listOrders({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getOrder", () => {
  it("faz GET /orders/:id com Bearer e retorna o pedido com itens", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleOrder), { status: 200 }),
    );

    const result = await getOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, order: sampleOrder });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/orders/${ORDER_ID}`);
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("ORDER_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await getOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.message).toMatch(/não encontrado/i);
  });

  it("retorna ok:false sem notFound para outros status de erro", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), { status: 500 }),
    );

    const result = await getOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(false);
    expect(result.message).toBe("falhou");
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await getOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
  });
});

describe("createOrder", () => {
  it("faz POST /orders com Bearer, JSON e corpo validado; retorna 201", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleOrder), { status: 201 }),
    );

    const result = await createOrder(validCreateValues, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, order: sampleOrder });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/orders");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      items: [{ productId: PRODUCT_ID, qty: 2 }],
    });
  });

  it("permite criar pedido vazio (items ausente vira [] pelo default do schema)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleOrder), { status: 201 }),
    );

    await createOrder({}, depsWith(fetchImpl));

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ items: [] });
  });

  it("não envia requisição quando o input é inválido", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleOrder), { status: 201 }),
    );

    const result = await createOrder(
      { items: [{ productId: "not-a-uuid", qty: 2 }] },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("mapeia erro da API para mensagem pt-BR do envelope (produto alheio/inexistente)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope("INVALID_ORDER_ITEM", "Produto não encontrado"),
          { status: 422 },
        ),
    );

    const result = await createOrder(validCreateValues, depsWith(fetchImpl));

    expect(result).toEqual({
      ok: false,
      message: "Produto não encontrado",
    });
  });

  it("retorna ok:false quando o 201 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 201 }),
    );

    const result = await createOrder(validCreateValues, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await createOrder(validCreateValues, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("replaceOrderItems", () => {
  it("faz PUT /orders/:id/items com Bearer, JSON e corpo validado; retorna 200", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleOrder), { status: 200 }),
    );

    const result = await replaceOrderItems(
      ORDER_ID,
      validReplaceValues,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, order: sampleOrder });
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/orders/${ORDER_ID}/items`,
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      items: [{ productId: PRODUCT_ID, qty: 3, unitCostCents: 4000 }],
    });
  });

  it("permite substituir por lista vazia (esvaziar o rascunho)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleOrder), { status: 200 }),
    );

    await replaceOrderItems(ORDER_ID, { items: [] }, depsWith(fetchImpl));

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ items: [] });
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("ORDER_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await replaceOrderItems(
      ORDER_ID,
      validReplaceValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409 (pedido não está mais em rascunho)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "ORDER_STATE",
            "Só é possível editar itens de um pedido em rascunho",
          ),
          { status: 409 },
        ),
    );

    const result = await replaceOrderItems(
      ORDER_ID,
      validReplaceValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.message).toMatch(/rascunho/);
  });

  it("não envia requisição quando o input é inválido", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleOrder), { status: 200 }),
    );

    const result = await replaceOrderItems(
      ORDER_ID,
      { items: [{ productId: "not-a-uuid", qty: 1 }] },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await replaceOrderItems(
      ORDER_ID,
      validReplaceValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("placeOrder / deliverOrder / cancelOrder", () => {
  it("placeOrder faz POST /orders/:id/place com Bearer; 200 retorna o pedido", async () => {
    const placedOrder: Order = { ...sampleOrder, status: "placed" };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(placedOrder), { status: 200 }),
    );

    const result = await placeOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, order: placedOrder });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/orders/${ORDER_ID}/place`,
    );
  });

  it("deliverOrder faz POST /orders/:id/deliver com Bearer; 200 retorna o pedido", async () => {
    const deliveredOrder: Order = {
      ...sampleOrder,
      status: "delivered",
      deliveredAt: "2026-07-20T13:00:00.000Z",
    };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(deliveredOrder), { status: 200 }),
    );

    const result = await deliverOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, order: deliveredOrder });
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/orders/${ORDER_ID}/deliver`,
    );
  });

  it("cancelOrder faz POST /orders/:id/cancel com Bearer; 200 retorna o pedido", async () => {
    const canceledOrder: Order = {
      ...sampleOrder,
      status: "canceled",
      canceledAt: "2026-07-20T13:00:00.000Z",
    };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(canceledOrder), { status: 200 }),
    );

    const result = await cancelOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, order: canceledOrder });
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/orders/${ORDER_ID}/cancel`,
    );
  });

  it("marca notFound em 404 (pedido inexistente ou de outra consultora)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("ORDER_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await placeOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409 (transição inválida)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "ORDER_STATE",
            "Só é possível marcar como pedido um rascunho com itens",
          ),
          { status: 409 },
        ),
    );

    const result = await placeOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.message).toMatch(/rascunho com itens/);
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await deliverOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await cancelOrder(ORDER_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});
