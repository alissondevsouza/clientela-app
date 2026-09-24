// Hrefs de drill-down e "Ver todos" da home (RF-20/RF-22/RF-23/RF-24/RF-25).
// Só monta URLs a partir de IDs — NUNCA nome/telefone na querystring
// (security.md/RF-26).

import type { ResolvedDashboardPeriod } from "@clientela/shared";

const SALES_PATH = "/crm/sales";
const RECEIVABLES_PATH = "/crm/sales/receivables";
const LEADS_PATH = "/crm/leads";
const PRODUCTS_PATH = "/crm/products";
const ORDERS_NEW_PATH = "/crm/orders/new";
const CLIENTS_PATH = "/crm/clients";
const APPOINTMENTS_PATH = "/crm/appointments";
const DASHBOARD_HOME_PATH = "/crm";

type PeriodBounds = Pick<ResolvedDashboardPeriod, "startDate" | "endDate">;

/** Cartões Vendido/Lucro/Ticket → lista de vendas do escopo Vendido no período (RF-22). */
export function soldDrillDownHref(period: PeriodBounds): string {
  const params = new URLSearchParams({
    status: "sold",
    soldFrom: period.startDate,
    soldTo: period.endDate,
  });
  return `${SALES_PATH}?${params.toString()}`;
}

/** Cartão Recebido → cobranças pagas no período (RF-22). */
export function receivedDrillDownHref(period: PeriodBounds): string {
  const params = new URLSearchParams({
    pending: "false",
    paidFrom: period.startDate,
    paidTo: period.endDate,
  });
  return `${RECEIVABLES_PATH}?${params.toString()}`;
}

/** Barra do gráfico de 12 meses → aquele mês isolado (RF-23). */
export function monthDashboardHref(month: string): string {
  const params = new URLSearchParams({ period: "month", month });
  return `${DASHBOARD_HOME_PATH}?${params.toString()}`;
}

/** "Ver todas" das cobranças do Hoje: atrasadas quando existem, senão a visão padrão (RF-20). */
export function collectionsViewAllHref(overdueCount: number): string {
  return overdueCount > 0 ? overdueReceivablesHref() : receivablesHref();
}

/** Resumo de cobranças do Hoje ("vencendo hoje"/"próximos 7 dias") → visão padrão (RF-20). */
export function collectionsSummaryHref(): string {
  return receivablesHref();
}

export type CollectionGroupTarget = {
  clientId: string | null;
  saleId: string | null;
};

/**
 * Grupo COM cliente → vendas em aberto dela; grupo SEM cliente → a venda
 * (RF-20). O contrato (`dashboardCollectionsGroupSchema`) garante exatamente
 * um dos dois preenchido — a ausência dos dois é violação de contrato da API,
 * não um estado de UI a tratar em silêncio.
 */
export function collectionGroupHref(group: CollectionGroupTarget): string {
  if (group.clientId !== null) {
    const params = new URLSearchParams({
      status: "open",
      clientId: group.clientId,
    });
    return `${SALES_PATH}?${params.toString()}`;
  }
  if (group.saleId !== null) {
    return saleHref(group.saleId);
  }
  throw new Error(
    "Grupo de cobrança sem cliente nem venda associada (contrato quebrado)",
  );
}

/** "Ver todas" das entregas pendentes (RF-20). */
export function deliveriesViewAllHref(): string {
  const params = new URLSearchParams({ status: "open", delivery: "pending" });
  return `${SALES_PATH}?${params.toString()}`;
}

/** "Ver todos" dos leads novos (RF-20). */
export function newLeadsViewAllHref(): string {
  const params = new URLSearchParams({ status: "new" });
  return `${LEADS_PATH}?${params.toString()}`;
}

/** "Criar pedido de reposição" das encomendas sem estoque (RF-20). */
export function restockOrderHref(): string {
  return ORDERS_NEW_PATH;
}

/** "Ver produtos" das encomendas sem estoque (RF-20). */
export function lowStockHref(): string {
  const params = new URLSearchParams({ lowStock: "true" });
  return `${PRODUCTS_PATH}?${params.toString()}`;
}

export function productsHref(): string {
  return PRODUCTS_PATH;
}

export function receivablesHref(): string {
  return RECEIVABLES_PATH;
}

export function overdueReceivablesHref(): string {
  const params = new URLSearchParams({ overdue: "true" });
  return `${RECEIVABLES_PATH}?${params.toString()}`;
}

export function saleHref(id: string): string {
  return `${SALES_PATH}/${id}`;
}

export function clientHref(id: string): string {
  return `${CLIENTS_PATH}/${id}`;
}

export function productHref(id: string): string {
  return `${PRODUCTS_PATH}/${id}`;
}

export function appointmentHref(id: string): string {
  return `${APPOINTMENTS_PATH}/${id}`;
}

export function appointmentsHref(): string {
  return APPOINTMENTS_PATH;
}
