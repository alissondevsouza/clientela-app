// Erros de domínio do módulo de pedidos de reposição (core.md/api.md): classes
// nomeadas lançadas na camada de negócio (service) e na guarda transacional
// (repository), mapeadas para HTTP no error-handler central (Task 3.3).
// Mensagens pt-BR já genéricas na origem — nunca vazam internals/PII (o nome do
// produto não é dado pessoal). Mapeamento previsto:
//   OrderNotFoundError                                      → 404
//   OrderStateError                                         → 409
//   InvalidOrderItemError                                   → 422
//   InvalidOrderClientError                                 → 422

// Pedido inexistente ou id que não casa nenhuma linha no escopo da consultora →
// 404. O mesmo 404 cobre "não existe" e "não é seu" (não vaza existência).
const ORDER_NOT_FOUND_MESSAGE = "Pedido não encontrado.";

export class OrderNotFoundError extends Error {
  constructor() {
    super(ORDER_NOT_FOUND_MESSAGE);
    this.name = "OrderNotFoundError";
  }
}

// Conflito de estado (409): transição fora da matriz do vocabulário (RF-03) ou
// edição de itens fora de `draft` (RF-02). Mensagem variável conforme o caso —
// sempre pt-BR e acionável.
export class OrderStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderStateError";
  }
}

// Item inválido na criação/substituição de itens (422): produto inexistente OU
// de outra consultora. Mensagem IDÊNTICA nos dois casos (não vaza existência);
// aponta o item pelo id que o próprio cliente enviou (não é vazamento).
export class InvalidOrderItemError extends Error {
  constructor(productId: string) {
    super(`Produto ${productId} inválido para este pedido.`);
    this.name = "InvalidOrderItemError";
  }
}

// Cliente inválida no vínculo de encomenda de um item (422, RF-02): clientId
// inexistente OU de outra consultora. Mensagem ÚNICA nos dois casos (não vaza
// existência — mesmo padrão de InvalidSaleClientError em sales); validada
// ANTES de persistir, na composição do service.
const INVALID_ORDER_CLIENT_MESSAGE = "Cliente inválida para este pedido.";

export class InvalidOrderClientError extends Error {
  constructor() {
    super(INVALID_ORDER_CLIENT_MESSAGE);
    this.name = "InvalidOrderClientError";
  }
}
