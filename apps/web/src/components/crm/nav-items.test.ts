import { describe, expect, it } from "vitest";
import { CRM_NAV_ITEMS, isNavItemActive } from "./nav-items";

const INICIO_HREF = "/crm";
const CLIENTES_HREF = "/crm/clients";
const LEADS_HREF = "/crm/leads";
const ORDERS_HREF = "/crm/orders";
const APPOINTMENTS_HREF = "/crm/appointments";

describe("isNavItemActive", () => {
  it("ativa Início em match exato de /crm", () => {
    expect(isNavItemActive("/crm", INICIO_HREF)).toBe(true);
  });

  it("não ativa Início em sub-rota (/crm/clients)", () => {
    expect(isNavItemActive("/crm/clients", INICIO_HREF)).toBe(false);
  });

  it("ativa Clientes em match exato", () => {
    expect(isNavItemActive("/crm/clients", CLIENTES_HREF)).toBe(true);
  });

  it("ativa Clientes em sub-rota (/crm/clients/123)", () => {
    expect(isNavItemActive("/crm/clients/123", CLIENTES_HREF)).toBe(true);
  });

  it("não ativa Leads quando a rota é de Clientes", () => {
    expect(isNavItemActive("/crm/clients", LEADS_HREF)).toBe(false);
  });

  it("ativa Clientes ignorando trailing slash (/crm/clients/)", () => {
    expect(isNavItemActive("/crm/clients/", CLIENTES_HREF)).toBe(true);
  });

  it("ativa Início ignorando trailing slash (/crm/)", () => {
    expect(isNavItemActive("/crm/", INICIO_HREF)).toBe(true);
  });

  it("não ativa Clientes para prefixo parcial (/crm/clientsfoo)", () => {
    expect(isNavItemActive("/crm/clientsfoo", CLIENTES_HREF)).toBe(false);
  });

  it("ativa Pedidos em match exato", () => {
    expect(isNavItemActive("/crm/orders", ORDERS_HREF)).toBe(true);
  });

  it("ativa Pedidos em sub-rota (/crm/orders/123)", () => {
    expect(isNavItemActive("/crm/orders/123", ORDERS_HREF)).toBe(true);
  });

  it("inclui a entrada Pedidos em CRM_NAV_ITEMS apontando para /crm/orders", () => {
    expect(
      CRM_NAV_ITEMS.some(
        (item) => item.href === ORDERS_HREF && item.label === "Pedidos",
      ),
    ).toBe(true);
  });

  it("inclui a entrada Agenda em CRM_NAV_ITEMS apontando para /crm/appointments", () => {
    expect(
      CRM_NAV_ITEMS.some(
        (item) => item.href === APPOINTMENTS_HREF && item.label === "Agenda",
      ),
    ).toBe(true);
  });

  it("ativa Agenda em match exato", () => {
    expect(isNavItemActive("/crm/appointments", APPOINTMENTS_HREF)).toBe(true);
  });

  it("ativa Agenda em sub-rota (/crm/appointments/123)", () => {
    expect(isNavItemActive("/crm/appointments/123", APPOINTMENTS_HREF)).toBe(
      true,
    );
  });

  it("não ativa Agenda quando a rota é de Pedidos", () => {
    expect(isNavItemActive("/crm/orders", APPOINTMENTS_HREF)).toBe(false);
  });
});
