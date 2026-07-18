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
