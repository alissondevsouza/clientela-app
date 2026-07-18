import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./nav-items";

const INICIO_HREF = "/crm";
const CLIENTES_HREF = "/crm/clients";
const LEADS_HREF = "/crm/leads";

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
});
