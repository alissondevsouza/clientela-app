import type { Client, UpdateClient } from "@clientela/shared";
import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client";
import { clients } from "../../db/schema";
import type {
  ClientsRepositoryPort,
  InsertClient,
  ListClientsParams,
} from "./clients.service";

export type ClientsRepository = ReturnType<typeof createClientsRepository>;

type ClientRow = typeof clients.$inferSelect;

// Molda a linha do banco no contrato de resposta (Client): timestamps `Date` →
// ISO 8601; `birthday` já é string "yyyy-mm-dd" (coluna date em modo string).
// `consultantId` fica de fora — não faz parte do contrato público.
const toClient = (row: ClientRow): Client => ({
  id: row.id,
  name: row.name,
  whatsapp: row.whatsapp,
  birthday: row.birthday,
  skinTone: row.skinTone,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

// Condição de busca: `ILIKE %termo%` em name OU whatsapp (case-insensitive).
// Se o termo contém dígito, compara também a forma só-dígitos contra o whatsapp
// (que é armazenado sem máscara) — assim "(11) 9" casa com o número guardado.
const buildSearchCondition = (search: string): SQL | undefined => {
  const term = `%${search}%`;
  const conditions: SQL[] = [
    ilike(clients.name, term),
    ilike(clients.whatsapp, term),
  ];

  const digits = search.replace(/\D/g, "");
  if (digits.length > 0) {
    conditions.push(ilike(clients.whatsapp, `%${digits}%`));
  }

  return or(...conditions);
};

// Única camada que toca o banco (api.md/database.md). TODA query filtra por
// `consultant_id` (escopo por consultora — RF-04); os retornos são moldados na
// porta que o service espera.
export const createClientsRepository = (
  db: Database,
): ClientsRepositoryPort => {
  const insert = async (client: InsertClient): Promise<Client> => {
    const [row] = await db.insert(clients).values(client).returning();

    if (!row) {
      throw new Error("Falha ao persistir cliente: insert não retornou linha");
    }

    return toClient(row);
  };

  const findById = async (
    consultantId: string,
    id: string,
  ): Promise<Client | undefined> => {
    const [row] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.consultantId, consultantId), eq(clients.id, id)))
      .limit(1);

    return row ? toClient(row) : undefined;
  };

  const update = async (
    consultantId: string,
    id: string,
    patch: UpdateClient,
  ): Promise<Client | undefined> => {
    const [row] = await db
      .update(clients)
      .set(patch)
      .where(and(eq(clients.consultantId, consultantId), eq(clients.id, id)))
      .returning();

    return row ? toClient(row) : undefined;
  };

  const remove = async (consultantId: string, id: string): Promise<boolean> => {
    const deleted = await db
      .delete(clients)
      .where(and(eq(clients.consultantId, consultantId), eq(clients.id, id)))
      .returning({ id: clients.id });

    return deleted.length > 0;
  };

  const list = async (
    consultantId: string,
    { page, perPage, search }: ListClientsParams,
  ): Promise<{ rows: Client[]; total: number }> => {
    const scope = eq(clients.consultantId, consultantId);
    const searchCondition = search ? buildSearchCondition(search) : undefined;
    const where = searchCondition ? and(scope, searchCondition) : scope;
    const offset = (page - 1) * perPage;

    const rows = await db
      .select()
      .from(clients)
      .where(where)
      // Ordenação estável: name asc com o id como desempate determinístico.
      .orderBy(asc(clients.name), asc(clients.id))
      .limit(perPage)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(clients)
      .where(where);

    return {
      rows: rows.map(toClient),
      total: totalRow?.value ?? 0,
    };
  };

  return { insert, findById, update, delete: remove, list };
};
