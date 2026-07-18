import type { Database } from "../../db/client";
import { leads, type NewLead } from "../../db/schema";

export type LeadsRepository = ReturnType<typeof createLeadsRepository>;

// Única camada que toca o banco (api.md). O insert devolve apenas `{ id }`:
// menos superfície de vazamento e a resposta HTTP nunca ecoa dado pessoal.
export const createLeadsRepository = (db: Database) => {
  const insert = async (lead: NewLead): Promise<{ id: string }> => {
    const [inserted] = await db
      .insert(leads)
      .values(lead)
      .returning({ id: leads.id });

    if (!inserted) {
      throw new Error("Falha ao persistir lead: insert não retornou id");
    }

    return inserted;
  };

  return { insert };
};
