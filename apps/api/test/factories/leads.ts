import type { LeadStatus } from "@clientela/shared";
import type { Database } from "../../src/db/client";
import { leads } from "../../src/db/schema";

const DEFAULT_STATUS: LeadStatus = "new";

// Leads NÃO têm `consultant_id` (leads.ts) — o funil de captação é
// compartilhado entre consultoras (drift já aceito, ver plan.md).
export type LeadOverrides = Partial<{
  name: string;
  whatsapp: string;
  interest: string | null;
  status: LeadStatus;
  createdAt: Date;
  clientId: string | null;
}>;

export const createLead = async (
  db: Database,
  overrides: LeadOverrides = {},
): Promise<{ id: string }> => {
  const timestamp = overrides.createdAt ?? new Date();
  const [row] = await db
    .insert(leads)
    .values({
      name: overrides.name ?? "Lead Factory",
      whatsapp: overrides.whatsapp ?? "11999998888",
      interest: overrides.interest ?? null,
      status: overrides.status ?? DEFAULT_STATUS,
      consentAt: timestamp,
      createdAt: timestamp,
      clientId: overrides.clientId ?? null,
    })
    .returning({ id: leads.id });

  if (!row) {
    throw new Error("factory createLead: falha ao inserir o lead");
  }

  return { id: row.id };
};
