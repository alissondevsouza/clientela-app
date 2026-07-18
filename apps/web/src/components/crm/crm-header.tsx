import Link from "next/link";
import { logoutAction } from "@/app/(crm)/actions";
import { Button } from "@/components/ui/button";
import { CrmDesktopNav } from "./crm-nav";

const BRAND_NAME = "Lais Barbosa";
const CRM_HOME_HREF = "/crm";
const LOGOUT_LABEL = "Sair";

const greeting = (name: string): string => `Olá, ${name}`;

// Header sticky do shell autenticado (RF-01). Server Component: nome da consultora
// chega por prop (o guard do layout já validou a sessão — sem fetch novo). A
// navegação desktop fica inline aqui; no mobile ela vira barra inferior fixa
// (CrmMobileNav). Logout é Server Action via <form action> — funciona sem JS.
export function CrmHeader({ consultantName }: { consultantName: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href={CRM_HOME_HREF}
          className="text-sm font-semibold tracking-tight whitespace-nowrap text-foreground"
        >
          {BRAND_NAME}
        </Link>

        <CrmDesktopNav />

        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            {greeting(consultantName)}
          </span>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-11 md:h-7"
            >
              {LOGOUT_LABEL}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
