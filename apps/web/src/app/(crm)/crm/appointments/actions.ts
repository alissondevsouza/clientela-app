"use server";

import {
  type AppointmentConflictsQueryInput,
  type AppointmentListItem,
  appointmentConflictsQuerySchema,
  type CompleteAppointmentInput,
  type CreateAppointmentInput,
  type CreateClientInput,
  type CreateLeadCrmInput,
  completeAppointmentSchema,
  createAppointmentSchema,
  createLeadCrmSchema,
  type LinkAppointmentSaleInput,
  linkAppointmentSaleSchema,
  type SaleStatus,
  type UpdateAppointmentInput,
  updateAppointmentSchema,
} from "@clientela/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { quickCreateClientAction as quickCreateClientActionBase } from "@/app/(crm)/crm/orders/actions";
import {
  createAppointment,
  deleteAppointment,
  getAppointmentConflicts,
  linkAppointmentSale,
  transitionAppointment,
  updateAppointment,
} from "@/lib/appointments-api";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { listClients } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import { convertLead, createLead, listLeads } from "@/lib/leads-api";
import { listSales } from "@/lib/sales-api";

const LIST_PATH = "/crm/appointments";
const CLIENTS_LIST_PATH = "/crm/clients";
const LEADS_LIST_PATH = "/crm/leads";
const LOGIN_PATH = "/login";

// Resultado do cadastro rápido de cliente, no mesmo formato do de
// `orders/actions.ts` (`{ ok: true, client: { id, name } }`) — declarado
// aqui, e não reexportado, pelo motivo abaixo.
export type QuickCreateClientResult =
  | { ok: true; client: { id: string; name: string } }
  | { ok: false; message: string };

// Cadastro rápido de CLIENTE no seletor de pessoa da agenda (RF-23): DELEGA
// para a Server Action já existente do cadastro rápido do pedido (CRM-10,
// `orders/actions.ts`) — mesma regra (`POST /clients`, revalida
// `/crm/clients`), sem nenhuma diferença ligada a "pedido". Precisa ser um
// Server Action PRÓPRIO deste módulo — **nunca um reexport** — porque o Next
// monta o `server-reference-manifest` de cada rota a partir dos ids
// registrados pelos módulos `"use server"` importados DIRETAMENTE por ela
// (achado da revisão de `crm-appointments`, comprovado em `next build` +
// standalone: reexportar `quickCreateClientAction` fazia o manifest de
// `/crm/appointments/new` e `/crm/appointments/[id]` conter só os 8 ids de
// `orders/actions.ts` + logout, apagando os demais actions deste módulo —
// toda ação da agenda respondia 404 "Server action not found" em produção,
// mascarado em `next dev`). Declarar o action aqui, mesmo delegando à mesma
// regra de negócio, resolve — a lesson 2026-07-19 (closure adaptador criado
// em OUTRO módulo não atravessa a fronteira RSC→client) é sobre props
// recriadas a cada render, não sobre isto: este wrapper é uma Server Action
// de primeira classe, exportada e estável neste módulo.
export const quickCreateClientAction = async (
  values: CreateClientInput,
): Promise<QuickCreateClientResult> => quickCreateClientActionBase(values);

// Teto de resultados da busca digitada dos seletores de cliente/lead (RF-14/
// RF-18): mesmo máximo de `PER_PAGE_MAX` do contrato compartilhado — cobre a
// busca sem paginação adicional no combobox. `listLeads` (Task 5.3) não expõe
// `perPage` no client tipado, então a busca de lead usa o default (20) — o
// client é "pronto", não é recriado aqui.
const SEARCH_CLIENTS_PER_PAGE = 100;

const appointmentDetailPath = (id: string): string => `${LIST_PATH}/${id}`;

const INVALID_INPUT_MESSAGE =
  "Não foi possível concluir a ação agora. Tente novamente.";

// Mensagem pt-BR acionável do contrato compartilhado (mesmo padrão do
// error-handler central da API — `firstValidationMessage`): quando o
// `safeParse` local falha, a PRIMEIRA issue do Zod já traz a mensagem certa
// ("Informe cliente ou lead, nunca os dois ao mesmo tempo", por exemplo) —
// nunca colapsar em `INVALID_INPUT_MESSAGE` e perder essa informação (achado
// da revisão de crm-appointments).
const firstIssueMessage = (error: z.ZodError): string =>
  error.issues[0]?.message ?? INVALID_INPUT_MESSAGE;

// Resultado observável pela UI: falha sempre traz `{ ok: false, message }`
// pt-BR para o componente exibir em `role="alert"`. `createAppointmentAction`
// REDIRECIONA no sucesso (a promise não resolve com valor); as demais
// retornam `{ ok: true }`.
export type AppointmentActionResult =
  | { ok: true }
  | { ok: false; message: string };

// Pessoa reduzida às colunas necessárias no seletor do form (RF-14/RF-18):
// nunca expomos WhatsApp/interesse/observações aqui — só o que a UI precisa
// para exibir e selecionar.
export type AppointmentFormPerson = { id: string; name: string };

export type SearchClientsResult =
  | { ok: true; clients: AppointmentFormPerson[] }
  | { ok: false; message: string };

export type SearchLeadsResult =
  | { ok: true; leads: AppointmentFormPerson[] }
  | { ok: false; message: string };

// Cadastro rápido de LEAD no seletor de pessoa da agenda (RF-23/RF-24,
// ADR-0020): mesmo formato de resultado do cadastro rápido de cliente, para o
// `PersonSelect` tratar os dois casos de forma simétrica.
export type QuickCreateLeadResult =
  | { ok: true; lead: AppointmentFormPerson }
  | { ok: false; message: string };

// Venda reduzida às colunas necessárias no seletor de vínculo (RF-10/RF-19):
// nunca expomos itens/recebíveis aqui — só o que identifica a venda na lista.
export type LinkableSale = {
  id: string;
  clientName: string;
  totalCents: number;
  soldAt: string;
  status: SaleStatus;
};

export type ListLinkableSalesResult =
  | { ok: true; sales: LinkableSale[] }
  | { ok: false; message: string };

export type CheckConflictsInput = {
  startsAt: string;
  durationMinutes: number;
  excludeId?: string;
};

export type CheckConflictsResult =
  | { ok: true; conflicts: AppointmentListItem[] }
  | { ok: false; message: string };

// Lê o Bearer do cookie de sessão. O layout do grupo `(crm)` já barra sessão
// ausente — a checagem aqui é defensiva (redirect fora de try/catch).
const requireToken = async (): Promise<string> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  return token;
};

const appointmentIdSchema = z.uuid();
const optionalClientIdSchema = z.uuid().optional();
const leadIdSchema = z.uuid();

// Cria um compromisso (POST /appointments — RF-04). Revalida o payload com o
// contrato na fronteira (security.md: nunca confiar no client) antes de
// chamar a API. Vínculo de pessoa presente ⇒ revalida também as listas de
// clientes/leads (a agenda passa a compor a ficha da cliente/o card de lead,
// RF-22). Sucesso ⇒ revalida a listagem e redireciona para o DETALHE do
// compromisso recém-criado; `revalidatePath`/`redirect` ficam FORA de
// try/catch (o helper nunca lança; `redirect` lança NEXT_REDIRECT
// propositalmente).
export const createAppointmentAction = async (
  values: CreateAppointmentInput,
): Promise<AppointmentActionResult> => {
  const parsed = createAppointmentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  const token = await requireToken();

  const result = await createAppointment(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  if (parsed.data.clientId != null || parsed.data.leadId != null) {
    revalidatePath(CLIENTS_LIST_PATH);
    revalidatePath(LEADS_LIST_PATH);
  }
  redirect(appointmentDetailPath(result.appointment.id));
};

// Edita um compromisso (PUT /appointments/:id — RF-07). Campos de pessoa
// omitidos preservam o vínculo atual (o contrato aceita `undefined` ausente
// vs. `null` explícito); por isso a revalidação cruzada de clientes/leads só
// dispara quando a chave `clientId`/`leadId` está PRESENTE no payload
// validado (mudou ou foi explicitamente desvinculada). Sucesso ⇒ revalida
// listagem e detalhe, retorna `{ ok: true }` — a usuária permanece no
// detalhe. Falha (409 fora de `scheduled`/campo terminal, 422 pessoa/venda
// incompatível, 404, rede) ⇒ `{ ok: false, message }` com a mensagem pt-BR da
// API.
export const updateAppointmentAction = async (
  id: string,
  values: UpdateAppointmentInput,
): Promise<AppointmentActionResult> => {
  const parsedId = appointmentIdSchema.safeParse(id);
  const parsedValues = updateAppointmentSchema.safeParse(values);
  if (!parsedId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }
  if (!parsedValues.success) {
    return { ok: false, message: firstIssueMessage(parsedValues.error) };
  }

  const token = await requireToken();

  const result = await updateAppointment(parsedId.data, parsedValues.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(appointmentDetailPath(parsedId.data));
  if ("clientId" in parsedValues.data || "leadId" in parsedValues.data) {
    revalidatePath(CLIENTS_LIST_PATH);
    revalidatePath(LEADS_LIST_PATH);
  }
  return { ok: true };
};

// Remove um compromisso (DELETE /appointments/:id — RF-09): "marquei por
// engano". Sucesso ⇒ revalida a listagem e redireciona para ELA (o detalhe
// deixou de existir). Falha (404, rede) ⇒ `{ ok: false, message }` pt-BR.
export const deleteAppointmentAction = async (
  id: string,
): Promise<AppointmentActionResult> => {
  const parsedId = appointmentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await deleteAppointment(parsedId.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
};

// Aplica uma transição de desfecho (RF-08). Sucesso ⇒ revalida listagem e
// detalhe, retorna `{ ok: true }`. Falha (409 fora de `scheduled`, 422
// `saleId` inválido em `done`, 404, rede) ⇒ `{ ok: false, message }` pt-BR.
const applyTransition = async (
  id: string,
  transition: "done" | "no-show" | "cancel",
  body: CompleteAppointmentInput | undefined,
): Promise<AppointmentActionResult> => {
  const parsedId = appointmentIdSchema.safeParse(id);
  const parsedBody =
    transition === "done"
      ? completeAppointmentSchema.safeParse(body ?? {})
      : undefined;
  if (!parsedId.success || (parsedBody !== undefined && !parsedBody.success)) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await transitionAppointment(
    parsedId.data,
    transition,
    parsedBody?.data,
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(appointmentDetailPath(parsedId.data));
  return { ok: true };
};

// `POST /appointments/:id/done` (RF-08): `scheduled` → `done`. `saleId`
// opcional vincula a venda atomicamente no servidor; omitido preserva um
// vínculo feito antes (RF-10).
export const completeAppointmentAction = async (
  id: string,
  saleId?: string,
): Promise<AppointmentActionResult> =>
  applyTransition(id, "done", saleId !== undefined ? { saleId } : undefined);

// `POST /appointments/:id/no-show` (RF-08): `scheduled` → `no_show`, limpa
// `sale_id` no servidor (invariante: encontro não realizado não tem venda).
export const noShowAppointmentAction = async (
  id: string,
): Promise<AppointmentActionResult> =>
  applyTransition(id, "no-show", undefined);

// `POST /appointments/:id/cancel` (RF-08): `scheduled` → `canceled`, limpa
// `sale_id` no servidor.
export const cancelAppointmentAction = async (
  id: string,
): Promise<AppointmentActionResult> => applyTransition(id, "cancel", undefined);

// Vincula/desvincula a venda do compromisso (PUT /appointments/:id/sale —
// RF-10). Sucesso ⇒ revalida só o DETALHE (o vínculo de venda não afeta a
// listagem nem a ficha da cliente/lead). Falha (409 fora de
// `scheduled`/`done`, 422 venda incompatível, 404, rede) ⇒
// `{ ok: false, message }` pt-BR.
export const linkAppointmentSaleAction = async (
  id: string,
  saleId: string | null,
): Promise<AppointmentActionResult> => {
  const parsedId = appointmentIdSchema.safeParse(id);
  const parsedBody = linkAppointmentSaleSchema.safeParse({
    saleId,
  } satisfies LinkAppointmentSaleInput);
  if (!parsedId.success || !parsedBody.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await linkAppointmentSale(
    parsedId.data,
    parsedBody.data.saleId,
    {
      fetchImpl: fetch,
      apiUrl: loadWebEnv().API_URL,
      token,
    },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(appointmentDetailPath(parsedId.data));
  return { ok: true };
};

// Converte o lead vinculado em cliente a partir do detalhe do compromisso
// (RF-25): reusa a MESMA conversão do funil de leads (`POST /leads/:id/convert`,
// CRM-04) — nenhuma regra nova, só um caminho de entrada diferente. Ao
// contrário de `convertLeadAction` (`crm/leads/actions.ts`), esta versão NÃO
// redireciona: a consultora permanece no detalhe do compromisso, que passa a
// exibir a cliente assim que a listagem revalida (RF-12 já re-aponta o
// `client_id` na mesma transação do backend). Revalida a agenda (lista e
// detalhe), leads e clientes — a pessoa mudou de funil em três telas ao
// mesmo tempo.
export const convertAppointmentLeadAction = async (
  appointmentId: string,
  leadId: string,
): Promise<AppointmentActionResult> => {
  const parsedAppointmentId = appointmentIdSchema.safeParse(appointmentId);
  const parsedLeadId = leadIdSchema.safeParse(leadId);
  if (!parsedAppointmentId.success || !parsedLeadId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await convertLead(parsedLeadId.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(appointmentDetailPath(parsedAppointmentId.data));
  revalidatePath(LEADS_LIST_PATH);
  revalidatePath(CLIENTS_LIST_PATH);
  return { ok: true };
};

// Busca clientes (RF-14, seletor de pessoa do form — RF-18): reusa
// `listClients(search)` do módulo de clientes existente. Retorna só
// `id`/`name` (nunca dado pessoal a mais). Nunca lança: falha vira
// `{ ok: false, message }` pt-BR.
export const searchClientsAction = async (
  term: string,
): Promise<SearchClientsResult> => {
  const token = await requireToken();

  const result = await listClients(
    { search: term, perPage: SEARCH_CLIENTS_PER_PAGE },
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return {
    ok: true,
    clients: result.data.map((client) => ({
      id: client.id,
      name: client.name,
    })),
  };
};

// Busca leads (RF-14, seletor de pessoa do form — RF-18): reusa
// `listLeads(search)` do módulo de leads existente. Retorna só `id`/`name`
// (nunca WhatsApp/interesse). Nunca lança: falha vira `{ ok: false, message }`
// pt-BR.
export const searchLeadsAction = async (
  term: string,
): Promise<SearchLeadsResult> => {
  const token = await requireToken();

  const result = await listLeads(
    { search: term },
    { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return {
    ok: true,
    leads: result.data.map((lead) => ({ id: lead.id, name: lead.name })),
  };
};

// Cadastro rápido de lead a partir do seletor de pessoa da agenda (RF-23):
// `POST /leads/manual` (RF-24/ADR-0020), distinto da captura pública da
// landing. Sucesso ⇒ revalida `/crm/leads` e devolve `{ id, name }` para o
// `PersonSelect` vincular o lead recém-criado ao compromisso em edição.
// Falha (validação ou API) ⇒ `{ ok: false, message }` pt-BR, nada criado.
export const quickCreateLeadAction = async (
  values: CreateLeadCrmInput,
): Promise<QuickCreateLeadResult> => {
  const parsed = createLeadCrmSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  const token = await requireToken();

  const result = await createLead(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(LEADS_LIST_PATH);
  return {
    ok: true,
    lead: { id: result.lead.id, name: result.lead.name },
  };
};

// Vendas ATIVAS ofertáveis ao vínculo (RF-10/RF-19 + CRM-12/RF-13): `open` e
// `completed` da cliente vinculada quando há `clientId`; sem cliente, as mais
// recentes da consultora. Cancelada nunca é ofertada — a API também a rejeita.
// A listagem filtra um status por vez, então as duas páginas são buscadas EM
// PARALELO (sem waterfall) e reordenadas por `soldAt` desc, como uma lista só.
// Projeção mínima (sem itens/recebíveis). Nunca lança.
const LINKABLE_SALE_STATUSES = ["open", "completed"] as const;

export const listLinkableSalesAction = async (
  clientId?: string,
): Promise<ListLinkableSalesResult> => {
  const parsedClientId = optionalClientIdSchema.safeParse(clientId);
  if (!parsedClientId.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();
  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };

  const results = await Promise.all(
    LINKABLE_SALE_STATUSES.map((status) =>
      listSales({ status, clientId: parsedClientId.data }, deps),
    ),
  );

  const failed = results.find((result) => !result.ok);
  if (failed && !failed.ok) {
    return { ok: false, message: failed.message };
  }

  const sales = results
    .flatMap((result) => (result.ok ? result.data : []))
    .toSorted((left, right) => right.soldAt.localeCompare(left.soldAt))
    .map((sale) => ({
      id: sale.id,
      clientName: sale.clientName,
      totalCents: sale.totalCents,
      soldAt: sale.soldAt,
      status: sale.status,
    }));

  return { ok: true, sales };
};

// Consulta sobreposições (GET /appointments/conflicts — RF-11): aviso NÃO
// bloqueante do formulário — nunca impede o envio, só informa. Nunca lança.
export const checkConflictsAction = async (
  values: CheckConflictsInput,
): Promise<CheckConflictsResult> => {
  const parsed = appointmentConflictsQuerySchema.safeParse(
    values satisfies AppointmentConflictsQueryInput,
  );
  if (!parsed.success) {
    return { ok: false, message: INVALID_INPUT_MESSAGE };
  }

  const token = await requireToken();

  const result = await getAppointmentConflicts(parsed.data, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return { ok: true, conflicts: result.data };
};
