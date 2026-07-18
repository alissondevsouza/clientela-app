import type {
  Client,
  ClientsListQuery,
  CreateClient,
  Paginated,
  UpdateClient,
} from "@clientela/shared";
import { ClientNotFoundError } from "./clients.errors";

// Dados de inserção: os campos validados na fronteira mais a consultora da
// sessão (nunca do body — RF-04). O service compõe; o repository persiste.
export type InsertClient = CreateClient & { consultantId: string };

export type ListClientsParams = {
  page: number;
  perPage: number;
  search?: string;
};

// Porta mínima do repositório (api.md: o service não conhece Drizzle nem o
// schema). TODA operação recebe `consultantId` para escopar por consultora.
// `update`/`delete` devolvem undefined/false quando nada casa no escopo — o
// service traduz isso em ClientNotFoundError.
export type ClientsRepositoryPort = {
  insert: (client: InsertClient) => Promise<Client>;
  findById: (consultantId: string, id: string) => Promise<Client | undefined>;
  update: (
    consultantId: string,
    id: string,
    patch: UpdateClient,
  ) => Promise<Client | undefined>;
  delete: (consultantId: string, id: string) => Promise<boolean>;
  list: (
    consultantId: string,
    params: ListClientsParams,
  ) => Promise<{ rows: Client[]; total: number }>;
};

export type ClientsServiceDeps = {
  repository: ClientsRepositoryPort;
};

export type ClientsService = ReturnType<typeof createClientsService>;

export const createClientsService = ({ repository }: ClientsServiceDeps) => {
  const create = (consultantId: string, input: CreateClient): Promise<Client> =>
    repository.insert({ consultantId, ...input });

  const getById = async (consultantId: string, id: string): Promise<Client> => {
    const client = await repository.findById(consultantId, id);
    if (!client) {
      throw new ClientNotFoundError();
    }
    return client;
  };

  // `patch` já vem validado da fronteira (updateClientSchema): chaves ausentes
  // = não alterar; `null` explícito = limpar o campo nullable. O service apenas
  // repassa — o repository monta o SET (o `null` chega intacto ao banco).
  const update = async (
    consultantId: string,
    id: string,
    patch: UpdateClient,
  ): Promise<Client> => {
    const updated = await repository.update(consultantId, id, patch);
    if (!updated) {
      throw new ClientNotFoundError();
    }
    return updated;
  };

  const remove = async (consultantId: string, id: string): Promise<void> => {
    const deleted = await repository.delete(consultantId, id);
    if (!deleted) {
      throw new ClientNotFoundError();
    }
  };

  const list = async (
    consultantId: string,
    query: ClientsListQuery,
  ): Promise<Paginated<Client>> => {
    const { rows, total } = await repository.list(consultantId, {
      page: query.page,
      perPage: query.perPage,
      search: query.search,
    });

    return {
      data: rows,
      page: query.page,
      perPage: query.perPage,
      total,
    };
  };

  return { create, getById, update, remove, list };
};
