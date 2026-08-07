import type { Client, CrmLead, LeadStatusUpdate } from "@clientela/shared";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../../db/client";
import { appointments, clients, leads, type NewLead } from "../../db/schema";
import { LeadAlreadyConvertedError } from "./leads.errors";
import type {
  ConvertLeadClientData,
  LeadsRepositoryPort,
  ListLeadsParams,
} from "./leads.service";

export type LeadsRepository = ReturnType<typeof createLeadsRepository>;

type LeadRow = typeof leads.$inferSelect;
type ClientRow = typeof clients.$inferSelect;

const CONVERTED_STATUS = "converted";

// Condição de busca (RF-14): `ILIKE %termo%` em name OU whatsapp
// (case-insensitive), mesmo padrão de `clients.repository.ts`. Termo só com
// dígitos também casa a forma só-dígitos contra o whatsapp normalizado (sem
// máscara) — ex.: "(11) 9" casa com o número guardado.
const buildSearchCondition = (search: string): SQL | undefined => {
  const term = `%${search}%`;
  const conditions: SQL[] = [
    ilike(leads.name, term),
    ilike(leads.whatsapp, term),
  ];

  const digits = search.replace(/\D/g, "");
  if (digits.length > 0) {
    conditions.push(ilike(leads.whatsapp, `%${digits}%`));
  }

  return or(...conditions);
};

// Molda a linha de lead no contrato de resposta do CRM (CrmLead): timestamp
// `Date` → ISO 8601; `consentAt`/`updatedAt` ficam de fora (não fazem parte do
// contrato de saída). `clientId` reflete o vínculo opcional com a cliente.
const toCrmLead = (row: LeadRow): CrmLead => ({
  id: row.id,
  name: row.name,
  whatsapp: row.whatsapp,
  interest: row.interest,
  source: row.source,
  status: row.status,
  clientId: row.clientId,
  createdAt: row.createdAt.toISOString(),
});

// Molda a linha do banco no contrato de resposta (Client) — mesmo shape do
// clients.repository: timestamps `Date` → ISO; `consultantId` fora do contrato.
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

// Única camada que toca o banco (api.md/database.md). O insert público devolve
// apenas `{ id }`: menos superfície de vazamento e a resposta HTTP nunca ecoa
// dado pessoal. As operações do CRM moldam a linha na porta que o service espera.
export const createLeadsRepository = (db: Database): LeadsRepositoryPort => {
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

  const list = async ({
    page,
    perPage,
    status,
    search,
  }: ListLeadsParams): Promise<{ rows: CrmLead[]; total: number }> => {
    const statusCondition = status ? eq(leads.status, status) : undefined;
    const searchCondition = search ? buildSearchCondition(search) : undefined;
    const conditions = [statusCondition, searchCondition].filter(
      (condition): condition is SQL => condition !== undefined,
    );
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * perPage;

    const rows = await db
      .select()
      .from(leads)
      .where(where)
      // Leads novos primeiro; id desc como desempate determinístico (plan.md).
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(perPage)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(leads)
      .where(where);

    return {
      rows: rows.map(toCrmLead),
      total: totalRow?.value ?? 0,
    };
  };

  const findById = async (id: string): Promise<CrmLead | undefined> => {
    const [row] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    return row ? toCrmLead(row) : undefined;
  };

  const updateStatus = async (
    id: string,
    status: LeadStatusUpdate,
  ): Promise<CrmLead | undefined> => {
    // Guarda de corrida: nunca altera lead já convertido (terminal). 0 linhas
    // ⇒ undefined; o service decide 404 (não existe) vs 409 (convertido) via
    // findById.
    const [row] = await db
      .update(leads)
      .set({ status })
      .where(and(eq(leads.id, id), ne(leads.status, CONVERTED_STATUS)))
      .returning();

    return row ? toCrmLead(row) : undefined;
  };

  const convert = async (
    leadId: string,
    insertClient: ConvertLeadClientData,
  ): Promise<Client> => {
    return db.transaction(async (tx) => {
      // (a) Marca o lead como convertido de forma condicional. A guarda de
      // já-convertido vive DENTRO da transação (WHERE status <> 'converted'):
      // 0 linhas ⇒ rollback + 409. Sob concorrência, só a primeira requisição
      // afeta a linha — a invariante Lead 1—0..1 Client é garantida aqui, não
      // no service (checagem só no service seria TOCTOU).
      const marked = await tx
        .update(leads)
        .set({ status: CONVERTED_STATUS })
        .where(and(eq(leads.id, leadId), ne(leads.status, CONVERTED_STATUS)))
        .returning({ id: leads.id });

      if (marked.length === 0) {
        throw new LeadAlreadyConvertedError();
      }

      // (b) Cria a cliente com o payload composto pelo service.
      const [clientRow] = await tx
        .insert(clients)
        .values(insertClient)
        .returning();

      if (!clientRow) {
        throw new Error(
          "Falha ao converter lead: insert de cliente não retornou linha",
        );
      }

      // (c) Pendura o vínculo do lead na cliente recém-criada.
      await tx
        .update(leads)
        .set({ clientId: clientRow.id })
        .where(eq(leads.id, leadId));

      // (d) RF-12: propaga a conversão para a agenda, na MESMA transação.
      // Só os compromissos do lead que AINDA não têm cliente são afetados
      // (`client_id IS NULL`) — um compromisso que já apontava para uma
      // cliente (ex.: vínculo manual anterior) nunca é sobrescrito.
      // `lead_id` é preservado (rastreabilidade) — o UPDATE só toca
      // `client_id`. Escopado por `consultant_id` para não vazar entre
      // consultoras. Não revalida `sale_id` pré-existente (limitação
      // declarada do RF-12): o vínculo de venda é preservado como está.
      await tx
        .update(appointments)
        .set({ clientId: clientRow.id })
        .where(
          and(
            eq(appointments.leadId, leadId),
            isNull(appointments.clientId),
            eq(appointments.consultantId, insertClient.consultantId),
          ),
        );

      return toClient(clientRow);
    });
  };

  return { insert, list, findById, updateStatus, convert };
};
