import type {
  Client,
  CrmLead,
  LeadCaptureRequest,
  LeadCaptureResponse,
  LeadStatus,
  LeadStatusUpdate,
  LeadsListQuery,
  Paginated,
} from "@clientela/shared";
import { LeadAlreadyConvertedError, LeadNotFoundError } from "./leads.errors";

export type LeadsClock = () => Date;
export type GenerateId = () => string;

// Parâmetros da listagem autenticada: paginação + filtro por status opcional
// (aceita todo o enum, inclusive `converted`, para inspeção do funil).
export type ListLeadsParams = {
  page: number;
  perPage: number;
  status?: LeadStatus;
};

// Dados da cliente compostos pelo service a partir do lead + consultora da
// sessão. O repository só executa a transação — a regra (prefixo do interesse,
// consultora da sessão) é do service (api.md).
export type ConvertLeadClientData = {
  name: string;
  whatsapp: string;
  consultantId: string;
  notes: string | null;
};

// Porta mínima que o service precisa do repositório — o service não conhece
// Drizzle nem o schema do banco (api.md: dependências explícitas, testável
// com fake, sem mock de módulo). `updateStatus`/`convert` guardam a corrida
// dentro do repositório: 0 linhas / rollback ⇒ o service traduz em erro.
export type LeadsRepositoryPort = {
  insert: (lead: {
    name: string;
    whatsapp: string;
    interest?: string;
    consentAt: Date;
  }) => Promise<{ id: string }>;
  list: (
    params: ListLeadsParams,
  ) => Promise<{ rows: CrmLead[]; total: number }>;
  findById: (id: string) => Promise<CrmLead | undefined>;
  updateStatus: (
    id: string,
    status: LeadStatusUpdate,
  ) => Promise<CrmLead | undefined>;
  convert: (
    leadId: string,
    insertClient: ConvertLeadClientData,
  ) => Promise<Client>;
};

export type LeadsServiceDeps = {
  repository: LeadsRepositoryPort;
  clock: LeadsClock;
  generateId: GenerateId;
};

export type LeadsService = ReturnType<typeof createLeadsService>;

// Prefixo aplicado ao interesse do lead ao virar observação da cliente — não
// perde a informação de captação sem criar um campo novo (plan.md).
const INTEREST_NOTE_PREFIX = "Interesse (lead): ";

const isHoneypotTriggered = (website: string | undefined): boolean =>
  website !== undefined && website.length > 0;

export const createLeadsService = ({
  repository,
  clock,
  generateId,
}: LeadsServiceDeps) => {
  const capture = async (
    input: LeadCaptureRequest,
  ): Promise<LeadCaptureResponse> => {
    // Honeypot: `website` não-vazio = bot. Responde 201 com id sintético, sem
    // persistir e sem revelar a detecção. `website` ausente ou "" (campo hidden
    // do formulário HTML) é humano e segue o fluxo normal. Nada é logado aqui:
    // dado pessoal não entra em log (security.md).
    if (isHoneypotTriggered(input.website)) {
      return { id: generateId() };
    }

    const inserted = await repository.insert({
      name: input.name,
      whatsapp: input.whatsapp,
      interest: input.interest,
      consentAt: clock(),
    });

    return { id: inserted.id };
  };

  // Listagem autenticada do CRM: monta o envelope paginado a partir do
  // repositório (que aplica filtro e ordem `created_at desc, id desc`).
  const listForCrm = async (
    query: LeadsListQuery,
  ): Promise<Paginated<CrmLead>> => {
    const { rows, total } = await repository.list({
      page: query.page,
      perPage: query.perPage,
      status: query.status,
    });

    return {
      data: rows,
      page: query.page,
      perPage: query.perPage,
      total,
    };
  };

  // Transição de status no funil. Lead convertido é terminal (409); inexistente
  // ⇒ 404. A guarda de corrida está também no repositório (WHERE status <>
  // 'converted'): se o lead virou `converted` entre o findById e o update,
  // `updateStatus` devolve undefined e traduzimos no mesmo 409.
  const updateStatus = async (
    id: string,
    status: LeadStatusUpdate,
  ): Promise<CrmLead> => {
    const lead = await repository.findById(id);
    if (!lead) {
      throw new LeadNotFoundError();
    }
    if (lead.status === "converted") {
      throw new LeadAlreadyConvertedError();
    }

    const updated = await repository.updateStatus(id, status);
    if (!updated) {
      throw new LeadAlreadyConvertedError();
    }
    return updated;
  };

  // Conversão lead → cliente. O service compõe o payload (dados do lead +
  // consultora da sessão + interesse em notes); o repository executa a
  // transação atômica com a guarda de já-convertido dentro dela. A checagem
  // prévia (404/409) evita abrir transação para casos triviais, mas a
  // atomicidade real vem da guarda transacional (LeadAlreadyConvertedError
  // relançado do repositório sob corrida).
  const convertToClient = async (
    id: string,
    consultantId: string,
  ): Promise<Client> => {
    const lead = await repository.findById(id);
    if (!lead) {
      throw new LeadNotFoundError();
    }
    if (lead.status === "converted") {
      throw new LeadAlreadyConvertedError();
    }

    const notes = lead.interest
      ? `${INTEREST_NOTE_PREFIX}${lead.interest}`
      : null;

    return repository.convert(id, {
      name: lead.name,
      whatsapp: lead.whatsapp,
      consultantId,
      notes,
    });
  };

  return { capture, listForCrm, updateStatus, convertToClient };
};
