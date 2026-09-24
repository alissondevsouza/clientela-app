// Cartões do Desempenho (RF-22): monta os 4 KPIs (Vendido, Recebido, Lucro
// estimado, Ticket médio) a partir do `DashboardPerformance` — decide título,
// valor, linha secundária, variação e destino de cada cartão. Módulo PURO
// (sem jsdom, lesson): a UI só itera o array e aplica classes de cor pela
// `direction` do delta.

import {
  averageTicketCents,
  type DashboardPerformance,
} from "@clientela/shared";
import {
  type FormattedDelta,
  formatDeltaText,
  formatMargin,
  formatTicket,
} from "./dashboard-format";
import { receivedDrillDownHref, soldDrillDownHref } from "./dashboard-links";
import { formatComparisonShortLabel } from "./dashboard-period-params";
import { formatBRL } from "./format";

const ZERO = 0;
const SINGLE = 1;

const SALE_UNIT_SINGULAR = "venda";
const SALE_UNIT_PLURAL = "vendas";
const CLIENT_UNIT_SINGULAR = "cliente atendida";
const CLIENT_UNIT_PLURAL = "clientes atendidas";
const MARGIN_PREFIX = "margem";

const SOLD_TITLE = "Vendido";
const RECEIVED_TITLE = "Recebido";
const PROFIT_TITLE = "Lucro estimado";
const TICKET_TITLE = "Ticket médio";

const salesCountText = (count: number): string =>
  `${count} ${count === SINGLE ? SALE_UNIT_SINGULAR : SALE_UNIT_PLURAL}`;

const clientsCountText = (count: number): string =>
  `${count} ${count === SINGLE ? CLIENT_UNIT_SINGULAR : CLIENT_UNIT_PLURAL}`;

export type PerformanceKpiKey = "sold" | "received" | "profit" | "ticket";

export type PerformanceKpiCard = {
  key: PerformanceKpiKey;
  title: string;
  value: string;
  secondaryLine: string | null;
  delta: FormattedDelta | null;
  href: string;
};

// Sem `previous` (período `all`/intervalo > 12 meses, RF-11) não há "vs" — o
// cartão simplesmente não mostra variação, nunca inventa uma base.
const buildDelta = (
  current: number,
  previous: number | null,
  shortLabel: string | null,
): FormattedDelta | null => {
  if (previous === null || shortLabel === null) {
    return null;
  }
  return formatDeltaText({ current, previous, shortLabel });
};

/**
 * Monta os 4 cartões do Desempenho (RF-22), na ordem Vendido/Recebido/Lucro/
 * Ticket. `previous` ausente tira a variação de todos; o ticket também some a
 * variação quando um dos dois lados não tem venda (`averageTicketCents`
 * devolve `null` — divisão por zero não é "zero", é "sem dado", mesma cautela
 * de `dashboard-format.ts`).
 */
export function buildPerformanceKpis(
  performance: DashboardPerformance,
): PerformanceKpiCard[] {
  const { current, previous, period } = performance;
  const shortLabel = formatComparisonShortLabel(period);
  const soldHref = soldDrillDownHref(period);
  const receivedHref = receivedDrillDownHref(period);

  const currentTicket = averageTicketCents(
    current.soldCents,
    current.soldCount,
  );
  const previousTicket =
    previous === null
      ? null
      : averageTicketCents(previous.soldCents, previous.soldCount);
  const ticketDelta =
    currentTicket === null || previousTicket === null
      ? null
      : buildDelta(currentTicket, previousTicket, shortLabel);

  return [
    {
      key: "sold",
      title: SOLD_TITLE,
      value: formatBRL(current.soldCents),
      secondaryLine: salesCountText(current.soldCount),
      delta: buildDelta(
        current.soldCents,
        previous === null ? null : previous.soldCents,
        shortLabel,
      ),
      href: soldHref,
    },
    {
      key: "received",
      title: RECEIVED_TITLE,
      value: formatBRL(current.receivedCents),
      secondaryLine: null,
      delta: buildDelta(
        current.receivedCents,
        previous === null ? null : previous.receivedCents,
        shortLabel,
      ),
      href: receivedHref,
    },
    {
      key: "profit",
      title: PROFIT_TITLE,
      value: formatBRL(current.profitCents),
      secondaryLine: `${MARGIN_PREFIX} ${formatMargin(current.profitCents, current.soldCents)}`,
      delta: buildDelta(
        current.profitCents,
        previous === null ? null : previous.profitCents,
        shortLabel,
      ),
      href: soldHref,
    },
    {
      key: "ticket",
      title: TICKET_TITLE,
      value: formatTicket(current.soldCents, current.soldCount),
      secondaryLine: clientsCountText(current.clientsCount),
      delta: ticketDelta,
      href: soldHref,
    },
  ];
}

/** Período sem nenhuma venda nem recebimento (RF-22): atalho "Registrar venda" abaixo da grade. */
export function hasNoMovement(
  current: DashboardPerformance["current"],
): boolean {
  return current.soldCount === ZERO && current.receivedCents === ZERO;
}
