// Gráfico de 12 meses em CSS (RF-23): alturas relativas, rótulo acessível por
// barra e destaque do período selecionado — tudo calculado por helper puro
// (sem jsdom, a altura em pixel/porcentagem é o que o teste consegue provar).

import {
  type DashboardPerformance,
  type ResolvedDashboardPeriod,
  SOLD_ON_MIN_DATE,
} from "@clientela/shared";
import {
  buildDashboardPeriodHref,
  monthAbbreviation,
  monthFullName,
} from "./dashboard-period-params";
import { formatBRL } from "./format";

const PERIOD_MIN_MONTH = SOLD_ON_MIN_DATE.slice(0, 7);

const MAX_HEIGHT_PERCENT = 100;
const ZERO_PERCENT = 0;
// Palavra "prejuízo" (A5): o marcador visual da barra virou um traço/ícone
// compacto (monthly-bars.tsx) — a palavra continua só na versão acessível
// (aria-label da coluna e tabela sr-only, ambos montados a partir daqui).
export const NEGATIVE_PROFIT_LABEL = "prejuízo";

export type MonthlySeriesItem = DashboardPerformance["series"][number];

export type MonthlyBar = {
  month: string;
  heightPercent: number;
  profitHeightPercent: number;
  profitNegative: boolean;
  highlighted: boolean;
  href: string | null;
  ariaLabel: string;
  shortLabel: string;
};

const relativeHeightPercent = (
  valueCents: number,
  maxCents: number,
): number => {
  if (maxCents <= 0 || valueCents <= 0) {
    return ZERO_PERCENT;
  }
  const percent = Math.round((valueCents * MAX_HEIGHT_PERCENT) / maxCents);
  return Math.min(MAX_HEIGHT_PERCENT, percent);
};

// Exportado para reuso na tabela `sr-only` do gráfico (monthly-bars.tsx),
// que precisa do ano por extenso — a série cruza dois anos (S3).
export const yearOf = (yearMonth: string): string => yearMonth.slice(0, 4);

/**
 * Monta as barras do gráfico (RF-23): altura relativa ao MAIOR Vendido da
 * série (`heightPercent`, 0–100, zero sem barra); o Lucro usa o MESMO teto
 * (`profitHeightPercent`) — lucro negativo vira `profitNegative` (altura 0,
 * nunca barra "negativa"); `highlighted` marca os meses dentro do período
 * selecionado; `href` é `null` para meses anteriores a 2015-01 (fora do
 * histórico, nunca um link morto); `ariaLabel` é a leitura por extenso da
 * barra (a11y: cor nunca é o único sinal).
 */
export function buildMonthlyBars(
  series: MonthlySeriesItem[],
  period: ResolvedDashboardPeriod,
): MonthlyBar[] {
  const maxSoldCents = series.reduce(
    (max, item) => Math.max(max, item.soldCents),
    ZERO_PERCENT,
  );

  return series.map((item) => {
    const profitNegative = item.profitCents < ZERO_PERCENT;
    const profitSuffix = profitNegative ? ` (${NEGATIVE_PROFIT_LABEL})` : "";
    return {
      month: item.month,
      heightPercent: relativeHeightPercent(item.soldCents, maxSoldCents),
      profitHeightPercent: profitNegative
        ? ZERO_PERCENT
        : relativeHeightPercent(item.profitCents, maxSoldCents),
      profitNegative,
      highlighted:
        item.month >= period.fromMonth && item.month <= period.toMonth,
      href:
        item.month < PERIOD_MIN_MONTH
          ? null
          : buildDashboardPeriodHref({ period: "month", month: item.month }),
      ariaLabel: `${monthFullName(item.month)} de ${yearOf(item.month)}: vendido ${formatBRL(item.soldCents)}, lucro ${formatBRL(item.profitCents)}${profitSuffix}`,
      shortLabel: monthAbbreviation(item.month),
    };
  });
}

/** Série toda zerada (nenhuma venda nos últimos 12 meses) — o gráfico dá lugar ao estado vazio (RF-23). */
export function isSeriesEmpty(series: MonthlySeriesItem[]): boolean {
  return series.every((item) => item.soldCents === ZERO_PERCENT);
}

export type TooltipAnchor = "start" | "end";

const HALF = 2;

// Lado para onde o tooltip de uma coluna abre (S1, QA rodada 3). O tooltip
// (até 160px) é bem mais largo que a coluna (~28px em 375px): centralizado,
// ele vaza da área do gráfico já na 2ª e na 11ª coluna. Ancorado na borda da
// coluna voltada para o centro do gráfico, sempre cabe — colunas da metade
// esquerda abrem para a direita, as da metade direita para a esquerda.
export function tooltipAnchor(index: number, count: number): TooltipAnchor {
  return index < count / HALF ? "start" : "end";
}
