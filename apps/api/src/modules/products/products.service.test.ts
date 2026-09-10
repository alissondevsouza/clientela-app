import type { Product, ProductsSummary } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { ProductNotFoundError } from "./products.errors";
import { escapeLikeTerm, toSafeInteger } from "./products.repository";
import {
  createProductsService,
  type InsertProduct,
  type ListProductsParams,
  type ProductsRepositoryPort,
} from "./products.service";

const CONSULTANT_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const CONSULTANT_B = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";

const FIXED_ISO = "2026-07-18T12:00:00.000Z";

type StoredProduct = Product & { consultantId: string };

// Repositório em memória (testing.md: fakes explícitos, sem mock de Drizzle).
// Reproduz o comportamento observável do repositório real — escopo por
// consultora, busca em name/brand_code, filtro lowStock, ordenação por name,
// paginação e summary agregado — para o teste asseverar efeito, não
// implementação.
const createFakeRepository = (seed: StoredProduct[]) => {
  let store: StoredProduct[] = [...seed];
  let idCounter = 0;

  const toProduct = (stored: StoredProduct): Product => {
    const { consultantId: _consultantId, ...product } = stored;
    return product;
  };

  const matchesSearch = (product: StoredProduct, search: string): boolean => {
    const term = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(term) ||
      (product.brandCode?.toLowerCase().includes(term) ?? false)
    );
  };

  const repository: ProductsRepositoryPort = {
    insert: async (input: InsertProduct) => {
      idCounter += 1;
      const stockQty = input.stockQty;
      const lowStockThreshold = input.lowStockThreshold;
      const stored: StoredProduct = {
        id: `generated-id-${idCounter}`,
        consultantId: input.consultantId,
        name: input.name,
        brandCode: input.brandCode ?? null,
        costCents: input.costCents,
        purchaseDiscountBps: input.purchaseDiscountBps,
        priceCents: input.priceCents,
        stockQty,
        reservedQty: 0,
        availableQty: stockQty,
        lowStockThreshold,
        lowStock: stockQty <= lowStockThreshold,
        createdAt: FIXED_ISO,
        updatedAt: FIXED_ISO,
      };
      store.push(stored);
      return toProduct(stored);
    },
    findById: async (consultantId, id) => {
      const found = store.find(
        (p) => p.consultantId === consultantId && p.id === id,
      );
      return found ? toProduct(found) : undefined;
    },
    update: async (consultantId, id, patch, resolve) => {
      const target = store.find(
        (p) => p.consultantId === consultantId && p.id === id,
      );
      if (!target) {
        return undefined;
      }
      const resolvedPatch = resolve(toProduct(target), patch);
      // Só aplica as chaves PRESENTES no patch (ausente = não alterar; `null`
      // explícito em campos nullable = limpar). Recalcula `lowStock` derivado.
      Object.assign(target, resolvedPatch, { updatedAt: FIXED_ISO });
      target.availableQty = target.stockQty - target.reservedQty;
      target.lowStock = target.availableQty <= target.lowStockThreshold;
      return toProduct(target);
    },
    delete: async (consultantId, id) => {
      const before = store.length;
      store = store.filter(
        (p) => !(p.consultantId === consultantId && p.id === id),
      );
      return store.length < before;
    },
    list: async (
      consultantId,
      { page, perPage, search, lowStock }: ListProductsParams,
    ) => {
      const scoped = store
        .filter((p) => p.consultantId === consultantId)
        .filter((p) => (search ? matchesSearch(p, search) : true))
        .filter((p) => (lowStock ? p.lowStock : true))
        .toSorted((a, b) => a.name.localeCompare(b.name));

      const offset = (page - 1) * perPage;
      const rows = scoped.slice(offset, offset + perPage).map(toProduct);
      return { rows, total: scoped.length };
    },
    summary: async (consultantId) => {
      const scoped = store.filter((p) => p.consultantId === consultantId);
      return scoped.reduce<ProductsSummary>(
        (acc, p) => ({
          stockCostCents: acc.stockCostCents + p.costCents * p.stockQty,
          stockPriceCents: acc.stockPriceCents + p.priceCents * p.stockQty,
          lowStockCount: acc.lowStockCount + (p.lowStock ? 1 : 0),
        }),
        { stockCostCents: 0, stockPriceCents: 0, lowStockCount: 0 },
      );
    },
  };

  return { repository, getStore: () => store };
};

const buildService = (seed: StoredProduct[] = []) => {
  const { repository, getStore } = createFakeRepository(seed);
  return { service: createProductsService({ repository }), getStore };
};

const storedProduct = (overrides: Partial<StoredProduct>): StoredProduct => {
  const stockQty = overrides.stockQty ?? 10;
  const reservedQty = overrides.reservedQty ?? 0;
  const lowStockThreshold = overrides.lowStockThreshold ?? 1;
  return {
    id: "11111111-1111-7111-8111-111111111111",
    consultantId: CONSULTANT_A,
    name: "Batom Vermelho",
    brandCode: null,
    costCents: 3550,
    purchaseDiscountBps: null,
    priceCents: 5990,
    stockQty,
    reservedQty,
    availableQty: overrides.availableQty ?? stockQty - reservedQty,
    lowStockThreshold,
    lowStock:
      (overrides.availableQty ?? stockQty - reservedQty) <= lowStockThreshold,
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    ...overrides,
  };
};

describe("productsService.create", () => {
  it("insere o produto escopado na consultora e retorna o registro criado", async () => {
    const { service, getStore } = buildService();

    const created = await service.create(CONSULTANT_A, {
      name: "Base Líquida",
      brandCode: "MK-123",
      costCents: 4000,
      priceCents: 7900,
      stockQty: 5,
      lowStockThreshold: 2,
    });

    expect(created).toMatchObject({
      name: "Base Líquida",
      brandCode: "MK-123",
      costCents: 4000,
      purchaseDiscountBps: null,
      priceCents: 7900,
      stockQty: 5,
      lowStockThreshold: 2,
      lowStock: false,
    });
    expect(created.id).toBeTruthy();
    expect(created).not.toHaveProperty("consultantId");

    const store = getStore();
    expect(store).toHaveLength(1);
    expect(store[0]?.consultantId).toBe(CONSULTANT_A);
  });

  it("deriva lowStock quando estoque <= limiar", async () => {
    const { service } = buildService();

    const created = await service.create(CONSULTANT_A, {
      name: "Rímel",
      brandCode: null,
      costCents: 2000,
      priceCents: 3500,
      stockQty: 1,
      lowStockThreshold: 3,
    });

    expect(created.lowStock).toBe(true);
  });

  it("calcula o custo no servidor quando a criação informa desconto", async () => {
    const { service } = buildService();

    const created = await service.create(CONSULTANT_A, {
      name: "Base com desconto",
      purchaseDiscountBps: 3500,
      priceCents: 9990,
      stockQty: 0,
      lowStockThreshold: 1,
    });

    expect(created.costCents).toBe(6494);
    expect(created.purchaseDiscountBps).toBe(3500);
    expect(created.priceCents).toBe(9990);
  });
});

describe("productsService.getById", () => {
  it("retorna o produto quando existe no escopo da consultora", async () => {
    const product = storedProduct({ id: "id-1", name: "Sombra" });
    const { service } = buildService([product]);

    const found = await service.getById(CONSULTANT_A, "id-1");

    expect(found.name).toBe("Sombra");
    expect(found).not.toHaveProperty("consultantId");
  });

  it("lança ProductNotFoundError com mensagem pt-BR quando não existe", async () => {
    const { service } = buildService();

    const error = await service
      .getById(CONSULTANT_A, "inexistente")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProductNotFoundError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toBe("Produto não encontrado.");
  });
});

describe("productsService.update", () => {
  it("atualização parcial preserva os campos não enviados e recalcula lowStock", async () => {
    const product = storedProduct({
      id: "id-1",
      name: "Gloss",
      costCents: 1000,
      priceCents: 2000,
      stockQty: 10,
      lowStockThreshold: 2,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      stockQty: 1,
    });

    expect(updated.stockQty).toBe(1);
    expect(updated.lowStock).toBe(true);
    expect(updated.name).toBe("Gloss");
    expect(updated.costCents).toBe(1000);
    expect(updated.priceCents).toBe(2000);
    expect(updated.lowStockThreshold).toBe(2);
  });

  it("`null` explícito limpa o brandCode", async () => {
    const product = storedProduct({ id: "id-1", brandCode: "MK-999" });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      brandCode: null,
    });

    expect(updated.brandCode).toBeNull();
  });

  it("taxa não nula entra em modo desconto e recalcula pelo preço atual", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 9990,
      costCents: 7000,
      purchaseDiscountBps: null,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      purchaseDiscountBps: 3500,
    });

    expect(updated.priceCents).toBe(9990);
    expect(updated.costCents).toBe(6494);
    expect(updated.purchaseDiscountBps).toBe(3500);
  });

  it("preço e taxa simultâneos calculam o custo pelo novo par", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 5000,
      costCents: 3000,
      purchaseDiscountBps: 4000,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      priceCents: 9990,
      purchaseDiscountBps: 3500,
    });

    expect(updated.priceCents).toBe(9990);
    expect(updated.costCents).toBe(6494);
    expect(updated.purchaseDiscountBps).toBe(3500);
  });

  it("custo direto muda um produto com desconto para o modo manual", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 9990,
      costCents: 6494,
      purchaseDiscountBps: 3500,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      costCents: 7100,
    });

    expect(updated.priceCents).toBe(9990);
    expect(updated.costCents).toBe(7100);
    expect(updated.purchaseDiscountBps).toBeNull();
  });

  it("taxa nula desativa o modo desconto e preserva o custo atual", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 9990,
      costCents: 6494,
      purchaseDiscountBps: 3500,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      purchaseDiscountBps: null,
    });

    expect(updated.priceCents).toBe(9990);
    expect(updated.costCents).toBe(6494);
    expect(updated.purchaseDiscountBps).toBeNull();
  });

  it("preço isolado recalcula o custo quando o produto está em modo desconto", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 10_000,
      costCents: 6500,
      purchaseDiscountBps: 3500,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      priceCents: 12_000,
    });

    expect(updated.priceCents).toBe(12_000);
    expect(updated.costCents).toBe(7800);
    expect(updated.purchaseDiscountBps).toBe(3500);
  });

  it("preço isolado preserva o custo quando o produto está em modo manual", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 10_000,
      costCents: 7000,
      purchaseDiscountBps: null,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      priceCents: 12_000,
    });

    expect(updated.priceCents).toBe(12_000);
    expect(updated.costCents).toBe(7000);
    expect(updated.purchaseDiscountBps).toBeNull();
  });

  it("preço com taxa nula preserva o custo e encerra o modo desconto", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 10_000,
      costCents: 6500,
      purchaseDiscountBps: 3500,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      priceCents: 12_000,
      purchaseDiscountBps: null,
    });

    expect(updated.priceCents).toBe(12_000);
    expect(updated.costCents).toBe(6500);
    expect(updated.purchaseDiscountBps).toBeNull();
  });

  it("PATCH não financeiro preserva preço, custo e taxa", async () => {
    const product = storedProduct({
      id: "id-1",
      priceCents: 10_000,
      costCents: 6500,
      purchaseDiscountBps: 3500,
      stockQty: 10,
      lowStockThreshold: 2,
    });
    const { service } = buildService([product]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      stockQty: 1,
    });

    expect(updated.stockQty).toBe(1);
    expect(updated.priceCents).toBe(10_000);
    expect(updated.costCents).toBe(6500);
    expect(updated.purchaseDiscountBps).toBe(3500);
  });

  it("lança ProductNotFoundError quando o produto não existe no escopo", async () => {
    const { service } = buildService();

    await expect(
      service.update(CONSULTANT_A, "inexistente", { name: "Novo" }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe("productsService.remove", () => {
  it("remove o produto do escopo da consultora", async () => {
    const product = storedProduct({ id: "id-1" });
    const { service, getStore } = buildService([product]);

    await expect(service.remove(CONSULTANT_A, "id-1")).resolves.toBeUndefined();
    expect(getStore()).toHaveLength(0);
  });

  it("lança ProductNotFoundError quando o produto não existe", async () => {
    const { service } = buildService();

    await expect(
      service.remove(CONSULTANT_A, "inexistente"),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe("productsService.list", () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    storedProduct({
      id: `id-${i + 1}`,
      // Nome com índice zero-padded para ordenação alfabética previsível.
      name: `Produto ${String(i + 1).padStart(2, "0")}`,
      stockQty: 10,
    }),
  );

  it("pagina com total correto e devolve a página pedida", async () => {
    const { service } = buildService(many);

    const firstPage = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
    });

    expect(firstPage.total).toBe(25);
    expect(firstPage.page).toBe(1);
    expect(firstPage.perPage).toBe(20);
    expect(firstPage.data).toHaveLength(20);
    expect(firstPage.data[0]?.name).toBe("Produto 01");

    const secondPage = await service.list(CONSULTANT_A, {
      page: 2,
      perPage: 20,
    });

    expect(secondPage.total).toBe(25);
    expect(secondPage.data).toHaveLength(5);
    expect(secondPage.data[0]?.name).toBe("Produto 21");
  });

  it("repassa a busca ao repository (filtra por nome e brand_code, case-insensitive)", async () => {
    const seed = [
      storedProduct({ id: "id-1", name: "Batom Fosco", brandCode: "MK-100" }),
      storedProduct({ id: "id-2", name: "Base", brandCode: "MK-200" }),
    ];
    const { service } = buildService(seed);

    const byName = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
      search: "fosco",
    });
    expect(byName.total).toBe(1);
    expect(byName.data[0]?.name).toBe("Batom Fosco");

    const byBrand = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
      search: "mk-200",
    });
    expect(byBrand.total).toBe(1);
    expect(byBrand.data[0]?.name).toBe("Base");
  });

  it("filtro lowStock só retorna produtos com estoque <= limiar", async () => {
    const seed = [
      storedProduct({
        id: "id-1",
        name: "Cheio",
        stockQty: 10,
        lowStockThreshold: 2,
      }),
      storedProduct({
        id: "id-2",
        name: "Baixo",
        stockQty: 1,
        lowStockThreshold: 3,
      }),
      storedProduct({
        id: "id-3",
        name: "Zerado",
        stockQty: 0,
        lowStockThreshold: 1,
      }),
    ];
    const { service } = buildService(seed);

    const result = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
      lowStock: true,
    });

    expect(result.total).toBe(2);
    expect(result.data.map((p) => p.name).toSorted()).toEqual([
      "Baixo",
      "Zerado",
    ]);
    expect(result.data.every((p) => p.lowStock)).toBe(true);
  });

  it("escopo: consultora A não enxerga produtos da consultora B", async () => {
    const seed = [
      storedProduct({ id: "a-1", consultantId: CONSULTANT_A, name: "A Um" }),
      storedProduct({ id: "b-1", consultantId: CONSULTANT_B, name: "B Um" }),
      storedProduct({ id: "b-2", consultantId: CONSULTANT_B, name: "B Dois" }),
    ];
    const { service } = buildService(seed);

    const listA = await service.list(CONSULTANT_A, { page: 1, perPage: 20 });

    expect(listA.total).toBe(1);
    expect(listA.data[0]?.name).toBe("A Um");

    await expect(service.getById(CONSULTANT_A, "b-1")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    await expect(
      service.update(CONSULTANT_A, "b-1", { name: "Invasão" }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(service.remove(CONSULTANT_A, "b-1")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });
});

describe("productsService.summary", () => {
  it("repassa o agregado da consultora calculado pelo repository", async () => {
    const seed = [
      storedProduct({
        id: "id-1",
        costCents: 1000,
        priceCents: 2000,
        stockQty: 3,
        lowStockThreshold: 1,
      }),
      storedProduct({
        id: "id-2",
        costCents: 500,
        priceCents: 900,
        stockQty: 1,
        lowStockThreshold: 5,
      }),
      // Estoque 0 não afeta as somas; conta como estoque baixo (0 <= limiar).
      storedProduct({
        id: "id-3",
        costCents: 9999,
        priceCents: 9999,
        stockQty: 0,
        lowStockThreshold: 1,
      }),
    ];
    const { service } = buildService(seed);

    const summary = await service.summary(CONSULTANT_A);

    expect(summary.stockCostCents).toBe(1000 * 3 + 500 * 1);
    expect(summary.stockPriceCents).toBe(2000 * 3 + 900 * 1);
    // id-2 (1 <= 5) e id-3 (0 <= 1) em estoque baixo.
    expect(summary.lowStockCount).toBe(2);
  });

  it("escopa por consultora e devolve zeros sem produtos", async () => {
    const seed = [
      storedProduct({
        id: "b-1",
        consultantId: CONSULTANT_B,
        costCents: 1000,
        priceCents: 2000,
        stockQty: 5,
      }),
    ];
    const { service } = buildService(seed);

    const summary = await service.summary(CONSULTANT_A);

    expect(summary).toEqual({
      stockCostCents: 0,
      stockPriceCents: 0,
      lowStockCount: 0,
    });
  });
});

describe("escapeLikeTerm", () => {
  it("escapa o curinga de porcentagem", () => {
    expect(escapeLikeTerm("%")).toBe("\\%");
  });

  it("escapa o curinga de sublinhado", () => {
    expect(escapeLikeTerm("_")).toBe("\\_");
  });

  it("escapa a barra invertida", () => {
    expect(escapeLikeTerm("\\")).toBe("\\\\");
  });

  it("deixa um termo normal intacto", () => {
    expect(escapeLikeTerm("Batom Vermelho 42")).toBe("Batom Vermelho 42");
  });

  it("escapa a barra antes dos curingas (sem duplicar as barras inseridas)", () => {
    expect(escapeLikeTerm("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("toSafeInteger", () => {
  it("converte string de agregado dentro do range seguro", () => {
    expect(toSafeInteger("129900", "stockCostCents")).toBe(129900);
  });

  it("converte zero", () => {
    expect(toSafeInteger(0, "lowStockCount")).toBe(0);
  });

  it("aceita o próprio MAX_SAFE_INTEGER", () => {
    expect(
      toSafeInteger(String(Number.MAX_SAFE_INTEGER), "stockPriceCents"),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("lança quando o agregado excede a precisão inteira segura", () => {
    const unsafe = String(Number.MAX_SAFE_INTEGER + 1);
    expect(() => toSafeInteger(unsafe, "stockCostCents")).toThrow(
      /excede a precisão inteira segura/,
    );
  });
});
