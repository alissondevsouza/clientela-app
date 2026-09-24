// Gráfico de 12 meses em CSS puro (RF-23) — sem biblioteca de gráficos, sem
// JS: cada coluna é um `Link` (quando o mês tem `href`); o tooltip usa
// `group-hover`/`group-focus-visible`. Vendido e Lucro partem da MESMA linha
// de base, mesmo matiz em dois passos (`bg-primary/25`/`bg-primary`) — Lucro é
// parte do Vendido, não uma série independente. Meses destacados por FORMA
// (rótulo em negrito + traço), nunca só por cor. Tabela `sr-only` é a
// alternativa acessível completa para leitor de tela.

import type {
  DashboardPerformance,
  ResolvedDashboardPeriod,
} from "@clientela/shared";
import { Minus } from "lucide-react";
import Link from "next/link";
import { monthFullName } from "@/lib/dashboard-period-params";
import { formatBRL } from "@/lib/format";
import {
  buildMonthlyBars,
  isSeriesEmpty,
  type MonthlyBar,
  NEGATIVE_PROFIT_LABEL,
  tooltipAnchor,
  yearOf,
} from "@/lib/monthly-bars";
import { monthsWithVisibleValue } from "@/lib/monthly-bars-value-label";
import { cn } from "@/lib/utils";

const EMPTY_SERIES_TEXT = "Nenhuma venda nos últimos 12 meses";
const LEGEND_SOLD_LABEL = "Vendido";
const LEGEND_PROFIT_LABEL = "Lucro estimado";
const TABLE_CAPTION = "Vendido e lucro por mês";
const TABLE_MONTH_HEADER = "Mês";
const TABLE_SOLD_HEADER = "Vendido";
const TABLE_PROFIT_HEADER = "Lucro";

type MonthlyBarWithValues = MonthlyBar & {
  soldCents: number;
  profitCents: number;
};

// Zip defensivo (noUncheckedIndexedAccess): `buildMonthlyBars` preserva a
// ordem/tamanho de `series` 1:1, mas o índice de array segue tipado como
// possivelmente ausente — meses sem par nunca acontecem no uso real e são
// só ignorados aqui (nunca `!`/`as`).
const zipBarsWithSeries = (
  bars: MonthlyBar[],
  series: DashboardPerformance["series"],
): MonthlyBarWithValues[] =>
  bars.reduce<MonthlyBarWithValues[]>((acc, bar, index) => {
    const item = series[index];
    if (item === undefined) {
      return acc;
    }
    acc.push({
      ...bar,
      soldCents: item.soldCents,
      profitCents: item.profitCents,
    });
    return acc;
  }, []);

export type MonthlyBarsChartProps = {
  series: DashboardPerformance["series"];
  period: ResolvedDashboardPeriod;
};

export function MonthlyBarsChart({ series, period }: MonthlyBarsChartProps) {
  if (isSeriesEmpty(series)) {
    return <p className="text-sm text-muted-foreground">{EMPTY_SERIES_TEXT}</p>;
  }

  const bars = zipBarsWithSeries(buildMonthlyBars(series, period), series);
  const valueMonths = monthsWithVisibleValue(bars, period);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-primary/25" />
          <span className="text-muted-foreground">{LEGEND_SOLD_LABEL}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-primary" />
          <span className="text-muted-foreground">{LEGEND_PROFIT_LABEL}</span>
        </span>
      </div>

      {/* Grade de 12 colunas de largura FLEXÍVEL (`minmax(0, 1fr)`, o padrão
          do Tailwind `grid-cols-12`): o conteúdo de uma coluna NUNCA alarga a
          faixa — ao contrário de `flex` (onde o rótulo de valor sem largura
          própria empurrava a coluna para além de 24px e forçava rolagem
          interna escondida, C1). Sem `overflow-x`: nada rola por dentro.
          `pt-5` reserva espaço para o ÚNICO rótulo de valor possível (A1,
          rodada 2) quando a barra mais alta chega a 100% — sem essa folga o
          rótulo invade a linha da legenda acima. */}
      <div className="grid h-40 grid-cols-12 items-end gap-0.5 border-b border-border pt-5 pb-px">
        {bars.map((bar, index) => (
          <MonthlyBarColumn
            key={bar.month}
            bar={bar}
            showValue={valueMonths.has(bar.month)}
            isFirst={index === 0}
            isLast={index === bars.length - 1}
            index={index}
            count={bars.length}
          />
        ))}
      </div>

      {/* A tabela em si NÃO leva `sr-only`: `table-layout: auto` ignora o
          `width: 1px` do `sr-only` quando o conteúdo (ano + "(prejuízo)")
          precisa de mais espaço, e a caixa da tabela alarga o documento em
          375px (C1, rodada 2). O `<div className="sr-only">` (posição
          absoluta, `width: 1px` + `overflow: hidden`) recorta a tabela por
          fora — `div` respeita `width` mesmo com conteúdo maior. */}
      <div className="sr-only">
        <table>
          <caption>{TABLE_CAPTION}</caption>
          <thead>
            <tr>
              <th scope="col">{TABLE_MONTH_HEADER}</th>
              <th scope="col">{TABLE_SOLD_HEADER}</th>
              <th scope="col">{TABLE_PROFIT_HEADER}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.month}>
                <td>
                  {monthFullName(bar.month)} de {yearOf(bar.month)}
                </td>
                <td>{formatBRL(bar.soldCents)}</td>
                <td>
                  {formatBRL(bar.profitCents)}
                  {bar.profitNegative ? ` (${NEGATIVE_PROFIT_LABEL})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type MonthlyBarColumnProps = {
  bar: MonthlyBarWithValues;
  showValue: boolean;
  isFirst: boolean;
  isLast: boolean;
  index: number;
  count: number;
};

// Cada coluna é a área de toque INTEIRA (altura total do gráfico) — maior que
// a barra visual, mais fácil de tocar no mobile (RF-23). `min-w-0` (com o
// grid `minmax(0, 1fr)` do pai) garante que nada dentro da coluna a alarga.
function MonthlyBarColumn({
  bar,
  showValue,
  isFirst,
  isLast,
  index,
  count,
}: MonthlyBarColumnProps) {
  // Rótulo de valor ANCORADO (nunca centralizado por padrão): a primeira
  // coluna ancora à esquerda e a última à direita, para o texto (que pode
  // passar de 24px — "R$ 12.475,57") nunca vazar para fora da área do
  // gráfico; as colunas do meio centralizam (C1).
  const valuePositionClass = isFirst
    ? "left-0 text-left"
    : isLast
      ? "right-0 text-right"
      : "left-1/2 -translate-x-1/2 text-center";

  // Tooltip de foco/hover ancorado pela metade do gráfico (`tooltipAnchor`):
  // centralizado, ele vazaria da área visível nas colunas perto das bordas
  // (S4 da rodada 2, S1 da rodada 3) e alargaria o documento em 375px.
  const tooltipPositionClass =
    tooltipAnchor(index, count) === "start" ? "left-0" : "right-0";

  const visual = (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max max-w-40 rounded-md bg-foreground px-2 py-1 text-center text-[10px] text-background group-hover:block group-focus-visible:block",
          tooltipPositionClass,
        )}
      >
        {bar.ariaLabel}
      </div>

      <div className="relative w-6 flex-1">
        {showValue ? (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute z-10 whitespace-nowrap text-[10px] font-medium text-foreground",
              valuePositionClass,
            )}
            style={{ bottom: `calc(${bar.heightPercent}% + 4px)` }}
          >
            {formatBRL(bar.soldCents)}
          </div>
        ) : null}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 rounded-t bg-primary/25"
          style={{ height: `${bar.heightPercent}%` }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 rounded-t bg-primary"
          style={{ height: `${bar.profitHeightPercent}%` }}
        />
        {bar.profitNegative ? (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 flex justify-center text-destructive"
          >
            <Minus className="size-3" aria-hidden />
          </span>
        ) : null}
      </div>

      <div
        aria-hidden
        className={cn(
          "mt-1 w-6 truncate border-t pt-0.5 text-center text-[10px]",
          bar.highlighted
            ? "border-foreground font-semibold text-foreground"
            : "border-transparent text-muted-foreground",
        )}
      >
        {bar.shortLabel}
      </div>
    </>
  );

  if (bar.href === null) {
    return (
      <div className="group relative flex h-full min-w-0 flex-col items-center">
        {visual}
        <span className="sr-only">{bar.ariaLabel}</span>
      </div>
    );
  }

  return (
    <Link
      href={bar.href}
      aria-label={bar.ariaLabel}
      className="group relative flex h-full min-w-0 flex-col items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {visual}
    </Link>
  );
}
