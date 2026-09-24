// Texto da variação e dos derivados dos cartões do Desempenho (RF-06/RF-22).
// Só formatação — a aritmética inteira vem sempre de `@clientela/shared`
// (`deltaPercent`/`classifyDelta`/`marginPercent`/`averageTicketCents`), nunca
// recalculada aqui.

import {
  averageTicketCents,
  classifyDelta,
  type DeltaClassification,
  deltaPercent,
  marginPercent,
} from "@clientela/shared";
import { formatBRL } from "./format";

const NO_BASE_TEXT = "sem base de comparação";
const NO_ACTIVITY_TEXT = "sem movimento";
const UP_ARROW = "▲";
const DOWN_ARROW = "▼";
const EMPTY_VALUE_TEXT = "—";
const ZERO = 0;

export type FormattedDelta = {
  text: string;
  direction: DeltaClassification;
};

/**
 * Texto da variação de um cartão (RF-22): alta `▲ 12% vs agosto`, queda
 * `▼ 8% vs agosto`, igual `0% vs agosto` (decisão: sempre mostra o percentual,
 * mesmo em 0 — consistente com alta/queda, que também mostram número), sem
 * base `sem base de comparação` (anterior ≤ 0 com atual ≠ 0, ou anterior
 * negativo), sem movimento `sem movimento` (os dois períodos exatamente
 * zero).
 */
export function formatDeltaText(input: {
  current: number;
  previous: number;
  shortLabel: string;
}): FormattedDelta {
  const { current, previous, shortLabel } = input;
  const direction = classifyDelta(current, previous);

  if (direction === "no_base") {
    return { text: NO_BASE_TEXT, direction };
  }
  if (direction === "no_activity") {
    return { text: NO_ACTIVITY_TEXT, direction };
  }

  // `direction` só chega aqui como "up"/"down"/"flat" — os três exigem
  // `previous > 0` (classifyDelta), a mesma condição sob a qual
  // `deltaPercent` nunca devolve `null`.
  const delta = deltaPercent(current, previous) ?? ZERO;
  const magnitude = Math.abs(delta);

  if (direction === "up") {
    return { text: `${UP_ARROW} ${magnitude}% vs ${shortLabel}`, direction };
  }
  if (direction === "down") {
    return {
      text: `${DOWN_ARROW} ${magnitude}% vs ${shortLabel}`,
      direction,
    };
  }
  return { text: `${magnitude}% vs ${shortLabel}`, direction };
}

/** Margem % (RF-06/RF-22) — `—` sem base (`soldCents = 0`); lucro negativo mostra o sinal. */
export function formatMargin(profitCents: number, soldCents: number): string {
  const percent = marginPercent(profitCents, soldCents);
  return percent === null ? EMPTY_VALUE_TEXT : `${percent}%`;
}

/** Ticket médio (RF-06/RF-22) — `—` sem venda (`soldCount = 0`). */
export function formatTicket(soldCents: number, soldCount: number): string {
  const ticket = averageTicketCents(soldCents, soldCount);
  return ticket === null ? EMPTY_VALUE_TEXT : formatBRL(ticket);
}
