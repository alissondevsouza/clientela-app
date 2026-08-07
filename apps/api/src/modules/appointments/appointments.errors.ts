// Erros de domínio do módulo de agenda (core.md/api.md): classes nomeadas
// lançadas na camada de negócio (service) e na guarda transacional
// (repository), mapeadas para HTTP no error-handler central (Task 3.5).
// Mensagens pt-BR já genéricas na origem — nunca vazam internals/PII.
// Mapeamento previsto:
//   AppointmentNotFoundError                                → 404
//   AppointmentStateError                                   → 409
//   InvalidAppointmentPersonError                            → 422
//   InvalidAppointmentSaleError                               → 422

// Compromisso inexistente ou id que não casa nenhuma linha no escopo da
// consultora → 404. O mesmo 404 cobre "não existe" e "não é seu" (RF-06, não
// vaza existência).
const APPOINTMENT_NOT_FOUND_MESSAGE = "Compromisso não encontrado.";

export class AppointmentNotFoundError extends Error {
  constructor() {
    super(APPOINTMENT_NOT_FOUND_MESSAGE);
    this.name = "AppointmentNotFoundError";
  }
}

// Conflito de estado (409): transição a partir de status terminal (RF-08),
// edição fora de `scheduled` com campo além de `notes` (RF-07), ou vínculo de
// venda fora de `scheduled`/`done` (RF-10). Mensagem variável conforme o
// caso — sempre pt-BR e acionável.
export class AppointmentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentStateError";
  }
}

// Vínculo de pessoa inválido (422, RF-03): clientId/leadId inexistente OU (no
// caso de cliente) de outra consultora. Mensagem ÚNICA para os dois casos —
// não vaza existência nem posse. Validado ANTES de persistir (create/update),
// para que uma FK violada nunca vire 500.
const INVALID_APPOINTMENT_PERSON_MESSAGE =
  "Cliente ou lead inválido para este compromisso.";

export class InvalidAppointmentPersonError extends Error {
  constructor() {
    super(INVALID_APPOINTMENT_PERSON_MESSAGE);
    this.name = "InvalidAppointmentPersonError";
  }
}

// Vínculo de venda inválido (422, RF-10): venda inexistente, de outra
// consultora, não `completed`, ou de cliente incompatível com o compromisso.
// Mensagem ÚNICA para todos os casos (não vaza existência). Validado dentro
// da mesma transação da escrita (done/linkSale/update), antes de gravar a FK.
const INVALID_APPOINTMENT_SALE_MESSAGE =
  "Venda inválida para este compromisso.";

export class InvalidAppointmentSaleError extends Error {
  constructor() {
    super(INVALID_APPOINTMENT_SALE_MESSAGE);
    this.name = "InvalidAppointmentSaleError";
  }
}
