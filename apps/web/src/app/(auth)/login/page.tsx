import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";

const BRAND = "Lais Barbosa";
const PAGE_TITLE = "Entrar no CRM";
const PAGE_DESCRIPTION = "Acesse o painel para gerenciar clientes e vendas.";
const CRM_PATH = "/crm";

// Página autenticada: não deve ser indexada por buscadores (área privada).
export const metadata: Metadata = {
  title: PAGE_TITLE,
  robots: { index: false },
};

// Server Component: se já há sessão válida (cookie presente + `/auth/me` ok),
// redireciona direto para o CRM (RF-09) — sem renderizar o form. `redirect` lança
// e fica fora de try/catch; `fetchSession` nunca lança (resultado discriminado).
export default async function LoginPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const session = await fetchSession(token, {
      fetchImpl: fetch,
      apiUrl: loadWebEnv().API_URL,
    });
    if (session.ok) {
      redirect(CRM_PATH);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <p className="font-heading text-sm font-medium text-muted-foreground">
            {BRAND}
          </p>
          <CardTitle className="text-xl">{PAGE_TITLE}</CardTitle>
          <CardDescription>{PAGE_DESCRIPTION}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
