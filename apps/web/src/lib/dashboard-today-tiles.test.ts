import type { DashboardToday } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { buildTodayTiles } from "./dashboard-today-tiles";
import { formatBRL } from "./format";

// Um grupo de cobrança genérico (RF-12: grupo existe quando há parcela
// atrasada OU de hoje) — usado só para deixar a seção "Cobranças" visível nos
// cenários que não testam o conteúdo do grupo em si (`dashboard-today-view.ts`
// exige `groups.length > 0` para exibir a seção fora do caso "só próximos 7
// dias").
const sampleCollectionsGroup = (
  overdue: boolean,
): DashboardToday["collections"]["groups"][number] => ({
  clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f",
  saleId: null,
  name: "Maria Silva",
  whatsapp: "5511912345678",
  amountCents: 5_000,
  installmentsCount: 1,
  oldestDueDate: overdue ? "2026-09-10" : "2026-09-23",
  overdue,
});

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

// Instante "agora" fixo para todos os testes que não são especificamente
// sobre a regra do "próximo compromisso" (A1) — 09:00 local, antes do
// `baseAppointment` padrão do describe "Agenda" (15:00 local), então os
// testes que não mexem com o relógio continuam vendo esse compromisso como
// "próximo". `buildTodayTiles` é função pura: nunca lê o relógio real.
const NOW_ISO = "2026-09-23T12:00:00.000Z";

describe("buildTodayTiles (RF-20a)", () => {
  it("tudo vazio ⇒ nenhum cartão", () => {
    expect(buildTodayTiles(EMPTY_TODAY, NOW_ISO)).toEqual([]);
  });

  describe("Cobranças", () => {
    it("com atrasadas: valor 'em atraso', resumo combina atrasadas e hoje, tom alert", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        collections: {
          ...EMPTY_TODAY.collections,
          overdueCount: 3,
          overdueCents: 11_655,
          dueTodayCount: 1,
          dueTodayCents: 5_000,
          groups: [sampleCollectionsGroup(true)],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        key: "collections",
        title: "Cobranças",
        value: `${formatBRL(11_655)} em atraso`,
        summary: "3 atrasadas · 1 vence hoje",
        href: "/crm/today#cobrancas",
        tone: "alert",
      });
    });

    it("singular: 1 atrasada · 1 vence hoje", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        collections: {
          ...EMPTY_TODAY.collections,
          overdueCount: 1,
          overdueCents: 5_000,
          dueTodayCount: 1,
          dueTodayCents: 5_000,
          groups: [sampleCollectionsGroup(true)],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile?.summary).toBe("1 atrasada · 1 vence hoje");
    });

    it("plural de 'vence hoje' sem atraso: valor do dia, resumo 'N vencem hoje', tom default", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        collections: {
          ...EMPTY_TODAY.collections,
          dueTodayCount: 2,
          dueTodayCents: 8_000,
          groups: [sampleCollectionsGroup(false)],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        value: formatBRL(8_000),
        summary: "2 vencem hoje",
        tone: "default",
      });
    });

    it("só próximos 7 dias: valor e resumo dos próximos 7 dias, tom default", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        collections: {
          ...EMPTY_TODAY.collections,
          next7Count: 4,
          next7Cents: 20_000,
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        value: formatBRL(20_000),
        summary: "4 nos próximos 7 dias",
        tone: "default",
      });
    });
  });

  describe("Agenda", () => {
    const baseAppointment = {
      id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e70",
      kind: "demo" as const,
      title: null,
      startsAt: "2026-09-23T18:00:00.000Z",
      clientId: null,
      clientName: null,
      clientWhatsapp: null,
      leadId: null,
      leadName: null,
      leadWhatsapp: null,
    };

    it("com cliente: 'N compromissos' e o horário local + primeiro nome", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        appointments: {
          total: 2,
          items: [
            {
              ...baseAppointment,
              clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e01",
              clientName: "Fernanda Souza",
            },
          ],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        key: "appointments",
        title: "Agenda",
        value: "2 compromissos",
        summary: "próximo às 15:00 · Fernanda",
        href: "/crm/today#agenda",
        tone: "default",
      });
    });

    it("singular: '1 compromisso'", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        appointments: { total: 1, items: [baseAppointment] },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile?.value).toBe("1 compromisso");
    });

    it("sem pessoa e sem título: cai para o rótulo do tipo", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        appointments: { total: 1, items: [baseAppointment] },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile?.summary).toBe("próximo às 15:00 · Sessão demonstrativa");
    });

    it("sem pessoa, com título livre: usa o título (sem encurtar)", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        appointments: {
          total: 1,
          items: [{ ...baseAppointment, title: "Consulta de retorno" }],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile?.summary).toBe("próximo às 15:00 · Consulta de retorno");
    });
  });

  // QA Emenda M8/A1: o helper ignorava a ordem do relógio e sempre pegava o
  // PRIMEIRO item da lista (que já vem ordenada por horário — RF-12), mesmo
  // que já tivesse passado. Agora recebe o instante atual e escolhe o
  // primeiro compromisso ainda por vir.
  describe("Agenda — próximo compromisso considera o relógio (A1)", () => {
    const earlyAppointment = {
      id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e80",
      kind: "demo" as const,
      title: null,
      startsAt: "2026-09-23T12:00:00.000Z", // 09:00 local
      clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e81",
      clientName: "Ana Lima",
      clientWhatsapp: null,
      leadId: null,
      leadName: null,
      leadWhatsapp: null,
    };
    const lateAppointment = {
      id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e82",
      kind: "demo" as const,
      title: null,
      startsAt: "2026-09-23T21:00:00.000Z", // 18:00 local
      clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e83",
      clientName: "Zélia Prado",
      clientWhatsapp: null,
      leadId: null,
      leadName: null,
      leadWhatsapp: null,
    };
    const twoAppointmentsToday: DashboardToday = {
      ...EMPTY_TODAY,
      appointments: {
        total: 2,
        items: [earlyAppointment, lateAppointment],
      },
    };

    it("todos futuros: pega o primeiro da lista (mais cedo)", () => {
      const [tile] = buildTodayTiles(
        twoAppointmentsToday,
        "2026-09-23T10:00:00.000Z", // 07:00 local — antes dos dois
      );
      expect(tile?.summary).toBe("próximo às 09:00 · Ana");
    });

    it("alguns passados: ignora o que já passou e pega o próximo ainda por vir", () => {
      const [tile] = buildTodayTiles(
        twoAppointmentsToday,
        "2026-09-23T17:40:00.000Z", // 14:40 local — entre os dois
      );
      expect(tile?.summary).toBe("próximo às 18:00 · Zélia");
    });

    it("todos passados: resumo cai para 'N para hoje', nunca aponta um horário que já passou", () => {
      const [tile] = buildTodayTiles(
        twoAppointmentsToday,
        "2026-09-23T23:00:00.000Z", // 20:00 local — depois dos dois
      );
      expect(tile?.value).toBe("2 compromissos");
      expect(tile?.summary).toBe("2 para hoje");
    });
  });

  describe("A entregar", () => {
    it("'N vendas' e o valor total", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        deliveries: {
          total: 1,
          totalCents: 39_980,
          items: [
            {
              saleId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e71",
              clientName: "Maria Silva",
              totalCents: 39_980,
              soldAt: "2026-09-20T13:00:00.000Z",
            },
          ],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        key: "deliveries",
        title: "A entregar",
        value: "1 venda",
        summary: formatBRL(39_980),
        href: "/crm/today#entregas",
      });
    });

    it("plural: 'N vendas'", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        deliveries: {
          total: 2,
          totalCents: 10_000,
          items: [
            {
              saleId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e71",
              clientName: "Maria Silva",
              totalCents: 5_000,
              soldAt: "2026-09-20T13:00:00.000Z",
            },
          ],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile?.value).toBe("2 vendas");
    });
  });

  describe("Leads novos", () => {
    it("'N leads' e o primeiro nome da mais recente", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        newLeads: {
          total: 2,
          items: [
            {
              id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e72",
              name: "Gabriela Nunes",
              whatsapp: "5511912345678",
              interest: null,
              createdAt: "2026-09-23T10:00:00.000Z",
            },
          ],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        key: "newLeads",
        title: "Leads novos",
        value: "2 leads",
        summary: "mais recente: Gabriela",
        href: "/crm/today#leads",
      });
    });

    it("singular: '1 lead'", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        newLeads: {
          total: 1,
          items: [
            {
              id: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e72",
              name: "Gabriela Nunes",
              whatsapp: "5511912345678",
              interest: null,
              createdAt: "2026-09-23T10:00:00.000Z",
            },
          ],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile?.value).toBe("1 lead");
    });
  });

  describe("Encomendas sem estoque", () => {
    it("'N produtos' e o total de unidades que faltam (missingQtyTotal do backend)", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
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
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        key: "restock",
        title: "Encomendas sem estoque",
        value: "1 produto",
        summary: "faltam 2 un.",
        href: "/crm/today#estoque",
      });
    });

    it("plural: 'N produtos' e o missingQtyTotal (não a soma dos itens exibidos)", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        restock: {
          shortCount: 2,
          missingQtyTotal: 5,
          items: [
            {
              productId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e74",
              name: "Batom matte",
              availableQty: -2,
              missingQty: 2,
            },
            {
              productId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e75",
              name: "Base líquida",
              availableQty: -3,
              missingQty: 3,
            },
          ],
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        value: "2 produtos",
        summary: "faltam 5 un.",
      });
    });

    // QA Emenda M8/C1: com mais de 5 produtos em falta, `items` só traz os 5
    // exibidos (RF-12) — somar só esses itens SUBESTIMA o total ("faltam 35
    // un." quando o real era 42). `missingQtyTotal` vem pronto do backend
    // (SUM sobre TODOS os produtos em falta), então o cartão tem que usá-lo
    // mesmo quando ele diverge muito da soma dos itens exibidos.
    it("shortCount > items.length: usa missingQtyTotal, não a soma parcial dos itens exibidos", () => {
      const missingQtyOfDisplayedItems = [9, 8, 7, 6, 5]; // soma 35 — só os 5 exibidos
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        restock: {
          shortCount: 7,
          missingQtyTotal: 42,
          items: missingQtyOfDisplayedItems.map((missingQty, index) => ({
            productId: `018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e${String(90 + index)}`,
            name: `Produto ${index + 1}`,
            availableQty: -missingQty,
            missingQty,
          })),
        },
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        value: "7 produtos",
        summary: "faltam 42 un.",
      });
    });
  });

  describe("Aniversariantes", () => {
    it("quem faz hoje aparece no resumo, mesmo sem ser o primeiro da lista", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        birthdays: [
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e73",
            name: "Ana Lima",
            whatsapp: "5511912345678",
            birthday: "1990-09-27",
            nextOn: "2026-09-27",
          },
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e76",
            name: "Maria Souza",
            whatsapp: "5511912345679",
            birthday: "1990-09-23",
            nextOn: "2026-09-23",
          },
        ],
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        key: "birthdays",
        title: "Aniversariantes",
        value: "2 nesta semana",
        summary: "Maria faz hoje",
        href: "/crm/today#aniversariantes",
      });
    });

    // QA Emenda M8/S3: com mais de uma pessoa fazendo aniversário hoje, o
    // resumo mostrava só a primeira ("Ana faz hoje"), escondendo as demais.
    it("mais de uma pessoa faz aniversário hoje: 'Nome e mais N fazem hoje'", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        birthdays: [
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e73",
            name: "Ana Lima",
            whatsapp: "5511912345678",
            birthday: "1990-09-23",
            nextOn: "2026-09-23",
          },
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e76",
            name: "Maria Souza",
            whatsapp: "5511912345679",
            birthday: "1990-09-23",
            nextOn: "2026-09-23",
          },
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e77",
            name: "Carla Nunes",
            whatsapp: "5511912345680",
            birthday: "1990-09-23",
            nextOn: "2026-09-23",
          },
        ],
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        value: "3 nesta semana",
        summary: "Ana e mais 2 fazem hoje",
      });
    });

    it("sem aniversário hoje: mostra a/o próxima(o), já ordenada por nextOn", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
        birthdays: [
          {
            clientId: "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e73",
            name: "Ana Lima",
            whatsapp: "5511912345678",
            birthday: "1990-09-27",
            nextOn: "2026-09-27",
          },
        ],
      };
      const [tile] = buildTodayTiles(today, NOW_ISO);
      expect(tile).toMatchObject({
        value: "1 nesta semana",
        summary: "próxima: Ana em 27/09",
      });
    });
  });

  describe("Omissão e ordem", () => {
    it("tipo sem itens não gera cartão", () => {
      const today: DashboardToday = {
        ...EMPTY_TODAY,
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
      };
      const tiles = buildTodayTiles(today, NOW_ISO);
      expect(tiles.map((tile) => tile.key)).toEqual(["deliveries"]);
    });

    it("ordem dos cartões segue a ordem das seções do RF-20 quando todas estão visíveis", () => {
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

      const tiles = buildTodayTiles(today, NOW_ISO);
      expect(tiles.map((tile) => tile.key)).toEqual([
        "collections",
        "appointments",
        "deliveries",
        "newLeads",
        "restock",
        "birthdays",
      ]);
    });
  });
});
