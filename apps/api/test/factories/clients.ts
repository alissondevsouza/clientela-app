import type { Database } from "../../src/db/client";
import { clients } from "../../src/db/schema";

export type ClientOverrides = Partial<{
  name: string;
  whatsapp: string;
  // "yyyy-mm-dd" (coluna `date` em modo string — sem fuso, ver clients.ts).
  birthday: string | null;
  skinTone: string | null;
  notes: string | null;
}>;

export const createClient = async (
  db: Database,
  consultantId: string,
  overrides: ClientOverrides = {},
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(clients)
    .values({
      consultantId,
      name: overrides.name ?? "Cliente Factory",
      whatsapp: overrides.whatsapp ?? "11912345678",
      birthday: overrides.birthday ?? null,
      skinTone: overrides.skinTone ?? null,
      notes: overrides.notes ?? null,
    })
    .returning({ id: clients.id });

  if (!row) {
    throw new Error("factory createClient: falha ao inserir a cliente");
  }

  return { id: row.id };
};
