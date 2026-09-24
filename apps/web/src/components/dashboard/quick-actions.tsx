// Ações rápidas da home (RF-18): Nova venda, Registrar pagamento, Novo
// compromisso, Nova cliente. Server Component — são só links, sem estado.

import { CalendarPlus, HandCoins, ShoppingCart, UserPlus } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NEW_SALE_HREF = "/crm/sales/new";
const REGISTER_PAYMENT_HREF = "/crm/sales/receivables";
const NEW_APPOINTMENT_HREF = "/crm/appointments/new";
const NEW_CLIENT_HREF = "/crm/clients/new";

const NEW_SALE_LABEL = "Nova venda";
const REGISTER_PAYMENT_LABEL = "Registrar pagamento";
const NEW_APPOINTMENT_LABEL = "Novo compromisso";
const NEW_CLIENT_LABEL = "Nova cliente";

const NAV_LABEL = "Ações rápidas";

type QuickAction = {
  key: string;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "new-sale",
    href: NEW_SALE_HREF,
    label: NEW_SALE_LABEL,
    icon: ShoppingCart,
  },
  {
    key: "register-payment",
    href: REGISTER_PAYMENT_HREF,
    label: REGISTER_PAYMENT_LABEL,
    icon: HandCoins,
  },
  {
    key: "new-appointment",
    href: NEW_APPOINTMENT_HREF,
    label: NEW_APPOINTMENT_LABEL,
    icon: CalendarPlus,
  },
  {
    key: "new-client",
    href: NEW_CLIENT_HREF,
    label: NEW_CLIENT_LABEL,
    icon: UserPlus,
  },
];

// Grade 2×2 (em vez de rolagem horizontal): rolagem horizontal esconderia a
// última ação sem nenhum indício visual de que há mais itens (web.md: sem
// rolagem horizontal da PÁGINA; aqui evitamos também a rolagem horizontal
// DENTRO do componente, por a11y/descoberta). Em ~375px o rótulo pode não
// caber numa linha só (ex.: "Registrar pagamento") — a altura é AUTO
// (`h-auto min-h-11`) e o texto QUEBRA em duas linhas (S1) em vez de truncar
// ("Registrar pagam…"). Alvo de toque ≥44px no mobile, compacto a partir de
// `md`.
export function QuickActions() {
  return (
    <nav
      aria-label={NAV_LABEL}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {QUICK_ACTIONS.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto min-h-11 w-full items-center justify-start gap-2 py-2 text-left whitespace-normal md:min-h-9",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="leading-tight">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
