"use server";

import type { LoginRequestInput } from "@clientela/shared";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildSessionCookieOptions,
  login,
  SESSION_COOKIE_NAME,
  sessionCookieMaxAgeSeconds,
} from "@/lib/auth";
import { extractClientIp } from "@/lib/client-ip";
import { loadWebEnv } from "@/lib/env";

const FORWARDED_FOR_HEADER = "x-forwarded-for";
const CRM_PATH = "/crm";

// Resultado observável pela UI: só o caminho de FALHA retorna à página — no sucesso
// a action redireciona para `/crm` (o navegador navega e a promise não resolve com
// valor). O membro `{ ok: true }` documenta o contrato para o narrowing do form.
export type LoginActionResult = { ok: true } | { ok: false; message: string };

// Server Action de login (RF-08): wrapper fino sobre o helper `login`. A lógica
// testável (validação, POST, mapeamento de erro) vive em `lib/auth.ts`; aqui só
// resolvemos ambiente + IP do cliente, gravamos o cookie de sessão e redirecionamos.
// O IP vem do ÚLTIMO valor do XFF (padrão LP-06: os anteriores são forjáveis) e é
// repassado à API para preservar o rate limit POR IP do login. NUNCA logamos token
// nem senha (security.md).
export const loginAction = async (
  values: LoginRequestInput,
): Promise<LoginActionResult> => {
  const requestHeaders = await headers();
  const clientIp = extractClientIp(requestHeaders.get(FORWARDED_FOR_HEADER));

  const result = await login(values, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    clientIp,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  // maxAge do cookie derivado do `expiresAt` da API (RF-08): a duração da sessão
  // tem fonte única no servidor; o web só converte para segundos até expirar.
  const maxAgeSeconds = sessionCookieMaxAgeSeconds(
    result.expiresAt,
    new Date(),
  );

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    result.token,
    buildSessionCookieOptions({
      isProduction: process.env.NODE_ENV === "production",
      maxAgeSeconds,
    }),
  );

  // `redirect` lança (NEXT_REDIRECT) — fica FORA de qualquer try/catch para não ser
  // engolido; a navegação para `/crm` é conduzida pelo Next.
  redirect(CRM_PATH);
};
