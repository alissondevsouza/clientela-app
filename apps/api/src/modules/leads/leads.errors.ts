// Erros de domínio do funil de leads (core.md/api.md): classes nomeadas lançadas
// na camada de negócio (service) e também na guarda de corrida da transação
// (repository), mapeadas para HTTP no error-handler central. Mensagens pt-BR.

// Lead inexistente ou id que não casa nenhuma linha → 404.
const LEAD_NOT_FOUND_MESSAGE = "Lead não encontrado.";

// Transição bloqueada: lead já convertido é terminal (PATCH de status) e a
// conversão não pode repetir (invariante Lead 1—0..1 Client) → 409.
const LEAD_ALREADY_CONVERTED_MESSAGE = "Lead já convertido em cliente.";

export class LeadNotFoundError extends Error {
  constructor() {
    super(LEAD_NOT_FOUND_MESSAGE);
    this.name = "LeadNotFoundError";
  }
}

export class LeadAlreadyConvertedError extends Error {
  constructor() {
    super(LEAD_ALREADY_CONVERTED_MESSAGE);
    this.name = "LeadAlreadyConvertedError";
  }
}
