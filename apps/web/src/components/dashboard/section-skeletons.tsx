// Skeletons por bloco da home (RF-18/web.md: loading obrigatório em tela de
// dados) — um fallback de `Suspense` por bloco, proporcional ao layout real
// (cards/linhas do bloco correspondente), manual (`animate-pulse bg-muted`,
// mesmo padrão de `crm/loading.tsx`). O conteúdo decorativo fica sob
// `aria-hidden` (não tem informação nenhuma); um texto `sr-only` FORA do
// `aria-hidden` anuncia "Carregando…" para leitor de tela, já que nada mais na
// árvore descreve o estado.

import { cn } from "@/lib/utils";

const LOADING_TEXT = "Carregando…";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        className,
      )}
    >
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="h-6 w-2/3" />
      <SkeletonBlock className="h-3 w-1/2" />
    </div>
  );
}

const TODAY_TILE_KEYS = ["t1", "t2", "t3", "t4"] as const;

/**
 * Skeleton do bloco Hoje da HOME (RF-20a): heading + grade de cartões-resumo
 * (mesma grade 2/3 colunas da `TodaySummaryTiles` real).
 */
export function TodaySummarySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only">{LOADING_TEXT}</span>
      <div aria-hidden className="flex flex-col gap-3">
        <SkeletonBlock className="h-7 w-24" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TODAY_TILE_KEYS.map((key) => (
            <div
              key={key}
              className="flex flex-col gap-1.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
            >
              <SkeletonBlock className="h-3 w-2/3" />
              <SkeletonBlock className="h-5 w-4/5" />
              <SkeletonBlock className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TODAY_DETAILS_SECTION_KEYS = ["t1", "t2", "t3"] as const;

/**
 * Skeleton da página `/crm/today` (RF-28): 3 "seções" com título e duas
 * linhas — layout das seções detalhadas do Hoje.
 */
export function TodayDetailsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only">{LOADING_TEXT}</span>
      <div aria-hidden className="flex flex-col gap-3">
        {TODAY_DETAILS_SECTION_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}

const PERFORMANCE_KPI_KEYS = ["k1", "k2", "k3", "k4"] as const;
// Alturas variadas para lembrar um gráfico de barras sem depender de valor
// arbitrário fora da escala padrão do Tailwind.
const PERFORMANCE_BAR_HEIGHTS = [
  "h-6",
  "h-10",
  "h-8",
  "h-14",
  "h-12",
  "h-16",
  "h-9",
  "h-11",
  "h-15",
  "h-7",
  "h-13",
  "h-10",
] as const;

/**
 * Skeleton do bloco Desempenho: seletor de período, 4 cartões de KPI, o
 * gráfico de 12 meses e as duas listas (mais vendidos/melhores clientes).
 */
export function PerformanceSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only">{LOADING_TEXT}</span>
      <div aria-hidden className="flex flex-col gap-3">
        <SkeletonBlock className="h-7 w-40" />
        <SkeletonBlock className="h-9 w-full" />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PERFORMANCE_KPI_KEYS.map((key) => (
            <SkeletonCard key={key} />
          ))}
        </div>

        <div className="flex h-40 items-end gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          {PERFORMANCE_BAR_HEIGHTS.map((height, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lista decorativa fixa, sem identidade própria.
            <SkeletonBlock key={index} className={cn("w-full", height)} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SkeletonBlock className="h-36 w-full rounded-xl" />
          <SkeletonBlock className="h-36 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

const POSITION_CARD_KEYS = ["a1", "a2"] as const;

/** Skeleton do bloco Posição agora: heading + 2 cartões (A receber, Estoque). */
export function PositionSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only">{LOADING_TEXT}</span>
      <div aria-hidden className="flex flex-col gap-3">
        <SkeletonBlock className="h-7 w-40" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {POSITION_CARD_KEYS.map((key) => (
            <SkeletonCard key={key} />
          ))}
        </div>
      </div>
    </div>
  );
}
