"use server";

import type { CreateClientInput, UpdateClientInput } from "@clientela/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { createClient, deleteClient, updateClient } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";

const LIST_PATH = "/crm/clients";
const LOGIN_PATH = "/login";

const clientDetailPath = (id: string): string => `${LIST_PATH}/${id}`;

// Resultado observável pela UI: no sucesso, create/delete REDIRECIONAM (a promise
// não resolve com valor) e update retorna `{ ok: true }`. O caminho de FALHA sempre
// retorna `{ ok: false, message }` pt-BR para o form exibir em `role="alert"`.
// NUNCA logamos nome/WhatsApp/dado pessoal (security.md/RF-10).
export type ClientActionResult = { ok: true } | { ok: false; message: string };

// Lê o Bearer do cookie de sessão. O layout do grupo `(crm)` já barra sessão
// ausente — a checagem aqui é defensiva (redirect fora de try/catch).
const requireToken = async (): Promise<string> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  return token;
};

// Cadastra uma cliente (POST /clients). Sucesso ⇒ revalida a lista e redireciona
// para o DETALHE da cliente recém-criada (RF-07). `revalidatePath`/`redirect`
// ficam FORA de try/catch: o helper nunca lança (resultado discriminado) e
// `redirect` lança NEXT_REDIRECT propositalmente.
export const createClientAction = async (
  values: CreateClientInput,
): Promise<ClientActionResult> => {
  const token = await requireToken();

  const result = await createClient(values, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  redirect(clientDetailPath(result.client.id));
};

// Atualiza parcialmente uma cliente (PATCH /clients/:id). Sucesso ⇒ revalida a
// lista e o detalhe (para refletir os novos dados na UI server-first) e retorna
// `{ ok: true }` — a usuária permanece na tela de detalhe/edição (RF-08).
export const updateClientAction = async (
  id: string,
  values: UpdateClientInput,
): Promise<ClientActionResult> => {
  const token = await requireToken();

  const result = await updateClient(id, values, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(clientDetailPath(id));
  return { ok: true };
};

// Exclui fisicamente uma cliente (DELETE /clients/:id — LGPD/RF-08). Sucesso ⇒
// revalida a lista e redireciona para ela.
export const deleteClientAction = async (
  id: string,
): Promise<ClientActionResult> => {
  const token = await requireToken();

  const result = await deleteClient(id, {
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
