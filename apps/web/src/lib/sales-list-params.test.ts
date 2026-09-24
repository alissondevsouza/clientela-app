import { describe, expect, it } from "vitest";
import {
  activeSalesFilterChips,
  buildReceivablesHref,
  buildSalesListHref,
  formatPaidRangeLabel,
  hasActiveSalesFilters,
  parseReceivablesSearchParams,
  parseSalesListSearchParams,
  type ReceivablesListFilters,
  receivablesCountText,
  receivablesEmptyText,
  receivablesViewTabs,
  type SalesListFilters,
  salesEmptyState,
  salesResultCountText,
} from "./sales-list-params";

const CLIENT_ID = "0198c5f2-6b1a-7c3d-8e9f-1234567890ab";

const baseFilters = (
  overrides: Partial<SalesListFilters> = {},
): SalesListFilters => ({
  page: 1,
  ...overrides,
});

describe("parseSalesListSearchParams", () => {
  it("searchParams vazio cai no default (página 1, sem filtros)", () => {
    expect(parseSalesListSearchParams({})).toEqual({ page: 1 });
  });

  it("página inválida (texto, zero, negativo) cai no default", () => {
    expect(parseSalesListSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseSalesListSearchParams({ page: "0" }).page).toBe(1);
    expect(parseSalesListSearchParams({ page: "-1" }).page).toBe(1);
  });

  it("página válida é coagida para número", () => {
    expect(parseSalesListSearchParams({ page: "3" }).page).toBe(3);
  });

  it("status fora do enum cai no default (undefined)", () => {
    expect(
      parseSalesListSearchParams({ status: "not-a-status" }).status,
    ).toBeUndefined();
  });

  it("status válido, inclusive 'sold', é aceito", () => {
    expect(parseSalesListSearchParams({ status: "sold" }).status).toBe("sold");
    expect(parseSalesListSearchParams({ status: "open" }).status).toBe("open");
  });

  it("clientId só é aceito quando é um uuid válido", () => {
    expect(parseSalesListSearchParams({ clientId: CLIENT_ID }).clientId).toBe(
      CLIENT_ID,
    );
    expect(
      parseSalesListSearchParams({ clientId: "not-a-uuid" }).clientId,
    ).toBeUndefined();
  });

  it("delivery fora do enum cai no default (undefined)", () => {
    expect(
      parseSalesListSearchParams({ delivery: "shipped" }).delivery,
    ).toBeUndefined();
    expect(parseSalesListSearchParams({ delivery: "pending" }).delivery).toBe(
      "pending",
    );
  });

  it("datas inválidas são descartadas", () => {
    const result = parseSalesListSearchParams({
      soldFrom: "32/13/2026",
      soldTo: "not-a-date",
    });
    expect(result.soldFrom).toBeUndefined();
    expect(result.soldTo).toBeUndefined();
  });

  // A3 (rodada 2): "9999-12-31" passa no formato ISO, mas a API rejeita com
  // 422 (fora do piso/teto) — se a web repassasse o valor, `/crm/sales`
  // cairia no `error.tsx` em vez de mostrar a lista sem o filtro (RF-16).
  it("soldFrom/soldTo muito no futuro (ex.: 9999-12-31) são descartados, nunca repassados", () => {
    const result = parseSalesListSearchParams({
      soldFrom: "9999-12-31",
      soldTo: "9999-12-31",
    });
    expect(result.soldFrom).toBeUndefined();
    expect(result.soldTo).toBeUndefined();
  });

  it("soldFrom/soldTo anteriores a 2015-01-01 são descartados", () => {
    const result = parseSalesListSearchParams({ soldFrom: "0099-01-01" });
    expect(result.soldFrom).toBeUndefined();
  });

  it("soldFrom/soldTo exatamente nos limites (2015-01-01 e 2099-12-31) são preservados", () => {
    const result = parseSalesListSearchParams({
      soldFrom: "2015-01-01",
      soldTo: "2099-12-31",
    });
    expect(result.soldFrom).toBe("2015-01-01");
    expect(result.soldTo).toBe("2099-12-31");
  });

  it("soldFrom > soldTo: as datas são TROCADAS, nunca descartadas", () => {
    const result = parseSalesListSearchParams({
      soldFrom: "2026-09-23",
      soldTo: "2026-09-01",
    });
    expect(result.soldFrom).toBe("2026-09-01");
    expect(result.soldTo).toBe("2026-09-23");
  });

  it("soldFrom <= soldTo permanece na ordem original", () => {
    const result = parseSalesListSearchParams({
      soldFrom: "2026-09-01",
      soldTo: "2026-09-23",
    });
    expect(result.soldFrom).toBe("2026-09-01");
    expect(result.soldTo).toBe("2026-09-23");
  });

  it("array no mesmo parâmetro é ignorado (cai no default)", () => {
    const result = parseSalesListSearchParams({
      status: ["open", "completed"],
      page: ["2", "3"],
    });
    expect(result.status).toBeUndefined();
    expect(result.page).toBe(1);
  });

  it("nunca lança, mesmo com todos os campos inválidos ao mesmo tempo", () => {
    expect(() =>
      parseSalesListSearchParams({
        page: "abc",
        status: "whatever",
        clientId: "123",
        soldFrom: "xx",
        soldTo: "yy",
        delivery: "??",
      }),
    ).not.toThrow();
  });
});

describe("buildSalesListHref", () => {
  it("sem filtros nem overrides: href da lista sem querystring", () => {
    expect(buildSalesListHref(baseFilters())).toBe("/crm/sales");
  });

  it("preserva os filtros existentes ao paginar (overrides.page)", () => {
    const filters = baseFilters({
      status: "sold",
      soldFrom: "2026-09-01",
      soldTo: "2026-09-23",
      delivery: "pending",
      clientId: CLIENT_ID,
    });

    const href = buildSalesListHref(filters, { page: 2 });

    expect(href).toBe(
      `/crm/sales?page=2&status=sold&clientId=${CLIENT_ID}&soldFrom=2026-09-01&soldTo=2026-09-23&delivery=pending`,
    );
  });

  it("trocar de aba (status) reseta a página para 1, mas preserva os demais filtros", () => {
    const filters = baseFilters({
      page: 3,
      soldFrom: "2026-09-01",
      soldTo: "2026-09-23",
    });

    const href = buildSalesListHref(filters, { status: "open" });

    expect(href).toBe(
      "/crm/sales?status=open&soldFrom=2026-09-01&soldTo=2026-09-23",
    );
  });

  it("remover um filtro (override undefined) tira só aquele parâmetro e reseta a página", () => {
    const filters = baseFilters({
      page: 4,
      status: "sold",
      soldFrom: "2026-09-01",
      soldTo: "2026-09-23",
    });

    const href = buildSalesListHref(filters, {
      soldFrom: undefined,
      soldTo: undefined,
    });

    expect(href).toBe("/crm/sales?status=sold");
  });

  it("'Todas' (status undefined) some da querystring", () => {
    const filters = baseFilters({ status: "open" });

    const href = buildSalesListHref(filters, { status: undefined });

    expect(href).toBe("/crm/sales");
  });
});

describe("activeSalesFilterChips", () => {
  it("sem filtros: nenhum chip", () => {
    expect(activeSalesFilterChips(baseFilters())).toEqual([]);
  });

  it("período completo: chip 'Período: de – até', removível preservando os demais filtros", () => {
    const filters = baseFilters({
      status: "sold",
      soldFrom: "2026-09-01",
      soldTo: "2026-09-23",
    });

    const chips = activeSalesFilterChips(filters);

    expect(chips).toHaveLength(1);
    expect(chips[0]?.key).toBe("period");
    expect(chips[0]?.label).toBe("Período: 01/09/2026 – 23/09/2026");
    expect(chips[0]?.removeHref).toBe("/crm/sales?status=sold");
  });

  it("só soldFrom: chip 'A partir de dd/mm/aaaa'", () => {
    const chips = activeSalesFilterChips(
      baseFilters({ soldFrom: "2026-09-01" }),
    );
    expect(chips[0]?.label).toBe("A partir de 01/09/2026");
  });

  it("só soldTo: chip 'Até dd/mm/aaaa'", () => {
    const chips = activeSalesFilterChips(baseFilters({ soldTo: "2026-09-23" }));
    expect(chips[0]?.label).toBe("Até 23/09/2026");
  });

  it("delivery=pending vira chip 'A entregar'; delivered vira 'Entregues'", () => {
    expect(
      activeSalesFilterChips(baseFilters({ delivery: "pending" }))[0]?.label,
    ).toBe("A entregar");
    expect(
      activeSalesFilterChips(baseFilters({ delivery: "delivered" }))[0]?.label,
    ).toBe("Entregues");
  });

  it("clientId vira chip 'Filtrado por cliente' — o id NUNCA aparece no rótulo", () => {
    const chips = activeSalesFilterChips(baseFilters({ clientId: CLIENT_ID }));
    expect(chips[0]?.label).toBe("Filtrado por cliente");
    expect(chips[0]?.label).not.toContain(CLIENT_ID);
    expect(chips[0]?.removeHref).toBe("/crm/sales");
  });

  it("todos os filtros ativos: três chips, na ordem período/entrega/cliente", () => {
    const filters = baseFilters({
      soldFrom: "2026-09-01",
      soldTo: "2026-09-23",
      delivery: "delivered",
      clientId: CLIENT_ID,
    });

    const chips = activeSalesFilterChips(filters);

    expect(chips.map((chip) => chip.key)).toEqual([
      "period",
      "delivery",
      "client",
    ]);
  });
});

describe("hasActiveSalesFilters", () => {
  it("false sem nenhum filtro nem aba", () => {
    expect(hasActiveSalesFilters(baseFilters())).toBe(false);
  });

  it("true com aba ativa (status), mesmo sem outros filtros", () => {
    expect(hasActiveSalesFilters(baseFilters({ status: "open" }))).toBe(true);
  });

  it("true com qualquer filtro isolado (período, entrega ou cliente)", () => {
    expect(hasActiveSalesFilters(baseFilters({ soldFrom: "2026-09-01" }))).toBe(
      true,
    );
    expect(hasActiveSalesFilters(baseFilters({ delivery: "pending" }))).toBe(
      true,
    );
    expect(hasActiveSalesFilters(baseFilters({ clientId: CLIENT_ID }))).toBe(
      true,
    );
  });
});

describe("salesResultCountText", () => {
  it("singular para 1", () => {
    expect(salesResultCountText(1)).toBe("1 venda");
  });

  it("plural para 0 e para N > 1", () => {
    expect(salesResultCountText(0)).toBe("0 vendas");
    expect(salesResultCountText(5)).toBe("5 vendas");
  });
});

describe("salesEmptyState", () => {
  it("'no_sales' sem filtro nem aba", () => {
    expect(salesEmptyState(baseFilters())).toBe("no_sales");
  });

  it("'no_results' com aba ativa", () => {
    expect(salesEmptyState(baseFilters({ status: "completed" }))).toBe(
      "no_results",
    );
  });

  it("'no_results' com filtro de período/entrega/cliente ativo", () => {
    expect(salesEmptyState(baseFilters({ soldFrom: "2026-09-01" }))).toBe(
      "no_results",
    );
    expect(salesEmptyState(baseFilters({ delivery: "pending" }))).toBe(
      "no_results",
    );
    expect(salesEmptyState(baseFilters({ clientId: CLIENT_ID }))).toBe(
      "no_results",
    );
  });
});

const baseReceivablesFilters = (
  overrides: Partial<ReceivablesListFilters> = {},
): ReceivablesListFilters => ({
  view: "pending",
  page: 1,
  ...overrides,
});

describe("parseReceivablesSearchParams", () => {
  it("searchParams vazio cai no default (visão pending, página 1)", () => {
    expect(parseReceivablesSearchParams({})).toEqual({
      view: "pending",
      page: 1,
    });
  });

  it("página inválida (texto, zero, negativo) cai no default", () => {
    expect(parseReceivablesSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseReceivablesSearchParams({ page: "0" }).page).toBe(1);
    expect(parseReceivablesSearchParams({ page: "-1" }).page).toBe(1);
  });

  it("overdue=true vira a visão 'overdue'", () => {
    expect(parseReceivablesSearchParams({ overdue: "true" })).toEqual({
      view: "overdue",
      page: 1,
    });
  });

  it("overdue com valor diferente de 'true' é ignorado (cai em pending)", () => {
    expect(parseReceivablesSearchParams({ overdue: "false" }).view).toBe(
      "pending",
    );
    expect(parseReceivablesSearchParams({ overdue: "whatever" }).view).toBe(
      "pending",
    );
  });

  it("pending=false com paidFrom e paidTo válidos vira a visão 'paid'", () => {
    const result = parseReceivablesSearchParams({
      pending: "false",
      paidFrom: "2026-09-01",
      paidTo: "2026-09-23",
    });
    expect(result).toEqual({
      view: "paid",
      page: 1,
      paidFrom: "2026-09-01",
      paidTo: "2026-09-23",
    });
  });

  it("pending=false só com paidFrom (ou só paidTo) também vira 'paid'", () => {
    expect(
      parseReceivablesSearchParams({
        pending: "false",
        paidFrom: "2026-09-01",
      }),
    ).toEqual({ view: "paid", page: 1, paidFrom: "2026-09-01" });

    expect(
      parseReceivablesSearchParams({
        pending: "false",
        paidTo: "2026-09-23",
      }),
    ).toEqual({ view: "paid", page: 1, paidTo: "2026-09-23" });
  });

  it("paidFrom > paidTo: as datas são TROCADAS, nunca descartadas", () => {
    const result = parseReceivablesSearchParams({
      pending: "false",
      paidFrom: "2026-09-23",
      paidTo: "2026-09-01",
    });
    expect(result.paidFrom).toBe("2026-09-01");
    expect(result.paidTo).toBe("2026-09-23");
  });

  it("datas inválidas são descartadas; sem data válida nenhuma, cai em 'pending'", () => {
    const result = parseReceivablesSearchParams({
      pending: "false",
      paidFrom: "32/13/2026",
      paidTo: "not-a-date",
    });
    expect(result).toEqual({ view: "pending", page: 1 });
  });

  // A3 (rodada 2): mesma proteção de `parseSalesListSearchParams` — nunca
  // repassa uma data-limite para a API (que rejeitaria com 422 e jogaria a
  // página no `error.tsx`).
  it("paidFrom/paidTo muito no futuro (ex.: 9999-12-31) são descartados; sem data válida nenhuma, cai em 'pending'", () => {
    const result = parseReceivablesSearchParams({
      pending: "false",
      paidFrom: "9999-12-31",
      paidTo: "9999-12-31",
    });
    expect(result).toEqual({ view: "pending", page: 1 });
  });

  it("pending=false sem nenhuma data cai no padrão 'pending'", () => {
    expect(parseReceivablesSearchParams({ pending: "false" })).toEqual({
      view: "pending",
      page: 1,
    });
  });

  it("pending=true (ou ausente) com datas é ignorado — datas só valem com pending=false", () => {
    const result = parseReceivablesSearchParams({
      pending: "true",
      paidFrom: "2026-09-01",
      paidTo: "2026-09-23",
    });
    expect(result.view).toBe("pending");
  });

  it("array no mesmo parâmetro é ignorado (cai no default)", () => {
    const result = parseReceivablesSearchParams({
      overdue: ["true", "false"],
      page: ["2", "3"],
    });
    expect(result).toEqual({ view: "pending", page: 1 });
  });

  it("nunca lança, mesmo com todos os campos inválidos ao mesmo tempo", () => {
    expect(() =>
      parseReceivablesSearchParams({
        page: "abc",
        overdue: "whatever",
        pending: "whatever",
        paidFrom: "xx",
        paidTo: "yy",
      }),
    ).not.toThrow();
  });
});

describe("buildReceivablesHref", () => {
  it("visão pending sem overrides: href da lista sem querystring", () => {
    expect(buildReceivablesHref(baseReceivablesFilters())).toBe(
      "/crm/sales/receivables",
    );
  });

  it("visão overdue: '?overdue=true'", () => {
    expect(
      buildReceivablesHref(baseReceivablesFilters({ view: "overdue" })),
    ).toBe("/crm/sales/receivables?overdue=true");
  });

  it("visão paid preserva as datas na querystring", () => {
    const filters = baseReceivablesFilters({
      view: "paid",
      paidFrom: "2026-09-01",
      paidTo: "2026-09-23",
    });
    expect(buildReceivablesHref(filters)).toBe(
      "/crm/sales/receivables?pending=false&paidFrom=2026-09-01&paidTo=2026-09-23",
    );
  });

  it("paginação (overrides.page) preserva a visão e as datas", () => {
    const filters = baseReceivablesFilters({
      view: "paid",
      paidFrom: "2026-09-01",
      paidTo: "2026-09-23",
    });
    expect(buildReceivablesHref(filters, { page: 2 })).toBe(
      "/crm/sales/receivables?page=2&pending=false&paidFrom=2026-09-01&paidTo=2026-09-23",
    );
  });

  it("trocar de visão reseta a página para 1", () => {
    const filters = baseReceivablesFilters({ view: "overdue", page: 3 });
    expect(buildReceivablesHref(filters, { view: "pending" })).toBe(
      "/crm/sales/receivables",
    );
  });

  it("trocar para pending/overdue e limpar as datas explicitamente remove o pending=false", () => {
    const filters = baseReceivablesFilters({
      view: "paid",
      page: 2,
      paidFrom: "2026-09-01",
      paidTo: "2026-09-23",
    });
    const href = buildReceivablesHref(filters, {
      view: "pending",
      paidFrom: undefined,
      paidTo: undefined,
    });
    expect(href).toBe("/crm/sales/receivables");
  });
});

describe("receivablesViewTabs", () => {
  it("duas abas: 'A receber' (pending) e 'Atrasadas' (overdue)", () => {
    const tabs = receivablesViewTabs(baseReceivablesFilters());
    expect(tabs.map((tab) => tab.label)).toEqual(["A receber", "Atrasadas"]);
  });

  it("aba ativa corresponde à visão atual", () => {
    const tabs = receivablesViewTabs(
      baseReceivablesFilters({ view: "overdue" }),
    );
    expect(tabs.find((tab) => tab.view === "pending")?.active).toBe(false);
    expect(tabs.find((tab) => tab.view === "overdue")?.active).toBe(true);
  });

  it("na visão 'paid', nenhuma aba fica ativa e os hrefs limpam as datas", () => {
    const filters = baseReceivablesFilters({
      view: "paid",
      paidFrom: "2026-09-01",
      paidTo: "2026-09-23",
    });
    const tabs = receivablesViewTabs(filters);
    expect(tabs.every((tab) => tab.active === false)).toBe(true);
    expect(tabs.find((tab) => tab.view === "pending")?.href).toBe(
      "/crm/sales/receivables",
    );
    expect(tabs.find((tab) => tab.view === "overdue")?.href).toBe(
      "/crm/sales/receivables?overdue=true",
    );
  });
});

describe("receivablesCountText", () => {
  it("singular/plural para pending e overdue: 'cobrança'/'cobranças'", () => {
    expect(receivablesCountText("pending", 1)).toBe("1 cobrança");
    expect(receivablesCountText("pending", 0)).toBe("0 cobranças");
    expect(receivablesCountText("overdue", 5)).toBe("5 cobranças");
  });

  it("singular/plural para paid: 'recebimento'/'recebimentos'", () => {
    expect(receivablesCountText("paid", 1)).toBe("1 recebimento");
    expect(receivablesCountText("paid", 0)).toBe("0 recebimentos");
    expect(receivablesCountText("paid", 3)).toBe("3 recebimentos");
  });
});

describe("receivablesEmptyText", () => {
  it("pending: 'Ninguém te deve no momento'", () => {
    expect(receivablesEmptyText("pending")).toBe("Ninguém te deve no momento");
  });

  it("overdue: 'Nenhuma cobrança atrasada'", () => {
    expect(receivablesEmptyText("overdue")).toBe("Nenhuma cobrança atrasada");
  });

  it("paid: 'Nenhum recebimento neste período'", () => {
    expect(receivablesEmptyText("paid")).toBe(
      "Nenhum recebimento neste período",
    );
  });
});

describe("formatPaidRangeLabel", () => {
  it("os dois lados: 'Recebidas de dd/mm/aaaa a dd/mm/aaaa'", () => {
    expect(formatPaidRangeLabel("2026-09-01", "2026-09-23")).toBe(
      "Recebidas de 01/09/2026 a 23/09/2026",
    );
  });

  it("só paidFrom: 'Recebidas a partir de dd/mm/aaaa'", () => {
    expect(formatPaidRangeLabel("2026-09-01", undefined)).toBe(
      "Recebidas a partir de 01/09/2026",
    );
  });

  it("só paidTo: 'Recebidas até dd/mm/aaaa'", () => {
    expect(formatPaidRangeLabel(undefined, "2026-09-23")).toBe(
      "Recebidas até 23/09/2026",
    );
  });

  it("nenhuma data: fallback 'Recebidas no período'", () => {
    expect(formatPaidRangeLabel(undefined, undefined)).toBe(
      "Recebidas no período",
    );
  });
});
