import {
  apiErrorSchema,
  type CreateProductInput,
  createProductSchema,
  type Product,
  type ProductsSummary,
  paginated,
  productSchema,
  productsSummarySchema,
  type UpdateProductInput,
  updateProductSchema,
} from "@clientela/shared";
import type { FetchImpl } from "./submit-lead";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;

const PRODUCTS_PATH = "/products";
const SUMMARY_PATH = "/products/summary";

const CONTENT_TYPE_HEADER = "content-type";
const CONTENT_TYPE_JSON = "application/json";
const AUTHORIZATION_HEADER = "authorization";
const TRAILING_SLASHES = /\/+$/;

// Mensagem genérica pt-BR (security.md/core.md): usada quando o detalhe da falha
// não pode/não deve ser exposto (rede, resposta ilegível, formato inesperado).
// Nunca vaza internals da API.
const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a ação agora. Verifique sua conexão e tente novamente.";

const NOT_FOUND_MESSAGE = "Produto não encontrado.";

const productsListSchema = paginated(productSchema);

export type ProductsApiDeps = {
  fetchImpl: FetchImpl;
  apiUrl: string;
  token: string;
};

export type ListProductsParams = {
  page?: number;
  perPage?: number;
  search?: string;
  lowStock?: boolean;
};

// Resultados discriminados (core.md): a página/action faz narrowing sem try/catch.
export type ListProductsResult =
  | { ok: true; data: Product[]; page: number; perPage: number; total: number }
  | { ok: false; message: string };

export type GetProductResult =
  | { ok: true; product: Product }
  | { ok: false; notFound: boolean; message: string };

export type MutateProductResult =
  | { ok: true; product: Product }
  | { ok: false; message: string };

export type DeleteProductResult = { ok: true } | { ok: false; message: string };

export type ProductsSummaryResult =
  | { ok: true; summary: ProductsSummary }
  | { ok: false; message: string };

const joinUrl = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(TRAILING_SLASHES, "")}${path}`;

const productUrl = (apiUrl: string, id: string): string =>
  joinUrl(apiUrl, `${PRODUCTS_PATH}/${encodeURIComponent(id)}`);

const authHeaders = (token: string): Record<string, string> => ({
  [AUTHORIZATION_HEADER]: `Bearer ${token}`,
});

const jsonAuthHeaders = (token: string): Record<string, string> => ({
  ...authHeaders(token),
  [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
});

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

// Extrai a mensagem do envelope de erro conhecido da API; qualquer desvio
// (não-JSON, shape inesperado) cai na mensagem genérica — nunca vaza internals.
const extractErrorMessage = async (response: Response): Promise<string> => {
  const parsed = apiErrorSchema.safeParse(await readJson(response));
  if (parsed.success) {
    return parsed.data.error.message;
  }
  return GENERIC_ERROR_MESSAGE;
};

const buildListUrl = (apiUrl: string, params: ListProductsParams): string => {
  const query = new URLSearchParams();
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    query.set("perPage", String(params.perPage));
  }
  if (params.search !== undefined && params.search.length > 0) {
    query.set("search", params.search);
  }
  // Só enviamos o filtro quando ativo (true). `false` é o comportamento padrão
  // (sem filtro) e omiti-lo mantém a URL limpa na paginação.
  if (params.lowStock === true) {
    query.set("lowStock", "true");
  }
  const queryString = query.toString();
  const base = joinUrl(apiUrl, PRODUCTS_PATH);
  return queryString ? `${base}?${queryString}` : base;
};

// Lista produtos paginados (GET /products) com Bearer. NUNCA lança: rede, status
// ≠ 200 e corpo malformado viram `{ ok: false, message }` pt-BR.
export const listProducts = async (
  params: ListProductsParams,
  { fetchImpl, apiUrl, token }: ProductsApiDeps,
): Promise<ListProductsResult> => {
  let response: Response;
  try {
    response = await fetchImpl(buildListUrl(apiUrl, params), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = productsListSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return {
    ok: true,
    data: parsed.data.data,
    page: parsed.data.page,
    perPage: parsed.data.perPage,
    total: parsed.data.total,
  };
};

// Busca um produto por id (GET /products/:id). 404 vira `{ notFound: true }`
// para a UI distinguir "não existe" de falha genérica; nunca lança.
export const getProduct = async (
  id: string,
  { fetchImpl, apiUrl, token }: ProductsApiDeps,
): Promise<GetProductResult> => {
  let response: Response;
  try {
    response = await fetchImpl(productUrl(apiUrl, id), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status === HTTP_NOT_FOUND) {
    return { ok: false, notFound: true, message: NOT_FOUND_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return {
      ok: false,
      notFound: false,
      message: await extractErrorMessage(response),
    };
  }

  const parsed = productSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, notFound: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, product: parsed.data };
};

// Cria um produto (POST /products). Valida na fronteira com o schema
// compartilhado antes de enviar; nunca lança.
export const createProduct = async (
  values: CreateProductInput,
  { fetchImpl, apiUrl, token }: ProductsApiDeps,
): Promise<MutateProductResult> => {
  const parsedInput = createProductSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, PRODUCTS_PATH), {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_CREATED) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = productSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, product: parsed.data };
};

// Atualiza parcialmente um produto (PATCH /products/:id). Valida na fronteira
// com o schema de update parcial antes de enviar; nunca lança.
export const updateProduct = async (
  id: string,
  values: UpdateProductInput,
  { fetchImpl, apiUrl, token }: ProductsApiDeps,
): Promise<MutateProductResult> => {
  const parsedInput = updateProductSchema.safeParse(values);
  if (!parsedInput.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(productUrl(apiUrl, id), {
      method: "PATCH",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(parsedInput.data),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = productSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, product: parsed.data };
};

// Exclui fisicamente um produto (DELETE /products/:id). 204 → sucesso; nunca
// lança.
export const deleteProduct = async (
  id: string,
  { fetchImpl, apiUrl, token }: ProductsApiDeps,
): Promise<DeleteProductResult> => {
  let response: Response;
  try {
    response = await fetchImpl(productUrl(apiUrl, id), {
      method: "DELETE",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_NO_CONTENT) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  return { ok: true };
};

// Busca o agregado da consultora (GET /products/summary): capital parado, valor
// de venda do estoque e contagem de estoque baixo. NUNCA lança.
export const getProductsSummary = async ({
  fetchImpl,
  apiUrl,
  token,
}: ProductsApiDeps): Promise<ProductsSummaryResult> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiUrl, SUMMARY_PATH), {
      method: "GET",
      headers: authHeaders(token),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (response.status !== HTTP_OK) {
    return { ok: false, message: await extractErrorMessage(response) };
  }

  const parsed = productsSummarySchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, summary: parsed.data };
};
