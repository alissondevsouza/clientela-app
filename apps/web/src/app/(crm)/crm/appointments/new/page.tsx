import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  checkConflictsAction,
  createAppointmentAction,
  quickCreateClientAction,
  quickCreateLeadAction,
  searchClientsAction,
  searchLeadsAction,
} from "@/app/(crm)/crm/appointments/actions";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getClient } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import { getLead } from "@/lib/leads-api";

const PAGE_TITLE = "Novo compromisso";
const SUBMIT_LABEL = "Criar compromisso";
const BACK_LABEL = "Voltar para a agenda";
const LIST_HREF = "/crm/appointments";
const LOGIN_PATH = "/login";

// `?clientId=`/`?leadId=` pré-selecionam a pessoa (RF-22: botão "Agendar" da
// ficha da cliente e do card de lead). Querystring inválida NUNCA derruba a
// página — `.catch(undefined)` volta ao estado "sem pré-seleção" (core.md:
// saneamento de input externo na fronteira).
const searchParamsSchema = z.object({
  clientId: z.uuid().optional().catch(undefined),
  leadId: z.uuid().optional().catch(undefined),
});

type NewAppointmentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Robots (noindex) herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Criação de compromisso (RSC, server-first — RF-18/RF-22): resolve a
// pré-seleção de pessoa NO SERVIDOR (o seletor já nasce com o chip
// preenchido, sem round-trip do client) e passa as Server Actions ao form
// como referência DIRETA (lesson 2026-07-19 — closure adaptador não
// atravessa a fronteira RSC→client). `clientId`/`leadId` nunca coexistem na
// UI (RF-02): se a querystring trouxer os dois, o cliente tem precedência —
// mesma regra de `resolveAppointmentPerson`. Buscas independentes disparadas
// EM PARALELO (`Promise.all`, sem waterfall — web.md).
export default async function NewAppointmentPage({
  searchParams,
}: NewAppointmentPageProps) {
  const { clientId, leadId } = searchParamsSchema.parse(await searchParams);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };

  // Cliente tem precedência sobre lead (RF-02): se os dois vierem na
  // querystring, a busca de lead nem dispara.
  const effectiveLeadId = clientId === undefined ? leadId : undefined;

  const [clientResult, leadResult] = await Promise.all([
    clientId === undefined ? Promise.resolve(null) : getClient(clientId, deps),
    effectiveLeadId === undefined
      ? Promise.resolve(null)
      : getLead(effectiveLeadId, deps),
  ]);

  const resolvedClient = clientResult?.ok ? clientResult.client : null;
  // `clientId` inválido/de outra consultora/excluído ⇒ `getClient` falha e a
  // pré-seleção é simplesmente descartada (nunca derruba a página).
  const defaultClientId = resolvedClient !== null ? resolvedClient.id : null;
  const defaultClientName = resolvedClient !== null ? resolvedClient.name : "";

  // `leadId` inexistente (ou id malformado, `getLead` → 404) ⇒ mesmo
  // tratamento do `clientId` inválido acima: a pré-seleção é descartada, nunca
  // um id não resolvido é oferecido ao formulário (ex-fallback "Lead
  // selecionado" removido — RF-22).
  const resolvedLead = leadResult?.ok ? leadResult.lead : null;
  const defaultLeadId =
    resolvedClient === null && resolvedLead !== null ? resolvedLead.id : null;
  const defaultLeadName = resolvedLead !== null ? resolvedLead.name : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={LIST_HREF}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {BACK_LABEL}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
      </div>

      <AppointmentForm
        mode="create"
        submitLabel={SUBMIT_LABEL}
        onSubmit={createAppointmentAction}
        searchClientsAction={searchClientsAction}
        searchLeadsAction={searchLeadsAction}
        checkConflictsAction={checkConflictsAction}
        quickCreateClientAction={quickCreateClientAction}
        quickCreateLeadAction={quickCreateLeadAction}
        defaultValues={{
          clientId: defaultClientId,
          clientName: defaultClientName,
          leadId: defaultLeadId,
          leadName: defaultLeadName,
        }}
      />
    </div>
  );
}
