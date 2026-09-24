// Grade de cartões-resumo do bloco Hoje na home (RF-20a — emenda de
// 2026-09-24): 2 colunas em 375px, 3 a partir de `sm`; cada cartão é
// INTEIRAMENTE um link para a seção correspondente de `/crm/today` (RF-28) —
// só título, número principal e uma linha de resumo, sem lista nem botão de
// WhatsApp aqui (isso ficou na página de detalhe). Server Component (só
// navegação, sem estado).

import {
  Cake,
  CalendarDays,
  HandCoins,
  type LucideIcon,
  PackageX,
  Truck,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { TodayTile } from "@/lib/dashboard-today-tiles";
import { cn } from "@/lib/utils";

const TILE_ICONS: Record<TodayTile["key"], LucideIcon> = {
  collections: HandCoins,
  appointments: CalendarDays,
  deliveries: Truck,
  newLeads: UserPlus,
  restock: PackageX,
  birthdays: Cake,
};

function TodayTileCard({ tile }: { tile: TodayTile }) {
  const Icon = TILE_ICONS[tile.key];
  return (
    <Link
      href={tile.href}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex items-start gap-1.5 text-xs leading-snug font-medium text-balance text-muted-foreground sm:text-sm">
            <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{tile.title}</span>
          </div>
          <p className="font-heading text-base leading-snug font-semibold text-balance sm:text-lg">
            {tile.value}
          </p>
          {tile.summary.length > 0 ? (
            <p
              className={cn(
                "text-xs leading-snug text-balance sm:text-sm",
                tile.tone === "alert"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {tile.summary}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export type TodaySummaryTilesProps = {
  tiles: TodayTile[];
};

export function TodaySummaryTiles({ tiles }: TodaySummaryTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <TodayTileCard key={tile.key} tile={tile} />
      ))}
    </div>
  );
}
