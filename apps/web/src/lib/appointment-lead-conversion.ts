import type { LeadStatus } from "@clientela/shared";

// Status do lead a partir dos quais a conversão pelo compromisso ainda faz
// sentido (RF-25): `converted` já virou cliente por outro caminho, `discarded`
// foi descartado — nenhum dos dois oferece o botão.
export const CONVERTIBLE_LEAD_STATUSES = new Set<LeadStatus>([
  "new",
  "contacted",
]);

export type ConvertibleLeadSource = {
  clientId: string | null;
  leadId: string | null;
};

// Decide se o detalhe do compromisso oferece "Converter em cliente" (RF-25) e
// devolve o `leadId` a converter, ou `null` quando não faz sentido. Extraído
// para `lib/` (ALERTA da revisão de `crm-appointments`): a regra tem 4 ramos
// — compromisso vinculado a CLIENTE (cliente tem precedência, RF-02: nem
// olha o lead), SEM pessoa vinculada, lead `converted` (já virou cliente por
// outro caminho) e lead `discarded` — só o ramo restante (lead `new`/
// `contacted`) libera o botão. `leadStatus === null` cobre tanto "sem lead
// vinculado" quanto "falha ao buscar o status do lead" (fail-closed: a
// página nunca trava, só some com a ação extra).
export const resolveConvertibleLead = (
  appointment: ConvertibleLeadSource,
  leadStatus: LeadStatus | null,
): string | null => {
  if (appointment.clientId !== null) {
    return null;
  }
  if (appointment.leadId === null) {
    return null;
  }
  if (leadStatus === null) {
    return null;
  }
  if (!CONVERTIBLE_LEAD_STATUSES.has(leadStatus)) {
    return null;
  }
  return appointment.leadId;
};
