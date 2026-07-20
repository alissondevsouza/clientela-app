"use server";

import type { UpdateGoalInput } from "@clientela/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { updateGoal } from "@/lib/dashboard-api";
import { loadWebEnv } from "@/lib/env";

const HOME_PATH = "/crm";
const LOGIN_PATH = "/login";

// Resultado observável pela UI (mesmo padrão de `products/actions.ts`): sucesso
// devolve o valor persistido (a UI sincroniza o estado local sem esperar um
// novo fetch); falha devolve mensagem pt-BR tratável no `role="alert"` do form.
export type UpdateGoalActionResult =
  | { ok: true; monthlyGoalCents: number | null }
  | { ok: false; message: string };

// Lê o Bearer do cookie de sessão. O layout do grupo `(crm)` já barra sessão
// ausente — a checagem aqui é defensiva (redirect fora de try/catch).
const requireToken = async (): Promise<string> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  return token;
};

// Define/edita/remove a meta mensal (PUT /dashboard/goal — RF-05). Este é o
// ÚNICO `actions.ts` da home do CRM (`/crm`); `logoutAction` fica em
// `(crm)/actions.ts`, um nível acima, e não é tocado aqui. Sucesso revalida a
// home para os cards refletirem o novo valor (`revalidatePath`).
export const updateGoalAction = async (
  values: UpdateGoalInput,
): Promise<UpdateGoalActionResult> => {
  const token = await requireToken();

  const result = await updateGoal(values.monthlyGoalCents, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(HOME_PATH);
  return { ok: true, monthlyGoalCents: result.monthlyGoalCents };
};
