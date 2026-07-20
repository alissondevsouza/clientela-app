import type {
  CreateSale,
  Paginated,
  PaymentMethod,
  Receivable,
  ReceivablesListQuery,
  ReceivablesSummary,
  Sale,
  SaleListItem,
  SaleStatus,
  SalesListQuery,
} from "@clientela/shared";
import { addMonthsClamped, splitInstallmentAmounts } from "@clientela/shared";
import {
  InvalidSaleCreditError,
  InvalidSaleItemError,
  SaleNotFoundError,
} from "./sales.errors";

// `credit` = venda a prazo (gera recebíveis); os demais são à vista.
const CREDIT_PAYMENT_METHOD: PaymentMethod = "credit";

const CREDIT_TOTAL_TOO_LOW_MESSAGE =
  "O valor total da venda é menor que o número de parcelas.";
// Defensivo: o schema já exige firstDueDate para `credit`. Mantido para o
// narrowing de tipo e como última linha de defesa se o contrato mudar.
const CREDIT_FIRST_DUE_REQUIRED_MESSAGE =
  "Informe o primeiro vencimento para venda a prazo.";

// ---------------------------------------------------------------------------
// Portas e tipos de dados entre service e repository. O service não conhece
// Drizzle nem o schema (api.md): compõe os dados de negócio e delega a
// persistência atômica. Snapshots (productName/unitPriceCents) e clientName são
// gravados no momento da venda — histórico imutável (inv. 5 do domínio).
// ---------------------------------------------------------------------------

// Snapshot mínimo do produto que o service precisa para compor a venda: nome
// (snapshot) e preço atual (default de unitPriceCents). Carregado FORA da
// transação — a atomicidade do preço é aceitável (snapshot); a invariante de
// estoque é garantida pelo UPDATE condicional dentro da transação.
export type SaleProductSnapshot = {
  id: string;
  name: string;
  priceCents: number;
  costCents: number;
};

// Cabeçalho da venda a persistir: clientId resolvido para string|null; o
// clientName (snapshot) é resolvido pelo repository dentro da transação a partir
// do clientId escopado (null ⇒ sentinel de venda sem cliente).
export type SaleData = {
  clientId: string | null;
  paymentMethod: PaymentMethod;
  totalCents: number;
};

// Item já com snapshot resolvido pelo service (nome do produto + preço unitário
// praticado). productId é obrigatório na criação (o produto foi validado).
export type SaleItemData = {
  productId: string;
  productName: string;
  qty: number;
  unitPriceCents: number;
  // Snapshot do custo do produto no momento da venda (CRM-07/lucro estimado) —
  // sempre o custo ATUAL do produto, nunca sujeito a override do cliente.
  costCents: number;
};

// Parcela a persistir: valor em centavos e vencimento ISO `yyyy-mm-dd`.
export type ReceivableData = {
  amountCents: number;
  dueDate: string;
};

// Recebível enriquecido com dados da venda/cliente para a lista "quem me deve"
// (RF-06): o escopo e os campos da cliente vêm do join com sales; o WhatsApp vem
// do LEFT JOIN com clients (null quando a cliente foi excluída ou a venda é
// anônima). Estrutura idêntica ao `ReceivableListItem` do contrato compartilhado.
export type ReceivableWithSale = Receivable & {
  clientId: string | null;
  clientName: string;
  clientWhatsapp: string | null;
};

export type ListSalesParams = {
  page: number;
  perPage: number;
  status?: SaleStatus;
  clientId?: string;
};

export type ListReceivablesParams = {
  page: number;
  perPage: number;
  pending: boolean;
};

// Porta do repositório de vendas/recebíveis. TODA operação recebe `consultantId`
// para escopar por consultora. As guardas de corrida (baixa de estoque, cancel,
// setReceivablePaid) vivem DENTRO das transações do repository; o service compõe
// os dados e traduz os retornos ausentes em erros de domínio.
export type SalesRepositoryPort = {
  // Carrega os produtos (escopados) para compor snapshot/preço default. Só
  // retorna os que existem no escopo — o service aponta o item ausente (422).
  findProductsByIds: (
    consultantId: string,
    ids: string[],
  ) => Promise<SaleProductSnapshot[]>;
  createSale: (
    consultantId: string,
    sale: SaleData,
    items: SaleItemData[],
    receivables: ReceivableData[],
  ) => Promise<Sale>;
  list: (
    consultantId: string,
    params: ListSalesParams,
  ) => Promise<{ rows: SaleListItem[]; total: number }>;
  getById: (consultantId: string, id: string) => Promise<Sale | undefined>;
  cancel: (consultantId: string, saleId: string) => Promise<Sale>;
  listReceivables: (
    consultantId: string,
    params: ListReceivablesParams,
  ) => Promise<{ rows: ReceivableWithSale[]; total: number }>;
  receivablesSummary: (consultantId: string) => Promise<ReceivablesSummary>;
  setReceivablePaid: (
    consultantId: string,
    receivableId: string,
    paid: boolean,
  ) => Promise<Receivable>;
};

export type SalesServiceDeps = {
  repository: SalesRepositoryPort;
};

export type SalesService = ReturnType<typeof createSalesService>;

export const createSalesService = ({ repository }: SalesServiceDeps) => {
  // Composição da venda (regra de negócio pura, sem HTTP): valida os itens
  // contra o catálogo da consultora, resolve snapshot/preço, calcula o total NO
  // SERVIDOR (o cliente nunca dita o valor — inv. 3) e, para `credit`, gera os
  // recebíveis (Σ exata via splitInstallmentAmounts, vencimentos mensais via
  // addMonthsClamped). A persistência atômica (baixa de estoque, inserts,
  // snapshot de clientName) é do repository.
  const create = async (
    consultantId: string,
    input: CreateSale,
  ): Promise<Sale> => {
    const uniqueIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await repository.findProductsByIds(
      consultantId,
      uniqueIds,
    );
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    const items: SaleItemData[] = input.items.map((item) => {
      const product = productById.get(item.productId);
      if (product === undefined) {
        // Produto inexistente OU de outra consultora ⇒ 422 idêntico (o findByIds
        // é escopado, então ambos os casos caem aqui sem vazar existência).
        throw new InvalidSaleItemError(item.productId);
      }
      // Default do preço unitário = preço atual do produto; override respeitado.
      const unitPriceCents = item.unitPriceCents ?? product.priceCents;
      return {
        productId: item.productId,
        productName: product.name,
        qty: item.qty,
        unitPriceCents,
        // Custo NUNCA é override pelo cliente — sempre o snapshot do custo atual
        // do produto (RF-02: mesma transação; nenhum outro comportamento muda).
        costCents: product.costCents,
      };
    });

    const totalCents = items.reduce(
      (sum, item) => sum + item.qty * item.unitPriceCents,
      0,
    );

    const receivablesData: ReceivableData[] = [];
    if (input.paymentMethod === CREDIT_PAYMENT_METHOD) {
      const firstDueDate = input.firstDueDate;
      if (firstDueDate === undefined) {
        throw new InvalidSaleCreditError(CREDIT_FIRST_DUE_REQUIRED_MESSAGE);
      }
      // total >= installments evita parcela de 0 centavos (viola o CHECK). O
      // total é do servidor, então a validação é do service (RF-02).
      if (totalCents < input.installments) {
        throw new InvalidSaleCreditError(CREDIT_TOTAL_TOO_LOW_MESSAGE);
      }
      const amounts = splitInstallmentAmounts(totalCents, input.installments);
      amounts.forEach((amountCents, index) => {
        receivablesData.push({
          amountCents,
          dueDate: addMonthsClamped(firstDueDate, index),
        });
      });
    }

    return repository.createSale(
      consultantId,
      {
        clientId: input.clientId ?? null,
        paymentMethod: input.paymentMethod,
        totalCents,
      },
      items,
      receivablesData,
    );
  };

  const list = async (
    consultantId: string,
    query: SalesListQuery,
  ): Promise<Paginated<SaleListItem>> => {
    const { rows, total } = await repository.list(consultantId, {
      page: query.page,
      perPage: query.perPage,
      status: query.status,
      clientId: query.clientId,
    });

    return {
      data: rows,
      page: query.page,
      perPage: query.perPage,
      total,
    };
  };

  const getById = async (consultantId: string, id: string): Promise<Sale> => {
    const sale = await repository.getById(consultantId, id);
    if (!sale) {
      throw new SaleNotFoundError();
    }
    return sale;
  };

  // Cancelamento (RF-05): a guarda de estado (só `completed`, sem parcela paga)
  // e a serialização contra o pagamento vivem na transação do repository, que
  // lança SaleNotFoundError/SaleStateError. O service apenas repassa o escopo.
  const cancel = (consultantId: string, saleId: string): Promise<Sale> =>
    repository.cancel(consultantId, saleId);

  const listReceivables = async (
    consultantId: string,
    query: ReceivablesListQuery,
  ): Promise<Paginated<ReceivableWithSale>> => {
    const { rows, total } = await repository.listReceivables(consultantId, {
      page: query.page,
      perPage: query.perPage,
      pending: query.pending,
    });

    return {
      data: rows,
      page: query.page,
      perPage: query.perPage,
      total,
    };
  };

  const receivablesSummary = (
    consultantId: string,
  ): Promise<ReceivablesSummary> => repository.receivablesSummary(consultantId);

  // Baixa/estorno de parcela (RF-06): a serialização contra o cancelamento
  // (SELECT ... FOR UPDATE na venda) e as guardas de estado vivem na transação
  // do repository (ReceivableNotFoundError/SaleStateError). O service repassa.
  const setReceivablePaid = (
    consultantId: string,
    receivableId: string,
    paid: boolean,
  ): Promise<Receivable> =>
    repository.setReceivablePaid(consultantId, receivableId, paid);

  return {
    create,
    list,
    getById,
    cancel,
    listReceivables,
    receivablesSummary,
    setReceivablePaid,
  };
};
