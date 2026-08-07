import type {
  Client,
  CreateLeadCrm,
  CrmLead,
  LeadCaptureRequest,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { LeadAlreadyConvertedError, LeadNotFoundError } from "./leads.errors";
import {
  type ConvertLeadClientData,
  createLeadsService,
  type LeadsRepositoryPort,
} from "./leads.service";

type InsertedLead = Parameters<LeadsRepositoryPort["insert"]>[0];

const REPO_ID = "11111111-1111-7111-8111-111111111111";
const SYNTHETIC_ID = "99999999-9999-7999-8999-999999999999";
const CONSULTANT_ID = "22222222-2222-7222-8222-222222222222";
const CREATED_CLIENT_ID = "33333333-3333-7333-8333-333333333333";
const FIXED_NOW = new Date("2026-07-16T12:00:00.000Z");

const buildLead = (overrides: Partial<CrmLead> = {}): CrmLead => ({
  id: "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
  name: "Maria Silva",
  whatsapp: "11987654321",
  interest: null,
  source: "landing",
  status: "new",
  clientId: null,
  createdAt: "2026-07-16T12:00:00.000Z",
  ...overrides,
});

// Fake em memória com a semântica real do repositório: filtro/ordem/paginação,
// guarda de já-convertido no updateStatus/convert. Expõe os stores para as
// asserções de efeito observável (testing.md: comportamento, não implementação).
const createFakeRepository = (initial: CrmLead[] = []) => {
  const store = new Map<string, CrmLead>();
  for (const lead of initial) {
    store.set(lead.id, lead);
  }
  const insertCalls: InsertedLead[] = [];
  const convertCalls: {
    leadId: string;
    insertClient: ConvertLeadClientData;
  }[] = [];

  const repository: LeadsRepositoryPort = {
    insert: async (lead) => {
      insertCalls.push(lead);
      // Espelha o repositório real: o insert persiste a linha, então
      // `findById(REPO_ID)` logo depois (createManual) enxerga o lead recém-
      // criado com os campos que o repositório real gravaria por default.
      store.set(REPO_ID, {
        id: REPO_ID,
        name: lead.name,
        whatsapp: lead.whatsapp,
        interest: lead.interest ?? null,
        source: lead.source ?? "landing",
        status: lead.status ?? "new",
        clientId: null,
        createdAt: FIXED_NOW.toISOString(),
      });
      return { id: REPO_ID };
    },
    list: async ({ page, perPage, status }) => {
      const all = [...store.values()]
        .filter((lead) => (status ? lead.status === status : true))
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) {
            return a.createdAt < b.createdAt ? 1 : -1;
          }
          return a.id < b.id ? 1 : -1;
        });
      const offset = (page - 1) * perPage;
      return { rows: all.slice(offset, offset + perPage), total: all.length };
    },
    findById: async (id) => store.get(id),
    updateStatus: async (id, status) => {
      const lead = store.get(id);
      if (!lead || lead.status === "converted") {
        return undefined;
      }
      const updated = { ...lead, status };
      store.set(id, updated);
      return updated;
    },
    convert: async (leadId, insertClient) => {
      convertCalls.push({ leadId, insertClient });
      const lead = store.get(leadId);
      if (!lead || lead.status === "converted") {
        throw new LeadAlreadyConvertedError();
      }
      const client: Client = {
        id: CREATED_CLIENT_ID,
        name: insertClient.name,
        whatsapp: insertClient.whatsapp,
        birthday: null,
        skinTone: null,
        notes: insertClient.notes,
        createdAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z",
      };
      store.set(leadId, {
        ...lead,
        status: "converted",
        clientId: client.id,
      });
      return client;
    },
  };

  return { repository, insertCalls, convertCalls, store };
};

const buildService = (repository: LeadsRepositoryPort) =>
  createLeadsService({
    repository,
    clock: () => FIXED_NOW,
    generateId: () => SYNTHETIC_ID,
  });

const validInput = (
  overrides: Partial<LeadCaptureRequest> = {},
): LeadCaptureRequest => ({
  name: "Maria Silva",
  whatsapp: "11987654321",
  consent: true,
  ...overrides,
});

describe("leadsService.capture", () => {
  it("persiste lead válido com consent_at do clock e retorna o id do repositório", async () => {
    const { repository, insertCalls } = createFakeRepository();
    const service = buildService(repository);

    const result = await service.capture(
      validInput({ interest: "Base líquida" }),
    );

    expect(result).toEqual({ id: REPO_ID });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      name: "Maria Silva",
      whatsapp: "11987654321",
      interest: "Base líquida",
      consentAt: FIXED_NOW,
    });
  });

  it("trata website não-vazio como bot: id sintético e nada persistido", async () => {
    const { repository, insertCalls } = createFakeRepository();
    const service = buildService(repository);

    const result = await service.capture(
      validInput({ website: "http://spam.example" }),
    );

    expect(result).toEqual({ id: SYNTHETIC_ID });
    expect(insertCalls).toHaveLength(0);
  });

  it("persiste quando website é string vazia (campo hidden do humano)", async () => {
    const { repository, insertCalls } = createFakeRepository();
    const service = buildService(repository);

    const result = await service.capture(validInput({ website: "" }));

    expect(result).toEqual({ id: REPO_ID });
    expect(insertCalls).toHaveLength(1);
  });

  it("persiste quando website está ausente", async () => {
    const { repository, insertCalls } = createFakeRepository();
    const service = buildService(repository);

    await service.capture(validInput());

    expect(insertCalls).toHaveLength(1);
  });

  it("propaga erro do repositório", async () => {
    const { repository } = createFakeRepository();
    const failing: LeadsRepositoryPort = {
      ...repository,
      insert: async () => {
        throw new Error("db indisponível");
      },
    };
    const service = buildService(failing);

    await expect(service.capture(validInput())).rejects.toThrow(
      "db indisponível",
    );
  });
});

describe("leadsService.createManual (RF-24, crm-appointments)", () => {
  const validCrmInput: CreateLeadCrm = {
    name: "Maria Silva",
    whatsapp: "11987654321",
  };

  it("grava source crm_manual, consent_at do clock e status new, e devolve o lead completo", async () => {
    const { repository, insertCalls } = createFakeRepository();
    const service = buildService(repository);

    const lead = await service.createManual(validCrmInput);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      name: "Maria Silva",
      whatsapp: "11987654321",
      consentAt: FIXED_NOW,
      source: "crm_manual",
      status: "new",
    });
    expect(lead).toEqual({
      id: REPO_ID,
      name: "Maria Silva",
      whatsapp: "11987654321",
      interest: null,
      source: "crm_manual",
      status: "new",
      clientId: null,
      createdAt: FIXED_NOW.toISOString(),
    });
  });

  it("não envia interest nem consent ao repositório (fora do cadastro rápido)", async () => {
    const { repository, insertCalls } = createFakeRepository();
    const service = buildService(repository);

    await service.createManual(validCrmInput);

    expect(insertCalls[0]).not.toHaveProperty("interest");
    expect(insertCalls[0]).not.toHaveProperty("consent");
  });

  it("propaga erro do repositório", async () => {
    const { repository } = createFakeRepository();
    const failing: LeadsRepositoryPort = {
      ...repository,
      insert: async () => {
        throw new Error("db indisponível");
      },
    };
    const service = buildService(failing);

    await expect(service.createManual(validCrmInput)).rejects.toThrow(
      "db indisponível",
    );
  });
});

describe("leadsService.listForCrm", () => {
  const oldest = buildLead({
    id: "11111111-1111-7111-8111-111111111111",
    status: "discarded",
    createdAt: "2026-07-10T09:00:00.000Z",
  });
  const middle = buildLead({
    id: "22222222-2222-7222-8222-222222222222",
    status: "new",
    createdAt: "2026-07-12T09:00:00.000Z",
  });
  const newest = buildLead({
    id: "33333333-3333-7333-8333-333333333333",
    status: "new",
    createdAt: "2026-07-15T09:00:00.000Z",
  });

  it("ordena por created_at desc (leads novos primeiro) e monta o envelope paginado", async () => {
    const { repository } = createFakeRepository([oldest, newest, middle]);
    const service = buildService(repository);

    const result = await service.listForCrm({ page: 1, perPage: 20 });

    expect(result.data.map((lead) => lead.id)).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ]);
    expect(result).toMatchObject({ page: 1, perPage: 20, total: 3 });
  });

  it("filtra por status quando informado", async () => {
    const { repository } = createFakeRepository([oldest, newest, middle]);
    const service = buildService(repository);

    const result = await service.listForCrm({
      page: 1,
      perPage: 20,
      status: "new",
    });

    expect(result.data.map((lead) => lead.id)).toEqual([newest.id, middle.id]);
    expect(result.total).toBe(2);
  });

  it("aplica paginação (perPage/offset) preservando o total", async () => {
    const { repository } = createFakeRepository([oldest, newest, middle]);
    const service = buildService(repository);

    const page1 = await service.listForCrm({ page: 1, perPage: 2 });
    const page2 = await service.listForCrm({ page: 2, perPage: 2 });

    expect(page1.data.map((lead) => lead.id)).toEqual([newest.id, middle.id]);
    expect(page1.total).toBe(3);
    expect(page2.data.map((lead) => lead.id)).toEqual([oldest.id]);
    expect(page2.total).toBe(3);
  });
});

describe("leadsService.getById", () => {
  const LEAD_ID = "66666666-6666-7666-8666-666666666666";

  it("devolve o lead quando existe", async () => {
    const { repository } = createFakeRepository([
      buildLead({ id: LEAD_ID, name: "Beatriz Lima" }),
    ]);
    const service = buildService(repository);

    const lead = await service.getById(LEAD_ID);

    expect(lead.id).toBe(LEAD_ID);
    expect(lead.name).toBe("Beatriz Lima");
  });

  it("rejeita com LeadNotFoundError quando o lead não existe", async () => {
    const { repository } = createFakeRepository();
    const service = buildService(repository);

    await expect(
      service.getById("00000000-0000-7000-8000-000000000000"),
    ).rejects.toThrow(LeadNotFoundError);
  });
});

describe("leadsService.updateStatus", () => {
  const LEAD_ID = "44444444-4444-7444-8444-444444444444";

  it("atualiza status entre new/contacted/discarded", async () => {
    const { repository, store } = createFakeRepository([
      buildLead({ id: LEAD_ID, status: "new" }),
    ]);
    const service = buildService(repository);

    const contacted = await service.updateStatus(LEAD_ID, "contacted");
    expect(contacted.status).toBe("contacted");

    const discarded = await service.updateStatus(LEAD_ID, "discarded");
    expect(discarded.status).toBe("discarded");

    const backToNew = await service.updateStatus(LEAD_ID, "new");
    expect(backToNew.status).toBe("new");
    expect(store.get(LEAD_ID)?.status).toBe("new");
  });

  it("rejeita com LeadAlreadyConvertedError quando o lead já está convertido", async () => {
    const { repository } = createFakeRepository([
      buildLead({ id: LEAD_ID, status: "converted" }),
    ]);
    const service = buildService(repository);

    await expect(service.updateStatus(LEAD_ID, "contacted")).rejects.toThrow(
      LeadAlreadyConvertedError,
    );
  });

  it("rejeita com LeadNotFoundError quando o lead não existe", async () => {
    const { repository } = createFakeRepository();
    const service = buildService(repository);

    await expect(
      service.updateStatus("00000000-0000-7000-8000-000000000000", "contacted"),
    ).rejects.toThrow(LeadNotFoundError);
  });

  it("traduz corrida (findById não-convertido mas update devolve 0 linhas) em LeadAlreadyConvertedError", async () => {
    const { repository } = createFakeRepository();
    const racing: LeadsRepositoryPort = {
      ...repository,
      findById: async (id) => buildLead({ id, status: "new" }),
      updateStatus: async () => undefined,
    };
    const service = buildService(racing);

    await expect(service.updateStatus(LEAD_ID, "contacted")).rejects.toThrow(
      LeadAlreadyConvertedError,
    );
  });
});

describe("leadsService.convertToClient", () => {
  const LEAD_ID = "55555555-5555-7555-8555-555555555555";

  it("compõe o payload da cliente com dados do lead, consultora da sessão e interesse em notes", async () => {
    const { repository, convertCalls, store } = createFakeRepository([
      buildLead({
        id: LEAD_ID,
        name: "Ana Souza",
        whatsapp: "11912345678",
        interest: "Base líquida",
        status: "contacted",
      }),
    ]);
    const service = buildService(repository);

    const client = await service.convertToClient(LEAD_ID, CONSULTANT_ID);

    expect(convertCalls).toHaveLength(1);
    expect(convertCalls[0]).toEqual({
      leadId: LEAD_ID,
      insertClient: {
        name: "Ana Souza",
        whatsapp: "11912345678",
        consultantId: CONSULTANT_ID,
        notes: "Interesse (lead): Base líquida",
      },
    });
    expect(client.id).toBe(CREATED_CLIENT_ID);
    expect(client.notes).toBe("Interesse (lead): Base líquida");
    expect(store.get(LEAD_ID)?.status).toBe("converted");
    expect(store.get(LEAD_ID)?.clientId).toBe(CREATED_CLIENT_ID);
  });

  it("usa notes null quando o lead não tem interesse", async () => {
    const { repository, convertCalls } = createFakeRepository([
      buildLead({ id: LEAD_ID, interest: null, status: "new" }),
    ]);
    const service = buildService(repository);

    await service.convertToClient(LEAD_ID, CONSULTANT_ID);

    expect(convertCalls[0]?.insertClient.notes).toBeNull();
  });

  it("rejeita com LeadNotFoundError quando o lead não existe", async () => {
    const { repository } = createFakeRepository();
    const service = buildService(repository);

    await expect(
      service.convertToClient(
        "00000000-0000-7000-8000-000000000000",
        CONSULTANT_ID,
      ),
    ).rejects.toThrow(LeadNotFoundError);
  });

  it("rejeita com LeadAlreadyConvertedError quando o lead já está convertido", async () => {
    const { repository, convertCalls } = createFakeRepository([
      buildLead({ id: LEAD_ID, status: "converted" }),
    ]);
    const service = buildService(repository);

    await expect(
      service.convertToClient(LEAD_ID, CONSULTANT_ID),
    ).rejects.toThrow(LeadAlreadyConvertedError);
    expect(convertCalls).toHaveLength(0);
  });

  it("traduz corrida (findById não-convertido mas convert lança dentro da transação) em LeadAlreadyConvertedError", async () => {
    const { repository } = createFakeRepository();
    const racing: LeadsRepositoryPort = {
      ...repository,
      findById: async (id) => buildLead({ id, status: "new" }),
      convert: async () => {
        throw new LeadAlreadyConvertedError();
      },
    };
    const service = buildService(racing);

    await expect(
      service.convertToClient(LEAD_ID, CONSULTANT_ID),
    ).rejects.toThrow(LeadAlreadyConvertedError);
  });
});
