// Visibilidade das seções do bloco Hoje (RF-20): "seção sem itens não
// aparece"; quando NENHUMA seção tem itens, o bloco mostra o estado único
// "Tudo em dia por hoje". Helper puro — a page decide o layout, este módulo só
// decide O QUE aparece e em que ORDEM (a mesma do RF-20).

import type { DashboardToday } from "@clientela/shared";

export const TODAY_SECTION_KEYS = [
  "collections",
  "appointments",
  "deliveries",
  "newLeads",
  "restock",
  "birthdays",
] as const;

export type TodaySectionKey = (typeof TODAY_SECTION_KEYS)[number];

// Âncoras do RF-28 — única fonte, usada pelo cartão-resumo da home
// (`dashboard-today-tiles.ts`) e pela seção correspondente de `/crm/today`
// (`today-details.tsx`), para as duas nunca divergirem (QA Emenda M8/S2:
// antes duplicado em `TILE_ANCHORS`/`SECTION_ANCHORS`, sem teste de
// igualdade).
export const TODAY_SECTION_ANCHORS: Record<TodaySectionKey, string> = {
  collections: "cobrancas",
  appointments: "agenda",
  deliveries: "entregas",
  newLeads: "leads",
  restock: "estoque",
  birthdays: "aniversariantes",
};

// Cobranças é a única seção com um critério de visibilidade que NÃO é "tem
// itens": ela aparece também só com o resumo dos próximos 7 dias, sem nenhum
// grupo acionável hoje (RF-20).
const isSectionVisible = (
  today: DashboardToday,
  key: TodaySectionKey,
): boolean => {
  switch (key) {
    case "collections":
      return (
        today.collections.groups.length > 0 || today.collections.next7Count > 0
      );
    case "appointments":
      return today.appointments.items.length > 0;
    case "deliveries":
      return today.deliveries.items.length > 0;
    case "newLeads":
      return today.newLeads.items.length > 0;
    case "restock":
      return today.restock.shortCount > 0;
    case "birthdays":
      return today.birthdays.length > 0;
  }
};

/** Chaves das seções visíveis, na mesma ordem do RF-20. */
export function visibleTodaySections(today: DashboardToday): TodaySectionKey[] {
  return TODAY_SECTION_KEYS.filter((key) => isSectionVisible(today, key));
}

/** Nenhuma seção tem o que mostrar — vira o estado único "Tudo em dia por hoje" (RF-20). */
export function isTodayEmpty(today: DashboardToday): boolean {
  return visibleTodaySections(today).length === 0;
}
