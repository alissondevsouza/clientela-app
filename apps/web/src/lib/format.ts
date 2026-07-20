// Formatação de moeda para a borda de exibição. Valores circulam sempre em
// centavos inteiros (core.md/web.md); a divisão por 100 acontece só aqui, na
// formatação. O Intl.NumberFormat é instanciado uma vez no módulo (imutável).

const CENTS_PER_UNIT = 100;

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / CENTS_PER_UNIT);
}

// Converte centavos (contrato) para a string em reais editável do input de
// formulário (ex.: 5990 → "59,90"). É EXIBIÇÃO — nunca é usada em cálculo; a
// conversão inversa (reais → centavos) acontece no submit via `parseBRLToCents`.
// Função pura e server-safe: vive em `lib/` (não em módulo `"use client"`) para
// poder ser chamada tanto em Server Components (pré-preencher o form de edição)
// quanto no client.
export function centsToReaisInput(cents: number): string {
  return (cents / CENTS_PER_UNIT).toFixed(DECIMAL_PLACES).replace(".", ",");
}

// Reordena uma data ISO `yyyy-mm-dd` para `dd/mm/aaaa` SEM construir `Date` — o
// parsing por `Date` interpretaria a data em UTC e um fuso negativo poderia
// recuar um dia (aniversário errado). Fail-safe: qualquer entrada que não case o
// formato ISO esperado volta como está, nunca lança (web.md, dd/mm/aaaa).
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDateBr(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

// Converte um valor em reais digitado no padrão pt-BR (ex.: "R$ 1.234,56") para
// centavos inteiros, na fronteira da UI (o payload circula sempre em centavos —
// core.md/database.md). A conversão é feita por ARITMÉTICA DE STRING: `Number`/
// `parseFloat` sobre decimais introduziria erro binário (0,1 + 0,2), então a
// parte inteira (só dígitos) e os centavos são combinados como inteiros.
//
// Tabela fixa (RF-07): "12,34"→1234 · "12,3"→1230 · "12"→1200 · "1.234,56"→123456
// · "1.234"→123400 · "R$ 12,34"→1234 · "12,345"→null · "12.34"→null · ""→null ·
// negativos→null. Qualquer entrada fora do padrão retorna null (nunca lança) —
// o form trata null como erro de validação e nunca envia.
//
// Decisões de casos-limite (documentadas): "1.234.567,89"→123456789 (múltiplos
// grupos de milhar); "0,99"→99; "00,5"→50 (zeros à esquerda na parte inteira são
// aceitos, valem 0); parte inteira vazia (ex.: ",50") → null.
const CURRENCY_SYMBOL = /R\$/g;
const WHITESPACE = /\s/g;
const SIGN = /[+-]/;
// Parte inteira com grupos de milhar: 1–3 dígitos e depois blocos de exatamente
// 3 separados por ponto ("1", "12", "123", "1.234", "1.234.567").
const THOUSANDS_INTEGER = /^\d{1,3}(\.\d{3})*$/;
// Parte inteira sem pontos: qualquer sequência de dígitos.
const PLAIN_INTEGER = /^\d+$/;
// Parte decimal: 1 ou 2 dígitos (padded para 2). 3+ casas ⇒ inválido.
const DECIMAL_FRACTION = /^\d{1,2}$/;
const DECIMAL_SEPARATOR = ",";
const THOUSANDS_SEPARATOR = /\./g;
const DECIMAL_PLACES = 2;

const isValidIntegerPart = (part: string): boolean =>
  part.includes(".") ? THOUSANDS_INTEGER.test(part) : PLAIN_INTEGER.test(part);

export function parseBRLToCents(input: string): number | null {
  const cleaned = input.replace(CURRENCY_SYMBOL, "").replace(WHITESPACE, "");
  if (cleaned.length === 0 || SIGN.test(cleaned)) {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(DECIMAL_SEPARATOR);
  const integerPart = lastComma === -1 ? cleaned : cleaned.slice(0, lastComma);
  const decimalPart = lastComma === -1 ? "" : cleaned.slice(lastComma + 1);

  if (lastComma !== -1 && !DECIMAL_FRACTION.test(decimalPart)) {
    return null;
  }
  if (!isValidIntegerPart(integerPart)) {
    return null;
  }

  // Ambas as partes são só dígitos aqui — `Number` opera sobre inteiros, nunca
  // sobre uma string decimal, preservando a exatidão.
  const units = Number(integerPart.replace(THOUSANDS_SEPARATOR, ""));
  const cents = Number(decimalPart.padEnd(DECIMAL_PLACES, "0"));
  return units * CENTS_PER_UNIT + cents;
}
