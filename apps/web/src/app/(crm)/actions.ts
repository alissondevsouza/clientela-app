"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logout, SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";

const LOGIN_PATH = "/login";

// Server Action de logout (RF-09): invalida a sessão na API, limpa o cookie local
// e redireciona para `/login`. Funciona sem JS (acionada por <form action>). O
// helper `logout` NUNCA lança (resultado booleano) — mesmo se a API estiver fora,
// o cookie é apagado e a usuária sai localmente. Nunca logamos o token (security.md).
export const logoutAction = async (): Promise<void> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await logout(token, { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);

  // `redirect` lança (NEXT_REDIRECT) — fica FORA de try/catch para não ser engolido.
  redirect(LOGIN_PATH);
};
