import { describe, expect, it } from "vitest";
import {
  appointmentHref,
  appointmentsHref,
  clientHref,
  collectionGroupHref,
  collectionsSummaryHref,
  collectionsViewAllHref,
  deliveriesViewAllHref,
  lowStockHref,
  monthDashboardHref,
  newLeadsViewAllHref,
  overdueReceivablesHref,
  productHref,
  productsHref,
  receivablesHref,
  receivedDrillDownHref,
  restockOrderHref,
  saleHref,
  soldDrillDownHref,
} from "./dashboard-links";

const PERIOD_BOUNDS = { startDate: "2026-09-01", endDate: "2026-09-23" };
const CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const SALE_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e60";
const PRODUCT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e61";
const APPOINTMENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e62";

describe("dashboard-links (RF-20/22/23/24/25)", () => {
  it("soldDrillDownHref", () => {
    expect(soldDrillDownHref(PERIOD_BOUNDS)).toBe(
      "/crm/sales?status=sold&soldFrom=2026-09-01&soldTo=2026-09-23",
    );
  });

  it("receivedDrillDownHref", () => {
    expect(receivedDrillDownHref(PERIOD_BOUNDS)).toBe(
      "/crm/sales/receivables?pending=false&paidFrom=2026-09-01&paidTo=2026-09-23",
    );
  });

  it("monthDashboardHref", () => {
    expect(monthDashboardHref("2026-08")).toBe(
      "/crm?period=month&month=2026-08",
    );
  });

  it("collectionsViewAllHref: com atrasadas vai para overdue=true", () => {
    expect(collectionsViewAllHref(2)).toBe(
      "/crm/sales/receivables?overdue=true",
    );
  });

  it("collectionsViewAllHref: sem atrasadas vai para a visão padrão", () => {
    expect(collectionsViewAllHref(0)).toBe("/crm/sales/receivables");
  });

  it("collectionsSummaryHref", () => {
    expect(collectionsSummaryHref()).toBe("/crm/sales/receivables");
  });

  it("collectionGroupHref: grupo com cliente vai para as vendas abertas dela", () => {
    expect(collectionGroupHref({ clientId: CLIENT_ID, saleId: null })).toBe(
      `/crm/sales?status=open&clientId=${CLIENT_ID}`,
    );
  });

  it("collectionGroupHref: grupo sem cliente vai para a venda", () => {
    expect(collectionGroupHref({ clientId: null, saleId: SALE_ID })).toBe(
      `/crm/sales/${SALE_ID}`,
    );
  });

  it("collectionGroupHref: sem cliente e sem venda é violação de contrato (lança)", () => {
    expect(() =>
      collectionGroupHref({ clientId: null, saleId: null }),
    ).toThrow();
  });

  it("deliveriesViewAllHref", () => {
    expect(deliveriesViewAllHref()).toBe(
      "/crm/sales?status=open&delivery=pending",
    );
  });

  it("newLeadsViewAllHref", () => {
    expect(newLeadsViewAllHref()).toBe("/crm/leads?status=new");
  });

  it("restockOrderHref", () => {
    expect(restockOrderHref()).toBe("/crm/orders/new");
  });

  it("lowStockHref", () => {
    expect(lowStockHref()).toBe("/crm/products?lowStock=true");
  });

  it("productsHref / receivablesHref / overdueReceivablesHref", () => {
    expect(productsHref()).toBe("/crm/products");
    expect(receivablesHref()).toBe("/crm/sales/receivables");
    expect(overdueReceivablesHref()).toBe(
      "/crm/sales/receivables?overdue=true",
    );
  });

  it("saleHref / clientHref / productHref / appointmentHref / appointmentsHref", () => {
    expect(saleHref(SALE_ID)).toBe(`/crm/sales/${SALE_ID}`);
    expect(clientHref(CLIENT_ID)).toBe(`/crm/clients/${CLIENT_ID}`);
    expect(productHref(PRODUCT_ID)).toBe(`/crm/products/${PRODUCT_ID}`);
    expect(appointmentHref(APPOINTMENT_ID)).toBe(
      `/crm/appointments/${APPOINTMENT_ID}`,
    );
    expect(appointmentsHref()).toBe("/crm/appointments");
  });

  it("nenhum href de cliente/venda/produto carrega nome ou telefone — só o id (RF-26)", () => {
    const hrefs = [
      collectionGroupHref({ clientId: CLIENT_ID, saleId: null }),
      saleHref(SALE_ID),
      clientHref(CLIENT_ID),
      productHref(PRODUCT_ID),
    ];
    for (const href of hrefs) {
      expect(href).not.toMatch(/name=|whatsapp=|phone=/);
    }
  });
});
