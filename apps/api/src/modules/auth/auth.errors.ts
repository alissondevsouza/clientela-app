// Erros de domínio da autenticação (core.md/api.md): classes nomeadas lançadas
// na camada de negócio e mapeadas para HTTP no error-handler central. Mensagens
// pt-BR genéricas — nunca revelam se o e-mail existe, nem expõem token/hash.

// Login com e-mail inexistente OU senha incorreta: mensagem idêntica nos dois
// casos (anti-enumeração — security.md/RF-03).
const INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha incorretos.";

export class InvalidCredentialsError extends Error {
  constructor() {
    super(INVALID_CREDENTIALS_MESSAGE);
    this.name = "InvalidCredentialsError";
  }
}

// Sessão ausente, desconhecida ou expirada ao validar o token (RF-04/RF-06).
const UNAUTHORIZED_MESSAGE = "Sessão inválida ou expirada.";

export class UnauthorizedError extends Error {
  constructor() {
    super(UNAUTHORIZED_MESSAGE);
    this.name = "UnauthorizedError";
  }
}
