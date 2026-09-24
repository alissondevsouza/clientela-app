import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TodayDetailsSkeleton } from "@/components/dashboard/section-skeletons";
import { TodayDetails } from "@/components/dashboard/today-details";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

const PAGE_TITLE = "Hoje";
const LOGIN_PATH = "/login";
const HOME_HREF = "/crm";
const BACK_LABEL = "← Início";
const BACK_LINK_CLASS =
  "text-sm font-medium text-primary hover:underline focus-visible:underline";

// Robots (noindex) é herdado do layout do grupo `(crm)`; não entra na
// navegação principal — é alcançada pelos cartões-resumo da home (RF-28).
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Página "Hoje" (RF-28 — CRM-14, emenda 2026-09-24): o conteúdo detalhado que
// antes ficava na home (listas, contagens, botões de WhatsApp), com âncora
// própria por seção (`TodayDetails`/`today-details.tsx`). Server-first: guard
// de sessão + `Suspense` com skeleton e `SectionError` isolado (mesma central
// de erro das outras seções — `TodayDetails` nunca lança).
export default async function CrmTodayPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href={HOME_HREF} className={BACK_LINK_CLASS}>
          {BACK_LABEL}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
      </header>

      <Suspense fallback={<TodayDetailsSkeleton />}>
        <TodayDetails token={token} />
      </Suspense>
    </div>
  );
}
