import { parseBRLToCents } from "./format";

// Cálculo do total ESTIMADO exibido no form de itens do pedido (RF-07/RF-08).
// Tudo em CENTAVOS inteiros: o total é apenas um preview client-side — o
// servidor recalcula (RF-01/RF-02) e é a fonte de verdade. Funções puras e
// server-safe: vivem em `lib/` (não em módulo `"use client"`), lesson
// 2026-07-18 (helper puro compartilhado entre RSC e client component nunca vem
// de módulo `"use client"`).

const QTY_MIN = 1;
const EMPTY_TOTAL = 0;

// Quantidade digitada → inteiro ≥ 1 ou `null` (vazio, zero, negativo, decimal,
// não-numérico). `null` sinaliza "linha incompleta": não entra no total.
export function parseOrderQtyInput(value: string): number | null {
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

// Custo unitário do item: campo OPCIONAL no contrato (RF-01) — vazio usa o
// custo atual do produto (`fallbackCents`, ou `null` quando nenhum produto
// está selecionado ainda); formato pt-BR inválido retorna `null` (linha
// inválida, não soma no total).
export function resolveUnitCostCents(
  unitCostInput: string,
  fallbackCents: number | null,
): number | null {
  const trimmed = unitCostInput.trim();
  if (trimmed.length === 0) {
    return fallbackCents;
  }
  return parseBRLToCents(trimmed);
}

// Subtotal da linha em centavos = quantidade × custo unitário resolvido.
// `null` quando a quantidade ou o custo (digitado ou de fallback) são
// inválidos/indisponíveis — a UI mostra "—" em vez de um valor enganoso.
export function orderItemSubtotalCents(
  qtyInput: string,
  unitCostInput: string,
  fallbackCents: number | null,
): number | null {
  const qty = parseOrderQtyInput(qtyInput);
  const unitCostCents = resolveUnitCostCents(unitCostInput, fallbackCents);
  if (qty === null || unitCostCents === null) {
    return null;
  }
  return qty * unitCostCents;
}

// Total geral em centavos = Σ dos subtotais VÁLIDOS. Linhas incompletas
// (subtotal `null`) contribuem 0 — o total ao vivo reflete só o que já é
// calculável; o servidor valida o payload completo no submit.
export function orderEstimatedTotalCents(
  lines: ReadonlyArray<{
    qty: string;
    unitCost: string;
    fallbackCents: number | null;
  }>,
): number {
  return lines.reduce((sum, line) => {
    const subtotal = orderItemSubtotalCents(
      line.qty,
      line.unitCost,
      line.fallbackCents,
    );
    return subtotal === null ? sum : sum + subtotal;
  }, EMPTY_TOTAL);
}
