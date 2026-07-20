import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Home,
  Package,
  ShoppingBag,
  UserPlus,
  Users,
} from "lucide-react";

export type CrmNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const CRM_ROOT_HREF = "/crm";

export const CRM_NAV_ITEMS: readonly CrmNavItem[] = [
  { href: CRM_ROOT_HREF, label: "Início", icon: Home },
  { href: "/crm/clients", label: "Clientes", icon: Users },
  { href: "/crm/leads", label: "Leads", icon: UserPlus },
  { href: "/crm/products", label: "Produtos", icon: Package },
  { href: "/crm/sales", label: "Vendas", icon: ShoppingBag },
  { href: "/crm/orders", label: "Pedidos", icon: ClipboardList },
];

const stripTrailingSlashes = (pathname: string): string => {
  const stripped = pathname.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
};

export const isNavItemActive = (pathname: string, href: string): boolean => {
  const normalizedPathname = stripTrailingSlashes(pathname);

  if (href === CRM_ROOT_HREF) {
    return normalizedPathname === CRM_ROOT_HREF;
  }

  return (
    normalizedPathname === href || normalizedPathname.startsWith(`${href}/`)
  );
};
