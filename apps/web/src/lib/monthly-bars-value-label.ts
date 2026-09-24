// Rótulo de valor do gráfico de 12 meses (RF-23): decisão do orquestrador
// (rodada 2, A1) — no máximo UM rótulo de valor por gráfico, nunca dois. Um
// único rótulo elimina estruturalmente qualquer colisão (distância de 1 ou 2
// colunas, empate no topo, invasão da legenda por dois rótulos a 100%).
//
// Regra:
// - período de um MÊS ISOLADO (`kind === "month"`): mostra o valor do mês
//   selecionado — SALVO se o Vendido desse mês for zero (nada a destacar).
// - período de VÁRIOS MESES (`year`/`range`/`all`): mostra o valor do mês de
//   maior Vendido DENTRO do período destacado (`highlighted`); empate ⇒ o
//   mais recente (bars vêm em ordem cronológica, então o último candidato
//   com o maior valor vence).
// - nenhum rótulo quando a série (ou o subconjunto destacado) está zerada.
//
// Módulo PURO, companheiro de `monthly-bars.ts`.

import type { ResolvedDashboardPeriod } from "@clientela/shared";
import type { MonthlyBar } from "./monthly-bars";

const ZERO_CENTS = 0;

export type MonthlyBarValueInput = Pick<MonthlyBar, "month" | "highlighted"> & {
  soldCents: number;
};

/**
 * Meses do gráfico que devem exibir o valor (RF-23) — nunca mais de um.
 */
export function monthsWithVisibleValue(
  bars: MonthlyBarValueInput[],
  period: ResolvedDashboardPeriod,
): Set<string> {
  if (period.kind === "month") {
    const selectedMonth = period.fromMonth;
    const selectedBar = bars.find((bar) => bar.month === selectedMonth);
    if (selectedBar === undefined || selectedBar.soldCents <= ZERO_CENTS) {
      return new Set();
    }
    return new Set([selectedMonth]);
  }

  const highlighted = bars.filter((bar) => bar.highlighted);
  const candidates = highlighted.length > 0 ? highlighted : bars;

  let topMonth: string | null = null;
  let topSoldCents = ZERO_CENTS;
  for (const bar of candidates) {
    if (bar.soldCents >= topSoldCents && bar.soldCents > ZERO_CENTS) {
      topSoldCents = bar.soldCents;
      topMonth = bar.month;
    }
  }

  return topMonth === null ? new Set() : new Set([topMonth]);
}
