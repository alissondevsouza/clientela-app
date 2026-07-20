import type { DashboardSummary, UpdateGoal } from "@clientela/shared";

// Injeta o relógio (padrão do projeto — ver `leads.service.ts`): o serviço não
// lê `Date.now()` direto, então o teste de unidade controla o mês exibido no
// `monthLabel` sem depender do relógio real (testing.md: sem dependência de
// relógio real).
export type DashboardClock = () => Date;

// Agregados crus do repositório (sem o `monthLabel`, que é derivado no service
// a partir do relógio injetado — RF-03/RF-04). `monthProfitCents` é a única
// grandeza com sinal (pode ser negativa).
export type DashboardSummaryData = Omit<DashboardSummary, "monthLabel">;

// Porta mínima do repositório: o service não conhece Drizzle nem o schema
// (api.md). `summary` já vem escopado pela consultora; `updateGoal` grava o
// novo valor (ou remove a meta com `null`) e devolve o valor persistido.
export type DashboardRepositoryPort = {
  summary: (consultantId: string) => Promise<DashboardSummaryData>;
  updateGoal: (
    consultantId: string,
    monthlyGoalCents: number | null,
  ) => Promise<number | null>;
};

export type DashboardServiceDeps = {
  repository: DashboardRepositoryPort;
  clock: DashboardClock;
};

export type DashboardService = ReturnType<typeof createDashboardService>;

// Formata o mês corrente em pt-BR ("julho de 2026"), coerente com o mês
// agregado no repositório (UTC — mesma decisão do `overdue`/plan.md). Usar
// `timeZone: "UTC"` evita depender do fuso do SO rodando o processo.
const formatMonthLabel = (date: Date): string =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

// Regra de negócio pura do painel (api.md: sem conhecer HTTP). `getSummary`
// compõe os agregados do repositório com o rótulo do mês corrente;
// `updateGoal` repassa o valor já validado na fronteira (`updateGoalSchema`).
export const createDashboardService = ({
  repository,
  clock,
}: DashboardServiceDeps) => {
  const getSummary = async (
    consultantId: string,
  ): Promise<DashboardSummary> => {
    const data = await repository.summary(consultantId);
    return { ...data, monthLabel: formatMonthLabel(clock()) };
  };

  const updateGoal = (
    consultantId: string,
    input: UpdateGoal,
  ): Promise<number | null> =>
    repository.updateGoal(consultantId, input.monthlyGoalCents);

  return { getSummary, updateGoal };
};
