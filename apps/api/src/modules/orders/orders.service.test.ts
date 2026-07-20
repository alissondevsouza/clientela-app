import type { Order, OrderListItem } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  InvalidOrderClientError,
  InvalidOrderItemError,
  OrderNotFoundError,
  OrderStateError,
} from "./orders.errors";
import {
  createOrdersService,
  type ListOrdersParams,
  type OrderClientRef,
  type OrderItemData,
  type OrderProductSnapshot,
  type OrdersRepositoryPort,
} from "./orders.service";

const CONSULTANT_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_1 = "11111111-1111-7111-8111-111111111111";
const PRODUCT_2 = "22222222-2222-7222-8222-222222222222";
const CLIENT_1 = "33333333-3333-7333-8333-333333333333";
const CLIENT_2 = "44444444-4444-7444-8444-444444444444";
const FIXED_ISO = "2026-07-20T12:00:00.000Z";

type CreateOrderCall = {
  consultantId: string;
  items: OrderItemData[];
  totalCents: number;
};

type ReplaceItemsCall = {
  consultantId: string;
  orderId: string;
  items: OrderItemData[];
  totalCents: number;
};

type FakeOptions = {
  products?: OrderProductSnapshot[];
  clientRefs?: OrderClientRef[];
  createOrderImpl?: (call: CreateOrderCall) => Promise<Order>;
  replaceItemsImpl?: (call: ReplaceItemsCall) => Promise<Order>;
  getByIdResult?: Order | undefined;
  listResult?: { rows: OrderListItem[]; total: number };
  placeResult?: Order;
  deliverResult?: Order;
  cancelResult?: Order;
};

// Molda um Order determinístico a partir do que o service compôs — assim os
// testes asseveram a COMPOSIÇÃO (snapshots, total) observando o que chegou ao
// repository, não implementação interna.
const buildOrderFromCall = (
  items: OrderItemData[],
  totalCents: number,
): Order => ({
  id: "order-generated",
  totalCents,
  status: "draft",
  placedAt: null,
  deliveredAt: null,
  canceledAt: null,
  createdAt: FIXED_ISO,
  items: items.map((item, index) => ({
    id: `item-${index}`,
    productId: item.productId,
    productName: item.productName,
    // Fake de repository: sem join real com clients — clientId repassado,
    // clientName não é composto pelo service (RF-01: derivado só na leitura
    // real do repository, testado em integração).
    clientId: item.clientId,
    clientName: null,
    qty: item.qty,
    unitCostCents: item.unitCostCents,
  })),
});

const createFakeRepository = (options: FakeOptions = {}) => {
  const products = options.products ?? [];
  const clientRefs = options.clientRefs ?? [];
  const calls: {
    createOrder: CreateOrderCall[];
    replaceItems: ReplaceItemsCall[];
    findClientsByIds: string[][];
  } = { createOrder: [], replaceItems: [], findClientsByIds: [] };

  const repository: OrdersRepositoryPort = {
    findProductsByIds: async (_consultantId: string, ids: string[]) =>
      products.filter((product) => ids.includes(product.id)),
    findClientsByIds: async (_consultantId: string, ids: string[]) => {
      calls.findClientsByIds.push(ids);
      return clientRefs.filter((client) => ids.includes(client.id));
    },
    createOrder: async (
      consultantId: string,
      items: OrderItemData[],
      totalCents: number,
    ) => {
      const call: CreateOrderCall = { consultantId, items, totalCents };
      calls.createOrder.push(call);
      if (options.createOrderImpl) {
        return options.createOrderImpl(call);
      }
      return buildOrderFromCall(items, totalCents);
    },
    replaceItems: async (
      consultantId: string,
      orderId: string,
      items: OrderItemData[],
      totalCents: number,
    ) => {
      const call: ReplaceItemsCall = {
        consultantId,
        orderId,
        items,
        totalCents,
      };
      calls.replaceItems.push(call);
      if (options.replaceItemsImpl) {
        return options.replaceItemsImpl(call);
      }
      return buildOrderFromCall(items, totalCents);
    },
    list: async (_consultantId: string, _params: ListOrdersParams) =>
      options.listResult ?? { rows: [], total: 0 },
    getById: async (_consultantId: string, _id: string) =>
      options.getByIdResult,
    place: async (_consultantId: string, _orderId: string) => {
      if (!options.placeResult) {
        throw new Error("placeResult não configurado");
      }
      return options.placeResult;
    },
    deliver: async (_consultantId: string, _orderId: string) => {
      if (!options.deliverResult) {
        throw new Error("deliverResult não configurado");
      }
      return options.deliverResult;
    },
    cancel: async (_consultantId: string, _orderId: string) => {
      if (!options.cancelResult) {
        throw new Error("cancelResult não configurado");
      }
      return options.cancelResult;
    },
  };

  return { repository, calls };
};

const buildService = (options: FakeOptions = {}) => {
  const { repository, calls } = createFakeRepository(options);
  return { service: createOrdersService({ repository }), calls };
};

const product = (
  overrides: Partial<OrderProductSnapshot> & Pick<OrderProductSnapshot, "id">,
): OrderProductSnapshot => ({
  name: "Batom Vermelho",
  costCents: 2000,
  ...overrides,
});

const client = (id: string): OrderClientRef => ({ id });

describe("ordersService.create — composição", () => {
  it("pedido sem itens é permitido e o total é 0", async () => {
    const { service, calls } = buildService();

    const order = await service.create(CONSULTANT_A, { items: [] });

    expect(calls.createOrder[0]).toEqual({
      consultantId: CONSULTANT_A,
      items: [],
      totalCents: 0,
    });
    expect(order.totalCents).toBe(0);
    expect(order.items).toEqual([]);
  });

  it("compõe snapshot (nome), usa o custo atual como default e calcula o total no servidor", async () => {
    const { service, calls } = buildService({
      products: [
        product({ id: PRODUCT_1, name: "Batom Fosco", costCents: 2200 }),
        product({ id: PRODUCT_2, name: "Base Líquida", costCents: 3500 }),
      ],
    });

    const order = await service.create(CONSULTANT_A, {
      items: [
        { productId: PRODUCT_1, qty: 2 },
        { productId: PRODUCT_2, qty: 1 },
      ],
    });

    const [call] = calls.createOrder;
    if (!call) {
      throw new Error("esperava uma chamada a createOrder");
    }
    expect(call.consultantId).toBe(CONSULTANT_A);
    expect(call.items).toEqual([
      {
        productId: PRODUCT_1,
        productName: "Batom Fosco",
        clientId: null,
        qty: 2,
        unitCostCents: 2200,
      },
      {
        productId: PRODUCT_2,
        productName: "Base Líquida",
        clientId: null,
        qty: 1,
        unitCostCents: 3500,
      },
    ]);
    expect(call.totalCents).toBe(2 * 2200 + 1 * 3500);
    expect(order.totalCents).toBe(7900);
  });

  it("respeita o unitCostCents informado (override) em vez do custo atual do produto", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1, costCents: 2000 })],
    });

    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 3, unitCostCents: 1500 }],
    });

    const [call] = calls.createOrder;
    expect(call?.items[0]?.unitCostCents).toBe(1500);
    expect(call?.totalCents).toBe(3 * 1500);
  });

  it("produto inexistente ou de outra consultora ⇒ InvalidOrderItemError (422) sem persistir", async () => {
    const { service, calls } = buildService({ products: [] });

    const error = await service
      .create(CONSULTANT_A, {
        items: [{ productId: PRODUCT_1, qty: 1 }],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidOrderItemError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toContain(PRODUCT_1);
    expect(calls.createOrder).toHaveLength(0);
  });

  it("ids duplicados de produto no payload são deduplicados na busca, mas os itens são preservados", async () => {
    const { service, calls } = buildService({
      products: [
        product({ id: PRODUCT_1, name: "Batom Fosco", costCents: 2000 }),
      ],
    });

    const order = await service.create(CONSULTANT_A, {
      items: [
        { productId: PRODUCT_1, qty: 1 },
        { productId: PRODUCT_1, qty: 2 },
      ],
    });

    const [call] = calls.createOrder;
    expect(call?.items).toHaveLength(2);
    expect(call?.items).toEqual([
      {
        productId: PRODUCT_1,
        productName: "Batom Fosco",
        clientId: null,
        qty: 1,
        unitCostCents: 2000,
      },
      {
        productId: PRODUCT_1,
        productName: "Batom Fosco",
        clientId: null,
        qty: 2,
        unitCostCents: 2000,
      },
    ]);
    expect(call?.totalCents).toBe(1 * 2000 + 2 * 2000);
    expect(order.items).toHaveLength(2);
  });
});

describe("ordersService.create — vínculo de cliente (RF-02)", () => {
  it("item sem clientId compõe com clientId null (reposição)", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1 })],
    });

    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 1 }],
    });

    const [call] = calls.createOrder;
    expect(call?.items[0]?.clientId).toBeNull();
    expect(calls.findClientsByIds).toHaveLength(0);
  });

  it("item com clientId válido (da consultora) repassa o vínculo ao repository", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1 })],
      clientRefs: [client(CLIENT_1)],
    });

    await service.create(CONSULTANT_A, {
      items: [{ productId: PRODUCT_1, qty: 1, clientId: CLIENT_1 }],
    });

    const [call] = calls.createOrder;
    expect(call?.items[0]?.clientId).toBe(CLIENT_1);
  });

  it("clientId inexistente ou de outra consultora ⇒ InvalidOrderClientError (422) sem persistir", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1 })],
      clientRefs: [],
    });

    const error = await service
      .create(CONSULTANT_A, {
        items: [{ productId: PRODUCT_1, qty: 1, clientId: CLIENT_1 }],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidOrderClientError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toBe("Cliente inválida para este pedido.");
    expect(calls.createOrder).toHaveLength(0);
  });

  it("mistura de itens com e sem cliente: cada item carrega o clientId correto", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1 }), product({ id: PRODUCT_2 })],
      clientRefs: [client(CLIENT_1)],
    });

    await service.create(CONSULTANT_A, {
      items: [
        { productId: PRODUCT_1, qty: 1, clientId: CLIENT_1 },
        { productId: PRODUCT_2, qty: 1 },
      ],
    });

    const [call] = calls.createOrder;
    expect(call?.items[0]?.clientId).toBe(CLIENT_1);
    expect(call?.items[1]?.clientId).toBeNull();
  });

  it("clientIds duplicados nos itens são deduplicados na busca ao repository", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1 })],
      clientRefs: [client(CLIENT_1), client(CLIENT_2)],
    });

    await service.create(CONSULTANT_A, {
      items: [
        { productId: PRODUCT_1, qty: 1, clientId: CLIENT_1 },
        { productId: PRODUCT_1, qty: 2, clientId: CLIENT_1 },
        { productId: PRODUCT_1, qty: 1, clientId: CLIENT_2 },
      ],
    });

    expect(calls.findClientsByIds).toHaveLength(1);
    expect(calls.findClientsByIds[0]).toHaveLength(2);
    expect(calls.findClientsByIds[0]).toEqual(
      expect.arrayContaining([CLIENT_1, CLIENT_2]),
    );
  });
});

describe("ordersService.replaceItems — composição", () => {
  it("substituir por lista vazia é válido e o total recalculado é 0", async () => {
    const { service, calls } = buildService();

    const order = await service.replaceItems(CONSULTANT_A, "order-1", {
      items: [],
    });

    expect(calls.replaceItems[0]).toEqual({
      consultantId: CONSULTANT_A,
      orderId: "order-1",
      items: [],
      totalCents: 0,
    });
    expect(order.totalCents).toBe(0);
  });

  it("recalcula o total e o snapshot dos itens substituídos", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1, name: "Rímel", costCents: 1800 })],
    });

    await service.replaceItems(CONSULTANT_A, "order-1", {
      items: [{ productId: PRODUCT_1, qty: 4 }],
    });

    const [call] = calls.replaceItems;
    expect(call?.orderId).toBe("order-1");
    expect(call?.items).toEqual([
      {
        productId: PRODUCT_1,
        productName: "Rímel",
        clientId: null,
        qty: 4,
        unitCostCents: 1800,
      },
    ]);
    expect(call?.totalCents).toBe(4 * 1800);
  });

  it("propaga OrderStateError lançado pela transação do repository (fora de draft)", async () => {
    const { service } = buildService({
      replaceItemsImpl: async () => {
        throw new OrderStateError("Só é possível editar itens de um rascunho.");
      },
    });

    const error = await service
      .replaceItems(CONSULTANT_A, "order-1", { items: [] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OrderStateError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toBe("Só é possível editar itens de um rascunho.");
  });

  it("clientId inexistente ⇒ InvalidOrderClientError (422) sem persistir (mesma composição do create)", async () => {
    const { service, calls } = buildService({
      products: [product({ id: PRODUCT_1 })],
      clientRefs: [],
    });

    const error = await service
      .replaceItems(CONSULTANT_A, "order-1", {
        items: [{ productId: PRODUCT_1, qty: 1, clientId: CLIENT_1 }],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidOrderClientError);
    expect(calls.replaceItems).toHaveLength(0);
  });
});

describe("ordersService — repasses com escopo", () => {
  it("getById repassa o resultado do repository", async () => {
    const order: Order = {
      id: "order-1",
      totalCents: 1000,
      status: "draft",
      placedAt: null,
      deliveredAt: null,
      canceledAt: null,
      createdAt: FIXED_ISO,
      items: [],
    };
    const { service } = buildService({ getByIdResult: order });

    await expect(service.getById(CONSULTANT_A, "order-1")).resolves.toEqual(
      order,
    );
  });

  it("getById lança OrderNotFoundError quando o repository devolve undefined", async () => {
    const { service } = buildService({ getByIdResult: undefined });

    const error = await service
      .getById(CONSULTANT_A, "inexistente")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OrderNotFoundError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toBe("Pedido não encontrado.");
  });

  it("list monta o envelope paginado", async () => {
    const row: OrderListItem = {
      id: "order-1",
      totalCents: 1000,
      status: "draft",
      placedAt: null,
      deliveredAt: null,
      canceledAt: null,
      createdAt: FIXED_ISO,
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

  it("place repassa o pedido do repository", async () => {
    const placed: Order = {
      id: "order-1",
      totalCents: 1000,
      status: "placed",
      placedAt: FIXED_ISO,
      deliveredAt: null,
      canceledAt: null,
      createdAt: FIXED_ISO,
      items: [],
    };
    const { service } = buildService({ placeResult: placed });

    await expect(service.place(CONSULTANT_A, "order-1")).resolves.toEqual(
      placed,
    );
  });

  it("deliver repassa o pedido do repository", async () => {
    const delivered: Order = {
      id: "order-1",
      totalCents: 1000,
      status: "delivered",
      placedAt: FIXED_ISO,
      deliveredAt: FIXED_ISO,
      canceledAt: null,
      createdAt: FIXED_ISO,
      items: [],
    };
    const { service } = buildService({ deliverResult: delivered });

    await expect(service.deliver(CONSULTANT_A, "order-1")).resolves.toEqual(
      delivered,
    );
  });

  it("cancel repassa o pedido cancelado do repository", async () => {
    const canceled: Order = {
      id: "order-1",
      totalCents: 1000,
      status: "canceled",
      placedAt: null,
      deliveredAt: null,
      canceledAt: FIXED_ISO,
      createdAt: FIXED_ISO,
      items: [],
    };
    const { service } = buildService({ cancelResult: canceled });

    await expect(service.cancel(CONSULTANT_A, "order-1")).resolves.toEqual(
      canceled,
    );
  });
});
