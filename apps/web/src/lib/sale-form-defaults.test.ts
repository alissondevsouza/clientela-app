import { describe, expect, it } from "vitest";
import { saleFormDateDefaults } from "./sale-form-defaults";

const TODAY = "2026-09-19";

describe("saleFormDateDefaults", () => {
  it("data passada vira entregue + já recebido (RF-16)", () => {
    expect(saleFormDateDefaults("2026-09-18", TODAY)).toEqual({
      deliveryStatus: "delivered",
      paymentCondition: "received",
    });
  });

  it("hoje mantém os padrões atuais (aguardando entrega + a receber na entrega)", () => {
    expect(saleFormDateDefaults(TODAY, TODAY)).toEqual({
      deliveryStatus: "pending",
      paymentCondition: "on_delivery",
    });
  });

  it("o limite é exclusivo: ontem é passado, hoje não é", () => {
    const yesterday = "2026-09-18";
    expect(saleFormDateDefaults(yesterday, TODAY)).toEqual({
      deliveryStatus: "delivered",
      paymentCondition: "received",
    });
    expect(saleFormDateDefaults(TODAY, TODAY)).toEqual({
      deliveryStatus: "pending",
      paymentCondition: "on_delivery",
    });
  });

  it("data muito antiga (histórico) também vira entregue + já recebido", () => {
    expect(saleFormDateDefaults("2015-01-01", TODAY)).toEqual({
      deliveryStatus: "delivered",
      paymentCondition: "received",
    });
  });
});
