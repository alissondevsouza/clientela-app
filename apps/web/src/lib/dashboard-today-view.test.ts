import type { DashboardToday } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  isTodayEmpty,
  TODAY_SECTION_ANCHORS,
  TODAY_SECTION_KEYS,
  visibleTodaySections,
} from "./dashboard-today-view";

const EMPTY_TODAY: DashboardToday = {
  today: "2026-09-23",
  collections: {
    overdueCount: 0,
    overdueCents: 0,
    dueTodayCount: 0,
    dueTodayCents: 0,
    next7Count: 0,
    next7Cents: 0,
    groupsTotal: 0,
    groups: [],
  },
  appointments: { total: 0, items: [] },
  deliveries: { total: 0, totalCents: 0, items: [] },
  newLeads: { total: 0, items: [] },
  restock: { shortCount: 0, missingQtyTotal: 0, items: [] },
  birthdays: [],
};

describe("visibleTodaySections / isTodayEmpty (RF-20)", () => {
  it("tudo vazio ⇒ nenhuma seção visível e 'Tudo em dia por hoje'", () => {
    expect(visibleTodaySections(EMPTY_TODAY)).toEqual([]);
    expect(isTodayEmpty(EMPTY_TODAY)).toBe(true);
  });

  it("cobranças aparecem só com grupos, mesmo sem próximos 7 dias", () => {
    const today: DashboardToday = {
      ...EMPTY_TODAY,
      collections: {
        ...EMPTY_TODAY.collections,
        overdueCount: 1,
        overdueCents: 15_000,
        groupsTotal: 1,
        groups: [
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f",
            saleId: null,
            name: "Maria Silva",
            whatsapp: "5511912345678",
            amountCents: 15_000,
            installmentsCount: 1,
            oldestDueDate: "2026-09-10",
            overdue: true,
          },
        ],
      },
    };
    expect(visibleTodaySections(today)).toEqual(["collections"]);
    expect(isTodayEmpty(today)).toBe(false);
  });

  it("cobranças aparecem SÓ com o resumo dos próximos 7 dias (sem grupos hoje/atrasadas)", () => {
    const today: DashboardToday = {
      ...EMPTY_TODAY,
      collections: {
        ...EMPTY_TODAY.collections,
        next7Count: 2,
        next7Cents: 20_000,
      },
    };
    expect(visibleTodaySections(today)).toEqual(["collections"]);
  });

  it("agenda, entregas, leads novos e aniversariantes só aparecem com itens", () => {
    const today: DashboardToday = {
      ...EMPTY_TODAY,
      appointments: {
        total: 1,
        items: [
          {
            id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e70",
            kind: "demo",
            title: null,
            startsAt: "2026-09-23T13:00:00.000Z",
            clientId: null,
            clientName: null,
            clientWhatsapp: null,
            leadId: null,
            leadName: null,
            leadWhatsapp: null,
          },
        ],
      },
      deliveries: {
        total: 1,
        totalCents: 10_000,
        items: [
          {
            saleId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e71",
            clientName: "Maria Silva",
            totalCents: 10_000,
            soldAt: "2026-09-20T13:00:00.000Z",
          },
        ],
      },
      newLeads: {
        total: 1,
        items: [
          {
            id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e72",
            name: "Joana Souza",
            whatsapp: "5511912345678",
            interest: null,
            createdAt: "2026-09-23T10:00:00.000Z",
          },
        ],
      },
      birthdays: [
        {
          clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e73",
          name: "Ana Lima",
          whatsapp: "5511912345678",
          birthday: "1990-09-25",
          nextOn: "2026-09-25",
        },
      ],
    };

    expect(visibleTodaySections(today)).toEqual([
      "appointments",
      "deliveries",
      "newLeads",
      "birthdays",
    ]);
  });

  it("encomendas sem estoque só aparecem quando shortCount > 0", () => {
    const withItemsButZeroShortCount: DashboardToday = {
      ...EMPTY_TODAY,
      restock: {
        shortCount: 0,
        missingQtyTotal: 2,
        items: [
          {
            productId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e74",
            name: "Batom matte",
            availableQty: -2,
            missingQty: 2,
          },
        ],
      },
    };
    // `shortCount` é a fonte da verdade de visibilidade, não o tamanho de
    // `items` — evita a seção "piscar" visível por um item órfão inconsistente.
    expect(visibleTodaySections(withItemsButZeroShortCount)).toEqual([]);

    const withShortCount: DashboardToday = {
      ...EMPTY_TODAY,
      restock: { shortCount: 2, missingQtyTotal: 4, items: [] },
    };
    expect(visibleTodaySections(withShortCount)).toEqual(["restock"]);
  });

  it("ordem das seções segue o RF-20 quando todas estão visíveis", () => {
    const today: DashboardToday = {
      today: "2026-09-23",
      collections: {
        overdueCount: 1,
        overdueCents: 15_000,
        dueTodayCount: 0,
        dueTodayCents: 0,
        next7Count: 0,
        next7Cents: 0,
        groupsTotal: 1,
        groups: [
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f",
            saleId: null,
            name: "Maria Silva",
            whatsapp: "5511912345678",
            amountCents: 15_000,
            installmentsCount: 1,
            oldestDueDate: "2026-09-10",
            overdue: true,
          },
        ],
      },
      appointments: {
        total: 1,
        items: [
          {
            id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e70",
            kind: "demo",
            title: null,
            startsAt: "2026-09-23T13:00:00.000Z",
            clientId: null,
            clientName: null,
            clientWhatsapp: null,
            leadId: null,
            leadName: null,
            leadWhatsapp: null,
          },
        ],
      },
      deliveries: {
        total: 1,
        totalCents: 10_000,
        items: [
          {
            saleId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e71",
            clientName: "Maria Silva",
            totalCents: 10_000,
            soldAt: "2026-09-20T13:00:00.000Z",
          },
        ],
      },
      newLeads: {
        total: 1,
        items: [
          {
            id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e72",
            name: "Joana Souza",
            whatsapp: "5511912345678",
            interest: null,
            createdAt: "2026-09-23T10:00:00.000Z",
          },
        ],
      },
      restock: {
        shortCount: 1,
        missingQtyTotal: 2,
        items: [
          {
            productId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e74",
            name: "Batom matte",
            availableQty: -2,
            missingQty: 2,
          },
        ],
      },
      birthdays: [
        {
          clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e73",
          name: "Ana Lima",
          whatsapp: "5511912345678",
          birthday: "1990-09-25",
          nextOn: "2026-09-25",
        },
      ],
    };

    expect(visibleTodaySections(today)).toEqual([
      "collections",
      "appointments",
      "deliveries",
      "newLeads",
      "restock",
      "birthdays",
    ]);
  });
});

// QA Emenda M8/S2: `dashboard-today-tiles.ts` (cartão da home) e
// `today-details.tsx` (seção de `/crm/today`) usavam listas de âncoras
// duplicadas, sem teste garantindo que concordavam. Agora as duas importam
// esta constante — este teste garante que ela nunca fica incompleta (uma
// chave sem âncora quebraria os dois lugares do mesmo jeito).
describe("TODAY_SECTION_ANCHORS (RF-28)", () => {
  it("tem uma âncora estável para cada seção do RF-20", () => {
    expect(Object.keys(TODAY_SECTION_ANCHORS).sort()).toEqual(
      [...TODAY_SECTION_KEYS].sort(),
    );
    expect(TODAY_SECTION_ANCHORS).toEqual({
      collections: "cobrancas",
      appointments: "agenda",
      deliveries: "entregas",
      newLeads: "leads",
      restock: "estoque",
      birthdays: "aniversariantes",
    });
  });
});
