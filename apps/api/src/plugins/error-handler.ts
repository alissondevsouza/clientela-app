import type { ApiError } from "@clientela/shared";
import { Elysia } from "elysia";
import {
  AppointmentNotFoundError,
  AppointmentStateError,
  InvalidAppointmentPersonError,
  InvalidAppointmentSaleError,
} from "../modules/appointments/appointments.errors";
import {
  InvalidCredentialsError,
  UnauthorizedError,
} from "../modules/auth/auth.errors";
import { ClientNotFoundError } from "../modules/clients/clients.errors";
import {
  LeadAlreadyConvertedError,
  LeadNotFoundError,
} from "../modules/leads/leads.errors";
import {
  InvalidOrderClientError,
  InvalidOrderItemError,
  OrderNotFoundError,
  OrderStateError,
} from "../modules/orders/orders.errors";
import { ProductNotFoundError } from "../modules/products/products.errors";
import {
  InsufficientStockError,
  InvalidSaleClientError,
  InvalidSaleCreditError,
  InvalidSaleItemError,
  ReceivableNotFoundError,
  SaleNotFoundError,
  SaleStateError,
} from "../modules/sales/sales.errors";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;

const ERROR_CODE = {
  validation: "VALIDATION_ERROR",
  invalidBody: "INVALID_BODY",
  invalidCredentials: "INVALID_CREDENTIALS",
  unauthorized: "UNAUTHORIZED",
  clientNotFound: "CLIENT_NOT_FOUND",
  productNotFound: "PRODUCT_NOT_FOUND",
  leadNotFound: "LEAD_NOT_FOUND",
  leadAlreadyConverted: "LEAD_ALREADY_CONVERTED",
  saleNotFound: "SALE_NOT_FOUND",
  receivableNotFound: "RECEIVABLE_NOT_FOUND",
  insufficientStock: "INSUFFICIENT_STOCK",
  saleStateConflict: "SALE_STATE_CONFLICT",
  invalidSaleItem: "INVALID_SALE_ITEM",
  invalidSaleCredit: "INVALID_SALE_CREDIT",
  invalidSaleClient: "INVALID_SALE_CLIENT",
  orderNotFound: "ORDER_NOT_FOUND",
  orderState: "ORDER_STATE",
  invalidOrderItem: "INVALID_ORDER_ITEM",
  invalidOrderClient: "INVALID_ORDER_CLIENT",
  appointmentNotFound: "APPOINTMENT_NOT_FOUND",
  appointmentState: "APPOINTMENT_STATE",
  invalidAppointmentPerson: "INVALID_APPOINTMENT_PERSON",
  invalidAppointmentSale: "INVALID_APPOINTMENT_SALE",
  notFound: "NOT_FOUND",
  internal: "INTERNAL_ERROR",
} as const;

const GENERIC_VALIDATION_MESSAGE = "Dados inválidos na requisição.";
const INVALID_BODY_MESSAGE = "Corpo da requisição inválido.";
const NOT_FOUND_MESSAGE = "Recurso não encontrado.";
// Mensagem genérica ao cliente: detalhe do erro fica apenas no log do servidor.
const GENERIC_INTERNAL_MESSAGE =
  "Ocorreu um erro inesperado. Tente novamente em instantes.";

const buildError = (code: string, message: string): ApiError => ({
  error: { code, message },
});

// Extrai a primeira issue do validador (Zod via Standard Schema expõe a
// mensagem pt-BR do schema em `summary`/`message`).
const firstValidationMessage = (issues: { summary?: string }[]): string => {
  const [first] = issues;
  return first?.summary ?? GENERIC_VALIDATION_MESSAGE;
};

// Error handler central (api.md): mapeamento único de erros de framework e de
// domínio para o envelope `{ error: { code, message } }`. `as: "global"` faz o
// hook valer para toda a árvore do app, sem try/catch por rota.
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  { as: "global" },
  ({ code, error, path, set }) => {
    if (code === "VALIDATION") {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(
        ERROR_CODE.validation,
        firstValidationMessage(error.all),
      );
    }

    // JSON malformado no body (code `PARSE` do Elysia) é erro do cliente, não do
    // servidor: 400 com envelope pt-BR, sem cair no catch-all/log de "erro
    // inesperado" (evita ruído de alerta com bots enviando body quebrado).
    if (code === "PARSE") {
      set.status = HTTP_BAD_REQUEST;
      return buildError(ERROR_CODE.invalidBody, INVALID_BODY_MESSAGE);
    }

    if (code === "NOT_FOUND") {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.notFound, NOT_FOUND_MESSAGE);
    }

    // Erros de domínio da autenticação (core.md/api.md): a classe é lançada no
    // service e mapeada para 401 aqui. A mensagem pt-BR já é genérica na origem
    // (não revela e-mail inexistente vs. senha errada, nem internals de sessão).
    if (error instanceof InvalidCredentialsError) {
      set.status = HTTP_UNAUTHORIZED;
      return buildError(ERROR_CODE.invalidCredentials, error.message);
    }

    if (error instanceof UnauthorizedError) {
      set.status = HTTP_UNAUTHORIZED;
      return buildError(ERROR_CODE.unauthorized, error.message);
    }

    // Erro de domínio do módulo clients (core.md/api.md): lançado no service (ou
    // na rota para id malformado) e mapeado para 404 aqui. A mensagem pt-BR já é
    // genérica na origem — o mesmo 404 cobre "não existe" e "não é sua" (RF-05).
    if (error instanceof ClientNotFoundError) {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.clientNotFound, error.message);
    }

    // Erro de domínio do módulo products (core.md/api.md): lançado no service (ou
    // na rota para id malformado) e mapeado para 404 aqui. Mensagem pt-BR já
    // genérica na origem — o mesmo 404 cobre "não existe" e "não é seu" (RF-05).
    if (error instanceof ProductNotFoundError) {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.productNotFound, error.message);
    }

    // Erros de domínio do funil de leads (core.md/api.md): lançados no service
    // (ou na rota para id malformado) e mapeados aqui. `LeadNotFoundError` cobre
    // inexistente e id inválido (404); `LeadAlreadyConvertedError` é a única
    // transição bloqueada alcançável (409) — PATCH em lead convertido e convert
    // repetido. Mensagens pt-BR já genéricas na origem.
    if (error instanceof LeadNotFoundError) {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.leadNotFound, error.message);
    }

    if (error instanceof LeadAlreadyConvertedError) {
      set.status = HTTP_CONFLICT;
      return buildError(ERROR_CODE.leadAlreadyConverted, error.message);
    }

    // Erros de domínio do módulo sales/recebíveis (core.md/api.md): lançados no
    // service (ou na rota para id malformado) e na guarda transacional do
    // repository. NotFound cobre inexistente e cross-tenant (404); estoque
    // insuficiente e conflitos de estado (cancelar cancelada, pagar pago, etc.)
    // são 409; itens/crédito/cliente inválidos na criação são 422. Mensagens
    // pt-BR já genéricas na origem — nome de produto não é dado pessoal.
    if (error instanceof SaleNotFoundError) {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.saleNotFound, error.message);
    }

    if (error instanceof ReceivableNotFoundError) {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.receivableNotFound, error.message);
    }

    if (error instanceof InsufficientStockError) {
      set.status = HTTP_CONFLICT;
      return buildError(ERROR_CODE.insufficientStock, error.message);
    }

    if (error instanceof SaleStateError) {
      set.status = HTTP_CONFLICT;
      return buildError(ERROR_CODE.saleStateConflict, error.message);
    }

    if (error instanceof InvalidSaleItemError) {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(ERROR_CODE.invalidSaleItem, error.message);
    }

    if (error instanceof InvalidSaleCreditError) {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(ERROR_CODE.invalidSaleCredit, error.message);
    }

    if (error instanceof InvalidSaleClientError) {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(ERROR_CODE.invalidSaleClient, error.message);
    }

    // Erros de domínio do módulo orders (core.md/api.md): lançados no service
    // (item inválido) ou na guarda transacional do repository (transição/edição
    // fora do estado permitido). NotFound cobre inexistente e cross-tenant
    // (404); conflitos de estado (transição inválida, editar itens fora de
    // draft, pedido sem itens no place) são 409; produto inválido no item é
    // 422. Mensagens pt-BR já genéricas na origem.
    if (error instanceof OrderNotFoundError) {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.orderNotFound, error.message);
    }

    if (error instanceof OrderStateError) {
      set.status = HTTP_CONFLICT;
      return buildError(ERROR_CODE.orderState, error.message);
    }

    if (error instanceof InvalidOrderItemError) {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(ERROR_CODE.invalidOrderItem, error.message);
    }

    // Cliente inválida no vínculo de encomenda de um item (RF-02): clientId
    // inexistente ou de outra consultora, validado no service ANTES de
    // persistir (simétrico a InvalidOrderItemError).
    if (error instanceof InvalidOrderClientError) {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(ERROR_CODE.invalidOrderClient, error.message);
    }

    // Erros de domínio do módulo appointments (core.md/api.md): lançados no
    // service (validação de pessoa, RF-03) ou na guarda transacional do
    // repository (transições, edição em status terminal, vínculo de venda).
    // NotFound cobre inexistente, cross-tenant e id malformado (404);
    // conflitos de estado (transição fora de `scheduled`, edição além de
    // `notes` em status terminal, vínculo fora de `scheduled`/`done`) são
    // 409; pessoa/venda inválida são 422. Mensagens pt-BR já genéricas na
    // origem (não vazam existência).
    if (error instanceof AppointmentNotFoundError) {
      set.status = HTTP_NOT_FOUND;
      return buildError(ERROR_CODE.appointmentNotFound, error.message);
    }

    if (error instanceof AppointmentStateError) {
      set.status = HTTP_CONFLICT;
      return buildError(ERROR_CODE.appointmentState, error.message);
    }

    if (error instanceof InvalidAppointmentPersonError) {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(ERROR_CODE.invalidAppointmentPerson, error.message);
    }

    if (error instanceof InvalidAppointmentSaleError) {
      set.status = HTTP_UNPROCESSABLE_ENTITY;
      return buildError(ERROR_CODE.invalidAppointmentSale, error.message);
    }

    set.status = HTTP_INTERNAL_ERROR;
    // LGPD (security.md): nunca logar body/dados pessoais. Só id de correlação,
    // código do erro, rota e o nome da classe do erro para diagnóstico.
    const requestId = crypto.randomUUID();
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(
      `[${requestId}] erro inesperado code=${code} path=${path} error=${errorName}`,
    );
    return buildError(ERROR_CODE.internal, GENERIC_INTERNAL_MESSAGE);
  },
);
