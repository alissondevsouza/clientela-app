import type { Client } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { ClientNotFoundError } from "./clients.errors";
import {
  type ClientsRepositoryPort,
  createClientsService,
  type InsertClient,
  type ListClientsParams,
} from "./clients.service";

const CONSULTANT_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const CONSULTANT_B = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";

const FIXED_ISO = "2026-07-17T12:00:00.000Z";

type StoredClient = Client & { consultantId: string };

// Repositório em memória (testing.md: fakes explícitos, sem mock de Drizzle).
// Reproduz o comportamento observável do repositório real — escopo por
// consultora, busca (name/whatsapp + forma só-dígitos), ordenação por name e
// paginação — para que o teste do service asserte efeito, não implementação.
const createFakeRepository = (seed: StoredClient[]) => {
  let store: StoredClient[] = [...seed];
  let idCounter = 0;

  const toClient = (stored: StoredClient): Client => {
    const { consultantId: _consultantId, ...client } = stored;
    return client;
  };

  const matchesSearch = (client: StoredClient, search: string): boolean => {
    const term = search.toLowerCase();
    if (
      client.name.toLowerCase().includes(term) ||
      client.whatsapp.toLowerCase().includes(term)
    ) {
      return true;
    }
    const digits = search.replace(/\D/g, "");
    return digits.length > 0 && client.whatsapp.includes(digits);
  };

  const repository: ClientsRepositoryPort = {
    insert: async (input: InsertClient) => {
      idCounter += 1;
      const stored: StoredClient = {
        id: `generated-id-${idCounter}`,
        consultantId: input.consultantId,
        name: input.name,
        whatsapp: input.whatsapp,
        birthday: input.birthday ?? null,
        skinTone: input.skinTone ?? null,
        notes: input.notes ?? null,
        createdAt: FIXED_ISO,
        updatedAt: FIXED_ISO,
      };
      store.push(stored);
      return toClient(stored);
    },
    findById: async (consultantId, id) => {
      const found = store.find(
        (c) => c.consultantId === consultantId && c.id === id,
      );
      return found ? toClient(found) : undefined;
    },
    update: async (consultantId, id, patch) => {
      const target = store.find(
        (c) => c.consultantId === consultantId && c.id === id,
      );
      if (!target) {
        return undefined;
      }
      // Só aplica as chaves PRESENTES no patch (ausente = não alterar; `null`
      // explícito = limpar). Object.assign com o patch reproduz isso.
      Object.assign(target, patch, { updatedAt: FIXED_ISO });
      return toClient(target);
    },
    delete: async (consultantId, id) => {
      const before = store.length;
      store = store.filter(
        (c) => !(c.consultantId === consultantId && c.id === id),
      );
      return store.length < before;
    },
    list: async (
      consultantId,
      { page, perPage, search }: ListClientsParams,
    ) => {
      const scoped = store
        .filter((c) => c.consultantId === consultantId)
        .filter((c) => (search ? matchesSearch(c, search) : true))
        .toSorted((a, b) => a.name.localeCompare(b.name));

      const offset = (page - 1) * perPage;
      const rows = scoped.slice(offset, offset + perPage).map(toClient);
      return { rows, total: scoped.length };
    },
  };

  return { repository, getStore: () => store };
};

const buildService = (seed: StoredClient[] = []) => {
  const { repository, getStore } = createFakeRepository(seed);
  return { service: createClientsService({ repository }), getStore };
};

const storedClient = (overrides: Partial<StoredClient>): StoredClient => ({
  id: "11111111-1111-7111-8111-111111111111",
  consultantId: CONSULTANT_A,
  name: "Ana",
  whatsapp: "11999990000",
  birthday: null,
  skinTone: null,
  notes: null,
  createdAt: FIXED_ISO,
  updatedAt: FIXED_ISO,
  ...overrides,
});

describe("clientsService.create", () => {
  it("insere a cliente escopada na consultora e retorna o registro criado", async () => {
    const { service, getStore } = buildService();

    const created = await service.create(CONSULTANT_A, {
      name: "Beatriz",
      whatsapp: "11988887777",
      birthday: "1990-05-10",
      skinTone: "média",
      notes: "prefere batom fosco",
    });

    expect(created).toMatchObject({
      name: "Beatriz",
      whatsapp: "11988887777",
      birthday: "1990-05-10",
      skinTone: "média",
      notes: "prefere batom fosco",
    });
    expect(created.id).toBeTruthy();

    const store = getStore();
    expect(store).toHaveLength(1);
    expect(store[0]?.consultantId).toBe(CONSULTANT_A);
  });
});

describe("clientsService.getById", () => {
  it("retorna a cliente quando existe no escopo da consultora", async () => {
    const client = storedClient({ id: "id-1", name: "Carla" });
    const { service } = buildService([client]);

    const found = await service.getById(CONSULTANT_A, "id-1");

    expect(found.name).toBe("Carla");
    expect(found).not.toHaveProperty("consultantId");
  });

  it("lança ClientNotFoundError com mensagem pt-BR quando não existe", async () => {
    const { service } = buildService();

    const error = await service
      .getById(CONSULTANT_A, "inexistente")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ClientNotFoundError);
    if (!(error instanceof Error)) {
      throw new Error("esperava uma instância de Error");
    }
    expect(error.message).toBe("Cliente não encontrada.");
  });
});

describe("clientsService.update", () => {
  it("atualização parcial preserva os campos não enviados", async () => {
    const client = storedClient({
      id: "id-1",
      name: "Dora",
      whatsapp: "11955554444",
      birthday: "1985-01-01",
      skinTone: "clara",
      notes: "cliente antiga",
    });
    const { service } = buildService([client]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      name: "Dora Silva",
    });

    expect(updated.name).toBe("Dora Silva");
    expect(updated.whatsapp).toBe("11955554444");
    expect(updated.birthday).toBe("1985-01-01");
    expect(updated.skinTone).toBe("clara");
    expect(updated.notes).toBe("cliente antiga");
  });

  it("`null` explícito limpa o campo nullable", async () => {
    const client = storedClient({
      id: "id-1",
      birthday: "1985-01-01",
      skinTone: "clara",
      notes: "remover isto",
    });
    const { service } = buildService([client]);

    const updated = await service.update(CONSULTANT_A, "id-1", {
      birthday: null,
      skinTone: null,
      notes: null,
    });

    expect(updated.birthday).toBeNull();
    expect(updated.skinTone).toBeNull();
    expect(updated.notes).toBeNull();
  });

  it("lança ClientNotFoundError quando a cliente não existe no escopo", async () => {
    const { service } = buildService();

    await expect(
      service.update(CONSULTANT_A, "inexistente", { name: "Nova" }),
    ).rejects.toBeInstanceOf(ClientNotFoundError);
  });
});

describe("clientsService.remove", () => {
  it("remove a cliente do escopo da consultora", async () => {
    const client = storedClient({ id: "id-1" });
    const { service, getStore } = buildService([client]);

    await expect(service.remove(CONSULTANT_A, "id-1")).resolves.toBeUndefined();
    expect(getStore()).toHaveLength(0);
  });

  it("lança ClientNotFoundError quando a cliente não existe", async () => {
    const { service } = buildService();

    await expect(
      service.remove(CONSULTANT_A, "inexistente"),
    ).rejects.toBeInstanceOf(ClientNotFoundError);
  });
});

describe("clientsService.list", () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    storedClient({
      id: `id-${i + 1}`,
      // Nome com índice zero-padded para ordenação alfabética previsível.
      name: `Cliente ${String(i + 1).padStart(2, "0")}`,
      whatsapp: `1199999${String(i + 1).padStart(4, "0")}`,
    }),
  );

  it("pagina com total correto e devolve a página pedida", async () => {
    const { service } = buildService(many);

    const firstPage = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
    });

    expect(firstPage.total).toBe(25);
    expect(firstPage.page).toBe(1);
    expect(firstPage.perPage).toBe(20);
    expect(firstPage.data).toHaveLength(20);
    expect(firstPage.data[0]?.name).toBe("Cliente 01");

    const secondPage = await service.list(CONSULTANT_A, {
      page: 2,
      perPage: 20,
    });

    expect(secondPage.total).toBe(25);
    expect(secondPage.page).toBe(2);
    expect(secondPage.data).toHaveLength(5);
    expect(secondPage.data[0]?.name).toBe("Cliente 21");
  });

  it("repassa a busca ao repository (filtra por nome, case-insensitive)", async () => {
    const seed = [
      storedClient({ id: "id-1", name: "Fernanda", whatsapp: "11911112222" }),
      storedClient({ id: "id-2", name: "Gabriela", whatsapp: "11933334444" }),
    ];
    const { service } = buildService(seed);

    const result = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
      search: "fern",
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe("Fernanda");
  });

  it("busca com dígitos casa contra a forma só-dígitos do whatsapp", async () => {
    const seed = [
      storedClient({ id: "id-1", name: "Helena", whatsapp: "11955550000" }),
      storedClient({ id: "id-2", name: "Ivone", whatsapp: "11966661111" }),
    ];
    const { service } = buildService(seed);

    const result = await service.list(CONSULTANT_A, {
      page: 1,
      perPage: 20,
      search: "(11) 95555-0000",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.name).toBe("Helena");
  });

  it("escopo: consultora A não enxerga clientes da consultora B", async () => {
    const seed = [
      storedClient({ id: "a-1", consultantId: CONSULTANT_A, name: "Ana A" }),
      storedClient({ id: "b-1", consultantId: CONSULTANT_B, name: "Bruna B" }),
      storedClient({ id: "b-2", consultantId: CONSULTANT_B, name: "Bianca B" }),
    ];
    const { service } = buildService(seed);

    const listA = await service.list(CONSULTANT_A, { page: 1, perPage: 20 });

    expect(listA.total).toBe(1);
    expect(listA.data).toHaveLength(1);
    expect(listA.data[0]?.name).toBe("Ana A");

    // A não acessa nem altera clientes de B (mesmo 404 de inexistente).
    await expect(service.getById(CONSULTANT_A, "b-1")).rejects.toBeInstanceOf(
      ClientNotFoundError,
    );
    await expect(
      service.update(CONSULTANT_A, "b-1", { name: "Invasão" }),
    ).rejects.toBeInstanceOf(ClientNotFoundError);
    await expect(service.remove(CONSULTANT_A, "b-1")).rejects.toBeInstanceOf(
      ClientNotFoundError,
    );
  });
});
