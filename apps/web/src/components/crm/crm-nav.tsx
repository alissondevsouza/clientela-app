"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CRM_NAV_ITEMS, isNavItemActive } from "./nav-items";

const NAV_ARIA_LABEL = "Navegação do CRM";

// Navegação do CRM em duas variantes a partir da mesma config (nav-items.ts):
// barra inferior fixa no mobile e navegação inline no header em telas >= md.
// Client Component (RF-07): só a marcação do item ativo depende de `usePathname`.

export function CrmMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={NAV_ARIA_LABEL}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {/* biome-ignore lint/a11y/noRedundantRoles: `list-style: none` faz VoiceOver/Safari remover a semântica de lista; role="list" a restaura. */}
      <ul role="list" className="flex list-none items-stretch justify-around">
        {CRM_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] font-medium transition-colors motion-reduce:transition-none",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function CrmDesktopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label={NAV_ARIA_LABEL} className="hidden md:flex">
      {/* biome-ignore lint/a11y/noRedundantRoles: `list-style: none` faz VoiceOver/Safari remover a semântica de lista; role="list" a restaura. */}
      <ul role="list" className="flex list-none items-center gap-1">
        {CRM_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
