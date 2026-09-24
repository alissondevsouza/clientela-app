import { z } from "zod";
import { appointmentKindValues } from "./appointments";
import { dashboardPeriodKindValues, yearMonthSchema } from "./dashboard-period";
import { MONEY_MAX_CENTS } from "./products";

const GOAL_TYPE_MESSAGE =
  "Informe a meta em centavos (número inteiro) ou remova a meta";
const GOAL_MIN_MESSAGE = "A meta deve ser maior que zero";
const GOAL_MAX_MESSAGE = "A meta deve ser no máximo R$ 1.000.000,00";

// Contrato de `PUT /dashboard/goal`: meta em centavos, inteiro > 0 e até o
// teto monetário do projeto (`MONEY_MAX_CENTS`, reusado de `products.ts` —
// core.md: nunca redefinir o número), OU `null` para remover a meta. Zero é
// inválido (evita divisão por zero no progresso e não é uma meta válida de
// produto). `error` no nível do `z.number()` cobre também o campo ausente
// (`{}`) em pt-BR — mesma técnica do `intField` de `products.ts`.
export const updateGoalSchema = z.object({
  monthlyGoalCents: z
    .number({ error: GOAL_TYPE_MESSAGE })
    .int(GOAL_TYPE_MESSAGE)
    .min(1, GOAL_MIN_MESSAGE)
    .max(MONEY_MAX_CENTS, GOAL_MAX_MESSAGE)
    .nullable(),
});

export type UpdateGoalInput = z.input<typeof updateGoalSchema>;
export type UpdateGoal = z.output<typeof updateGoalSchema>;

// Resposta nova de `PUT /dashboard/goal` (RF-09): o corpo do request não
// muda, mas a resposta passa a devolver o MÊS gravado (sempre o corrente,
// decidido pelo relógio do servidor — nunca pelo cliente) junto do valor, já
// que a meta agora tem histórico por mês (RF-07) em vez de um único campo na
// consultora.
export const updateGoalResponseSchema = z.object({
  month: yearMonthSchema,
  monthlyGoalCents: z.number().int().min(1).nullable(),
});

export type UpdateGoalResponse = z.infer<typeof updateGoalResponseSchema>;

// ---------------------------------------------------------------------------
// `GET /dashboard/performance` (RF-11) — período resolvido (dashboard-period.ts)
// + métricas atuais/comparadas + série de 12 meses + rankings + meta do mês.
// ---------------------------------------------------------------------------

const SERIES_MONTHS_COUNT = 12;
const TOP_LIST_MAX_ITEMS = 5;

const dashboardPeriodComparisonSchema = z.object({
  fromMonth: yearMonthSchema,
  toMonth: yearMonthSchema,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});

// Espelha `ResolvedDashboardPeriod` (dashboard-period.ts) como contrato Zod —
// os dois têm que concordar; o teste de contrato (`dashboard.test.ts`) prova
// isso parseando uma saída real de `resolveDashboardPeriod`.
const dashboardPeriodSchema = z.object({
  kind: z.enum(dashboardPeriodKindValues),
  fromMonth: yearMonthSchema,
  toMonth: yearMonthSchema,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  inProgress: z.boolean(),
  comparison: dashboardPeriodComparisonSchema.nullable(),
});

// Vendido/Lucro/Recebido/Clientes atendidas de um período (RF-05). Lucro é a
// ÚNICA grandeza com sinal (venda no prejuízo é legítima — não pode virar 500
// na serialização).
const dashboardPeriodMetricsSchema = z.object({
  soldCents: z.number().int().min(0),
  soldCount: z.number().int().min(0),
  profitCents: z.number().int(),
  receivedCents: z.number().int().min(0),
  clientsCount: z.number().int().min(0),
});

const dashboardMonthlySeriesItemSchema = z.object({
  month: yearMonthSchema,
  soldCents: z.number().int().min(0),
  profitCents: z.number().int(),
});

// `productId` nullable: item de produto excluído é agrupado pelo NOME
// snapshot (RF-11) — a linha continua existindo, só sem o vínculo.
const dashboardTopProductSchema = z.object({
  productId: z.uuid().nullable(),
  name: z.string(),
  qty: z.number().int().min(0),
  soldCents: z.number().int().min(0),
});

// Só vendas com `clientId` não nulo entram no ranking (RF-11: venda anônima
// não é "cliente").
const dashboardTopClientSchema = z.object({
  clientId: z.uuid(),
  name: z.string(),
  salesCount: z.number().int().min(0),
  soldCents: z.number().int().min(0),
});

export const dashboardGoalSourceValues = [
  "explicit",
  "inherited",
  "none",
] as const;

export type DashboardGoalSource = (typeof dashboardGoalSourceValues)[number];

// Bloco de meta do RF-10 — só presente quando `period.kind === "month"`
// (`dashboardPerformanceSchema.goal` é nullable para os demais `kind`).
// `inheritedFromMonth` só é não-nulo quando `source === "inherited"`.
// `editable` é `true` apenas no mês corrente (RF-10: mês passado só mostra o
// resultado, sem edição).
const dashboardGoalSchema = z.object({
  month: yearMonthSchema,
  goalCents: z.number().int().min(1).nullable(),
  source: z.enum(dashboardGoalSourceValues),
  inheritedFromMonth: yearMonthSchema.nullable(),
  editable: z.boolean(),
  daysRemaining: z.number().int().min(0),
});

export const dashboardPerformanceSchema = z.object({
  period: dashboardPeriodSchema,
  current: dashboardPeriodMetricsSchema,
  previous: dashboardPeriodMetricsSchema.nullable(),
  series: z.array(dashboardMonthlySeriesItemSchema).length(SERIES_MONTHS_COUNT),
  topProducts: z.array(dashboardTopProductSchema).max(TOP_LIST_MAX_ITEMS),
  topClients: z.array(dashboardTopClientSchema).max(TOP_LIST_MAX_ITEMS),
  goal: dashboardGoalSchema.nullable(),
});

export type DashboardPerformance = z.infer<typeof dashboardPerformanceSchema>;

// ---------------------------------------------------------------------------
// `GET /dashboard/today` (RF-12) — a central do dia: cobranças, agenda,
// entregas, leads novos, encomendas sem estoque e aniversariantes.
// ---------------------------------------------------------------------------

const TODAY_LIST_MAX_ITEMS = 5;
const BIRTHDAYS_MAX_ITEMS = 20;

const COLLECTIONS_GROUP_IDENTITY_MESSAGE =
  "Informe o cliente ou a venda do grupo de cobrança, nunca os dois nem nenhum";

// Grupo de cobrança (RF-12): por CLIENTE (`clientId`) quando a venda tem
// cliente vinculada; por VENDA (`saleId`) quando não tem — as duas chaves são
// mutuamente exclusivas por desenho (nunca as duas, nunca nenhuma).
const dashboardCollectionsGroupSchema = z
  .object({
    clientId: z.uuid().nullable(),
    saleId: z.uuid().nullable(),
    name: z.string(),
    whatsapp: z.string().nullable(),
    amountCents: z.number().int().min(0),
    installmentsCount: z.number().int().min(1),
    oldestDueDate: z.iso.date(),
    overdue: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const hasClient = value.clientId !== null;
    const hasSale = value.saleId !== null;
    if (hasClient === hasSale) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: COLLECTIONS_GROUP_IDENTITY_MESSAGE,
      });
    }
  });

const dashboardCollectionsSchema = z.object({
  overdueCount: z.number().int().min(0),
  overdueCents: z.number().int().min(0),
  dueTodayCount: z.number().int().min(0),
  dueTodayCents: z.number().int().min(0),
  next7Count: z.number().int().min(0),
  next7Cents: z.number().int().min(0),
  groupsTotal: z.number().int().min(0),
  groups: z.array(dashboardCollectionsGroupSchema).max(TODAY_LIST_MAX_ITEMS),
});

// Campos de pessoa necessários à mensagem de confirmação (RF-12/RF-19): sem
// isso o botão "Confirmar no WhatsApp" não teria número nem nome.
const dashboardTodayAppointmentSchema = z.object({
  id: z.uuid(),
  kind: z.enum(appointmentKindValues),
  title: z.string().nullable(),
  startsAt: z.iso.datetime(),
  clientId: z.uuid().nullable(),
  clientName: z.string().nullable(),
  clientWhatsapp: z.string().nullable(),
  leadId: z.uuid().nullable(),
  leadName: z.string().nullable(),
  leadWhatsapp: z.string().nullable(),
});

const dashboardTodayAppointmentsSchema = z.object({
  total: z.number().int().min(0),
  items: z.array(dashboardTodayAppointmentSchema).max(TODAY_LIST_MAX_ITEMS),
});

const dashboardDeliveryItemSchema = z.object({
  saleId: z.uuid(),
  clientName: z.string(),
  totalCents: z.number().int().min(0),
  soldAt: z.iso.datetime(),
});

const dashboardDeliveriesSchema = z.object({
  total: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  items: z.array(dashboardDeliveryItemSchema).max(TODAY_LIST_MAX_ITEMS),
});

const dashboardNewLeadItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  whatsapp: z.string(),
  interest: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

const dashboardNewLeadsSchema = z.object({
  total: z.number().int().min(0),
  items: z.array(dashboardNewLeadItemSchema).max(TODAY_LIST_MAX_ITEMS),
});

// Só "encomenda sem estoque" (disponível < 0) — o "estoque baixo" comum fica
// no bloco Posição (RF-25), nunca aqui (RF-12: o padrão de fábrica deixaria a
// seção sempre cheia de ruído). Por isso não há campo `total`: `shortCount`
// já É a contagem completa (os itens são só os 5 primeiros a mostrar).
const dashboardRestockItemSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  availableQty: z.number().int().max(-1),
  missingQty: z.number().int().min(1),
});

const dashboardRestockSchema = z.object({
  shortCount: z.number().int().min(0),
  // Soma de `missingQty` de TODOS os produtos em falta (não só os até 5
  // exibidos em `items`) — RF-20a exige "o total de unidades que faltam", e
  // `items` sozinho não dá conta disso quando `shortCount > 5` (emenda de
  // 2026-09-24, QA Emenda M8/C1).
  missingQtyTotal: z.number().int().min(0),
  items: z.array(dashboardRestockItemSchema).max(TODAY_LIST_MAX_ITEMS),
});

// `nextOn` é a data (`yyyy-mm-dd`, dentro da janela) em que o aniversário
// "cai" este ano — já resolve 29/02 ⇒ 28/02 em ano não bissexto
// (`nextBirthdayInWindow`, dashboard-metrics.ts); `birthday` é a data de
// nascimento crua, para exibir a idade se um dia fizer sentido.
const dashboardBirthdayItemSchema = z.object({
  clientId: z.uuid(),
  name: z.string(),
  whatsapp: z.string(),
  birthday: z.iso.date(),
  nextOn: z.iso.date(),
});

export const dashboardTodaySchema = z.object({
  today: z.iso.date(),
  collections: dashboardCollectionsSchema,
  appointments: dashboardTodayAppointmentsSchema,
  deliveries: dashboardDeliveriesSchema,
  newLeads: dashboardNewLeadsSchema,
  restock: dashboardRestockSchema,
  birthdays: z.array(dashboardBirthdayItemSchema).max(BIRTHDAYS_MAX_ITEMS),
});

export type DashboardToday = z.infer<typeof dashboardTodaySchema>;
