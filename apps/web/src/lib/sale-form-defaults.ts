import type { DeliveryStatus, PaymentCondition } from "@clientela/shared";

// RF-16: reentrada do histórico deixada nos defaults atuais do formulário
// (`pending`/`on_delivery`) não baixa estoque, fica `open` para sempre,
// reserva o produto e nunca entra em faturamento nem em lucro — trocar só a
// entrega resolveria metade (com `on_delivery` a cobrança nasce com `paid_at`
// nulo e o status permanece `open`). Por isso os dois padrões mudam juntos.
// A usuária pode sempre alterar os dois depois — isto só decide o valor
// INICIAL do formulário.

export type SaleFormDateDefaults = {
  deliveryStatus: DeliveryStatus;
  paymentCondition: PaymentCondition;
};

// Padrões atuais (venda de hoje) — comportamento inalterado.
const TODAY_DEFAULTS: SaleFormDateDefaults = {
  deliveryStatus: "pending",
  paymentCondition: "on_delivery",
};

// Padrões do contrato (`packages/shared/src/sales.ts`) para venda retroativa.
const PAST_DEFAULTS: SaleFormDateDefaults = {
  deliveryStatus: "delivered",
  paymentCondition: "received",
};

/**
 * Deriva os padrões de entrega e condição de pagamento a partir da data
 * escolhida no formulário (`soldOnIso`, `yyyy-mm-dd`) comparada ao dia local
 * de hoje (`todayLocalDateIso`, mesmo formato — injetado, nunca lido do
 * relógio aqui, para a função continuar pura e determinística).
 *
 * `soldOnIso` anterior a hoje ⇒ padrões de venda retroativa (`delivered` +
 * `received`). `soldOnIso` igual a hoje ⇒ padrões atuais. `soldOnIso`
 * posterior a hoje não deveria ocorrer (o contrato rejeita data futura) —
 * tratado aqui como "hoje" por segurança, sem lançar.
 */
export function saleFormDateDefaults(
  soldOnIso: string,
  todayLocalDateIso: string,
): SaleFormDateDefaults {
  return soldOnIso < todayLocalDateIso ? PAST_DEFAULTS : TODAY_DEFAULTS;
}
