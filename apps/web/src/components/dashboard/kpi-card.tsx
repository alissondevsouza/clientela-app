// Cartão clicável do Desempenho (RF-22): o CARTÃO INTEIRO é um `Link` (foco
// visível), com título, valor principal, linha secundária opcional e o texto
// da variação (ícone/seta E texto — a cor é só reforço, nunca o único sinal).
// Server Component (sem interação além da navegação).

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormattedDelta } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";

const DELTA_DIRECTION_CLASS: Record<FormattedDelta["direction"], string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-destructive",
  flat: "text-muted-foreground",
  no_base: "text-muted-foreground",
  no_activity: "text-muted-foreground",
};

export type KpiCardProps = {
  title: string;
  value: string;
  secondaryLine: string | null;
  delta: FormattedDelta | null;
  href: string;
};

export function KpiCard({
  title,
  value,
  secondaryLine,
  delta,
  href,
}: KpiCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="font-heading text-lg font-semibold sm:text-xl">
            {value}
          </p>
          {secondaryLine !== null ? (
            <p className="text-xs text-muted-foreground sm:text-sm">
              {secondaryLine}
            </p>
          ) : null}
          {delta !== null ? (
            <p
              className={cn(
                "text-xs font-medium sm:text-sm",
                DELTA_DIRECTION_CLASS[delta.direction],
              )}
            >
              {delta.text}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
