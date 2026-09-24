// Seletor de período da home (RF-21): atalhos, setas ‹ › e "Personalizado"
// como formulário GET — Server Component, SEM JS (funciona por link/form
// nativo; o `<details>` é um disclosure widget nativo, sem estado React).

import type {
  DashboardPeriodQuery,
  ResolvedDashboardPeriod,
} from "@clientela/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildPeriodNavigation,
  buildPeriodPresets,
} from "@/lib/dashboard-period-params";
import { cn } from "@/lib/utils";

const DASHBOARD_PATH = "/crm";
const CUSTOM_LABEL = "Personalizado";
const CUSTOM_FROM_ID = "dashboard-custom-period-from";
const CUSTOM_TO_ID = "dashboard-custom-period-to";
const CUSTOM_FROM_LABEL = "De";
const CUSTOM_TO_LABEL = "Até";
const APPLY_LABEL = "Aplicar";
const PREVIOUS_MONTH_LABEL = "Mês anterior";
const NEXT_MONTH_LABEL = "Próximo mês";
const PREVIOUS_YEAR_LABEL = "Ano anterior";
const NEXT_YEAR_LABEL = "Próximo ano";

export type PeriodSelectorProps = {
  query: DashboardPeriodQuery;
  period: ResolvedDashboardPeriod;
  todayIso: string;
};

export function PeriodSelector({
  query,
  period,
  todayIso,
}: PeriodSelectorProps) {
  const presets = buildPeriodPresets(query, todayIso);
  const navigation = buildPeriodNavigation(period, todayIso);
  const hasArrows = period.kind === "month" || period.kind === "year";
  const previousLabel =
    period.kind === "year" ? PREVIOUS_YEAR_LABEL : PREVIOUS_MONTH_LABEL;
  const nextLabel = period.kind === "year" ? NEXT_YEAR_LABEL : NEXT_MONTH_LABEL;

  const customActive = query.period === "range";
  const customDefaultFrom = query.period === "range" ? (query.from ?? "") : "";
  const customDefaultTo = query.period === "range" ? (query.to ?? "") : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {hasArrows ? (
          <NavArrow
            href={navigation.previousHref}
            label={previousLabel}
            icon={ChevronLeft}
          />
        ) : null}

        {/* A4: em 375px, "Este an…" cortava e "Tudo" ficava invisível dentro
            da rolagem horizontal escondida. `flex-wrap` (sem `overflow-x`)
            garante que todo atalho fica visível, quebrando em mais de uma
            linha quando não couber. */}
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {presets.map((preset) =>
            // "Personalizado" (`href: null`) não é link — é o `<details>` abaixo.
            preset.href === null ? null : (
              <Link
                key={preset.key}
                href={preset.href}
                aria-current={preset.active ? "page" : undefined}
                className={cn(
                  buttonVariants({
                    variant: preset.active ? "default" : "outline",
                  }),
                  "h-9 shrink-0 whitespace-nowrap",
                )}
              >
                {preset.label}
              </Link>
            ),
          )}
        </div>

        {hasArrows ? (
          <NavArrow
            href={navigation.nextHref}
            label={nextLabel}
            icon={ChevronRight}
          />
        ) : null}
      </div>

      <details open={customActive} className="group">
        <summary
          className={cn(
            buttonVariants({ variant: customActive ? "default" : "outline" }),
            "h-9 w-fit cursor-pointer list-none",
          )}
        >
          {CUSTOM_LABEL}
        </summary>
        <form
          method="GET"
          action={DASHBOARD_PATH}
          className="mt-2 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="period" value="range" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={CUSTOM_FROM_ID}>{CUSTOM_FROM_LABEL}</Label>
            <Input
              id={CUSTOM_FROM_ID}
              name="from"
              type="month"
              defaultValue={customDefaultFrom}
              className="h-11 md:h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={CUSTOM_TO_ID}>{CUSTOM_TO_LABEL}</Label>
            <Input
              id={CUSTOM_TO_ID}
              name="to"
              type="month"
              defaultValue={customDefaultTo}
              className="h-11 md:h-9"
            />
          </div>
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 md:h-9",
            )}
          >
            {APPLY_LABEL}
          </button>
        </form>
      </details>
    </div>
  );
}

type NavArrowProps = {
  href: string | null;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

function NavArrow({ href, label, icon: Icon }: NavArrowProps) {
  if (href === null) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "pointer-events-none shrink-0 opacity-50",
        )}
      >
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "shrink-0",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </Link>
  );
}
