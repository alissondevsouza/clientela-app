import type {
  CreateSaleInput,
  Receivable,
  ReceivableListItem,
  ReceivablesSummary,
  Sale,
  SaleListItem,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  cancelSale,
  createSale,
  deleteSale,
  getReceivablesSummary,
  getSale,
  listReceivables,
  listSales,
  type SalesApiDeps,
  setReceivablePaid,
} from "./sales-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";
const SALE_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const CLIENT_ID = "018f9c2e-1111-7b3d-9e21-0a1b2c3d4e5f";
const RECEIVABLE_ID = "018f9c2e-2222-7b3d-9e21-0a1b2c3d4e5f";
const PRODUCT_ID = "018f9c2e-3333-7b3d-9e21-0a1b2c3d4e5f";

const sampleReceivable: Receivable = {
  id: RECEIVABLE_ID,
  saleId: SALE_ID,
  amountCents: 3334,
  dueDate: "2026-08-18",
  dueKind: "scheduled",
  paidAt: null,
  voidedAt: null,
  status: "pending",
  overdue: false,
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
};

// Item da lista "quem me deve": recebível + dados da venda/cliente (RF-06).
const sampleReceivableListItem: ReceivableListItem = {
  ...sampleReceivable,
  clientId: CLIENT_ID,
  clientName: "Maria Silva",
  clientWhatsapp: "+5511987654321",
};

const sampleSale: Sale = {
  id: SALE_ID,
  clientId: CLIENT_ID,
  clientName: "Maria Silva",
  totalCents: 10000,
  paymentMethod: "credit",
  paymentCondition: "installments",
  cardType: null,
  installments: 3,
  paymentPlanKnown: true,
  status: "completed",
  deliveryStatus: "delivered",
  paymentStatus: "paid",
  paidCents: 10000,
  outstandingCents: 0,
  soldAt: "2026-07-18T12:00:00.000Z",
  deliveredAt: "2026-07-18T12:00:00.000Z",
  completedAt: "2026-07-18T12:00:00.000Z",
  canceledAt: null,
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
  items: [
    {
      id: "018f9c2e-4444-7b3d-9e21-0a1b2c3d4e5f",
      productId: PRODUCT_ID,
      productName: "Batom Matte Vermelho",
      qty: 2,
      unitPriceCents: 5000,
    },
  ],
  receivables: [sampleReceivable],
};

const sampleListItem: SaleListItem = {
  id: SALE_ID,
  clientId: CLIENT_ID,
  clientName: "Maria Silva",
  totalCents: 10000,
  paymentMethod: "credit",
  paymentCondition: "installments",
  cardType: null,
  installments: 3,
  paymentPlanKnown: true,
  status: "completed",
  deliveryStatus: "delivered",
  paymentStatus: "paid",
  paidCents: 10000,
  outstandingCents: 0,
  soldAt: "2026-07-18T12:00:00.000Z",
  deliveredAt: "2026-07-18T12:00:00.000Z",
  completedAt: "2026-07-18T12:00:00.000Z",
  canceledAt: null,
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
};

const sampleSummary: ReceivablesSummary = {
  pendingCents: 10000,
  overdueCents: 3334,
  overdueCount: 1,
};

const validCreateValues: CreateSaleInput = {
  clientId: CLIENT_ID,
  items: [{ productId: PRODUCT_ID, qty: 2 }],
  paymentMethod: "cash",
  deliveryStatus: "pending",
  paymentCondition: "on_delivery",
  installments: 1,
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

const depsWith = (fetchImpl: FetchImpl): SalesApiDeps => ({
  fetchImpl,
  apiUrl: API_URL,
  token: TOKEN,
});

const errorEnvelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message } });

describe("createSale", () => {
  it("faz POST /sales com Bearer, JSON e corpo validado; retorna 201", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleSale), { status: 201 }),
    );

    const result = await createSale(validCreateValues, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, sale: sampleSale });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/sales");
    // Default do schema aplicado na fronteira (installments = 1).
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      clientId: CLIENT_ID,
      items: [{ productId: PRODUCT_ID, qty: 2 }],
      paymentMethod: "cash",
      deliveryStatus: "pending",
      paymentCondition: "on_delivery",
      installments: 1,
    });
  });

  it("não envia requisição quando o input é inválido", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleSale), { status: 201 }),
    );

    const result = await createSale(
      {
        items: [],
        paymentMethod: "cash",
        deliveryStatus: "pending",
        paymentCondition: "on_delivery",
        installments: 1,
      },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("marca conflict com a mensagem da API em 409 (estoque insuficiente)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "INSUFFICIENT_STOCK",
            "Estoque insuficiente: restam 2 unidades de Batom Matte Vermelho",
          ),
          { status: 409 },
        ),
    );

    const result = await createSale(validCreateValues, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.message).toMatch(/Estoque insuficiente/);
  });

  it("mapeia 422 para a mensagem pt-BR do envelope sem conflict", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Produto inválido"), {
          status: 422,
        }),
    );

    const result = await createSale(validCreateValues, depsWith(fetchImpl));

    expect(result).toEqual({
      ok: false,
      conflict: false,
      message: "Produto inválido",
    });
  });

  it("retorna ok:false quando o 201 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 201 }),
    );

    const result = await createSale(validCreateValues, depsWith(fetchImpl));

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

    const result = await createSale(validCreateValues, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("listSales", () => {
  it("faz GET /sales com Bearer e monta a query com page/status/clientId", async () => {
    const body = JSON.stringify({
      data: [sampleListItem],
      page: 2,
      perPage: 20,
      total: 1,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await listSales(
      { page: 2, status: "completed", clientId: CLIENT_ID },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: true,
      data: [sampleListItem],
      page: 2,
      perPage: 20,
      total: 1,
    });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/sales?page=2&status=completed&clientId=${CLIENT_ID}`,
    );
  });

  it("omite filtros quando ausentes", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listSales({}, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/sales");
  });

  it("monta a query com perPage, status=sold (escopo Vendido, RF-14), soldFrom/soldTo e delivery", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 50, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listSales(
      {
        perPage: 50,
        status: "sold",
        soldFrom: "2026-08-01",
        soldTo: "2026-08-31",
        delivery: "pending",
      },
      depsWith(fetchImpl),
    );

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/sales?perPage=50&status=sold&soldFrom=2026-08-01&soldTo=2026-08-31&delivery=pending",
    );
  });

  it("omite clientId vazio mesmo com os demais filtros definidos", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listSales({ clientId: "" }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/sales");
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Filtro inválido"), {
          status: 422,
        }),
    );

    const result = await listSales({}, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Filtro inválido" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await listSales({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getSale", () => {
  it("faz GET /sales/:id com Bearer e retorna a venda com itens/recebíveis", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleSale), { status: 200 }),
    );

    const result = await getSale(SALE_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, sale: sampleSale });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/sales/${SALE_ID}`);
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SALE_NOT_FOUND", "não encontrada"), {
          status: 404,
        }),
    );

    const result = await getSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.message).toMatch(/não encontrada/i);
  });

  it("retorna ok:false sem notFound para outros status de erro", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), { status: 500 }),
    );

    const result = await getSale(SALE_ID, depsWith(fetchImpl));

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

    const result = await getSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
  });
});

describe("cancelSale", () => {
  it("faz POST /sales/:id/cancel com Bearer; 200 retorna ok", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(null, { status: 200 }),
    );

    const result = await cancelSale(SALE_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/sales/${SALE_ID}/cancel`);
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SALE_NOT_FOUND", "não encontrada"), {
          status: 404,
        }),
    );

    const result = await cancelSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409 (parcela paga ou já cancelada)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "SALE_STATE",
            "Estorne as parcelas pagas antes de cancelar a venda",
          ),
          { status: 409 },
        ),
    );

    const result = await cancelSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.message).toMatch(/Estorne as parcelas/);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await cancelSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("deleteSale", () => {
  it("faz DELETE /sales/:id com Bearer; 204 sem corpo retorna ok", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(null, { status: 204 }),
    );

    const result = await deleteSale(SALE_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.init?.method).toBe("DELETE");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/sales/${SALE_ID}`);
  });

  it("marca notFound em 404 (inclui cross-tenant)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SALE_NOT_FOUND", "não encontrada"), {
          status: 404,
        }),
    );

    const result = await deleteSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
  });

  it("retorna a mensagem da API em erro genérico (status inesperado)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("INTERNAL", "Erro interno"), {
          status: 500,
        }),
    );

    const result = await deleteSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(false);
    expect(result.message).toBe("Erro interno");
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await deleteSale(SALE_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("listReceivables", () => {
  it("faz GET /receivables com Bearer e envia pending quando false", async () => {
    const body = JSON.stringify({
      data: [sampleReceivableListItem],
      page: 1,
      perPage: 20,
      total: 1,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await listReceivables(
      { page: 1, pending: false },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: true,
      data: [sampleReceivableListItem],
      page: 1,
      perPage: 20,
      total: 1,
    });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      "http://localhost:3001/receivables?page=1&pending=false",
    );
  });

  it("envia pending=true quando explicitamente true", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listReceivables({ pending: true }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/receivables?pending=true",
    );
  });

  it("omite pending quando ausente (API usa o default)", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listReceivables({}, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/receivables");
  });

  it("monta a query com perPage e overdue=true (RF-15)", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 50, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listReceivables(
      { perPage: 50, pending: true, overdue: true },
      depsWith(fetchImpl),
    );

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/receivables?perPage=50&pending=true&overdue=true",
    );
  });

  it("omite overdue quando false (default da API, RF-15)", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listReceivables({ overdue: false }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/receivables");
  });

  it("monta a query com paidFrom/paidTo (RF-15, recebidas no período)", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listReceivables(
      { pending: false, paidFrom: "2026-08-01", paidTo: "2026-08-31" },
      depsWith(fetchImpl),
    );

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/receivables?pending=false&paidFrom=2026-08-01&paidTo=2026-08-31",
    );
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await listReceivables({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getReceivablesSummary", () => {
  it("faz GET /receivables/summary com Bearer e retorna o agregado", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleSummary), { status: 200 }),
    );

    const result = await getReceivablesSummary(depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, summary: sampleSummary });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/receivables/summary");
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(JSON.stringify({ pendingCents: "x" }), { status: 200 }),
    );

    const result = await getReceivablesSummary(depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), { status: 500 }),
    );

    const result = await getReceivablesSummary(depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "falhou" });
  });
});

describe("setReceivablePaid", () => {
  it("faz PATCH /receivables/:id com Bearer, JSON e corpo { paid }; retorna o recebível", async () => {
    const paidReceivable: Receivable = {
      ...sampleReceivable,
      paidAt: "2026-07-18T13:00:00.000Z",
    };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(paidReceivable), { status: 200 }),
    );

    const result = await setReceivablePaid(
      RECEIVABLE_ID,
      true,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, receivable: paidReceivable });
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/receivables/${RECEIVABLE_ID}`,
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ paid: true });
  });

  it("envia paid=false no estorno", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleReceivable), { status: 200 }),
    );

    await setReceivablePaid(RECEIVABLE_ID, false, depsWith(fetchImpl));

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ paid: false });
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("RECEIVABLE_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await setReceivablePaid(
      RECEIVABLE_ID,
      true,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope("SALE_STATE", "Este recebível já está pago"),
          { status: 409 },
        ),
    );

    const result = await setReceivablePaid(
      RECEIVABLE_ID,
      true,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.message).toMatch(/já está pago/);
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await setReceivablePaid(
      RECEIVABLE_ID,
      true,
      depsWith(fetchImpl),
    );

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

    const result = await setReceivablePaid(
      RECEIVABLE_ID,
      true,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});
