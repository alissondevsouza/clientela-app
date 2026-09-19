import type {
  CreatePaymentMethod,
  CreateSaleInput,
  DeliveryStatus,
  PaymentCondition,
} from "@clientela/shared";
import { parseBRLToCents } from "./format";

// Extraído de `sale-form.tsx` para ser testável sem harness de componente (o
// projeto não tem jsdom/`@testing-library` — precedente `appointment-form-payload.ts`).
// Preço em reais → centavos, ou `undefined` quando o formato pt-BR não casa
// (`parseBRLToCents` retorna `null`). `undefined` no payload sinaliza "sem preço
// válido" — o form marca o erro de campo antes de enviar.
export const parseSaleFormPrice = (input: string): number | undefined => {
  const cents = parseBRLToCents(input);
  return cents === null ? undefined : cents;
};

export type SaleFormItemPayloadValues = {
  productId: string;
  price: string;
  qty: string;
};

export type SaleFormPayloadValues = {
  clientId: string | null;
  items: ReadonlyArray<SaleFormItemPayloadValues>;
  paymentMethod: CreatePaymentMethod;
  deliveryStatus: DeliveryStatus;
  paymentCondition: PaymentCondition;
  cardType: "debit" | "credit";
  installments: string;
  firstDueDate: string;
  // Dia local (`yyyy-mm-dd`) escolhido no campo "Data da venda" (RF-01).
  // Sempre enviado explícito — o contrato aceita ausente (⇒ hoje), mas o form
  // sempre tem um valor (default = hoje).
  soldOn: string;
};

// Monta o payload do contrato a partir dos valores do form (strings → centavos/
// números). Preço inválido vira `undefined` (o contrato o trata como "usar preço
// atual", mas o preço inválido já é sinalizado ANTES via mensagem própria do
// form); qty vazia vira `NaN` para cair na mensagem pt-BR do contrato.
export const buildSaleFormPayload = (
  values: SaleFormPayloadValues,
): CreateSaleInput => {
  const items = values.items.map((item) => {
    const cents = parseSaleFormPrice(item.price);
    const parsedQty = Number(item.qty.trim());
    return {
      productId: item.productId,
      qty: item.qty.trim().length === 0 ? Number.NaN : parsedQty,
      ...(cents === undefined ? {} : { unitPriceCents: cents }),
    };
  });

  return {
    clientId: values.clientId ?? undefined,
    items,
    paymentMethod: values.paymentMethod,
    deliveryStatus: values.deliveryStatus,
    paymentCondition: values.paymentCondition,
    soldOn: values.soldOn,
    installments:
      values.paymentCondition === "installments"
        ? values.installments.trim().length === 0
          ? Number.NaN
          : Number(values.installments.trim())
        : 1,
    ...(values.paymentMethod === "card" ? { cardType: values.cardType } : {}),
    ...(values.paymentCondition === "installments" &&
    values.firstDueDate.length > 0
      ? { firstDueDate: values.firstDueDate }
      : {}),
  };
};
