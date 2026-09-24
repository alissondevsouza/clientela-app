// Formatação curta de data (dd/mm, SEM ano) usada em textos densos do bloco
// Hoje (RF-20) — aniversariante ("hoje" × dia curto) e o resumo inline de um
// grupo de cobrança ("venceu dd/mm"), que reflete o MESMO texto curto já usado
// na mensagem de WhatsApp do grupo (`dashboard-messages.ts`): mostrar a data
// completa (`formatDateBr`, dd/mm/aaaa) ali duplicaria a informação em dois
// formatos diferentes na mesma linha da tela. Função pura, testável sem jsdom
// (lesson).

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Fail-safe: entrada fora do formato ISO volta como está, nunca lança (mesmo
// padrão de `format.ts`).
export function formatDayMonthBr(dateIso: string): string {
  const match = ISO_DATE_PATTERN.exec(dateIso);
  if (match === null) {
    return dateIso;
  }
  const [, , month, day] = match;
  return `${day}/${month}`;
}

const TODAY_LABEL = "hoje";

/** "hoje" quando `nextOn` é o dia local de hoje; senão o dia curto (dd/mm). */
export function birthdayDayLabel(nextOn: string, todayIso: string): string {
  if (nextOn === todayIso) {
    return TODAY_LABEL;
  }
  return formatDayMonthBr(nextOn);
}

const ZERO_COUNT = 0;

/**
 * Sufixo de contagem para o CABEÇALHO de cada seção do Hoje (A2/RF-20: "Uma
 * seção por tipo do RF-12, cada uma com contagem" — Agenda, Leads novos,
 * Encomendas sem estoque e Aniversariantes não mostravam nenhum indício de
 * quantos itens existiam além dos 5 exibidos). O texto entra no PRÓPRIO nó de
 * texto do heading (`${título}${sectionCountSuffix(n)}`) — herda a
 * acessibilidade do heading, sem precisar de `aria-label` à parte. Nunca
 * chamado com contagem zero na prática (seção sem itens não é renderizada —
 * `dashboard-today-view.ts`), mas devolve "" nesse caso por segurança.
 */
export function sectionCountSuffix(count: number): string {
  if (count <= ZERO_COUNT) {
    return "";
  }
  return ` · ${count}`;
}
