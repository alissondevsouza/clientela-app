import type { DeliveryStatus, PaymentStatus } from "@clientela/shared";

// Subtítulo do ciclo da venda (RF-12): `status` sozinho ("Em aberto") não diz o
// que falta. Entrega e pagamento são dimensões independentes, então o texto
// nasce do par — sempre em pt-BR e sempre em TEXTO (cor nunca carrega o estado
// sozinha). Venda cancelada não tem subtítulo: o badge já é terminal e a
// dívida foi anulada.
const CANCELED_PAYMENT_STATUS: PaymentStatus = "voided";

const SUBTITLES: Record<DeliveryStatus, Record<PaymentStatus, string>> = {
  pending: {
    pending: "Aguardando entrega e pagamento",
    partial: "Parcialmente paga, aguardando entrega",
    paid: "Paga, aguardando entrega",
    voided: "",
  },
  delivered: {
    pending: "Entregue, aguardando pagamento",
    partial: "Entregue, parcialmente paga",
    paid: "Entregue e paga",
    voided: "",
  },
};

export const saleLifecycleSubtitle = (sale: {
  deliveryStatus: DeliveryStatus;
  paymentStatus: PaymentStatus;
}): string | null => {
  if (sale.paymentStatus === CANCELED_PAYMENT_STATUS) {
    return null;
  }
  const subtitle = SUBTITLES[sale.deliveryStatus][sale.paymentStatus];
  return subtitle.length > 0 ? subtitle : null;
};
