import type { ApiError } from "@clientela/shared";
import { Elysia } from "elysia";
import {
  InvalidCredentialsError,
  UnauthorizedError,
} from "../modules/auth/auth.errors";
import { ClientNotFoundError } from "../modules/clients/clients.errors";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

const ERROR_CODE = {
  validation: "VALIDATION_ERROR",
  invalidBody: "INVALID_BODY",
  invalidCredentials: "INVALID_CREDENTIALS",
  unauthorized: "UNAUTHORIZED",
  clientNotFound: "CLIENT_NOT_FOUND",
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
