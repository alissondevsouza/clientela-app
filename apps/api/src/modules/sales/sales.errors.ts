// Erros de domínio do módulo de vendas/recebíveis (core.md/api.md): classes
// nomeadas lançadas na camada de negócio (service) e na guarda transacional
// (repository), mapeadas para HTTP no error-handler central (Task 2.2).
// Mensagens pt-BR já genéricas na origem — nunca vazam internals/PII (o nome do
// produto não é dado pessoal). Mapeamento previsto:
//   SaleNotFoundError / ReceivableNotFoundError            → 404
//   InsufficientStockError / SaleStateError                → 409
//   InvalidSaleItemError / InvalidSaleCreditError /
//   InvalidSaleClientError / InvalidSaleDateError          → 422

// Venda inexistente ou id que não casa nenhuma linha no escopo da consultora →
// 404. O mesmo 404 cobre "não existe" e "não é sua" (não vaza existência).
const SALE_NOT_FOUND_MESSAGE = "Venda não encontrada.";

// Parcela inexistente ou de venda de outra consultora → 404 (mesma política).
const RECEIVABLE_NOT_FOUND_MESSAGE = "Parcela não encontrada.";

export class SaleNotFoundError extends Error {
  constructor() {
    super(SALE_NOT_FOUND_MESSAGE);
    this.name = "SaleNotFoundError";
  }
}

export class ReceivableNotFoundError extends Error {
  constructor() {
    super(RECEIVABLE_NOT_FOUND_MESSAGE);
    this.name = "ReceivableNotFoundError";
  }
}

// Baixa de estoque impossível: restam menos unidades do que a venda pede. A
// guarda real é o UPDATE condicional na transação (nunca-negativo sob
// concorrência); esta mensagem informa o restante atual e o nome do produto
// (snapshot) para a consultora agir. Nome de produto não é dado pessoal.
export class InsufficientStockError extends Error {
  constructor(productName: string, remaining: number) {
    super(
      `Estoque insuficiente: restam ${remaining} unidades de ${productName}.`,
    );
    this.name = "InsufficientStockError";
  }
}

// Conflito de estado (409): cancelar venda já cancelada, cancelar venda com
// parcela paga, pagar/estornar parcela de venda cancelada, pagar parcela já
// paga, estornar parcela pendente. Mensagem variável conforme o caso — sempre
// pt-BR e acionável.
export class SaleStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleStateError";
  }
}

// Item inválido na criação da venda (422): produto inexistente OU de outra
// consultora. Mensagem IDÊNTICA nos dois casos (não vaza existência — RF-03);
// aponta o item pelo id que o próprio cliente enviou (não é vazamento).
export class InvalidSaleItemError extends Error {
  constructor(productId: string) {
    super(`Produto ${productId} inválido para esta venda.`);
    this.name = "InvalidSaleItemError";
  }
}

// Regra de venda a prazo violada (422): total menor que o número de parcelas
// (geraria parcela de 0 centavos, que viola o CHECK) ou vencimento ausente.
// Mensagem variável.
export class InvalidSaleCreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSaleCreditError";
  }
}

// Cliente inválida na criação da venda (422): clientId informado que não existe
// no escopo da consultora. Impede vincular a venda a cliente de outra
// consultora (cross-tenant) — validado na transação, antes de persistir.
const INVALID_SALE_CLIENT_MESSAGE = "Cliente inválida para esta venda.";

export class InvalidSaleClientError extends Error {
  constructor() {
    super(INVALID_SALE_CLIENT_MESSAGE);
    this.name = "InvalidSaleClientError";
  }
}

// Data da venda no futuro (422): guarda AUTORITATIVA (RF-02), comparada com o
// dia local de `transactionNow` (relógio do Postgres) dentro do service — o
// Zod só dá feedback de UI e o CHECK do banco não pode chamar `now()`. O
// relógio do cliente é forjável; este é o ponto que realmente barra.
const INVALID_SALE_DATE_MESSAGE = "A data da venda não pode ser no futuro.";

export class InvalidSaleDateError extends Error {
  constructor() {
    super(INVALID_SALE_DATE_MESSAGE);
    this.name = "InvalidSaleDateError";
  }
}
