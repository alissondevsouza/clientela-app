"use server";

import type { LeadStatusUpdate } from "@clientela/shared";
import { updateLeadStatusSchema } from "@clientela/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { convertLead, updateLeadStatus } from "@/lib/leads-api";

const LEADS_PATH = "/crm/leads";
const CLIENTS_PATH = "/crm/clients";
const LOGIN_PATH = "/login";

// Entrada inválida na fronteira (id não-uuid, status fora do enum) NUNCA deveria
// vir da própria UI — se vier, respondemos com mensagem genérica pt-BR sem vazar
// detalhe. Nenhum log de PII (security.md/RF-09): a action só recebe id/status.
const INVALID_INPUT_MESSAGE =
  "Não foi possível concluir a ação agora. Tente novamente.";

const leadIdSchema = z.uuid();

const clientDetailPath = (id: string): string => `${CLIENTS_PATH}/${id}`;

// Resultado observável pela UI: no sucesso, `convertLeadAction` REDIRECIONA (a
// promise não resolve com valor) e `updateLeadStatusAction` retorna `{ ok: true }`.
// O caminho de FALHA sempre retorna `{ ok: false, message }` pt-BR para o
// componente exibir em `role="alert"`.
export type LeadActionResult = { ok: true } | { ok: false; message: string };

// Lê o Bearer do cookie de sessão. O layout do grupo `(crm)` já barra sessão
// ausente — a checagem aqui é defensiva (redirect fora de try/catch).
const requireToken = async (): Promise<string> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  return token;
};

// Transita o status do lead (PATCH /leads/:id/status). Valida id e status na
// fronteira (input externo — core.md/security.md) reusando o schema compartilhado
// (exclui `converted`). Sucesso ⇒ revalida a lista e retorna `{ ok: true }`.
export const updateLeadStatusAction = async (
  id: string,
  status: LeadStatusUpdate,
): Promise<LeadActionResult> => {
  const parsedId = leadIdSchema.safeParse(id);
  const parsedStatus = updateLeadStatusSchema.safeParse({ status });
  if (!parsedId.success || !parsedStatus.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await updateLeadStatus(
    parsedId.data,
    parsedStatus.data.status,
    {
      fetchImpl: fetch,
      apiUrl: loadWebEnv().API_URL,
      token,
    },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LEADS_PATH);
  return { ok: true };
};

// Converte o lead em cliente (POST /leads/:id/convert). Sucesso ⇒ revalida a
// lista de leads e a de clientes e redireciona para o DETALHE da cliente criada
// (RF-08). `revalidatePath`/`redirect` ficam FORA de try/catch: o helper nunca
// lança (resultado discriminado) e `redirect` lança NEXT_REDIRECT propositalmente.
export const convertLeadAction = async (
  id: string,
): Promise<LeadActionResult> => {
  const parsedId = leadIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await convertLead(parsedId.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LEADS_PATH);
  revalidatePath(CLIENTS_PATH);
  redirect(clientDetailPath(result.client.id));
};
