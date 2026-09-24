import type { AppointmentKind, AppointmentStatus } from "@clientela/shared";
import type { Database } from "../../src/db/client";
import { appointments } from "../../src/db/schema";

const DEFAULT_DURATION_MINUTES = 30;
const DEFAULT_KIND: AppointmentKind = "demo";
const DEFAULT_STATUS: AppointmentStatus = "scheduled";

export type AppointmentOverrides = {
  startsAt: Date;
  status?: AppointmentStatus;
  clientId?: string | null;
  leadId?: string | null;
  saleId?: string | null;
  kind?: AppointmentKind;
  title?: string | null;
  durationMinutes?: number;
  location?: string | null;
  notes?: string | null;
};

// Semeadura DIRETA (bypassa o Zod da fronteira, mesmo padrão de
// appointments.integration.test.ts#seedAppointment): o banco tolera
// `clientId`/`leadId` preenchidos ao mesmo tempo e status terminal — a
// exclusividade/transição é regra de contrato, não CHECK.
export const createAppointment = async (
  db: Database,
  consultantId: string,
  overrides: AppointmentOverrides,
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(appointments)
    .values({
      consultantId,
      clientId: overrides.clientId ?? null,
      leadId: overrides.leadId ?? null,
      saleId: overrides.saleId ?? null,
      kind: overrides.kind ?? DEFAULT_KIND,
      title: overrides.title ?? null,
      startsAt: overrides.startsAt,
      durationMinutes: overrides.durationMinutes ?? DEFAULT_DURATION_MINUTES,
      status: overrides.status ?? DEFAULT_STATUS,
      location: overrides.location ?? null,
      notes: overrides.notes ?? null,
    })
    .returning({ id: appointments.id });

  if (!row) {
    throw new Error(
      "factory createAppointment: falha ao inserir o compromisso",
    );
  }

  return { id: row.id };
};
