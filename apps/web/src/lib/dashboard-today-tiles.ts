// Cartões-resumo do bloco Hoje na home (RF-20a — emenda de 2026-09-24): um
// cartão por tipo VISÍVEL do RF-12, na mesma ordem de `visibleTodaySections`,
// cada um com só um número principal e uma linha de resumo — o conteúdo
// detalhado (listas, botões de WhatsApp) mudou para `/crm/today` (RF-28) e
// cada cartão é um link para a âncora da seção correspondente lá. Função
// pura, testável sem jsdom (lessons.md).

import {
  APPOINTMENT_KIND_LABELS,
  appLocalTimeHm,
  type DashboardToday,
  resolveAppointmentPerson,
} from "@clientela/shared";
import { firstName } from "./dashboard-messages";
import { formatDayMonthBr } from "./dashboard-today-format";
import {
  TODAY_SECTION_ANCHORS,
  type TodaySectionKey,
  visibleTodaySections,
} from "./dashboard-today-view";
import { formatBRL } from "./format";

export type TodayTileTone = "default" | "alert";

export type TodayTile = {
  key: TodaySectionKey;
  title: string;
  value: string;
  summary: string;
  href: string;
  tone: TodayTileTone;
};

const TODAY_PATH = "/crm/today";

const TILE_TITLES: Record<TodaySectionKey, string> = {
  collections: "Cobranças",
  appointments: "Agenda",
  deliveries: "A entregar",
  newLeads: "Leads novos",
  restock: "Encomendas sem estoque",
  birthdays: "Aniversariantes",
};

const tileHref = (key: TodaySectionKey): string =>
  `${TODAY_PATH}#${TODAY_SECTION_ANCHORS[key]}`;

const SINGLE = 1;
const pluralize = (count: number, singular: string, plural: string): string =>
  count === SINGLE ? singular : plural;

/** Primeiro nome, com fallback para o nome inteiro (nome vazio não ocorre nos dados do Hoje — só por segurança). */
const shortName = (name: string): string => firstName(name) ?? name;

// Cobranças (RF-20a): `value` prioriza o valor em atraso, depois o de hoje,
// depois o dos próximos 7 dias — o primeiro que existir; `summary` combina
// atrasadas/hoje quando algum dos dois existe, senão cai no resumo dos
// próximos 7 dias. `tone: "alert"` só quando há atraso (a cor é só reforço —
// o texto já diz "em atraso").
function collectionsTile(
  collections: DashboardToday["collections"],
): TodayTile {
  const summaryParts: string[] = [];
  if (collections.overdueCount > 0) {
    summaryParts.push(
      `${collections.overdueCount} ${pluralize(collections.overdueCount, "atrasada", "atrasadas")}`,
    );
  }
  if (collections.dueTodayCount > 0) {
    summaryParts.push(
      `${collections.dueTodayCount} ${pluralize(collections.dueTodayCount, "vence hoje", "vencem hoje")}`,
    );
  }
  const summary =
    summaryParts.length > 0
      ? summaryParts.join(" · ")
      : `${collections.next7Count} nos próximos 7 dias`;

  const value =
    collections.overdueCount > 0
      ? `${formatBRL(collections.overdueCents)} em atraso`
      : collections.dueTodayCount > 0
        ? formatBRL(collections.dueTodayCents)
        : formatBRL(collections.next7Cents);

  return {
    key: "collections",
    title: TILE_TITLES.collections,
    value,
    summary,
    href: tileHref("collections"),
    tone: collections.overdueCount > 0 ? "alert" : "default",
  };
}

// Rótulo da pessoa de um compromisso — mesma precedência de
// `today-section.tsx` (cliente/lead > título livre > rótulo do tipo), com o
// PRIMEIRO NOME quando é mesmo uma pessoa (título livre não é encurtado: não
// é um nome).
const appointmentPersonLabel = (
  item: DashboardToday["appointments"]["items"][number],
): string => {
  const person = resolveAppointmentPerson(item);
  if (person.name !== null) {
    return shortName(person.name);
  }
  if (item.title !== null && item.title.trim().length > 0) {
    return item.title;
  }
  return APPOINTMENT_KIND_LABELS[item.kind];
};

// Agenda (RF-20a): `value` é a contagem de hoje; `summary` é o horário e a
// pessoa do PRÓXIMO compromisso ainda por vir (`startsAt >= nowIso`), não o
// primeiro da lista — às 14h um compromisso das 9h já passou e não é mais
// "próximo" (QA Emenda M8/A1). A lista tem no máximo 5 itens (RF-12): se
// houver mais compromissos pela manhã, o próximo de fato pode não estar
// nela — mesma limitação assumida nas outras seções resumidas. Quando NENHUM
// item listado ainda está por vir, cai no total do dia ("N para hoje"), sem
// fingir que existe um próximo.
function appointmentsTile(
  appointments: DashboardToday["appointments"],
  nowIso: string,
): TodayTile {
  const next = appointments.items.find((item) => item.startsAt >= nowIso);
  const summary =
    next !== undefined
      ? `próximo às ${appLocalTimeHm(next.startsAt)} · ${appointmentPersonLabel(next)}`
      : appointments.items.length > 0
        ? `${appointments.total} para hoje`
        : "";

  return {
    key: "appointments",
    title: TILE_TITLES.appointments,
    value: `${appointments.total} ${pluralize(appointments.total, "compromisso", "compromissos")}`,
    summary,
    href: tileHref("appointments"),
    tone: "default",
  };
}

function deliveriesTile(deliveries: DashboardToday["deliveries"]): TodayTile {
  return {
    key: "deliveries",
    title: TILE_TITLES.deliveries,
    value: `${deliveries.total} ${pluralize(deliveries.total, "venda", "vendas")}`,
    summary: formatBRL(deliveries.totalCents),
    href: tileHref("deliveries"),
    tone: "default",
  };
}

function newLeadsTile(newLeads: DashboardToday["newLeads"]): TodayTile {
  const [mostRecent] = newLeads.items;
  return {
    key: "newLeads",
    title: TILE_TITLES.newLeads,
    value: `${newLeads.total} ${pluralize(newLeads.total, "lead", "leads")}`,
    summary:
      mostRecent === undefined
        ? ""
        : `mais recente: ${shortName(mostRecent.name)}`,
    href: tileHref("newLeads"),
    tone: "default",
  };
}

// `missingQtyTotal` já é o total de TODOS os produtos em falta, calculado no
// backend (`GET /dashboard/today`) — não só a soma dos itens exibidos (até
// 5), que subestimaria o número com `shortCount > 5` (QA Emenda M8/C1).
function restockTile(restock: DashboardToday["restock"]): TodayTile {
  return {
    key: "restock",
    title: TILE_TITLES.restock,
    value: `${restock.shortCount} ${pluralize(restock.shortCount, "produto", "produtos")}`,
    summary: `faltam ${restock.missingQtyTotal} un.`,
    href: tileHref("restock"),
    tone: "default",
  };
}

const NO_EXTRA = 0;

// Aniversariantes (RF-20a): `summary` mostra quem faz aniversário HOJE
// (`nextOn === today.today`) quando existir; senão a/o próxima(o) da lista,
// já ordenada por `nextOn` (RF-12) — o primeiro item É o mais próximo. Com
// mais de uma pessoa fazendo aniversário hoje, "Ana faz hoje" escondia as
// demais — agora soma quem mais faz ("Ana e mais 1 fazem hoje", QA Emenda
// M8/S3); "fazem" concorda no plural sempre que há mais de uma pessoa.
function birthdaysTile(
  birthdays: DashboardToday["birthdays"],
  todayIso: string,
): TodayTile {
  const dueToday = birthdays.filter((item) => item.nextOn === todayIso);
  const [firstDueToday] = dueToday;
  const extraDueTodayCount = dueToday.length - 1;
  const [next] = birthdays;
  const summary =
    firstDueToday !== undefined
      ? extraDueTodayCount > NO_EXTRA
        ? `${shortName(firstDueToday.name)} e mais ${extraDueTodayCount} fazem hoje`
        : `${shortName(firstDueToday.name)} faz hoje`
      : next !== undefined
        ? `próxima: ${shortName(next.name)} em ${formatDayMonthBr(next.nextOn)}`
        : "";

  return {
    key: "birthdays",
    title: TILE_TITLES.birthdays,
    value: `${birthdays.length} nesta semana`,
    summary,
    href: tileHref("birthdays"),
    tone: "default",
  };
}

function buildTile(
  key: TodaySectionKey,
  today: DashboardToday,
  nowIso: string,
): TodayTile {
  switch (key) {
    case "collections":
      return collectionsTile(today.collections);
    case "appointments":
      return appointmentsTile(today.appointments, nowIso);
    case "deliveries":
      return deliveriesTile(today.deliveries);
    case "newLeads":
      return newLeadsTile(today.newLeads);
    case "restock":
      return restockTile(today.restock);
    case "birthdays":
      return birthdaysTile(today.birthdays, today.today);
  }
}

/**
 * Monta os cartões-resumo do bloco Hoje da home (RF-20a), na mesma ordem de
 * `visibleTodaySections` — tipo sem itens simplesmente não gera cartão.
 * `nowIso` é o instante ATUAL (não o dia), injetado pela page a partir do
 * relógio do servidor — decide o "próximo compromisso" do cartão Agenda
 * (QA Emenda M8/A1); nunca lido de dentro deste helper (função pura,
 * testável com relógio fixo).
 */
export function buildTodayTiles(
  today: DashboardToday,
  nowIso: string,
): TodayTile[] {
  return visibleTodaySections(today).map((key) =>
    buildTile(key, today, nowIso),
  );
}
