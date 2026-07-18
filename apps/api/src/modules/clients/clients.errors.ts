// Erro de domínio do módulo de clientes (core.md/api.md): classe nomeada lançada
// na camada de negócio e mapeada para 404 no error-handler central. Mensagem
// pt-BR única; o mesmo 404 cobre "não existe" e "não é sua" (não vaza existência
// de cliente de outra consultora — RF-04/RF-05).
const CLIENT_NOT_FOUND_MESSAGE = "Cliente não encontrada.";

export class ClientNotFoundError extends Error {
  constructor() {
    super(CLIENT_NOT_FOUND_MESSAGE);
    this.name = "ClientNotFoundError";
  }
}
