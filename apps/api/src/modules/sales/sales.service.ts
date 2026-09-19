import type {
  CardType,
  CreateSale,
  DeliveryStatus,
  DueKind,
  Paginated,
  PaymentCondition,
  PaymentMethod,
  PaymentStatus,
  Receivable,
  ReceivablesListQuery,
  ReceivablesSummary,
  Sale,
  SaleListItem,
  SaleStatus,
  SalesListQuery,
} from "@clientela/shared";
import {
  addMonthsClamped,
  appLocalDateIso,
  appLocalDateTimeToUtc,
  splitInstallmentAmounts,
  validateSaleTotalCents,
} from "@clientela/shared";
import {
  InvalidSaleCreditError,
  InvalidSaleDateError,
  InvalidSaleItemError,
  SaleNotFoundError,
} from "./sales.errors";

const RECEIVED_PAYMENT_CONDITION: PaymentCondition = "received";
const ON_DELIVERY_PAYMENT_CONDITION: PaymentCondition = "on_delivery";
const COMPLETED_SALE_STATUS: SaleStatus = "completed";
const OPEN_SALE_STATUS: SaleStatus = "open";
const CREDIT_FIRST_DUE_REQUIRED_MESSAGE =
  "Informe o primeiro vencimento para pagamento parcelado.";
// Meio-dia local (nunca meia-noite): meia-noite local pode ser ambígua
// (repetida) ou inexistente (pulada) numa virada de horário de verão —
// `packages/shared/src/time.ts` alerta. Datas brasileiras anteriores a 2019
// têm DST.
const RETROACTIVE_SALE_TIME_HM = "12:00";

// ---------------------------------------------------------------------------
// Portas e tipos de dados entre service e repository. O service não conhece
// Drizzle nem o schema (api.md): compõe os dados de negócio e delega a
// persistência atômica. Snapshots (productName/unitPriceCents) e clientName são
// gravados no momento da venda — histórico imutável (inv. 5 do domínio).
// ---------------------------------------------------------------------------

// Snapshot mínimo do produto que o composer precisa para materializar a venda:
// nome/preço/custo atuais. A Task 2.2 os obtém já travados dentro da transação;
// o composer não tem acesso ao repositório nem pode relê-los.
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

export type ComposedSaleData = {
  clientId: string | null;
  paymentMethod: PaymentMethod;
  paymentCondition: PaymentCondition;
  cardType: CardType | null;
  installments: number;
  paymentPlanKnown: true;
  totalCents: number;
  status: SaleStatus;
  soldAt: Date;
  deliveredAt: Date | null;
  completedAt: Date | null;
  canceledAt: null;
  createdAt: Date;
  updatedAt: Date;
};

export type ComposedReceivableData = {
  amountCents: number;
  dueDate: string | null;
  dueKind: DueKind;
  paidAt: Date | null;
  voidedAt: null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentProjection = {
  paymentStatus: PaymentStatus;
  paidCents: number;
  outstandingCents: number;
};

export type ComposedSale = {
  sale: ComposedSaleData;
  items: SaleItemData[];
  receivables: ComposedReceivableData[];
  deliveryStatus: DeliveryStatus;
  paymentStatus: PaymentStatus;
  paidCents: number;
  outstandingCents: number;
};

export type ReceivableStateSnapshot = {
  amountCents: number;
  paidAt: Date | null;
  voidedAt: Date | null;
};

export const deriveReceivableStatus = (
  receivable: Pick<ReceivableStateSnapshot, "paidAt" | "voidedAt">,
): "pending" | "paid" | "voided" => {
  if (receivable.voidedAt !== null) {
    return "voided";
  }
  return receivable.paidAt === null ? "pending" : "paid";
};

// Regra ÚNICA do estado financeiro de uma venda (RF-09), a partir do total e do
// que já foi efetivamente recebido. Venda cancelada não tem crédito nem dívida
// cobrável: as cobranças pendentes viram anuladas e as pagas barram o
// cancelamento. Usada tanto pelo composer quanto pelas leituras (detalhe soma
// as linhas; listagem soma em SQL) — a projeção nunca diverge entre as duas.
export const derivePaymentSummary = (
  totalCents: number,
  saleStatus: SaleStatus,
  paidCents: number,
): PaymentProjection => {
  if (saleStatus === "canceled") {
    return { paymentStatus: "voided", paidCents: 0, outstandingCents: 0 };
  }

  const outstandingCents = Math.max(totalCents - paidCents, 0);

  if (outstandingCents === 0) {
    return { paymentStatus: "paid", paidCents, outstandingCents };
  }
  if (paidCents === 0) {
    return { paymentStatus: "pending", paidCents, outstandingCents };
  }
  return { paymentStatus: "partial", paidCents, outstandingCents };
};

export const derivePaymentProjection = (
  totalCents: number,
  saleStatus: SaleStatus,
  receivables: readonly ReceivableStateSnapshot[],
): PaymentProjection =>
  derivePaymentSummary(
    totalCents,
    saleStatus,
    receivables.reduce(
      (sum, receivable) =>
        deriveReceivableStatus(receivable) === "paid"
          ? sum + receivable.amountCents
          : sum,
      0,
    ),
  );

const deriveInitialSaleStatus = (
  deliveryStatus: DeliveryStatus,
  paymentStatus: PaymentStatus,
): SaleStatus =>
  deliveryStatus === "delivered" && paymentStatus === "paid"
    ? COMPLETED_SALE_STATUS
    : OPEN_SALE_STATUS;

const createReceivable = (
  amountCents: number,
  dueDate: string | null,
  dueKind: DueKind,
  paidAt: Date | null,
  transactionNow: Date,
): ComposedReceivableData => ({
  amountCents,
  dueDate,
  dueKind,
  paidAt,
  voidedAt: null,
  createdAt: transactionNow,
  updatedAt: transactionNow,
});

// Deriva o instante DE NEGÓCIO da venda (RF-03) a partir do dia local
// escolhido (`soldOn`) e do instante canônico da transação — nunca lê o
// relógio, recebe `transactionNow` já resolvido. `soldOn` ausente OU igual ao
// dia local de hoje ⇒ `transactionNow` intacto, byte a byte (o caminho quente,
// 99% das vendas, fica idêntico ao comportamento atual — plan.md). Passado ⇒
// meio-dia local do dia escolhido. Futuro ⇒ `InvalidSaleDateError`: esta é a
// guarda AUTORITATIVA (RF-02) — o Zod só dá feedback de UI e o CHECK do banco
// não pode chamar `now()` (garante só `sold_at <= updated_at`).
const deriveSaleInstant = (
  soldOn: string | undefined,
  transactionNow: Date,
): Date => {
  const todayLocal = appLocalDateIso(transactionNow.toISOString());
  if (soldOn === undefined || soldOn === todayLocal) {
    return transactionNow;
  }
  if (soldOn > todayLocal) {
    throw new InvalidSaleDateError();
  }
  return new Date(appLocalDateTimeToUtc(soldOn, RETROACTIVE_SALE_TIME_HM));
};

// Recebe exclusivamente o input já validado, snapshots de produtos já travados
// e o instante canônico do Postgres. Não toca em persistência nem no relógio:
// a Task 2.2 fornece esses insumos e grava este resultado sem recalcular nada.
export const composeSaleCreation = (
  input: CreateSale,
  lockedProducts: readonly SaleProductSnapshot[],
  transactionNow: Date,
): ComposedSale => {
  const productById = new Map(
    lockedProducts.map((product) => [product.id, product]),
  );
  const items = input.items.map((item) => {
    const product = productById.get(item.productId);
    if (product === undefined) {
      throw new InvalidSaleItemError(item.productId);
    }
    return {
      productId: product.id,
      productName: product.name,
      qty: item.qty,
      unitPriceCents: item.unitPriceCents ?? product.priceCents,
      costCents: product.costCents,
    };
  });
  const totalCents = items.reduce(
    (sum, item) => sum + item.qty * item.unitPriceCents,
    0,
  );
  const totalValidation = validateSaleTotalCents(
    totalCents,
    input.installments,
  );
  if (!totalValidation.success) {
    const issue = totalValidation.error.issues[0];
    throw new InvalidSaleCreditError(
      issue?.message ?? "Plano de pagamento inválido.",
    );
  }

  // Instante DE NEGÓCIO da venda (RF-03): hoje ⇒ `transactionNow` intacto;
  // passado ⇒ meio-dia local; futuro ⇒ InvalidSaleDateError. `createdAt`/
  // `updatedAt` da venda e das cobranças continuam no relógio real — só o que
  // é evento de negócio (soldAt/deliveredAt/completedAt, due_date/paid_at das
  // cobranças) acompanha a data escolhida.
  const saleInstant = deriveSaleInstant(input.soldOn, transactionNow);
  const localSaleDate = appLocalDateIso(saleInstant.toISOString());
  const receivables: ComposedReceivableData[] = [];
  if (totalCents > 0) {
    if (input.paymentCondition === RECEIVED_PAYMENT_CONDITION) {
      receivables.push(
        createReceivable(
          totalCents,
          localSaleDate,
          "scheduled",
          saleInstant,
          transactionNow,
        ),
      );
    } else if (input.paymentCondition === ON_DELIVERY_PAYMENT_CONDITION) {
      const delivered = input.deliveryStatus === "delivered";
      receivables.push(
        createReceivable(
          totalCents,
          delivered ? localSaleDate : null,
          delivered ? "scheduled" : "on_delivery",
          null,
          transactionNow,
        ),
      );
    } else {
      const firstDueDate = input.firstDueDate;
      if (firstDueDate === undefined) {
        throw new InvalidSaleCreditError(CREDIT_FIRST_DUE_REQUIRED_MESSAGE);
      }
      splitInstallmentAmounts(totalCents, input.installments).forEach(
        (amountCents, index) => {
          receivables.push(
            createReceivable(
              amountCents,
              addMonthsClamped(firstDueDate, index),
              "scheduled",
              null,
              transactionNow,
            ),
          );
        },
      );
    }
  }

  const initialPayment = derivePaymentProjection(
    totalCents,
    OPEN_SALE_STATUS,
    receivables,
  );
  const status = deriveInitialSaleStatus(
    input.deliveryStatus,
    initialPayment.paymentStatus,
  );
  const projection = derivePaymentProjection(totalCents, status, receivables);
  const deliveredAt = input.deliveryStatus === "delivered" ? saleInstant : null;
  const completedAt = status === COMPLETED_SALE_STATUS ? saleInstant : null;

  return {
    sale: {
      clientId: input.clientId ?? null,
      paymentMethod: input.paymentMethod,
      paymentCondition: input.paymentCondition,
      cardType: input.cardType ?? null,
      installments: input.installments,
      paymentPlanKnown: true,
      totalCents,
      status,
      soldAt: saleInstant,
      deliveredAt,
      completedAt,
      canceledAt: null,
      createdAt: transactionNow,
      updatedAt: transactionNow,
    },
    items,
    receivables,
    deliveryStatus: input.deliveryStatus,
    ...projection,
  };
};

// Pedido de criação de venda: o service não lê o catálogo nem o relógio. Diz
// QUAIS produtos precisam ser travados e entrega a função que compõe a venda a
// partir das linhas já travadas e do instante canônico da transação (RF-04).
// Assim a regra de negócio continua no service e o lock/atomicidade no
// repository, sem janela entre ler o produto e inserir o item.
export type SaleCreationRequest = {
  productIds: string[];
  compose: (
    lockedProducts: readonly SaleProductSnapshot[],
    transactionNow: Date,
  ) => ComposedSale;
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
  createSale: (
    consultantId: string,
    request: SaleCreationRequest,
  ) => Promise<Sale>;
  list: (
    consultantId: string,
    params: ListSalesParams,
  ) => Promise<{ rows: SaleListItem[]; total: number }>;
  getById: (consultantId: string, id: string) => Promise<Sale | undefined>;
  cancel: (consultantId: string, saleId: string) => Promise<Sale>;
  remove: (consultantId: string, saleId: string) => Promise<void>;
  deliver?: (consultantId: string, saleId: string) => Promise<Sale>;
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
  const create = (consultantId: string, input: CreateSale): Promise<Sale> =>
    repository.createSale(consultantId, {
      productIds: [...new Set(input.items.map((item) => item.productId))],
      compose: (lockedProducts, transactionNow) =>
        composeSaleCreation(input, lockedProducts, transactionNow),
    });

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

  // Exclusão (RF-08 a RF-13): a decisão de estoque (três casos, um só devolve)
  // é invariante TRANSACIONAL e vive no repository — o mesmo padrão do cancel.
  // O service não adiciona regra nenhuma, só repassa o escopo.
  const remove = (consultantId: string, saleId: string): Promise<void> =>
    repository.remove(consultantId, saleId);

  const deliver = (consultantId: string, saleId: string): Promise<Sale> => {
    if (!repository.deliver) {
      throw new SaleNotFoundError();
    }
    return repository.deliver(consultantId, saleId);
  };

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
    remove,
    deliver,
    listReceivables,
    receivablesSummary,
    setReceivablePaid,
  };
};
