"use server";

import type { CreateProductInput, UpdateProductInput } from "@clientela/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/lib/products-api";

const LIST_PATH = "/crm/products";
const LOGIN_PATH = "/login";

const productDetailPath = (id: string): string => `${LIST_PATH}/${id}`;

// Resultado observável pela UI: no sucesso, create/delete REDIRECIONAM (a promise
// não resolve com valor) e update retorna `{ ok: true }`. O caminho de FALHA
// sempre retorna `{ ok: false, message }` pt-BR para o form exibir em
// `role="alert"`. Produtos não têm dado pessoal, mas mantemos o padrão de logar
// só IDs (security.md/RF-09).
export type ProductActionResult = { ok: true } | { ok: false; message: string };

// Lê o Bearer do cookie de sessão. O layout do grupo `(crm)` já barra sessão
// ausente — a checagem aqui é defensiva (redirect fora de try/catch).
const requireToken = async (): Promise<string> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  return token;
};

// Cadastra um produto (POST /products). Sucesso ⇒ revalida a lista e redireciona
// para o DETALHE do produto recém-criado (RF-07). `revalidatePath`/`redirect`
// ficam FORA de try/catch: o helper nunca lança (resultado discriminado) e
// `redirect` lança NEXT_REDIRECT propositalmente.
export const createProductAction = async (
  values: CreateProductInput,
): Promise<ProductActionResult> => {
  const token = await requireToken();

  const result = await createProduct(values, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  redirect(productDetailPath(result.product.id));
};

// Atualiza parcialmente um produto (PATCH /products/:id). Sucesso ⇒ revalida a
// lista e o detalhe (para refletir os novos dados na UI server-first) e retorna
// `{ ok: true }` — a usuária permanece na tela de detalhe/edição.
export const updateProductAction = async (
  id: string,
  values: UpdateProductInput,
): Promise<ProductActionResult> => {
  const token = await requireToken();

  const result = await updateProduct(id, values, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(productDetailPath(id));
  return { ok: true };
};

// Exclui fisicamente um produto (DELETE /products/:id — RF-08). Sucesso ⇒
// revalida a lista e redireciona para ela.
export const deleteProductAction = async (
  id: string,
): Promise<ProductActionResult> => {
  const token = await requireToken();

  const result = await deleteProduct(id, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
};
