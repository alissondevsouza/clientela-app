import {
  type DeliveryStatus,
  deliveryStatusValues,
  type PaymentStatus,
  paymentStatusValues,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { saleLifecycleSubtitle } from "./sale-lifecycle";

const sale = (
  deliveryStatus: DeliveryStatus,
  paymentStatus: PaymentStatus,
): { deliveryStatus: DeliveryStatus; paymentStatus: PaymentStatus } => ({
  deliveryStatus,
  paymentStatus,
});

describe("saleLifecycleSubtitle", () => {
  it("descreve o par entrega × pagamento em pt-BR", () => {
    expect(saleLifecycleSubtitle(sale("pending", "pending"))).toBe(
      "Aguardando entrega e pagamento",
    );
    expect(saleLifecycleSubtitle(sale("pending", "partial"))).toBe(
      "Parcialmente paga, aguardando entrega",
    );
    expect(saleLifecycleSubtitle(sale("pending", "paid"))).toBe(
      "Paga, aguardando entrega",
    );
    expect(saleLifecycleSubtitle(sale("delivered", "pending"))).toBe(
      "Entregue, aguardando pagamento",
    );
    expect(saleLifecycleSubtitle(sale("delivered", "partial"))).toBe(
      "Entregue, parcialmente paga",
    );
    expect(saleLifecycleSubtitle(sale("delivered", "paid"))).toBe(
      "Entregue e paga",
    );
  });

  it("venda anulada (cancelada) não recebe subtítulo — o badge já é terminal", () => {
    expect(saleLifecycleSubtitle(sale("pending", "voided"))).toBeNull();
    expect(saleLifecycleSubtitle(sale("delivered", "voided"))).toBeNull();
  });

  it("cobre toda a matriz sem estado sem resposta", () => {
    for (const deliveryStatus of deliveryStatusValues) {
      for (const paymentStatus of paymentStatusValues) {
        const subtitle = saleLifecycleSubtitle(
          sale(deliveryStatus, paymentStatus),
        );
        if (paymentStatus === "voided") {
          expect(subtitle).toBeNull();
          continue;
        }
        expect(subtitle).toBeTruthy();
      }
    }
  });
});
