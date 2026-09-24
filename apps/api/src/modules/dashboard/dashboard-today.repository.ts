import type {
  AppointmentStatus,
  BirthdayWindowEntry,
  LeadStatus,
  SaleStatus,
} from "@clientela/shared";
import { and, asc, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { availableQtyExpression } from "../../db/derived-expressions";
import {
  appointments,
  clients,
  leads,
  products,
  receivables,
  sales,
} from "../../db/schema";
import type {
  DashboardBirthdayRowData,
  DashboardCollectionsData,
  DashboardDeliveryItemData,
  DashboardNewLeadItemData,
  DashboardRestockItemData,
  DashboardTodayAppointmentData,
  DashboardTodayData,
  DashboardTodayQueryInput,
  DashboardTodayRepositoryPort,
} from "./dashboard.service";

export type DashboardTodayRepository = ReturnType<
  typeof createDashboardTodayRepository
>;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const TODAY_LIST_MAX_ITEMS = 5;
const BIRTHDAYS_MAX_ITEMS = 20;
const SCHEDULED_DUE_KIND = "scheduled";
const SCHEDULED_APPOINTMENT_STATUS: AppointmentStatus = "scheduled";
const OPEN_SALE_STATUS: SaleStatus = "open";
const NEW_LEAD_STATUS: LeadStatus = "new";
// "Encomenda sem estoque" (RF-12): disponível < 0 — nunca <= 0 (produto com
// disponível exatamente 0 não é "sem estoque para entregar já reservado", é
// só "no limite"; o "estoque baixo" comum fica na Posição, RF-25).
const PRODUCT_AVAILABLE_QTY_ZERO = 0;

// Converte um agregado (bigint/numeric do driver) para número inteiro seguro —
// mesma guarda replicada em products/sales/dashboard-performance.repository
// (convenção aceita, known-issue "toSafeInteger replicado").
const toSafeInteger = (value: string | number, field: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `Agregado de ${field} excede a precisão inteira segura (${value})`,
    );
  }
  return parsed;
};

// Escopo comum das cobranças do Hoje (RF-12/Glossário): pendente (não paga,
// não anulada) e `due_kind = 'scheduled'` — só parcela com vencimento definido
// entra em atrasada/hoje/próximos 7 dias (`on_delivery`/`unknown` não tem
// `due_date` e fica de fora, por desenho).
const collectionsScope = (consultantId: string) => [
  eq(sales.consultantId, consultantId),
  eq(receivables.dueKind, SCHEDULED_DUE_KIND),
  isNull(receivables.paidAt),
  isNull(receivables.voidedAt),
];

// Cobranças (RF-12): contagens/somas de atrasadas (`due_date < hoje`), hoje
// (`= hoje`) e próximos 7 dias (`hoje < due_date <= hoje + 7`) via `FILTER`;
// grupos das atrasadas OU de hoje (`due_date <= hoje`) por
// `COALESCE(client_id, sale_id)` — um grupo por CLIENTE quando há cliente
// vinculado, senão um grupo por VENDA. Toda comparação de atraso usa o
// parâmetro `todayIso`/`next7EndIso` (nunca CURRENT_DATE/now() — RF-04).
const loadCollections = async (
  tx: Transaction,
  consultantId: string,
  { todayIso, next7EndIso }: DashboardTodayQueryInput,
): Promise<DashboardCollectionsData> => {
  const scope = collectionsScope(consultantId);

  const [summaryRow] = await tx
    .select({
      overdueCount: sql<string>`COUNT(*) FILTER (WHERE ${receivables.dueDate} < ${todayIso}::date)`,
      overdueCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.dueDate} < ${todayIso}::date), 0)::bigint`,
      dueTodayCount: sql<string>`COUNT(*) FILTER (WHERE ${receivables.dueDate} = ${todayIso}::date)`,
      dueTodayCents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.dueDate} = ${todayIso}::date), 0)::bigint`,
      next7Count: sql<string>`COUNT(*) FILTER (WHERE ${receivables.dueDate} > ${todayIso}::date AND ${receivables.dueDate} <= ${next7EndIso}::date)`,
      next7Cents: sql<string>`COALESCE(SUM(${receivables.amountCents}) FILTER (WHERE ${receivables.dueDate} > ${todayIso}::date AND ${receivables.dueDate} <= ${next7EndIso}::date), 0)::bigint`,
    })
    .from(receivables)
    .innerJoin(sales, eq(receivables.saleId, sales.id))
    .where(and(...scope));

  const dueTodayOrOverdue = sql`${receivables.dueDate} <= ${todayIso}::date`;
  // Grupo por cliente (client_id) ou, sem cliente, por venda (sale_id) —
  // mutuamente exclusivos (RF-12). `product_id`-like coalesce de
  // dashboard-performance.repository, mesma técnica.
  const groupKeyExpr = sql`COALESCE(${sales.clientId}::text, 'sale:' || ${sales.id}::text)`;

  const [totalRow] = await tx
    .select({ value: sql<string>`COUNT(DISTINCT (${groupKeyExpr}))` })
    .from(receivables)
    .innerJoin(sales, eq(receivables.saleId, sales.id))
    .where(and(...scope, dueTodayOrOverdue));

  const groupRows = await tx
    .select({
      // Postgres não tem agregado MAX/MIN nativo para `uuid` ("function
      // max(uuid) does not exist") — cast para `text` antes de agregar.
      clientId: sql<string | null>`MAX(${sales.clientId}::text)`,
      // `saleId` só quando o grupo NÃO tem cliente — nesse caso todas as linhas
      // do grupo compartilham o MESMO sale_id (a chave do agrupamento é
      // justamente esse id), então MAX devolve o valor único.
      saleId: sql<
        string | null
      >`CASE WHEN MAX(${sales.clientId}::text) IS NULL THEN MAX(${sales.id}::text) ELSE NULL END`,
      // Nome atual da cliente quando há vínculo; senão o snapshot da venda
      // (sales.client_name) — RF-12.
      name: sql<string>`COALESCE(MAX(${clients.name}), MAX(${sales.clientName}))`,
      whatsapp: sql<string | null>`MAX(${clients.whatsapp})`,
      amountCents: sql<string>`SUM(${receivables.amountCents})::bigint`,
      installmentsCount: sql<string>`COUNT(*)`,
      oldestDueDate: sql<string>`MIN(${receivables.dueDate})`,
    })
    .from(receivables)
    .innerJoin(sales, eq(receivables.saleId, sales.id))
    .leftJoin(clients, eq(sales.clientId, clients.id))
    .where(and(...scope, dueTodayOrOverdue))
    .groupBy(groupKeyExpr)
    .orderBy(
      sql`MIN(${receivables.dueDate}) ASC`,
      sql`SUM(${receivables.amountCents}) DESC`,
      // Desempate final (S7/determinismo): a própria chave do grupo — dois
      // grupos empatados em vencimento e valor não têm ordem garantida sem
      // ela (asc só para fixar UMA ordem estável, sem significado de negócio).
      sql`${groupKeyExpr} ASC`,
    )
    .limit(TODAY_LIST_MAX_ITEMS);

  return {
    overdueCount: toSafeInteger(summaryRow?.overdueCount ?? 0, "overdueCount"),
    overdueCents: toSafeInteger(summaryRow?.overdueCents ?? 0, "overdueCents"),
    dueTodayCount: toSafeInteger(
      summaryRow?.dueTodayCount ?? 0,
      "dueTodayCount",
    ),
    dueTodayCents: toSafeInteger(
      summaryRow?.dueTodayCents ?? 0,
      "dueTodayCents",
    ),
    next7Count: toSafeInteger(summaryRow?.next7Count ?? 0, "next7Count"),
    next7Cents: toSafeInteger(summaryRow?.next7Cents ?? 0, "next7Cents"),
    groupsTotal: toSafeInteger(totalRow?.value ?? 0, "groupsTotal"),
    groups: groupRows.map((row) => {
      const oldestDueDate = row.oldestDueDate;
      return {
        clientId: row.clientId,
        saleId: row.saleId,
        name: row.name,
        whatsapp: row.whatsapp,
        amountCents: toSafeInteger(row.amountCents, "amountCents"),
        installmentsCount: toSafeInteger(
          row.installmentsCount,
          "installmentsCount",
        ),
        oldestDueDate,
        overdue: oldestDueDate < todayIso,
      };
    }),
  };
};

// Compromissos `scheduled` de hoje (RF-12): `starts_at` em `[dayStartUtc,
// dayEndUtc)` (bounds já locais — RF-04/ADR-0018); campos de pessoa (cliente
// OU lead) via LEFT JOIN para a mensagem de confirmação (RF-19).
const loadAppointments = async (
  tx: Transaction,
  consultantId: string,
  { dayStartUtc, dayEndUtc }: DashboardTodayQueryInput,
): Promise<{ total: number; items: DashboardTodayAppointmentData[] }> => {
  const scope = and(
    eq(appointments.consultantId, consultantId),
    eq(appointments.status, SCHEDULED_APPOINTMENT_STATUS),
    gte(appointments.startsAt, new Date(dayStartUtc)),
    lt(appointments.startsAt, new Date(dayEndUtc)),
  );

  const rows = await tx
    .select({
      id: appointments.id,
      kind: appointments.kind,
      title: appointments.title,
      startsAt: appointments.startsAt,
      clientId: appointments.clientId,
      clientName: clients.name,
      clientWhatsapp: clients.whatsapp,
      leadId: appointments.leadId,
      leadName: leads.name,
      leadWhatsapp: leads.whatsapp,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(leads, eq(appointments.leadId, leads.id))
    .where(scope)
    .orderBy(asc(appointments.startsAt), asc(appointments.id))
    .limit(TODAY_LIST_MAX_ITEMS);

  const [totalRow] = await tx
    .select({ value: count() })
    .from(appointments)
    .where(scope);

  return {
    total: totalRow?.value ?? 0,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      clientId: row.clientId,
      clientName: row.clientName,
      clientWhatsapp: row.clientWhatsapp,
      leadId: row.leadId,
      leadName: row.leadName,
      leadWhatsapp: row.leadWhatsapp,
    })),
  };
};

// Entregas pendentes (RF-12): vendas `open` com `delivered_at IS NULL`,
// ordenadas pelas mais antigas por `sold_at` primeiro.
const loadDeliveries = async (
  tx: Transaction,
  consultantId: string,
): Promise<{
  total: number;
  totalCents: number;
  items: DashboardDeliveryItemData[];
}> => {
  const scope = and(
    eq(sales.consultantId, consultantId),
    eq(sales.status, OPEN_SALE_STATUS),
    isNull(sales.deliveredAt),
  );

  const rows = await tx
    .select({
      saleId: sales.id,
      clientName: sales.clientName,
      totalCents: sales.totalCents,
      soldAt: sales.soldAt,
    })
    .from(sales)
    .where(scope)
    .orderBy(asc(sales.soldAt), asc(sales.id))
    .limit(TODAY_LIST_MAX_ITEMS);

  const [summaryRow] = await tx
    .select({
      total: count(),
      totalCents: sql<string>`COALESCE(SUM(${sales.totalCents}), 0)::bigint`,
    })
    .from(sales)
    .where(scope);

  return {
    total: summaryRow?.total ?? 0,
    totalCents: toSafeInteger(summaryRow?.totalCents ?? 0, "totalCents"),
    items: rows.map((row) => ({
      saleId: row.saleId,
      clientName: row.clientName,
      totalCents: row.totalCents,
      soldAt: row.soldAt.toISOString(),
    })),
  };
};

// Leads novos (RF-12): `status = 'new'`, mais recentes primeiro. Leads NÃO têm
// `consultant_id` (drift já aceito — plan.md/04-domain-model.md).
const loadNewLeads = async (
  tx: Transaction,
): Promise<{ total: number; items: DashboardNewLeadItemData[] }> => {
  const scope = eq(leads.status, NEW_LEAD_STATUS);

  const rows = await tx
    .select({
      id: leads.id,
      name: leads.name,
      whatsapp: leads.whatsapp,
      interest: leads.interest,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(scope)
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(TODAY_LIST_MAX_ITEMS);

  const [totalRow] = await tx
    .select({ value: count() })
    .from(leads)
    .where(scope);

  return {
    total: totalRow?.value ?? 0,
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      whatsapp: row.whatsapp,
      interest: row.interest,
      createdAt: row.createdAt.toISOString(),
    })),
  };
};

// Encomenda sem estoque (RF-12): só produtos com disponível < 0 (reserva de
// vendas abertas não entregues > estoque físico — `availableQtyExpression`,
// db/derived-expressions.ts, mesma regra do módulo de produtos). O "estoque
// baixo" comum (disponível <= mínimo) fica na Posição (RF-25), não aqui.
const loadRestock = async (
  tx: Transaction,
  consultantId: string,
): Promise<{
  shortCount: number;
  missingQtyTotal: number;
  items: DashboardRestockItemData[];
}> => {
  const scope = and(
    eq(products.consultantId, consultantId),
    lt(availableQtyExpression, PRODUCT_AVAILABLE_QTY_ZERO),
  );
  // Reinterpreta o tipo da expressão (declarada `sql<number>` em
  // derived-expressions.ts) como string para o SELECT: o resultado real
  // (integer - numeric) chega como string do driver — mesma cautela dos
  // agregados bigint/numeric do projeto.
  const availableQtySelect = sql<string>`${availableQtyExpression}`;

  const rows = await tx
    .select({
      productId: products.id,
      name: products.name,
      availableQty: availableQtySelect,
    })
    .from(products)
    .where(scope)
    .orderBy(asc(availableQtyExpression), asc(products.name))
    .limit(TODAY_LIST_MAX_ITEMS);

  // `missingQtyTotal` soma TODOS os produtos em falta (não só os 5 de
  // `items`), na mesma consulta do `count()` — sem N+1 (QA Emenda M8/C1).
  const [totalRow] = await tx
    .select({
      value: count(),
      missingQtyTotal: sql<string>`COALESCE(SUM(-(${availableQtyExpression})), 0)::bigint`,
    })
    .from(products)
    .where(scope);

  return {
    shortCount: totalRow?.value ?? 0,
    missingQtyTotal: toSafeInteger(
      totalRow?.missingQtyTotal ?? 0,
      "missingQtyTotal",
    ),
    items: rows.map((row) => {
      const availableQty = toSafeInteger(row.availableQty, "availableQty");
      return {
        productId: row.productId,
        name: row.name,
        availableQty,
        missingQty: -availableQty,
      };
    }),
  };
};

// Aniversariantes da janela (RF-12/A1): `birthdayEntries` (rank cronológico
// de cada `MM-DD`, incluindo a regra de 29/02 — `birthdayWindowRanked`,
// packages/shared/dashboard-metrics.ts) vira uma tabela derivada `VALUES` e
// decide o `ORDER BY` ANTES do `LIMIT` — o filtro antigo (`ORDER BY name`)
// aplicava o limite sobre a ordem alfabética e podia omitir aniversariantes
// de HOJE quando havia mais de 20 na janela (A1). `nextOn` é calculado no
// SERVICE (Task 4.3), não aqui — o rank do SQL só decide quem sobrevive ao
// `LIMIT`. `to_char(birthday, 'YYYY-MM-DD')` garante o formato de string
// esperado por `DashboardBirthdayRowData` independente de como o driver
// serializa colunas `date`.
const loadBirthdays = async (
  tx: Transaction,
  consultantId: string,
  birthdayEntries: BirthdayWindowEntry[],
): Promise<DashboardBirthdayRowData[]> => {
  if (birthdayEntries.length === 0) {
    return [];
  }

  const windowValues = sql.join(
    birthdayEntries.map(
      (entry) => sql`(${entry.monthDay}::text, ${entry.rank}::int)`,
    ),
    sql`, `,
  );

  const rows = await tx.execute<{
    client_id: string;
    name: string;
    whatsapp: string;
    birthday: string;
  }>(sql`
    WITH birthday_window (month_day, rank) AS (
      VALUES ${windowValues}
    )
    SELECT ${clients.id} AS client_id,
      ${clients.name} AS name,
      ${clients.whatsapp} AS whatsapp,
      to_char(${clients.birthday}, 'YYYY-MM-DD') AS birthday
    FROM ${clients}
    JOIN birthday_window
      ON to_char(${clients.birthday}, 'MM-DD') = birthday_window.month_day
    WHERE ${clients.consultantId} = ${consultantId}
    ORDER BY birthday_window.rank ASC, ${clients.name} ASC, ${clients.id} ASC
    LIMIT ${BIRTHDAYS_MAX_ITEMS}
  `);

  return rows.map((row) => ({
    clientId: row.client_id,
    name: row.name,
    whatsapp: row.whatsapp,
    birthday: row.birthday,
  }));
};

// Única camada que toca o banco (api.md/database.md). `today()` abre UMA
// transação read-only `repeatable read` (RF-12) — cobranças/agenda/entregas/
// leads/estoque/aniversariantes vêm do MESMO snapshot.
export const createDashboardTodayRepository = (
  db: Database,
): DashboardTodayRepositoryPort => {
  const today = (
    consultantId: string,
    input: DashboardTodayQueryInput,
  ): Promise<DashboardTodayData> =>
    db.transaction(
      async (tx) => {
        const collections = await loadCollections(tx, consultantId, input);
        const appointmentsBlock = await loadAppointments(
          tx,
          consultantId,
          input,
        );
        const deliveries = await loadDeliveries(tx, consultantId);
        const newLeads = await loadNewLeads(tx);
        const restock = await loadRestock(tx, consultantId);
        const birthdays = await loadBirthdays(
          tx,
          consultantId,
          input.birthdayEntries,
        );

        return {
          collections,
          appointments: appointmentsBlock,
          deliveries,
          newLeads,
          restock,
          birthdays,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

  return { today };
};
