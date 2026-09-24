import type {
  AppointmentKind,
  DashboardGoalSource,
  DashboardPerformance,
  DashboardPeriodQuery,
  DashboardToday,
} from "@clientela/shared";
import {
  appLocalDateIso,
  appLocalDayRangeUtc,
  type BirthdayWindowEntry,
  birthdayWindowRanked,
  daysRemainingInMonth,
  lastDayOfYearMonth,
  monthsEndingAt,
  nextBirthdayInWindow,
  nextDayIso,
  periodBoundsUtc,
  resolveDashboardPeriod,
  yearMonthOfDate,
} from "@clientela/shared";
import { InvalidDashboardPeriodError } from "./dashboard.errors";

// Injeta o relógio (padrão do projeto — ver `leads.service.ts`): o serviço não
// lê `Date.now()` direto, então o teste de unidade controla o "hoje" local
// (mês corrente, dia de hoje, janela de aniversário) sem depender do relógio
// real (testing.md: sem dependência de relógio real).
export type DashboardClock = () => Date;

// ---------------------------------------------------------------------------
// Portas do painel novo (RF-11/RF-12, crm-home-period-and-daily-hub). Tipos de
// função definidos AQUI (não em Drizzle) — o service não conhece o banco
// (api.md); `dashboard-performance.repository.ts`/`dashboard-today.repository.ts`
// implementam estas portas.
// ---------------------------------------------------------------------------

// Bounds de instante `[startUtc, endUtc)` já resolvidos pelo service (nunca
// `AT TIME ZONE`/`CURRENT_DATE`/`now()` no repository — ADR-0018). Mesmo
// formato de `periodBoundsUtc`/`appLocalDayRangeUtc` (packages/shared).
export type DashboardPeriodBounds = { startUtc: string; endUtc: string };

// Vendido/Lucro/Recebido/Clientes atendidas de um período (RF-05). `profitCents`
// é a única grandeza com sinal (venda no prejuízo é legítima).
export type DashboardPeriodMetricsData = {
  soldCents: number;
  soldCount: number;
  profitCents: number;
  receivedCents: number;
  clientsCount: number;
};

export type DashboardSeriesMonthInput = {
  month: string;
  startUtc: string;
  endUtc: string;
};

export type DashboardMonthlySeriesItemData = {
  month: string;
  soldCents: number;
  profitCents: number;
};

// `productId` nullable: item de produto excluído é agrupado pelo NOME
// snapshot (RF-11).
export type DashboardTopProductData = {
  productId: string | null;
  name: string;
  qty: number;
  soldCents: number;
};

export type DashboardTopClientData = {
  clientId: string;
  name: string;
  salesCount: number;
  soldCents: number;
};

// Linha crua da meta efetiva (RF-07): `monthStart` é o mês da linha
// encontrada (pode ser anterior ao mês consultado — herança); `null` quando
// não há nenhuma linha `month_start <= monthStart` (sem meta). A tradução
// para `explicit`/`inherited`/`none` (RF-10) é regra do SERVICE, não do
// repository.
export type EffectiveGoalRow = { goalCents: number | null; monthStart: string };

export type DashboardPerformanceQueryInput = {
  current: DashboardPeriodBounds;
  previous: DashboardPeriodBounds | null;
  series: DashboardSeriesMonthInput[];
  topLimit: number;
  // `null` quando `period.kind !== "month"` (RF-10: meta só existe para mês
  // isolado) — o repository pula a consulta de meta neste caso.
  goalMonthStart: string | null;
};

export type DashboardPerformanceData = {
  current: DashboardPeriodMetricsData;
  previous: DashboardPeriodMetricsData | null;
  series: DashboardMonthlySeriesItemData[];
  topProducts: DashboardTopProductData[];
  topClients: DashboardTopClientData[];
  goal: EffectiveGoalRow | null;
};

export type DashboardPerformanceRepositoryPort = {
  // Abre UMA transação read-only `repeatable read` e executa tudo o que o
  // service pediu (bounds já resolvidos) — o repository só executa (plan.md).
  performance: (
    consultantId: string,
    input: DashboardPerformanceQueryInput,
  ) => Promise<DashboardPerformanceData>;
  // Upsert da meta (RF-07/RF-09) — fora da transação read-only de
  // `performance` (é uma escrita própria, chamada por `updateMonthlyGoal`).
  upsertGoal: (
    consultantId: string,
    monthStart: string,
    goalCents: number | null,
  ) => Promise<number | null>;
};

// Grupo de cobrança (RF-12): por CLIENTE (`clientId` presente) ou por VENDA
// (`saleId` presente, sem cliente vinculado) — mutuamente exclusivos.
export type DashboardCollectionsGroupData = {
  clientId: string | null;
  saleId: string | null;
  name: string;
  whatsapp: string | null;
  amountCents: number;
  installmentsCount: number;
  oldestDueDate: string;
  overdue: boolean;
};

export type DashboardCollectionsData = {
  overdueCount: number;
  overdueCents: number;
  dueTodayCount: number;
  dueTodayCents: number;
  next7Count: number;
  next7Cents: number;
  groupsTotal: number;
  groups: DashboardCollectionsGroupData[];
};

// Campos de pessoa necessários à mensagem de confirmação (RF-12/RF-19).
export type DashboardTodayAppointmentData = {
  id: string;
  kind: AppointmentKind;
  title: string | null;
  startsAt: string;
  clientId: string | null;
  clientName: string | null;
  clientWhatsapp: string | null;
  leadId: string | null;
  leadName: string | null;
  leadWhatsapp: string | null;
};

export type DashboardDeliveryItemData = {
  saleId: string;
  clientName: string;
  totalCents: number;
  soldAt: string;
};

export type DashboardNewLeadItemData = {
  id: string;
  name: string;
  whatsapp: string;
  interest: string | null;
  createdAt: string;
};

export type DashboardRestockItemData = {
  productId: string;
  name: string;
  availableQty: number;
  missingQty: number;
};

// Linha crua do aniversariante (sem `nextOn` — calculado no SERVICE via
// `nextBirthdayInWindow`, plan.md/Task 4.2).
export type DashboardBirthdayRowData = {
  clientId: string;
  name: string;
  whatsapp: string;
  birthday: string;
};

export type DashboardTodayQueryInput = {
  todayIso: string;
  dayStartUtc: string;
  dayEndUtc: string;
  next7EndIso: string;
  // Rank cronológico de cada `MM-DD` da janela (A1) — o repository ordena por
  // ele ANTES do `LIMIT`, nunca pelo nome (senão aniversariantes de hoje podem
  // ficar de fora quando há mais de 20 na janela).
  birthdayEntries: BirthdayWindowEntry[];
};

export type DashboardTodayData = {
  collections: DashboardCollectionsData;
  appointments: { total: number; items: DashboardTodayAppointmentData[] };
  deliveries: {
    total: number;
    totalCents: number;
    items: DashboardDeliveryItemData[];
  };
  newLeads: { total: number; items: DashboardNewLeadItemData[] };
  restock: {
    shortCount: number;
    missingQtyTotal: number;
    items: DashboardRestockItemData[];
  };
  birthdays: DashboardBirthdayRowData[];
};

export type DashboardTodayRepositoryPort = {
  // Abre UMA transação read-only `repeatable read` (RF-12) — bounds/janela já
  // resolvidos pelo service (dia local, próximos 7 dias, lista de `MM-DD`).
  today: (
    consultantId: string,
    input: DashboardTodayQueryInput,
  ) => Promise<DashboardTodayData>;
};

export type DashboardServiceDeps = {
  // Portas do painel novo (RF-11/RF-12) — obrigatórias: `GET
  // /dashboard/performance`/`GET /dashboard/today` são as únicas rotas do
  // módulo desde a Task 4.4 (RF-13 removeu `GET /dashboard/summary`, que
  // usava o repository antigo). Todo composition root (produção e
  // `buildApp` de teste) injeta as duas.
  performanceRepository: DashboardPerformanceRepositoryPort;
  todayRepository: DashboardTodayRepositoryPort;
  clock: DashboardClock;
};

export type DashboardService = ReturnType<typeof createDashboardService>;

// "Hoje" local (`yyyy-mm-dd`, APP_TIME_ZONE) a partir do relógio injetado —
// nunca `Date.now()` direto (ADR-0018), reusado por `getPerformance`/
// `getToday`/`updateMonthlyGoal`.
const todayLocalIso = (clock: DashboardClock): string =>
  appLocalDateIso(clock().toISOString());

const SERIES_MONTHS_COUNT = 12;
const TOP_LIST_LIMIT = 5;
// Janela do RF-12 ("próximos 7 dias") e do RF-10/RF-12 (aniversariantes até
// hoje + 7) — mesmo número, dois usos.
const NEXT7_WINDOW_DAYS = 7;

// Soma `days` dias a uma data local `yyyy-mm-dd`, reusando o primitivo já
// testado `nextDayIso` (packages/shared) em vez de duplicar a aritmética de
// calendário — só usado aqui para o fim da janela "próximos 7 dias" do Hoje.
const addDaysIso = (dateIso: string, days: number): string => {
  let result = dateIso;
  for (let step = 0; step < days; step += 1) {
    result = nextDayIso(result);
  }
  return result;
};

type DashboardGoalBlock = NonNullable<DashboardPerformance["goal"]>;

// Meta efetiva do mês (RF-10): distingue `explicit` (linha do próprio mês),
// `inherited` (linha de um mês anterior, sem linha própria) e `none` (nenhuma
// linha `month_start <= mês` OU a linha efetiva tem `goal_cents = NULL` —
// remoção explícita, RF-07: "sem meta a partir deste mês". A6: sem esta
// segunda condição, remover a meta devolvia `source: "explicit"`/`"inherited"`
// com `goalCents: null`, contrato ambíguo). `editable`/`daysRemaining` só
// valem algo no mês CORRENTE (mês passado: não editável, sem ritmo — RF-10).
const buildGoalBlock = (
  fromMonth: string,
  todayIso: string,
  effective: EffectiveGoalRow | null,
): DashboardGoalBlock => {
  const todayMonth = yearMonthOfDate(todayIso);
  const editable = fromMonth === todayMonth;
  const daysRemaining = editable ? daysRemainingInMonth(todayIso) : 0;

  if (effective === null || effective.goalCents === null) {
    return {
      month: fromMonth,
      goalCents: null,
      source: "none",
      inheritedFromMonth: null,
      editable,
      daysRemaining,
    };
  }

  const effectiveMonth = yearMonthOfDate(effective.monthStart);
  const isExplicit = effectiveMonth === fromMonth;
  const source: DashboardGoalSource = isExplicit ? "explicit" : "inherited";

  return {
    month: fromMonth,
    goalCents: effective.goalCents,
    source,
    inheritedFromMonth: isExplicit ? null : effectiveMonth,
    editable,
    daysRemaining,
  };
};

// Regra de negócio pura do painel (api.md: sem conhecer HTTP). `getPerformance`/
// `getToday`/`updateMonthlyGoal` são a base da home (RF-11/RF-12/RF-09) — as
// únicas operações do módulo desde que `GET /dashboard/summary` saiu (RF-13).
export const createDashboardService = ({
  performanceRepository,
  todayRepository,
  clock,
}: DashboardServiceDeps) => {
  // RF-02/RF-03/RF-11: resolve o período (mês futuro ⇒ erro de domínio),
  // calcula os bounds UTC do período e da comparação, a série de 12 meses
  // terminando em `toMonth` (mês inteiro local, RF-11) e a meta (só em
  // `kind === "month"`, RF-10) — o repository só agrega o que já vem pronto.
  const getPerformance = async (
    consultantId: string,
    query: DashboardPeriodQuery,
  ): Promise<DashboardPerformance> => {
    const todayIso = todayLocalIso(clock);
    const resolved = resolveDashboardPeriod(query, todayIso);
    if (!resolved.ok) {
      throw new InvalidDashboardPeriodError(resolved.message);
    }
    const { period } = resolved;

    const currentBounds = periodBoundsUtc(period.startDate, period.endDate);
    const previousBounds = period.comparison
      ? periodBoundsUtc(period.comparison.startDate, period.comparison.endDate)
      : null;

    // Série SEMPRE em meses de calendário inteiros locais (mesmo quando o mês
    // corrente ainda está em andamento) — plan.md: "mês inteiro local".
    const series = monthsEndingAt(period.toMonth, SERIES_MONTHS_COUNT).map(
      (month) => {
        const bounds = periodBoundsUtc(
          `${month}-01`,
          lastDayOfYearMonth(month),
        );
        return { month, startUtc: bounds.startUtc, endUtc: bounds.endUtc };
      },
    );

    const goalMonthStart =
      period.kind === "month" ? `${period.fromMonth}-01` : null;

    const data = await performanceRepository.performance(consultantId, {
      current: currentBounds,
      previous: previousBounds,
      series,
      topLimit: TOP_LIST_LIMIT,
      goalMonthStart,
    });

    const goal =
      period.kind === "month"
        ? buildGoalBlock(period.fromMonth, todayIso, data.goal)
        : null;

    return {
      period,
      current: data.current,
      previous: data.previous,
      series: data.series,
      topProducts: data.topProducts,
      topClients: data.topClients,
      goal,
    };
  };

  // RF-12: "hoje" local, bounds do dia, fim da janela de 7 dias e o rank de
  // cada `MM-DD` de aniversário (regra de 29/02 — `birthdayWindowRanked`); o
  // repository ordena e aplica o `LIMIT` pelo rank (A1), devolve os
  // aniversariantes crus da janela e este service calcula `nextOn`
  // (`nextBirthdayInWindow`) e ordena a versão final por `nextOn`/nome
  // (RF-12) — o rank do SQL só decide QUEM sobrevive ao `LIMIT`.
  const getToday = async (consultantId: string): Promise<DashboardToday> => {
    const todayIso = todayLocalIso(clock);
    const { startUtc: dayStartUtc, endUtc: dayEndUtc } =
      appLocalDayRangeUtc(todayIso);
    const next7EndIso = addDaysIso(todayIso, NEXT7_WINDOW_DAYS);
    const birthdayEntries = birthdayWindowRanked(todayIso, NEXT7_WINDOW_DAYS);

    const data = await todayRepository.today(consultantId, {
      todayIso,
      dayStartUtc,
      dayEndUtc,
      next7EndIso,
      birthdayEntries,
    });

    const birthdays = data.birthdays
      .map((row) => {
        const nextOn = nextBirthdayInWindow(
          row.birthday,
          todayIso,
          NEXT7_WINDOW_DAYS,
        );
        if (nextOn === null) {
          // Invariante quebrada: o repository já filtrou pelo rank de
          // `birthdayEntries` — uma linha fora da janela aqui é bug no filtro
          // SQL, nunca dado esperado (mesma postura de `toSafeInteger`: nunca
          // perder/mascarar silenciosamente). Mensagem só com `clientId`
          // (LGPD/security.md: nada de data de nascimento em erro/log).
          throw new Error(
            `Aniversariante fora da janela calculada (clientId=${row.clientId})`,
          );
        }
        return { ...row, nextOn };
      })
      .toSorted((left, right) => {
        if (left.nextOn !== right.nextOn) {
          return left.nextOn < right.nextOn ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

    return {
      today: todayIso,
      collections: data.collections,
      appointments: data.appointments,
      deliveries: data.deliveries,
      newLeads: data.newLeads,
      restock: data.restock,
      birthdays,
    };
  };

  // RF-09: grava a meta do MÊS CORRENTE pelo relógio do servidor — nunca pelo
  // cliente (relógio do cliente é forjável). `monthlyGoalCents: null` remove a
  // meta a partir deste mês (RF-07).
  const updateMonthlyGoal = async (
    consultantId: string,
    monthlyGoalCents: number | null,
  ): Promise<{ month: string; monthlyGoalCents: number | null }> => {
    const todayIso = todayLocalIso(clock);
    const month = yearMonthOfDate(todayIso);
    const saved = await performanceRepository.upsertGoal(
      consultantId,
      `${month}-01`,
      monthlyGoalCents,
    );
    return { month, monthlyGoalCents: saved };
  };

  return {
    getPerformance,
    getToday,
    updateMonthlyGoal,
  };
};
