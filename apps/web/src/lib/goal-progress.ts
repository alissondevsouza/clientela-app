// Progresso da meta mensal (RF-05/RF-07): função pura, só inteiros. Nenhum
// float persistido — o percentual é derivado por divisão inteira (`Math.floor`)
// sobre centavos, e o arredondamento acontece só aqui, na exibição.

const PERCENT_SCALE = 100;
const NO_PROGRESS_PERCENT = 0;

// Percentual de progresso das vendas do mês em relação à meta, SEM CAP (pode
// passar de 100 — quem capa visualmente é a barra; o número exibido é o real).
// `goalCents` é sempre > 0 no fluxo normal (o schema rejeita meta 0 e "sem
// meta" é `null`, tratado antes de chamar esta função — nunca invocada nesse
// caso). Guarda defensiva contra divisão por zero/negativo mesmo assim.
export function goalProgressPercent(
  salesCents: number,
  goalCents: number,
): number {
  if (goalCents <= 0) {
    return NO_PROGRESS_PERCENT;
  }
  return Math.floor((salesCents * PERCENT_SCALE) / goalCents);
}
