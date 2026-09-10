import type {
  CreateProductInput,
  Product,
  ProductsSummary,
  UpdateProductInput,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProductsSummary,
  listProducts,
  type ProductsApiDeps,
  updateProduct,
} from "./products-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";
const PRODUCT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";

const sampleProduct: Product = {
  id: PRODUCT_ID,
  name: "Batom Matte Vermelho",
  brandCode: "MK-1234",
  costCents: 3550,
  purchaseDiscountBps: null,
  priceCents: 5990,
  stockQty: 12,
  reservedQty: 0,
  availableQty: 12,
  lowStockThreshold: 3,
  lowStock: false,
  createdAt: "2026-07-17T12:00:00.000Z",
  updatedAt: "2026-07-17T12:00:00.000Z",
};

const discountedProduct: Product = {
  ...sampleProduct,
  costCents: 3894,
  purchaseDiscountBps: 3500,
};

const sampleSummary: ProductsSummary = {
  stockCostCents: 426000,
  stockPriceCents: 718800,
  lowStockCount: 2,
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

const depsWith = (fetchImpl: FetchImpl): ProductsApiDeps => ({
  fetchImpl,
  apiUrl: API_URL,
  token: TOKEN,
});

const errorEnvelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message } });

describe("listProducts", () => {
  it("faz GET /products com Bearer e monta a query com page/search URL-encoded", async () => {
    const body = JSON.stringify({
      data: [sampleProduct],
      page: 2,
      perPage: 10,
      total: 1,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await listProducts(
      { page: 2, search: "batom matte" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: true,
      data: [sampleProduct],
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
      "http://localhost:3001/products?page=2&search=batom+matte",
    );
  });

  it("inclui lowStock=true na query quando o filtro está ativo", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listProducts({ page: 1, lowStock: true }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/products?page=1&lowStock=true",
    );
  });

  it("omite lowStock quando false e search vazio", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listProducts({ search: "", lowStock: false }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/products");
  });

  it("inclui perPage na query quando informado (ex.: catálogo completo do form de pedidos)", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 100, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listProducts({ perPage: 100 }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/products?perPage=100");
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Busca muito longa"), {
          status: 422,
        }),
    );

    const result = await listProducts({}, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Busca muito longa" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await listProducts({}, depsWith(fetchImpl));

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

    const result = await listProducts({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getProduct", () => {
  it("faz GET /products/:id com Bearer e retorna o produto", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleProduct), { status: 200 }),
    );

    const result = await getProduct(PRODUCT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, product: sampleProduct });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/products/${PRODUCT_ID}`);
  });

  it("preserva custo calculado e desconto de compra na resposta", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify(discountedProduct), { status: 200 }),
    );

    const result = await getProduct(PRODUCT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, product: discountedProduct });
  });

  it("rejeita resposta sem a forma de custo", async () => {
    const { purchaseDiscountBps: _purchaseDiscountBps, ...legacyProduct } =
      sampleProduct;
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify(legacyProduct), { status: 200 }),
    );

    const result = await getProduct(PRODUCT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("PRODUCT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await getProduct(PRODUCT_ID, depsWith(fetchImpl));

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

    const result = await getProduct(PRODUCT_ID, depsWith(fetchImpl));

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

    const result = await getProduct(PRODUCT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
  });
});

describe("createProduct", () => {
  const validValues: CreateProductInput = {
    name: "Base Líquida Bege",
    costCents: 3550,
    priceCents: 5990,
  };

  it("faz POST /products com Bearer, JSON e corpo validado; retorna 201", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleProduct), { status: 201 }),
    );

    const result = await createProduct(validValues, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, product: sampleProduct });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/products");
    // Defaults do schema aplicados na fronteira (estoque 0, limiar 1).
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "Base Líquida Bege",
      costCents: 3550,
      priceCents: 5990,
      stockQty: 0,
      lowStockThreshold: 1,
    });
  });

  it("não envia requisição quando o input é inválido", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleProduct), { status: 201 }),
    );

    const result = await createProduct(
      { name: "X", costCents: 3550, priceCents: 5990 },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("envia desconto de compra sem custo calculado pelo navegador", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(discountedProduct), { status: 201 }),
    );

    const result = await createProduct(
      {
        name: "Base Líquida Bege",
        purchaseDiscountBps: 3500,
        priceCents: 5990,
      },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, product: discountedProduct });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "Base Líquida Bege",
      purchaseDiscountBps: 3500,
      priceCents: 5990,
      stockQty: 0,
      lowStockThreshold: 1,
    });
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Custo inválido"), {
          status: 422,
        }),
    );

    const result = await createProduct(validValues, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Custo inválido" });
  });
});

describe("updateProduct", () => {
  const validValues: UpdateProductInput = { stockQty: 2 };

  it("faz PATCH /products/:id com Bearer e corpo parcial validado; retorna 200", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleProduct), { status: 200 }),
    );

    const result = await updateProduct(
      PRODUCT_ID,
      validValues,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, product: sampleProduct });
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/products/${PRODUCT_ID}`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ stockQty: 2 });
  });

  it("não envia requisição quando o body está vazio (nenhum campo)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleProduct), { status: 200 }),
    );

    const result = await updateProduct(PRODUCT_ID, {}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("envia alteração de desconto sem custo calculado pelo navegador", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(discountedProduct), { status: 200 }),
    );

    const result = await updateProduct(
      PRODUCT_ID,
      { purchaseDiscountBps: 3500 },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, product: discountedProduct });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      purchaseDiscountBps: 3500,
    });
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("PRODUCT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await updateProduct(
      PRODUCT_ID,
      { name: "Novo nome" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: false, message: "não encontrado" });
  });
});

describe("deleteProduct", () => {
  it("faz DELETE /products/:id com Bearer; 204 retorna ok", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(null, { status: 204 }),
    );

    const result = await deleteProduct(PRODUCT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.init?.method).toBe("DELETE");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/products/${PRODUCT_ID}`);
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("PRODUCT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await deleteProduct(PRODUCT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "não encontrado" });
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await deleteProduct(PRODUCT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getProductsSummary", () => {
  it("faz GET /products/summary com Bearer e retorna o agregado parseado", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleSummary), { status: 200 }),
    );

    const result = await getProductsSummary(depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, summary: sampleSummary });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/products/summary");
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(JSON.stringify({ stockCostCents: "x" }), { status: 200 }),
    );

    const result = await getProductsSummary(depsWith(fetchImpl));

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

    const result = await getProductsSummary(depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "falhou" });
  });
});
