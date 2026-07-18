"use server";

import type { LeadCaptureRequestInput } from "@clientela/shared";
import { headers } from "next/headers";
import { extractClientIp } from "@/lib/client-ip";
import { loadWebEnv } from "@/lib/env";
import { type SubmitLeadResult, submitLead } from "@/lib/submit-lead";

const FORWARDED_FOR_HEADER = "x-forwarded-for";

// Server Action de captura de lead (RF-03): wrapper fino sobre `submitLead`.
// A lógica testável (validação, mapeamento de envelope, erros) vive no helper;
// aqui só resolvemos o ambiente e o IP do visitante. NÃO logamos o payload
// (dado pessoal — LGPD/security.md): o helper já mapeia erros sem vazar internals.
export const submitLeadAction = async (
  values: LeadCaptureRequestInput,
): Promise<SubmitLeadResult> => {
  const requestHeaders = await headers();
  const clientIp = extractClientIp(requestHeaders.get(FORWARDED_FOR_HEADER));

  return submitLead(values, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    clientIp,
  });
};
