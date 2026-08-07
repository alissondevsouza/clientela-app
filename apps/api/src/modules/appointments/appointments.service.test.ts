import type {
  Appointment,
  AppointmentListItem,
  AppointmentsListQuery,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  AppointmentNotFoundError,
  InvalidAppointmentPersonError,
} from "./appointments.errors";
import {
  type AppointmentPersonRef,
  type AppointmentsRangeBounds,
  type AppointmentsRepositoryPort,
  createAppointmentsService,
  type FindConflictsParams,
  type ListAppointmentsParams,
} from "./appointments.service";

const CONSULTANT_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_1 = "11111111-1111-7111-8111-111111111111";
const LEAD_1 = "22222222-2222-7222-8222-222222222222";
const SALE_1 = "33333333-3333-7333-8333-333333333333";
const APPOINTMENT_1 = "44444444-4444-7444-8444-444444444444";

// Clock fixo (testing.md/lessons: nunca relógio real em teste): 15:00 UTC de
// 05/08/2026 = 12:00 BRT do mesmo dia local — "hoje" é inequivocamente
// 2026-08-05 no fuso da app.
const FIXED_CLOCK_ISO = "2026-08-05T15:00:00.000Z";
const fixedClock = () => new Date(FIXED_CLOCK_ISO);

// Bounds esperados do dia local 2026-08-05 (00:00 BRT = 03:00Z) — conferidos
// contra o helper `appLocalDayRangeUtc` do shared (testado em `time.test.ts`,
// Task 1.2), não recalculados aqui.
const TODAY_START_UTC = "2026-08-05T03:00:00.000Z";
const OTHER_DAY_START_UTC = "2026-08-10T03:00:00.000Z";
const OTHER_DAY_END_UTC = "2026-08-11T03:00:00.000Z";

const buildAppointment = (
  overrides: Partial<Appointment> = {},
): Appointment => ({
  id: APPOINTMENT_1,
  clientId: null,
  clientName: null,
  clientWhatsapp: null,
  leadId: null,
  leadName: null,
  leadWhatsapp: null,
  saleId: null,
  saleTotalCents: null,
  kind: "demo",
  title: null,
  startsAt: FIXED_CLOCK_ISO,
  durationMinutes: 30,
  status: "scheduled",
  location: null,
  notes: null,
  createdAt: FIXED_CLOCK_ISO,
  updatedAt: FIXED_CLOCK_ISO,
  ...overrides,
});

const buildListItem = (
  overrides: Partial<AppointmentListItem> = {},
): AppointmentListItem => {
  const {
    notes: _notes,
    clientWhatsapp: _clientWhatsapp,
    leadWhatsapp: _leadWhatsapp,
    ...rest
  } = buildAppointment();
  return { ...rest, ...overrides };
};

type FakeOptions = {
  clientRefs?: AppointmentPersonRef[];
  leadRefs?: AppointmentPersonRef[];
  createResult?: Appointment;
  listResult?: { rows: AppointmentListItem[]; total: number };
  getByIdResult?: Appointment | undefined;
  updateResult?: Appointment;
  markDoneResult?: Appointment;
  markNoShowResult?: Appointment;
  cancelResult?: Appointment;
  linkSaleResult?: Appointment;
  findConflictsResult?: AppointmentListItem[];
};

const createFakeRepository = (options: FakeOptions = {}) => {
  const clientRefs = options.clientRefs ?? [];
  const leadRefs = options.leadRefs ?? [];
  const calls: {
    findClientById: string[];
    findLeadById: string[];
    create: unknown[];
    list: ListAppointmentsParams[];
    update: unknown[];
    markDone: { id: string; saleId?: string }[];
    linkSale: { id: string; saleId: string | null }[];
    findConflicts: FindConflictsParams[];
  } = {
    findClientById: [],
    findLeadById: [],
    create: [],
    list: [],
    update: [],
    markDone: [],
    linkSale: [],
    findConflicts: [],
  };

  const repository: AppointmentsRepositoryPort = {
    findClientById: async (_consultantId, clientId) => {
      calls.findClientById.push(clientId);
      return clientRefs.find((ref) => ref.id === clientId);
    },
    findLeadById: async (leadId) => {
      calls.findLeadById.push(leadId);
      return leadRefs.find((ref) => ref.id === leadId);
    },
    create: async (consultantId, input) => {
      calls.create.push({ consultantId, input });
      if (!options.createResult) {
        throw new Error("createResult não configurado");
      }
      return options.createResult;
    },
    list: async (_consultantId, params) => {
      calls.list.push(params);
      return options.listResult ?? { rows: [], total: 0 };
    },
    getById: async (_consultantId, _id) => options.getByIdResult,
    update: async (consultantId, id, input) => {
      calls.update.push({ consultantId, id, input });
      if (!options.updateResult) {
        throw new Error("updateResult não configurado");
      }
      return options.updateResult;
    },
    markDone: async (_consultantId, id, saleId) => {
      calls.markDone.push({ id, saleId });
      if (!options.markDoneResult) {
        throw new Error("markDoneResult não configurado");
      }
      return options.markDoneResult;
    },
    markNoShow: async (_consultantId, _id) => {
      if (!options.markNoShowResult) {
        throw new Error("markNoShowResult não configurado");
      }
      return options.markNoShowResult;
    },
    cancel: async (_consultantId, _id) => {
      if (!options.cancelResult) {
        throw new Error("cancelResult não configurado");
      }
      return options.cancelResult;
    },
    linkSale: async (_consultantId, id, saleId) => {
      calls.linkSale.push({ id, saleId });
      if (!options.linkSaleResult) {
        throw new Error("linkSaleResult não configurado");
      }
      return options.linkSaleResult;
    },
    remove: async (_consultantId, _id) => {},
    findConflicts: async (_consultantId, params) => {
      calls.findConflicts.push(params);
      return options.findConflictsResult ?? [];
    },
  };

  return { repository, calls };
};

const buildService = (options: FakeOptions = {}) => {
  const { repository, calls } = createFakeRepository(options);
  return {
    service: createAppointmentsService({ repository, clock: fixedClock }),
    calls,
  };
};

const baseListQuery: AppointmentsListQuery = {
  page: 1,
  perPage: 20,
  range: "upcoming",
};

describe("appointmentsService.create — validação de pessoa (RF-03)", () => {
  it("compromisso sem cliente nem lead é criado sem validar nada", async () => {
    const created = buildAppointment();
    const { service, calls } = buildService({ createResult: created });

    const result = await service.create(CONSULTANT_A, {
      kind: "demo",
      startsAt: FIXED_CLOCK_ISO,
      durationMinutes: 30,
    });

    expect(result).toEqual(created);
    expect(calls.findClientById).toHaveLength(0);
    expect(calls.findLeadById).toHaveLength(0);
    expect(calls.create).toHaveLength(1);
  });

  it("clientId da própria consultora ⇒ valida e persiste (caminho feliz)", async () => {
    const created = buildAppointment({ clientId: CLIENT_1 });
    const { service, calls } = buildService({
      clientRefs: [{ id: CLIENT_1 }],
      createResult: created,
    });

    await service.create(CONSULTANT_A, {
      clientId: CLIENT_1,
      kind: "demo",
      startsAt: FIXED_CLOCK_ISO,
      durationMinutes: 30,
    });

    expect(calls.findClientById).toEqual([CLIENT_1]);
    expect(calls.create).toHaveLength(1);
  });

  it("clientId inexistente/de outra consultora ⇒ InvalidAppointmentPersonError, sem persistir", async () => {
    const { service, calls } = buildService({ clientRefs: [] });

    const error = await service
      .create(CONSULTANT_A, {
        clientId: CLIENT_1,
        kind: "demo",
        startsAt: FIXED_CLOCK_ISO,
        durationMinutes: 30,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidAppointmentPersonError);
    expect(calls.create).toHaveLength(0);
  });

  it("leadId válido ⇒ valida e persiste", async () => {
    const created = buildAppointment({ leadId: LEAD_1 });
    const { service, calls } = buildService({
      leadRefs: [{ id: LEAD_1 }],
      createResult: created,
    });

    await service.create(CONSULTANT_A, {
      leadId: LEAD_1,
      kind: "demo",
      startsAt: FIXED_CLOCK_ISO,
      durationMinutes: 30,
    });

    expect(calls.findLeadById).toEqual([LEAD_1]);
  });

  it("leadId inexistente ⇒ InvalidAppointmentPersonError, sem persistir", async () => {
    const { service, calls } = buildService({ leadRefs: [] });

    const error = await service
      .create(CONSULTANT_A, {
        leadId: LEAD_1,
        kind: "demo",
        startsAt: FIXED_CLOCK_ISO,
        durationMinutes: 30,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidAppointmentPersonError);
    expect(calls.create).toHaveLength(0);
  });
});

describe("appointmentsService.update — validação de pessoa (RF-03) e delegação", () => {
  it("clientId presente e inválido no PUT ⇒ InvalidAppointmentPersonError, sem chamar repository.update", async () => {
    const { service, calls } = buildService({ clientRefs: [] });

    const error = await service
      .update(CONSULTANT_A, APPOINTMENT_1, { clientId: CLIENT_1 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidAppointmentPersonError);
    expect(calls.update).toHaveLength(0);
  });

  it("clientId: null (desvínculo explícito) não valida nada e delega ao repository", async () => {
    const updated = buildAppointment({ clientId: null });
    const { service, calls } = buildService({ updateResult: updated });

    await service.update(CONSULTANT_A, APPOINTMENT_1, { clientId: null });

    expect(calls.findClientById).toHaveLength(0);
    expect(calls.update).toHaveLength(1);
  });

  it("payload válido é repassado integralmente ao repository", async () => {
    const updated = buildAppointment({ location: "Salão da cliente" });
    const { service, calls } = buildService({ updateResult: updated });

    const result = await service.update(CONSULTANT_A, APPOINTMENT_1, {
      location: "Salão da cliente",
    });

    expect(result).toEqual(updated);
    expect(calls.update[0]).toEqual({
      consultantId: CONSULTANT_A,
      id: APPOINTMENT_1,
      input: { location: "Salão da cliente" },
    });
  });
});

describe("appointmentsService — repasses simples (transições, venda, exclusão)", () => {
  it("getById repassa o resultado do repository", async () => {
    const appointment = buildAppointment();
    const { service } = buildService({ getByIdResult: appointment });

    await expect(service.getById(CONSULTANT_A, APPOINTMENT_1)).resolves.toEqual(
      appointment,
    );
  });

  it("getById lança AppointmentNotFoundError quando o repository devolve undefined", async () => {
    const { service } = buildService({ getByIdResult: undefined });

    const error = await service
      .getById(CONSULTANT_A, "inexistente")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppointmentNotFoundError);
  });

  it("markDone sem saleId no corpo repassa saleId undefined (preserva vínculo existente)", async () => {
    const done = buildAppointment({ status: "done" });
    const { service, calls } = buildService({ markDoneResult: done });

    await service.markDone(CONSULTANT_A, APPOINTMENT_1, {});

    expect(calls.markDone[0]).toEqual({ id: APPOINTMENT_1, saleId: undefined });
  });

  it("markDone com saleId repassa o saleId ao repository", async () => {
    const done = buildAppointment({ status: "done", saleId: SALE_1 });
    const { service, calls } = buildService({ markDoneResult: done });

    await service.markDone(CONSULTANT_A, APPOINTMENT_1, { saleId: SALE_1 });

    expect(calls.markDone[0]).toEqual({ id: APPOINTMENT_1, saleId: SALE_1 });
  });

  it("markNoShow repassa o resultado do repository", async () => {
    const noShow = buildAppointment({ status: "no_show" });
    const { service } = buildService({ markNoShowResult: noShow });

    await expect(
      service.markNoShow(CONSULTANT_A, APPOINTMENT_1),
    ).resolves.toEqual(noShow);
  });

  it("cancel repassa o resultado do repository", async () => {
    const canceled = buildAppointment({ status: "canceled" });
    const { service } = buildService({ cancelResult: canceled });

    await expect(service.cancel(CONSULTANT_A, APPOINTMENT_1)).resolves.toEqual(
      canceled,
    );
  });

  it("linkSale repassa saleId (vincular) ao repository", async () => {
    const linked = buildAppointment({ saleId: SALE_1 });
    const { service, calls } = buildService({ linkSaleResult: linked });

    await service.linkSale(CONSULTANT_A, APPOINTMENT_1, { saleId: SALE_1 });

    expect(calls.linkSale[0]).toEqual({ id: APPOINTMENT_1, saleId: SALE_1 });
  });

  it("linkSale repassa saleId: null (desvincular) ao repository", async () => {
    const unlinked = buildAppointment({ saleId: null });
    const { service, calls } = buildService({ linkSaleResult: unlinked });

    await service.linkSale(CONSULTANT_A, APPOINTMENT_1, { saleId: null });

    expect(calls.linkSale[0]).toEqual({ id: APPOINTMENT_1, saleId: null });
  });

  it("remove delega ao repository sem erro", async () => {
    const { service } = buildService();

    await expect(
      service.remove(CONSULTANT_A, APPOINTMENT_1),
    ).resolves.toBeUndefined();
  });

  it("findConflicts envolve o resultado do repository no envelope { data }", async () => {
    const item = buildListItem();
    const { service, calls } = buildService({ findConflictsResult: [item] });

    const result = await service.findConflicts(CONSULTANT_A, {
      startsAt: FIXED_CLOCK_ISO,
      durationMinutes: 30,
    });

    expect(result).toEqual({ data: [item] });
    expect(calls.findConflicts[0]).toEqual({
      startsAt: FIXED_CLOCK_ISO,
      durationMinutes: 30,
      excludeId: undefined,
    });
  });
});

describe("appointmentsService.list — recortes de range → bounds (RF-05)", () => {
  const boundsOf = async (
    query: AppointmentsListQuery,
  ): Promise<AppointmentsRangeBounds> => {
    const { service, calls } = buildService({
      listResult: { rows: [], total: 0 },
    });
    await service.list(CONSULTANT_A, query);
    const [params] = calls.list;
    if (!params) {
      throw new Error("esperava uma chamada a repository.list");
    }
    return params.bounds;
  };

  it("upcoming ⇒ bounds com startUtc no início do dia local de hoje (clock injetado)", async () => {
    const bounds = await boundsOf({ ...baseListQuery, range: "upcoming" });
    expect(bounds).toEqual({ range: "upcoming", startUtc: TODAY_START_UTC });
  });

  it("pending ⇒ bounds com o MESMO startUtc de upcoming (início do dia local de hoje)", async () => {
    const bounds = await boundsOf({ ...baseListQuery, range: "pending" });
    expect(bounds).toEqual({ range: "pending", startUtc: TODAY_START_UTC });
  });

  it("history ⇒ bounds sem recorte de data (o filtro de status vive no repository)", async () => {
    const bounds = await boundsOf({ ...baseListQuery, range: "history" });
    expect(bounds).toEqual({ range: "history" });
  });

  it("day ⇒ bounds [startUtc, endUtc) do dia local informado em `date`", async () => {
    const bounds = await boundsOf({
      ...baseListQuery,
      range: "day",
      date: "2026-08-10",
    });
    expect(bounds).toEqual({
      range: "day",
      startUtc: OTHER_DAY_START_UTC,
      endUtc: OTHER_DAY_END_UTC,
    });
  });

  it("all ⇒ bounds sem nenhum recorte", async () => {
    const bounds = await boundsOf({ ...baseListQuery, range: "all" });
    expect(bounds).toEqual({ range: "all" });
  });

  it("upcoming em instante próximo à virada do dia local usa o dia local correto (não UTC)", async () => {
    // 2026-08-06T02:00:00Z = 23:00 BRT de 05/08 — ainda "hoje" no fuso da app,
    // mesmo já sendo 06/08 em UTC (RF-15/ADR-0018).
    const { repository, calls: nearMidnightCalls } = createFakeRepository({
      listResult: { rows: [], total: 0 },
    });
    const nearMidnightService = createAppointmentsService({
      repository,
      clock: () => new Date("2026-08-06T02:00:00.000Z"),
    });

    await nearMidnightService.list(CONSULTANT_A, {
      ...baseListQuery,
      range: "upcoming",
    });

    const [params] = nearMidnightCalls.list;
    expect(params?.bounds).toEqual({
      range: "upcoming",
      startUtc: TODAY_START_UTC,
    });
  });

  it("filtros combináveis (status/kind/clientId/leadId) e paginação são repassados ao repository", async () => {
    const { service, calls } = buildService({
      listResult: { rows: [], total: 0 },
    });

    await service.list(CONSULTANT_A, {
      page: 2,
      perPage: 10,
      range: "all",
      status: "done",
      kind: "follow_up",
      clientId: CLIENT_1,
      leadId: undefined,
    });

    expect(calls.list[0]).toEqual({
      page: 2,
      perPage: 10,
      bounds: { range: "all" },
      status: "done",
      kind: "follow_up",
      clientId: CLIENT_1,
      leadId: undefined,
    });
  });

  it("monta o envelope paginado com os dados do repository", async () => {
    const item = buildListItem();
    const { service } = buildService({
      listResult: { rows: [item], total: 1 },
    });

    const result = await service.list(CONSULTANT_A, {
      ...baseListQuery,
      page: 1,
      perPage: 20,
    });

    expect(result).toEqual({ data: [item], page: 1, perPage: 20, total: 1 });
  });
});
