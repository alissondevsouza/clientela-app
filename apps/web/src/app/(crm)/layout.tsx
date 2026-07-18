import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CrmHeader } from "@/components/crm/crm-header";
import { CrmMobileNav } from "@/components/crm/crm-nav";
import { fetchSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";

const LOGIN_PATH = "/login";

// Área privada: nenhuma página do grupo `(crm)` é indexável (RF-05). Definido uma
// única vez no layout do grupo — herdado por todas as pages (sem duplicação).
export const metadata: Metadata = {
  robots: { index: false },
};

// Guard server-side do grupo `(crm)` (RF-09): valida a sessão contra a API a cada
// request. Ler `cookies()` torna a rota dinâmica (sem cache da checagem) — a
// verificação nunca é servida de cache estático. Sem cookie ou sessão inválida ⇒
// `redirect('/login')` (lança NEXT_REDIRECT, fora de try/catch); `fetchSession`
// nunca lança (resultado discriminado). O shell (header + navegação) é montado
// aqui a partir da consultora já validada — sem fetch novo (RF-01, RF-07).
export default async function CrmLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const session = await fetchSession(token, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
  });
  if (!session.ok) {
    redirect(LOGIN_PATH);
  }

  return (
    <div className="min-h-dvh">
      <CrmHeader consultantName={session.consultant.name} />
      {/* pb compensatório: a barra inferior fixa do mobile (CrmMobileNav) não
          pode cobrir o conteúdo; em >= md a barra some e o padding volta ao normal. */}
      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>
      <CrmMobileNav />
    </div>
  );
}
