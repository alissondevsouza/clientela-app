import {
  DATE_FILTER_MAX_DATE,
  type DeliveryStatus,
  deliveryStatusValues,
  SOLD_ON_MIN_DATE,
  salesListStatusFilterValues,
} from "@clientela/shared";
import { z } from "zod";
import { formatDateBr } from "./format";

// Mesmo piso/teto do schema compartilhado (A3, rodada 2): uma data fora da
// faixa (ex.: `?soldTo=9999-12-31`) é DESCARTADA aqui (cai no default, como
// qualquer outro parâmetro inválido) — nunca repassada à API, que rejeitaria
// com 422 e jogaria a página no `error.tsx` (RF-16 exige o default silencioso
// para link/favorito velho).
const isWithinDateFilterRange = (value: string): boolean =>
  value >= SOLD_ON_MIN_DATE && value <= DATE_FILTER_MAX_DATE;

const dateFilterSchema = z.iso
  .date()
  .refine(isWithinDateFilterRange)
  .optional()
  .catch(undefined);

// Estado de filtro/paginação da tela `/crm/sales` (RF-16), derivado da
// querystring (web.md/core.md: fronteira validada, nunca lança). É a fonte
// única para a page renderizar abas, formulário de período, chips removíveis,
// paginação e a chamada a `listSales` — todos a partir do MESMO objeto.
const PAGE_DEFAULT = 1;
export const SALES_LIST_PATH = "/crm/sales";

export type SalesListSearchParams = Record<
  string,
  string | string[] | undefined
>;

// `URLSearchParams`/`searchParams` do App Router repete a chave em array
// quando aparece mais de uma vez na URL — tratamos como parâmetro inválido
// (ignorado, cai no default) em vez de escolher um valor arbitrário.
const singleParam = (
  value: string | string[] | undefined,
): string | undefined => (typeof value === "string" ? value : undefined);

// Cada campo tem seu próprio fallback (`.catch`) — um valor inválido isolado
// nunca invalida os demais nem lança (mesmo padrão do `searchParamsSchema` que
// esta task substitui em `sales/page.tsx`).
const salesListFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).catch(PAGE_DEFAULT),
  status: z.enum(salesListStatusFilterValues).optional().catch(undefined),
  clientId: z.uuid().optional().catch(undefined),
  soldFrom: dateFilterSchema,
  soldTo: dateFilterSchema,
  delivery: z.enum(deliveryStatusValues).optional().catch(undefined),
});

export type SalesListFilters = z.output<typeof salesListFiltersSchema>;

/**
 * Sanea os `searchParams` de `/crm/sales` (RF-16): página/status/cliente/
 * datas/entrega inválidos caem no default (nunca lança); `clientId` só passa
 * quando é um uuid; `soldFrom > soldTo` é TROCADO (nunca vira 422 na API).
 */
export function parseSalesListSearchParams(
  searchParams: SalesListSearchParams,
): SalesListFilters {
  const parsed = salesListFiltersSchema.parse({
    page: singleParam(searchParams.page),
    status: singleParam(searchParams.status),
    clientId: singleParam(searchParams.clientId),
    soldFrom: singleParam(searchParams.soldFrom),
    soldTo: singleParam(searchParams.soldTo),
    delivery: singleParam(searchParams.delivery),
  });

  const { soldFrom, soldTo } = parsed;
  if (soldFrom !== undefined && soldTo !== undefined && soldFrom > soldTo) {
    return { ...parsed, soldFrom: soldTo, soldTo: soldFrom };
  }

  return parsed;
}

/**
 * Href de `/crm/sales` com os filtros de `base` mais `overrides` (RF-16): usada
 * por abas, formulário de período (via chips) e paginação. Uma chave presente
 * em `overrides` com valor `undefined` REMOVE aquele filtro. Trocar de aba/
 * filtro reseta a página para 1; só a paginação (`overrides.page`) preserva a
 * página pedida — qualquer outra troca sempre volta para a página 1.
 */
export function buildSalesListHref(
  base: SalesListFilters,
  overrides: Partial<SalesListFilters> = {},
): string {
  const isPaginating = Object.hasOwn(overrides, "page");
  const merged: SalesListFilters = {
    ...base,
    ...overrides,
    page: isPaginating ? (overrides.page ?? PAGE_DEFAULT) : PAGE_DEFAULT,
  };

  const query = new URLSearchParams();
  if (merged.page > PAGE_DEFAULT) {
    query.set("page", String(merged.page));
  }
  if (merged.status !== undefined) {
    query.set("status", merged.status);
  }
  if (merged.clientId !== undefined) {
    query.set("clientId", merged.clientId);
  }
  if (merged.soldFrom !== undefined) {
    query.set("soldFrom", merged.soldFrom);
  }
  if (merged.soldTo !== undefined) {
    query.set("soldTo", merged.soldTo);
  }
  if (merged.delivery !== undefined) {
    query.set("delivery", merged.delivery);
  }

  const queryString = query.toString();
  return queryString ? `${SALES_LIST_PATH}?${queryString}` : SALES_LIST_PATH;
}

export type SalesFilterChipKey = "period" | "delivery" | "client";

export type SalesFilterChip = {
  key: SalesFilterChipKey;
  label: string;
  removeHref: string;
};

// Rótulo do chip de "A entregar"/"Entregues" (RF-16) — DIFERENTE do rótulo do
// filtro de status na tela de entregas (`DELIVERY_STATUS_LABELS`): o chip é
// mais curto porque já está no contexto "filtro ativo de vendas".
const DELIVERY_FILTER_CHIP_LABELS: Record<DeliveryStatus, string> = {
  pending: "A entregar",
  delivered: "Entregues",
};

const CLIENT_FILTER_CHIP_LABEL = "Filtrado por cliente";
const EN_DASH = "–";

// Rótulo do chip de período: os dois lados, ou só um lado quando o outro está
// ausente (`soldFrom`/`soldTo` são independentes entre si — RF-14).
const periodFilterChipLabel = (
  soldFrom: string | undefined,
  soldTo: string | undefined,
): string | undefined => {
  if (soldFrom !== undefined && soldTo !== undefined) {
    return `Período: ${formatDateBr(soldFrom)} ${EN_DASH} ${formatDateBr(soldTo)}`;
  }
  if (soldFrom !== undefined) {
    return `A partir de ${formatDateBr(soldFrom)}`;
  }
  if (soldTo !== undefined) {
    return `Até ${formatDateBr(soldTo)}`;
  }
  return undefined;
};

/**
 * Filtros removíveis exibidos como chips (RF-16): período (um lado ou os
 * dois), entrega e cliente — NUNCA o nome da cliente na URL, só o id.
 * `status` (a aba ativa) não vira chip aqui — já é representado pela aba.
 */
export function activeSalesFilterChips(
  filters: SalesListFilters,
): SalesFilterChip[] {
  const chips: SalesFilterChip[] = [];

  const periodLabel = periodFilterChipLabel(filters.soldFrom, filters.soldTo);
  if (periodLabel !== undefined) {
    chips.push({
      key: "period",
      label: periodLabel,
      removeHref: buildSalesListHref(filters, {
        soldFrom: undefined,
        soldTo: undefined,
      }),
    });
  }

  if (filters.delivery !== undefined) {
    chips.push({
      key: "delivery",
      label: DELIVERY_FILTER_CHIP_LABELS[filters.delivery],
      removeHref: buildSalesListHref(filters, { delivery: undefined }),
    });
  }

  if (filters.clientId !== undefined) {
    chips.push({
      key: "client",
      label: CLIENT_FILTER_CHIP_LABEL,
      removeHref: buildSalesListHref(filters, { clientId: undefined }),
    });
  }

  return chips;
}

/** Há algum filtro ativo (aba ≠ "Todas" OU período/entrega/cliente). */
export function hasActiveSalesFilters(filters: SalesListFilters): boolean {
  return (
    filters.status !== undefined ||
    filters.clientId !== undefined ||
    filters.soldFrom !== undefined ||
    filters.soldTo !== undefined ||
    filters.delivery !== undefined
  );
}

/** "1 venda" / "N vendas" — contagem total exibida só com filtro ativo. */
export function salesResultCountText(total: number): string {
  return total === 1 ? "1 venda" : `${total} vendas`;
}

export type SalesEmptyState = "no_sales" | "no_results";

/**
 * `"no_sales"` (nenhuma venda cadastrada, tela sem filtro nenhum — inclui sem
 * aba) vira o vazio de primeiro uso com CTA de cadastro; `"no_results"`
 * (qualquer aba ou filtro ativo) vira "Nenhuma venda com estes filtros" +
 * "Limpar filtros" (RF-16).
 */
export function salesEmptyState(filters: SalesListFilters): SalesEmptyState {
  return hasActiveSalesFilters(filters) ? "no_results" : "no_sales";
}

// ---------------------------------------------------------------------------
// Cobranças (`/crm/sales/receivables`, RF-17): mesma abordagem dos helpers de
// vendas acima — `searchParams` saneados na fronteira (nunca lança), href
// builder central para abas/chip/paginação. Três visões: "pending" (padrão,
// aba "A receber"), "overdue" (aba "Atrasadas", `overdue=true`) e "paid"
// ("Recebidas no período" — só alcançável por link com `pending=false` +
// `paidFrom`/`paidTo`; NÃO é aba, aparece como chip removível que volta para
// "pending").
// ---------------------------------------------------------------------------

export const RECEIVABLES_LIST_PATH = "/crm/sales/receivables";

export type ReceivablesView = "pending" | "overdue" | "paid";

export type ReceivablesListFilters = {
  view: ReceivablesView;
  page: number;
  paidFrom?: string;
  paidTo?: string;
};

const receivablesSearchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(PAGE_DEFAULT),
  overdue: z.enum(["true", "false"]).optional().catch(undefined),
  pending: z.enum(["true", "false"]).optional().catch(undefined),
  paidFrom: dateFilterSchema,
  paidTo: dateFilterSchema,
});

/**
 * Sanea os `searchParams` de `/crm/sales/receivables` (RF-17): `overdue=true`
 * vira a visão "overdue"; `pending=false` com pelo menos uma data válida vira
 * "paid" (data inválida é DESCARTADA; De > Até é TROCADO, nunca descartado);
 * `pending=false` sem data nenhuma cai no padrão "pending"; qualquer
 * combinação totalmente inválida também cai em "pending". Nunca lança.
 */
export function parseReceivablesSearchParams(
  searchParams: SalesListSearchParams,
): ReceivablesListFilters {
  const parsed = receivablesSearchParamsSchema.parse({
    page: singleParam(searchParams.page),
    overdue: singleParam(searchParams.overdue),
    pending: singleParam(searchParams.pending),
    paidFrom: singleParam(searchParams.paidFrom),
    paidTo: singleParam(searchParams.paidTo),
  });

  if (parsed.overdue === "true") {
    return { view: "overdue", page: parsed.page };
  }

  if (parsed.pending === "false") {
    const { paidFrom, paidTo } = parsed;
    if (paidFrom === undefined && paidTo === undefined) {
      return { view: "pending", page: parsed.page };
    }
    if (paidFrom !== undefined && paidTo !== undefined && paidFrom > paidTo) {
      return {
        view: "paid",
        page: parsed.page,
        paidFrom: paidTo,
        paidTo: paidFrom,
      };
    }
    return { view: "paid", page: parsed.page, paidFrom, paidTo };
  }

  return { view: "pending", page: parsed.page };
}

/**
 * Href de `/crm/sales/receivables` com a visão/página/datas de `base` mais
 * `overrides` (RF-17) — usada por abas, chip e paginação. As datas só entram
 * na querystring quando a visão final é "paid"; trocar de visão reseta a
 * página (só `overrides.page` preserva a página pedida — mesmo padrão de
 * `buildSalesListHref`).
 */
export function buildReceivablesHref(
  base: ReceivablesListFilters,
  overrides: Partial<ReceivablesListFilters> = {},
): string {
  const isPaginating = Object.hasOwn(overrides, "page");
  const merged: ReceivablesListFilters = {
    ...base,
    ...overrides,
    page: isPaginating ? (overrides.page ?? PAGE_DEFAULT) : PAGE_DEFAULT,
  };

  const query = new URLSearchParams();
  if (merged.page > PAGE_DEFAULT) {
    query.set("page", String(merged.page));
  }
  if (merged.view === "overdue") {
    query.set("overdue", "true");
  }
  if (merged.view === "paid") {
    query.set("pending", "false");
    if (merged.paidFrom !== undefined) {
      query.set("paidFrom", merged.paidFrom);
    }
    if (merged.paidTo !== undefined) {
      query.set("paidTo", merged.paidTo);
    }
  }

  const queryString = query.toString();
  return queryString
    ? `${RECEIVABLES_LIST_PATH}?${queryString}`
    : RECEIVABLES_LIST_PATH;
}

export type ReceivablesViewTab = {
  view: "pending" | "overdue";
  label: string;
  href: string;
  active: boolean;
};

const RECEIVABLES_VIEW_TABS: ReadonlyArray<{
  view: "pending" | "overdue";
  label: string;
}> = [
  { view: "pending", label: "A receber" },
  { view: "overdue", label: "Atrasadas" },
];

/**
 * Abas "A receber"/"Atrasadas" (RF-17) — "Recebidas no período" NÃO é aba (só
 * alcançável por link); trocar de aba limpa as datas da visão "paid" (nunca
 * arrasta um filtro de data para uma aba que não o usa).
 */
export function receivablesViewTabs(
  filters: ReceivablesListFilters,
): ReceivablesViewTab[] {
  return RECEIVABLES_VIEW_TABS.map(({ view, label }) => ({
    view,
    label,
    href: buildReceivablesHref(filters, {
      view,
      paidFrom: undefined,
      paidTo: undefined,
    }),
    active: filters.view === view,
  }));
}

/**
 * "1 cobrança"/"N cobranças" (visões "pending"/"overdue") ou "1 recebimento"/
 * "N recebimentos" (visão "paid") — contagem total de cada visão (RF-17).
 */
export function receivablesCountText(
  view: ReceivablesView,
  total: number,
): string {
  if (view === "paid") {
    return total === 1 ? "1 recebimento" : `${total} recebimentos`;
  }
  return total === 1 ? "1 cobrança" : `${total} cobranças`;
}

/** Texto do vazio por visão (RF-17). */
export function receivablesEmptyText(view: ReceivablesView): string {
  if (view === "overdue") {
    return "Nenhuma cobrança atrasada";
  }
  if (view === "paid") {
    return "Nenhum recebimento neste período";
  }
  return "Ninguém te deve no momento";
}

/**
 * Rótulo do chip da visão "paid" (RF-17): "Recebidas de dd/mm/aaaa a
 * dd/mm/aaaa", ou só um lado quando o outro está ausente (`paidFrom`/
 * `paidTo` são independentes entre si).
 */
export function formatPaidRangeLabel(
  paidFrom?: string,
  paidTo?: string,
): string {
  if (paidFrom !== undefined && paidTo !== undefined) {
    return `Recebidas de ${formatDateBr(paidFrom)} a ${formatDateBr(paidTo)}`;
  }
  if (paidFrom !== undefined) {
    return `Recebidas a partir de ${formatDateBr(paidFrom)}`;
  }
  if (paidTo !== undefined) {
    return `Recebidas até ${formatDateBr(paidTo)}`;
  }
  return "Recebidas no período";
}
