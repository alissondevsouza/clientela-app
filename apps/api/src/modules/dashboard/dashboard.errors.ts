// Erro de domínio do módulo dashboard (core.md/api.md), no estilo de
// `appointments.errors.ts`. Período futuro (RF-02) depende do relógio
// injetado no service — não cabe no schema Zod (`dashboardPeriodQuerySchema`
// só barra o que independe de "hoje": formato, piso 2015-01, `from > to`) —,
// então vira erro de domínio lançado pelo service. Mensagem pt-BR já pronta:
// vem de `resolveDashboardPeriod` (packages/shared/dashboard-period.ts), que
// devolve `{ ok: false, message }` sem lançar (função pura). Mapeado para 422
// `VALIDATION_ERROR` no `error-handler.ts` central.
export class InvalidDashboardPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDashboardPeriodError";
  }
}
