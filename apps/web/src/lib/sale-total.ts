import { splitInstallmentAmounts } from "@clientela/shared";
import { parseBRLToCents } from "./format";

// Cálculo do preview do form de venda (RF-09). Tudo em CENTAVOS inteiros: os
// valores digitados em reais viram centavos por `parseBRLToCents` (aritmética de
// string, sem float — core.md/database.md) e o total exibido é apenas um preview
// — o servidor recalcula e é a fonte de verdade (plan). Funções puras e
// server-safe: vivem em `lib/` (não em módulo `"use client"`) e são testáveis
// isoladamente.

const QTY_MIN = 1;
const EMPTY_TOTAL = 0;

// Quantidade digitada (input numérico) → inteiro ≥ 1 ou `null` (vazio, zero,
// negativo, decimal, não-numérico). `null` sinaliza "linha incompleta": não entra
// no total e a validação do contrato no submit produz a mensagem pt-BR.
export function parseQtyInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < QTY_MIN) {
    return null;
  }
  return parsed;
}

// Subtotal da linha em centavos = preço (reais → centavos) × quantidade. `null`
// quando o preço não casa o formato pt-BR ou a quantidade é inválida — a UI
// mostra "—" em vez de um valor enganoso.
export function lineSubtotalCents(
  priceInput: string,
  qtyInput: string,
): number | null {
  const cents = parseBRLToCents(priceInput);
  const qty = parseQtyInput(qtyInput);
  if (cents === null || qty === null) {
    return null;
  }
  return cents * qty;
}

// Total geral em centavos = Σ dos subtotais VÁLIDOS. Linhas incompletas
// (subtotal `null`) contribuem 0 — o total ao vivo reflete só o que já é
// calculável; o servidor valida o payload completo no submit.
export function totalCents(
  lines: ReadonlyArray<{ price: string; qty: string }>,
): number {
  return lines.reduce((sum, line) => {
    const subtotal = lineSubtotalCents(line.price, line.qty);
    return subtotal === null ? sum : sum + subtotal;
  }, EMPTY_TOTAL);
}

// Valor representativo de uma parcela (a primeira/maior) para o preview
// "Nx de ~R$ Y". `null` quando o preview não se aplica (parcelas < 1 ou total <
// parcelas — evitaria parcela de 0 centavos, mesma guarda de
// `splitInstallmentAmounts`). O "~" na UI sinaliza que as parcelas podem diferir
// em 1 centavo.
export function installmentAmountPreviewCents(
  total: number,
  installments: number,
): number | null {
  if (!Number.isInteger(installments) || installments < QTY_MIN) {
    return null;
  }
  if (!Number.isInteger(total) || total < installments) {
    return null;
  }
  const [first] = splitInstallmentAmounts(total, installments);
  return first ?? null;
}
