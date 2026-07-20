import type {
  CreateOrder,
  Order,
  OrderListItem,
  OrderStatus,
  OrdersListQuery,
  Paginated,
  ReplaceOrderItems,
} from "@clientela/shared";
import {
  InvalidOrderClientError,
  InvalidOrderItemError,
  OrderNotFoundError,
} from "./orders.errors";

// ---------------------------------------------------------------------------
// Portas e tipos de dados entre service e repository. O service não conhece
// Drizzle nem o schema (api.md): compõe os itens/total e delega a persistência
// atômica. Snapshot (productName/unitCostCents) é gravado no momento da
// composição — histórico imutável (inv. 5 do domínio, ADR-0013).
// ---------------------------------------------------------------------------

// Snapshot mínimo do produto que o service precisa para compor o item: nome
// (snapshot) e custo atual (default de unitCostCents). Carregado FORA da
// transação — a atomicidade do custo é aceitável (snapshot), assim como em
// sales.
export type OrderProductSnapshot = {
  id: string;
  name: string;
  costCents: number;
};

// Item já com snapshot resolvido pelo service (nome do produto + custo unitário
// praticado, override ou default). productId é obrigatório na composição (o
// produto foi validado contra o catálogo da consultora). clientId: SEM
// snapshot (RF-01/plan) — apenas o vínculo, validado contra o escopo da
// consultora; null = item de reposição (sem cliente).
export type OrderItemData = {
  productId: string;
  productName: string;
  clientId: string | null;
  qty: number;
  unitCostCents: number;
};

// Referência mínima de cliente para validar o vínculo de encomenda (RF-02):
// só o id importa aqui — sem snapshot de nome (clientName é derivado por join
// na leitura, não na composição).
export type OrderClientRef = {
  id: string;
};

export type ListOrdersParams = {
  page: number;
  perPage: number;
  status?: OrderStatus;
};

// Porta do repositório de pedidos. TODA operação recebe `consultantId` para
// escopar por consultora. As guardas de transição (place/deliver/cancel) e o
// crédito de estoque na entrega vivem DENTRO das transações do repository; o
// service compõe os itens/total e traduz os retornos ausentes em erros de
// domínio.
export type OrdersRepositoryPort = {
  // Carrega os produtos (escopados) para compor snapshot/custo default. Só
  // retorna os que existem no escopo — o service aponta o item ausente (422).
  findProductsByIds: (
    consultantId: string,
    ids: string[],
  ) => Promise<OrderProductSnapshot[]>;
  // Carrega as clientes (escopadas) referenciadas pelos itens, para o service
  // validar o vínculo de encomenda (RF-02). Só retorna as que existem no
  // escopo — o service aponta o item ausente (422), simétrico a
  // findProductsByIds.
  findClientsByIds: (
    consultantId: string,
    ids: string[],
  ) => Promise<OrderClientRef[]>;
  createOrder: (
    consultantId: string,
    items: OrderItemData[],
    totalCents: number,
  ) => Promise<Order>;
  replaceItems: (
    consultantId: string,
    orderId: string,
    items: OrderItemData[],
    totalCents: number,
  ) => Promise<Order>;
  list: (
    consultantId: string,
    params: ListOrdersParams,
  ) => Promise<{ rows: OrderListItem[]; total: number }>;
  getById: (consultantId: string, id: string) => Promise<Order | undefined>;
  place: (consultantId: string, orderId: string) => Promise<Order>;
  deliver: (consultantId: string, orderId: string) => Promise<Order>;
  cancel: (consultantId: string, orderId: string) => Promise<Order>;
};

export type OrdersServiceDeps = {
  repository: OrdersRepositoryPort;
};

export type OrdersService = ReturnType<typeof createOrdersService>;

export const createOrdersService = ({ repository }: OrdersServiceDeps) => {
  // Composição dos itens (regra de negócio pura, sem HTTP): valida os itens
  // contra o catálogo da consultora, resolve snapshot/custo (override ??
  // custo atual do produto), valida o vínculo de cliente opcional (RF-02:
  // clientId informado deve pertencer à consultora — ANTES de persistir) e
  // calcula o total NO SERVIDOR (Σ qty × unitCostCents — o cliente nunca dita
  // o valor). Compartilhada entre create e replaceItems (RF-01/RF-02: mesma
  // composição).
  const composeItems = async (
    consultantId: string,
    itemsInput: CreateOrder["items"] | ReplaceOrderItems["items"],
  ): Promise<{ items: OrderItemData[]; totalCents: number }> => {
    const uniqueIds = [...new Set(itemsInput.map((item) => item.productId))];
    const products = await repository.findProductsByIds(
      consultantId,
      uniqueIds,
    );
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    // clientId ausente/null = item de reposição; normalizado para null (o
    // schema aceita undefined, mas OrderItemData carrega só string | null).
    const uniqueClientIds = [
      ...new Set(
        itemsInput
          .map((item) => item.clientId ?? null)
          .filter((clientId): clientId is string => clientId !== null),
      ),
    ];
    const clients =
      uniqueClientIds.length > 0
        ? await repository.findClientsByIds(consultantId, uniqueClientIds)
        : [];
    const clientIds = new Set(clients.map((client) => client.id));

    const items: OrderItemData[] = itemsInput.map((item) => {
      const product = productById.get(item.productId);
      if (product === undefined) {
        // Produto inexistente OU de outra consultora ⇒ 422 idêntico (o
        // findByIds é escopado, então ambos os casos caem aqui sem vazar
        // existência).
        throw new InvalidOrderItemError(item.productId);
      }
      const clientId = item.clientId ?? null;
      if (clientId !== null && !clientIds.has(clientId)) {
        // Cliente inexistente OU de outra consultora ⇒ 422 idêntico (mesmo
        // padrão de InvalidOrderItemError — não vaza existência).
        throw new InvalidOrderClientError();
      }
      // Default do custo unitário = custo atual do produto; override
      // respeitado (RF-01).
      const unitCostCents = item.unitCostCents ?? product.costCents;
      return {
        productId: item.productId,
        productName: product.name,
        clientId,
        qty: item.qty,
        unitCostCents,
      };
    });

    const totalCents = items.reduce(
      (sum, item) => sum + item.qty * item.unitCostCents,
      0,
    );

    return { items, totalCents };
  };

  const create = async (
    consultantId: string,
    input: CreateOrder,
  ): Promise<Order> => {
    const { items, totalCents } = await composeItems(consultantId, input.items);
    return repository.createOrder(consultantId, items, totalCents);
  };

  // Substituição completa dos itens (RF-02): lista vazia é válida (esvaziar o
  // rascunho); o bloqueio de "pedido sem itens" só existe no `place`. A
  // guarda de status (só `draft`) vive na transação do repository
  // (OrderStateError).
  const replaceItems = async (
    consultantId: string,
    orderId: string,
    input: ReplaceOrderItems,
  ): Promise<Order> => {
    const { items, totalCents } = await composeItems(consultantId, input.items);
    return repository.replaceItems(consultantId, orderId, items, totalCents);
  };

  const list = async (
    consultantId: string,
    query: OrdersListQuery,
  ): Promise<Paginated<OrderListItem>> => {
    const { rows, total } = await repository.list(consultantId, {
      page: query.page,
      perPage: query.perPage,
      status: query.status,
    });

    return {
      data: rows,
      page: query.page,
      perPage: query.perPage,
      total,
    };
  };

  const getById = async (consultantId: string, id: string): Promise<Order> => {
    const order = await repository.getById(consultantId, id);
    if (!order) {
      throw new OrderNotFoundError();
    }
    return order;
  };

  // Transições (RF-03/RF-04): as guardas de estado (matriz do vocabulário,
  // `place` sem itens, crédito de estoque no `deliver`) vivem na transação do
  // repository, que lança OrderNotFoundError/OrderStateError. O service
  // apenas repassa o escopo.
  const place = (consultantId: string, orderId: string): Promise<Order> =>
    repository.place(consultantId, orderId);

  const deliver = (consultantId: string, orderId: string): Promise<Order> =>
    repository.deliver(consultantId, orderId);

  const cancel = (consultantId: string, orderId: string): Promise<Order> =>
    repository.cancel(consultantId, orderId);

  return {
    create,
    replaceItems,
    list,
    getById,
    place,
    deliver,
    cancel,
  };
};
