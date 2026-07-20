import type {
  CreateSale,
  Receivable,
  ReceivablesSummary,
  Sale,
  SaleListItem,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  InsufficientStockError,
  InvalidSaleCreditError,
  InvalidSaleItemError,
  SaleNotFoundError,
} from "./sales.errors";
import {
  createSalesService,
  type ListReceivablesParams,
  type ListSalesParams,
  type ReceivableData,
  type ReceivableWithSale,
  type SaleData,
  type SaleItemData,
  type SaleProductSnapshot,
  type SalesRepositoryPort,
} from "./sales.service";

const CONSULTANT_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_1 = "11111111-1111-7111-8111-111111111111";
const PRODUCT_2 = "22222222-2222-7222-8222-222222222222";
const CLIENT_1 = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";
const FIXED_ISO = "2026-07-18T12:00:00.000Z";

type CreateSaleCall = {
  consultantId: string;
  sale: SaleData;
  items: SaleItemData[];
  receivables: ReceivableData[];
};

type FakeOptions = {
  products?: SaleProductSnapshot[];
  createSaleImpl?: (call: CreateSaleCall) => Promise<Sale>;
  getByIdResult?: Sale | undefined;
  listResult?: { rows: SaleListItem[]; total: number };
  cancelResult?: Sale;
  listReceivablesResult?: { rows: ReceivableWithSale[]; total: number };
  summaryResult?: ReceivablesSummary;
  setReceivablePaidResult?: Receivable;
};

// Molda um Sale determinístico a partir do que o service compôs — assim os
// testes asseveram a COMPOSIÇÃO (snapshots, total, recebíveis) observando o
// que chegou ao repository, e o repasse dos demais métodos.
const buildSaleFromCall = (call: CreateSaleCall): Sale => ({
  id: "sale-generated",
  clientId: call.sale.clientId,
  clientName: call.sale.clientId
    ? "Cliente Vinculada"
    : "Cliente não identificada",
  totalCents: call.sale.totalCents,
  paymentMethod: call.sale.paymentMethod,
  status: "completed",
  soldAt: FIXED_ISO,
  items: call.items.map((item, index) => ({
    id: `item-${index}`,
    productId: item.productId,
    productName: item.productName,
    qty: item.qty,
    unitPriceCents: item.unitPriceCents,
  })),
  receivables: call.receivables.map((receivable, index) => ({
    id: `rec-${index}`,
    saleId: "sale-generated",
    amountCents: receivable.amountCents,
    dueDate: receivable.dueDate,
    paidAt: null,
    overdue: false,
  })),
});

const createFakeRepository = (options: FakeOptions = {}) => {
  const products = options.products ?? [];
  const calls: { createSale: CreateSaleCall[] } = { createSale: [] };

  const repository: SalesRepositoryPort = {
    findProductsByIds: async (_consultantId: string, ids: string[]) =>
      products.filter((product) => ids.includes(product.id)),
    createSale: async (
      consultantId: string,
      sale: SaleData,
      items: SaleItemData[],
      receivables: ReceivableData[],
    ) => {
      const call: CreateSaleCall = { consultantId, sale, items, receivables };
      calls.createSale.push(call);
      if (options.createSaleImpl) {
        return options.createSaleImpl(call);
      }
      return buildSaleFromCall(call);
    },
    list: async (_consultantId: string, _params: ListSalesParams) =>
      options.listResult ?? { rows: [], total: 0 },
    getById: async (_consultantId: string, _id: string) =>
      options.getByIdResult,
    cancel: async (_consultantId: string, _saleId: string) => {
      if (!options.cancelResult) {
        throw new Error("cancelResult não configurado");
      }
      return options.cancelResult;
    },
    listReceivables: async (
      _consultantId: string,
      _params: ListReceivablesParams,
    ) => options.listReceivablesResult ?? { rows: [], total: 0 },
    receivablesSummary: async (_consultantId: string) =>
      options.summaryResult ?? {
        pendingCents: 0,
        overdueCents: 0,
        overdueCount: 0,
      },
    setReceivablePaid: async (
      _consultantId: string,
      _receivableId: string,
      _paid: boolean,
    ) => {
      if (!options.setReceivablePaidResult) {
        throw new Error("setReceivablePaidResult não configurado");
      }
      return options.setReceivablePaidResult;
    },
  };

  return { repository, calls };
};

const buildService = (options: FakeOptions = {}) => {
  const { repository, calls } = createFakeRepository(options);
  return { service: createSalesService({ repository }), calls };
};

const product = (
  overrides: Partial<SaleProductSnapshot> & Pick<SaleProductSnapshot, "id">,
): SaleProductSnapshot => ({
  name: "Batom Vermelho",
  priceCents: 5990,
  costCents: 2000,
  ...overrides,
});

describe("salesService.create — composição", () => {
  it("compõe snapshot (nome), usa o preço atual como default, calcula o total no servidor e não gera recebíveis à vista", async () => {
    const { service, calls } = buildService({
      products: [
        product({
          id: PRODUCT_1,
          name: "Batom Fosco",
          priceCents: 5000,
          costCents: 2200,
        }),
        product({
          id: PRODUCT_2,
          name: "Base Líquida",
          priceCents: 8000,
          costCents: 3500,
        }),
      ],
    });

    const input: CreateSale = {
      clientId: CLIENT_1,
      items: [
        { productId: PRODUCT_1, qty: 2 },
        { productId: PRODUCT_2, qty: 1 },
      ],
      paymentMethod: "cash",
      installments: 1,
    };

    const sale = await service.create(CONSULTANT_A, input);

    const [call] = calls.createSale;
    if (!call) {
      throw new Error("esperava uma chamada a createSale");
    }
    expect(call.consultantId).toBe(CONSULTANT_A);
    expect(call.sale).toEqual({
      clientId: CLIENT_1,
      paymentMethod: "cash",
      totalCents: 2 * 5000 + 1 * 8000,
    });
    expect(call.items).toEqual([
      {
        productId: PRODUCT_1,
        productName: "Batom Fosco",
        qty: 2,
        unitPriceCents: 5000,
        costCents: 2200,
      },
      {
        productId: PRODUCT_2,
        productName: "Base Líquida",
        qty: 1,
        unitPriceCents: 8000,
        costCents: 3500,
      },
    ]);
    expect(call.receivables).toEqual([]);
    expect(sale.totalCents).toBe(18000);
    expect(sale.receivables).toEqual([]);
  });

  it("respeita o unitPriceCents informado (override) em vez do preço atual", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1, priceCents: 5990 })],
    });

    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 3, unitPriceCents: 4999 }],
      paymentMethod: "pix",
      installments: 1,
    });

    const [call] = calls.createSale;
    expect(call?.items[0]?.unitPriceCents).toBe(4999);
    expect(call?.sale.totalCents).toBe(3 * 4999);
  });

  it("item composto carrega costCents do produto (snapshot), sem override do cliente (CRM-07/RF-02)", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1, priceCents: 5990, costCents: 2750 })],
    });

    // unitPriceCents com override não afeta o costCents: o custo é sempre o
    // snapshot do produto, nunca decidido pelo cliente.
    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 1, unitPriceCents: 4999 }],
      paymentMethod: "pix",
      installments: 1,
    });

    const [call] = calls.createSale;
    expect(call?.items[0]?.costCents).toBe(2750);
    expect(call?.items[0]?.unitPriceCents).toBe(4999);
  });

  it("venda sem cliente identificada é permitida (clientId null)", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1, priceCents: 1000 })],
    });

    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 1 }],
      paymentMethod: "card",
      installments: 1,
    });

    expect(calls.createSale[0]?.sale.clientId).toBeNull();
  });
});

describe("salesService.create — venda a prazo (credit)", () => {
  it("gera recebíveis com Σ exata e vencimentos mensais a partir do primeiro vencimento", async () => {
    const { service, calls } = buildService({
      // total 10000 (2 × 5000) em 3× ⇒ 3334 + 3333 + 3333.
      products: [product({ id: PRODUCT_1, priceCents: 5000 })],
    });

    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 2 }],
      paymentMethod: "credit",
      installments: 3,
      firstDueDate: "2026-01-31",
    });

    const receivables = calls.createSale[0]?.receivables ?? [];
    expect(receivables.map((r) => r.amountCents)).toEqual([3334, 3333, 3333]);
    // Σ exata = total.
    expect(receivables.reduce((sum, r) => sum + r.amountCents, 0)).toBe(10000);
    // Vencimentos: 31/jan → 28/fev (clamp) → 31/mar (âncora no dia original).
    expect(receivables.map((r) => r.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("fiado (1×) gera um único recebível no vencimento", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1, priceCents: 7000 })],
    });

    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 1 }],
      paymentMethod: "credit",
      installments: 1,
      firstDueDate: "2026-08-10",
    });

    expect(calls.createSale[0]?.receivables).toEqual([
      { amountCents: 7000, dueDate: "2026-08-10" },
    ]);
  });

  it("total menor que o número de parcelas ⇒ InvalidSaleCreditError (422) e não persiste", async () => {
    const { service, calls } = buildService({
      // total 2 centavos, 3 parcelas.
      products: [product({ id: PRODUCT_1, priceCents: 2 })],
    });

    const error = await service
      .create(CONSULTANT_A, {
        items: [{ productId: PRODUCT_1, qty: 1 }],
        paymentMethod: "credit",
        installments: 3,
        firstDueDate: "2026-08-10",
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidSaleCreditError);
    expect(calls.createSale).toHaveLength(0);
  });
});

describe("salesService.create — validação de itens", () => {
  it("produto inexistente ou de outra consultora ⇒ InvalidSaleItemError (422) sem persistir", async () => {
    const { service, calls } = buildService({ products: [] });

    const error = await service
      .create(CONSULTANT_A, {
        items: [{ productId: PRODUCT_1, qty: 1 }],
        paymentMethod: "cash",
        installments: 1,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidSaleItemError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toContain(PRODUCT_1);
    expect(calls.createSale).toHaveLength(0);
  });

  it("propaga InsufficientStockError lançado pela transação do repository", async () => {
    const { service } = buildService({
      products: [product({ id: PRODUCT_1, name: "Rímel", priceCents: 1000 })],
      createSaleImpl: async () => {
        throw new InsufficientStockError("Rímel", 2);
      },
    });

    const error = await service
      .create(CONSULTANT_A, {
        items: [{ productId: PRODUCT_1, qty: 5 }],
        paymentMethod: "cash",
        installments: 1,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InsufficientStockError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toBe(
      "Estoque insuficiente: restam 2 unidades de Rímel.",
    );
  });
});

describe("salesService — repasses com escopo", () => {
  it("getById repassa o resultado do repository", async () => {
    const sale: Sale = {
      id: "sale-1",
      clientId: null,
      clientName: "Cliente não identificada",
      totalCents: 1000,
      paymentMethod: "cash",
      status: "completed",
      soldAt: FIXED_ISO,
      items: [],
      receivables: [],
    };
    const { service } = buildService({ getByIdResult: sale });

    await expect(service.getById(CONSULTANT_A, "sale-1")).resolves.toEqual(
      sale,
    );
  });

  it("getById lança SaleNotFoundError quando o repository devolve undefined", async () => {
    const { service } = buildService({ getByIdResult: undefined });

    const error = await service
      .getById(CONSULTANT_A, "inexistente")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SaleNotFoundError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toBe("Venda não encontrada.");
  });

  it("list monta o envelope paginado", async () => {
    const row: SaleListItem = {
      id: "sale-1",
      clientId: null,
      clientName: "Cliente não identificada",
      totalCents: 1000,
      paymentMethod: "cash",
      status: "completed",
      soldAt: FIXED_ISO,
    };
    const { service } = buildService({ listResult: { rows: [row], total: 1 } });

    const result = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
    });

    expect(result).toEqual({
      data: [row],
      page: 1,
      perPage: 20,
      total: 1,
    });
  });

  it("cancel repassa a venda cancelada do repository", async () => {
    const canceled: Sale = {
      id: "sale-1",
      clientId: null,
      clientName: "Cliente não identificada",
      totalCents: 1000,
      paymentMethod: "cash",
      status: "canceled",
      soldAt: FIXED_ISO,
      items: [],
      receivables: [],
    };
    const { service } = buildService({ cancelResult: canceled });

    await expect(service.cancel(CONSULTANT_A, "sale-1")).resolves.toEqual(
      canceled,
    );
  });

  it("listReceivables monta o envelope paginado", async () => {
    const row: ReceivableWithSale = {
      id: "rec-1",
      saleId: "sale-1",
      amountCents: 3334,
      dueDate: "2026-08-10",
      paidAt: null,
      overdue: false,
      clientId: CLIENT_1,
      clientName: "Cliente Vinculada",
      clientWhatsapp: "+5511987654321",
    };
    const { service } = buildService({
      listReceivablesResult: { rows: [row], total: 1 },
    });

    const result = await service.listReceivables(CONSULTANT_A, {
      page: 1,
      perPage: 20,
      pending: true,
    });

    expect(result).toEqual({ data: [row], page: 1, perPage: 20, total: 1 });
  });

  it("receivablesSummary repassa o agregado do repository", async () => {
    const summary: ReceivablesSummary = {
      pendingCents: 9999,
      overdueCents: 3334,
      overdueCount: 1,
    };
    const { service } = buildService({ summaryResult: summary });

    await expect(service.receivablesSummary(CONSULTANT_A)).resolves.toEqual(
      summary,
    );
  });

  it("setReceivablePaid repassa o recebível do repository", async () => {
    const receivable: Receivable = {
      id: "rec-1",
      saleId: "sale-1",
      amountCents: 3334,
      dueDate: "2026-08-10",
      paidAt: FIXED_ISO,
      overdue: false,
    };
    const { service } = buildService({
      setReceivablePaidResult: receivable,
    });

    await expect(
      service.setReceivablePaid(CONSULTANT_A, "rec-1", true),
    ).resolves.toEqual(receivable);
  });
});
