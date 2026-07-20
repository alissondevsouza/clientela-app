// Erro de domínio do módulo de produtos (core.md/api.md): classe nomeada
// lançada na camada de negócio e mapeada para 404 no error-handler central.
// Mensagem pt-BR única; o mesmo 404 cobre "não existe" e "não é seu" (não vaza
// existência de produto de outra consultora — RF-03/RF-05).
const PRODUCT_NOT_FOUND_MESSAGE = "Produto não encontrado.";

export class ProductNotFoundError extends Error {
  constructor() {
    super(PRODUCT_NOT_FOUND_MESSAGE);
    this.name = "ProductNotFoundError";
  }
}
