import { formatBRL } from "./format";

// RF-08/RF-09: o texto de consequência da confirmação de exclusão depende do
// estado REAL da venda — não é um aviso genérico. Três casos de estoque,
// mutuamente exclusivos: (a) entregue e não cancelada ⇒ os itens voltam ao
// estoque; (b) aberta e não entregue ⇒ nunca debitou, só libera a reserva;
// (c) cancelada ⇒ o cancelamento já devolveu (se havia o que devolver), a
// exclusão não mexe em nada — creditar de novo aqui duplicaria o estoque.
// `canceled` tem prioridade sobre `delivered`: uma venda cancelada pode ter
// sido entregue antes de cancelar, e o cancelamento já reverteu esse estoque.
export type SaleDeleteWarningInput = {
  delivered: boolean;
  canceled: boolean;
  paidCents: number;
};

const STOCK_RETURNS_MESSAGE = "Os itens desta venda voltarão ao estoque.";

const STOCK_UNCHANGED_RESERVED_MESSAGE =
  "O estoque não será alterado — a reserva dos itens será liberada.";

const STOCK_UNCHANGED_CANCELED_MESSAGE =
  "O estoque não será alterado: o cancelamento já devolveu os itens, se havia o que devolver.";

const RECEIVABLES_REMOVED_MESSAGE = "As cobranças desta venda serão removidas.";

const APPOINTMENT_PRESERVED_MESSAGE =
  "O compromisso da agenda vinculado a esta venda será preservado, apenas desvinculado.";

const IRREVERSIBLE_MESSAGE = "Esta ação não pode ser desfeita.";

const stockEffectMessage = (input: SaleDeleteWarningInput): string => {
  if (input.canceled) {
    return STOCK_UNCHANGED_CANCELED_MESSAGE;
  }
  if (input.delivered) {
    return STOCK_RETURNS_MESSAGE;
  }
  return STOCK_UNCHANGED_RESERVED_MESSAGE;
};

const paidAmountMessage = (paidCents: number): string | null => {
  if (paidCents <= 0) {
    return null;
  }
  return `O valor já recebido (${formatBRL(paidCents)}) sairá do histórico.`;
};

/**
 * Deriva o texto de consequência exibido no primeiro passo da confirmação de
 * exclusão (RF-08), a partir do estado da venda: efeito no estoque (RF-09),
 * remoção das cobranças, valor já recebido que sai do histórico quando houver
 * (RF-10) e preservação do compromisso da agenda vinculado (RF-11). Função
 * pura — não lê nada além do que recebe.
 */
export function saleDeleteWarning(input: SaleDeleteWarningInput): string {
  return [
    stockEffectMessage(input),
    RECEIVABLES_REMOVED_MESSAGE,
    paidAmountMessage(input.paidCents),
    APPOINTMENT_PRESERVED_MESSAGE,
    IRREVERSIBLE_MESSAGE,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}
