import { describe, expect, it } from "vitest";
import { saleDeleteWarning } from "./sale-delete-warning";

describe("saleDeleteWarning", () => {
  it("venda entregue e não cancelada: avisa que os itens voltam ao estoque", () => {
    const warning = saleDeleteWarning({
      delivered: true,
      canceled: false,
      paidCents: 0,
    });

    expect(warning).toMatch(/voltarão ao estoque/);
    expect(warning).not.toMatch(/reserva dos itens/);
    expect(warning).toMatch(/cobranças desta venda serão removidas/);
    expect(warning).toMatch(/compromisso da agenda/);
    expect(warning).toMatch(/não pode ser desfeita/);
  });

  it("venda aberta não entregue: não mexe em estoque, libera a reserva", () => {
    const warning = saleDeleteWarning({
      delivered: false,
      canceled: false,
      paidCents: 0,
    });

    expect(warning).toMatch(/estoque não será alterado/);
    expect(warning).toMatch(/reserva dos itens será liberada/);
    expect(warning).not.toMatch(/voltarão ao estoque/);
  });

  it("venda cancelada: não mexe em estoque (o cancelamento já devolveu)", () => {
    const warning = saleDeleteWarning({
      delivered: true,
      canceled: true,
      paidCents: 0,
    });

    expect(warning).toMatch(/estoque não será alterado/);
    expect(warning).toMatch(/o cancelamento já devolveu/);
    expect(warning).not.toMatch(/voltarão ao estoque/);
  });

  it("venda cancelada tem prioridade sobre entregue mesmo se nunca foi entregue", () => {
    const warning = saleDeleteWarning({
      delivered: false,
      canceled: true,
      paidCents: 0,
    });

    expect(warning).toMatch(/o cancelamento já devolveu/);
  });

  it("com valor já recebido: menciona o valor formatado em R$ que sai do histórico", () => {
    const warning = saleDeleteWarning({
      delivered: true,
      canceled: false,
      paidCents: 15000,
    });

    expect(warning).toMatch(/R\$\s*150,00/);
    expect(warning).toMatch(/sairá do histórico/);
  });

  it("sem valor recebido: não menciona valor nenhum", () => {
    const warning = saleDeleteWarning({
      delivered: true,
      canceled: false,
      paidCents: 0,
    });

    expect(warning).not.toMatch(/sairá do histórico/);
  });
});
