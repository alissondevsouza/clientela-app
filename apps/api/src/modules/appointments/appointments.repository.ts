import type {
  Appointment,
  AppointmentKind,
  AppointmentListItem,
  AppointmentStatus,
  CreateAppointment,
  SaleStatus,
  UpdateAppointment,
} from "@clientela/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client";
import { appointments, clients, leads, sales } from "../../db/schema";
import {
  AppointmentNotFoundError,
  AppointmentStateError,
  InvalidAppointmentSaleError,
} from "./appointments.errors";
import type {
  AppointmentPersonRef,
  AppointmentsRangeBounds,
  AppointmentsRepositoryPort,
  FindConflictsParams,
  ListAppointmentsParams,
} from "./appointments.service";

export type AppointmentsRepository = ReturnType<
  typeof createAppointmentsRepository
>;

// Executor: aceita tanto a conexão (`db`) quanto a transação (`tx`) — padrão
// de orders/sales.repository, evita duplicar SQL entre carregador e escrita.
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

const SCHEDULED_STATUS: AppointmentStatus = "scheduled";
const DONE_STATUS: AppointmentStatus = "done";
const NO_SHOW_STATUS: AppointmentStatus = "no_show";
const CANCELED_STATUS: AppointmentStatus = "canceled";
// Vínculo da agenda aceita venda ATIVA (RF-13 da CRM-12): `open` ou
// `completed`. Cancelada nunca é vinculável; uma venda já vinculada que depois
// é cancelada preserva o vínculo histórico.
const LINKABLE_SALE_STATUSES: SaleStatus[] = ["open", "completed"];

const CONFLICTS_LIMIT = 20;

const DONE_INVALID_TRANSITION_MESSAGE =
  "Só é possível concluir um compromisso agendado.";
const NO_SHOW_INVALID_TRANSITION_MESSAGE =
  "Só é possível marcar falta em um compromisso agendado.";
const CANCEL_INVALID_TRANSITION_MESSAGE =
  "Só é possível cancelar um compromisso agendado.";
const LINK_SALE_INVALID_STATE_MESSAGE =
  "Só é possível vincular venda a um compromisso agendado ou realizado.";
const UPDATE_TERMINAL_ONLY_NOTES_MESSAGE =
  "Compromisso com desfecho: só é possível editar as observações.";
const UPDATE_INVALID_STATE_MESSAGE =
  "Não foi possível salvar: o status do compromisso mudou.";

type AppointmentRow = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  clientWhatsapp: string | null;
  leadId: string | null;
  leadName: string | null;
  leadWhatsapp: string | null;
  saleId: string | null;
  saleTotalCents: number | null;
  kind: AppointmentKind;
  title: string | null;
  startsAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AppointmentListRow = Omit<
  AppointmentRow,
  "clientWhatsapp" | "leadWhatsapp" | "notes"
>;

// Colunas completas (detalhe, RF-06): LEFT JOIN em clients/leads/sales — sem
// snapshot (ADR-0016), nome/whatsapp/total sempre o ATUAL, null quando não há
// vínculo ou a pessoa/venda foi excluída.
const APPOINTMENT_DETAIL_COLUMNS = {
  id: appointments.id,
  clientId: appointments.clientId,
  clientName: clients.name,
  clientWhatsapp: clients.whatsapp,
  leadId: appointments.leadId,
  leadName: leads.name,
  leadWhatsapp: leads.whatsapp,
  saleId: appointments.saleId,
  saleTotalCents: sales.totalCents,
  kind: appointments.kind,
  title: appointments.title,
  startsAt: appointments.startsAt,
  durationMinutes: appointments.durationMinutes,
  status: appointments.status,
  location: appointments.location,
  notes: appointments.notes,
  createdAt: appointments.createdAt,
  updatedAt: appointments.updatedAt,
};

// Colunas da listagem (RF-01/RF-05): SEM `notes`/whatsapp — minimização de
// dado pessoal na origem (não só no contrato de saída), o número só é lido
// no detalhe.
const APPOINTMENT_LIST_COLUMNS = {
  id: appointments.id,
  clientId: appointments.clientId,
  clientName: clients.name,
  leadId: appointments.leadId,
  leadName: leads.name,
  saleId: appointments.saleId,
  saleTotalCents: sales.totalCents,
  kind: appointments.kind,
  title: appointments.title,
  startsAt: appointments.startsAt,
  durationMinutes: appointments.durationMinutes,
  status: appointments.status,
  location: appointments.location,
  createdAt: appointments.createdAt,
  updatedAt: appointments.updatedAt,
};

const toAppointment = (row: AppointmentRow): Appointment => ({
  id: row.id,
  clientId: row.clientId,
  clientName: row.clientName,
  clientWhatsapp: row.clientWhatsapp,
  leadId: row.leadId,
  leadName: row.leadName,
  leadWhatsapp: row.leadWhatsapp,
  saleId: row.saleId,
  saleTotalCents: row.saleTotalCents,
  kind: row.kind,
  title: row.title,
  startsAt: row.startsAt.toISOString(),
  durationMinutes: row.durationMinutes,
  status: row.status,
  location: row.location,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toAppointmentListItem = (
  row: AppointmentListRow,
): AppointmentListItem => ({
  id: row.id,
  clientId: row.clientId,
  clientName: row.clientName,
  leadId: row.leadId,
  leadName: row.leadName,
  saleId: row.saleId,
  saleTotalCents: row.saleTotalCents,
  kind: row.kind,
  title: row.title,
  startsAt: row.startsAt.toISOString(),
  durationMinutes: row.durationMinutes,
  status: row.status,
  location: row.location,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

// Carrega o compromisso completo (detalhe) escopado pela consultora. Aceita
// `db` ou `tx` — reusado dentro das transações de escrita para devolver o
// recurso atualizado sem duplicar o SELECT com joins.
const loadAppointment = async (
  executor: Executor,
  consultantId: string,
  id: string,
): Promise<Appointment | undefined> => {
  const [row] = await executor
    .select(APPOINTMENT_DETAIL_COLUMNS)
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(leads, eq(appointments.leadId, leads.id))
    .leftJoin(sales, eq(appointments.saleId, sales.id))
    .where(
      and(eq(appointments.id, id), eq(appointments.consultantId, consultantId)),
    )
    .limit(1);

  if (!row) {
    return undefined;
  }
  return toAppointment(row);
};

// Sale válida para vínculo (RF-10): existe, é da consultora e está ativa
// (`open` ou `completed`). Consultada ANTES de gravar a FK — nunca deixa uma violação de
// FK crua virar 500 (ponto de rigor #3). Aceita `db`/`tx` para rodar dentro
// da mesma transação da escrita (RF-08/RF-08.1).
const findLinkableSale = async (
  executor: Executor,
  consultantId: string,
  saleId: string,
): Promise<{ id: string; clientId: string | null } | undefined> => {
  const [row] = await executor
    .select({ id: sales.id, clientId: sales.clientId })
    .from(sales)
    .where(
      and(
        eq(sales.id, saleId),
        eq(sales.consultantId, consultantId),
        inArray(sales.status, LINKABLE_SALE_STATUSES),
      ),
    )
    .limit(1);
  return row;
};

// Regra de compatibilidade de cliente (RF-10): compromisso com clientId E
// venda com clientId DIFERENTE ⇒ inválido. Venda sem cliente é vinculável a
// qualquer compromisso; compromisso sem cliente aceita qualquer venda ativa. Lança `InvalidAppointmentSaleError` (mesma mensagem para
// inexistente/alheia/incompatível — não vaza existência).
const assertLinkableSale = async (
  executor: Executor,
  consultantId: string,
  saleId: string,
  appointmentClientId: string | null,
): Promise<void> => {
  const sale = await findLinkableSale(executor, consultantId, saleId);
  if (!sale) {
    throw new InvalidAppointmentSaleError();
  }
  if (
    appointmentClientId !== null &&
    sale.clientId !== null &&
    sale.clientId !== appointmentClientId
  ) {
    throw new InvalidAppointmentSaleError();
  }
};

// Cliente atualmente vinculado a uma venda já linkada ao compromisso (usado
// pela revalidação de compatibilidade do PUT, RF-07) — só a leitura do
// clientId, sem repetir o filtro de status (a venda já foi validada quando
// vinculada; aqui só checamos consistência de cliente).
const findSaleClientId = async (
  executor: Executor,
  consultantId: string,
  saleId: string,
): Promise<string | null | undefined> => {
  const [row] = await executor
    .select({ clientId: sales.clientId })
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.consultantId, consultantId)))
    .limit(1);
  return row?.clientId;
};

// Constrói o filtro do recorte de `range` (RF-05) a partir dos bounds JÁ
// resolvidos pelo service (nunca `AT TIME ZONE`/`CURRENT_DATE`/`now()` aqui —
// ponto de rigor #1). Cada bound vira `gte`/`lt` sobre `starts_at` — sargável,
// usa o índice `(consultant_id, starts_at)`.
const rangeConditions = (bounds: AppointmentsRangeBounds): SQL[] => {
  switch (bounds.range) {
    case "upcoming":
      return [gte(appointments.startsAt, new Date(bounds.startUtc))];
    case "pending":
      return [
        lt(appointments.startsAt, new Date(bounds.startUtc)),
        eq(appointments.status, SCHEDULED_STATUS),
      ];
    case "history":
      return [ne(appointments.status, SCHEDULED_STATUS)];
    case "day":
      return [
        gte(appointments.startsAt, new Date(bounds.startUtc)),
        lt(appointments.startsAt, new Date(bounds.endUtc)),
      ];
    case "all":
      return [];
    default: {
      const exhaustiveCheck: never = bounds;
      return exhaustiveCheck;
    }
  }
};

const isAscendingRange = (bounds: AppointmentsRangeBounds): boolean =>
  bounds.range === "upcoming" || bounds.range === "day";

// Única camada que toca o banco (api.md/database.md). TODA query escopa por
// `consultant_id`.
export const createAppointmentsRepository = (
  db: Database,
): AppointmentsRepositoryPort => {
  const findClientById = async (
    consultantId: string,
    clientId: string,
  ): Promise<AppointmentPersonRef | undefined> => {
    const [row] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(eq(clients.id, clientId), eq(clients.consultantId, consultantId)),
      )
      .limit(1);
    return row;
  };

  // Leads não têm `consultant_id` (drift documentado em 04-domain-model.md) —
  // a checagem do RF-03 para lead é só de existência.
  const findLeadById = async (
    leadId: string,
  ): Promise<AppointmentPersonRef | undefined> => {
    const [row] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    return row;
  };

  // Criação (RF-01/RF-04): o vínculo de pessoa já foi validado pelo service
  // ANTES desta chamada (findClientById/findLeadById) — a FK só é escrita
  // depois de confirmada, nunca crua.
  const create = async (
    consultantId: string,
    input: CreateAppointment,
  ): Promise<Appointment> => {
    const [row] = await db
      .insert(appointments)
      .values({
        consultantId,
        clientId: input.clientId ?? null,
        leadId: input.leadId ?? null,
        kind: input.kind,
        title: input.title ?? null,
        startsAt: new Date(input.startsAt),
        durationMinutes: input.durationMinutes,
        location: input.location ?? null,
        notes: input.notes ?? null,
      })
      .returning({ id: appointments.id });

    if (!row) {
      throw new Error("Falha ao persistir compromisso: insert não retornou id");
    }

    const created = await loadAppointment(db, consultantId, row.id);
    if (!created) {
      throw new Error("Falha ao carregar compromisso recém-criado");
    }
    return created;
  };

  const list = async (
    consultantId: string,
    {
      page,
      perPage,
      bounds,
      status,
      kind,
      clientId,
      leadId,
    }: ListAppointmentsParams,
  ): Promise<{ rows: AppointmentListItem[]; total: number }> => {
    const conditions: SQL[] = [
      eq(appointments.consultantId, consultantId),
      ...rangeConditions(bounds),
    ];
    if (status) {
      conditions.push(eq(appointments.status, status));
    }
    if (kind) {
      conditions.push(eq(appointments.kind, kind));
    }
    if (clientId) {
      conditions.push(eq(appointments.clientId, clientId));
    }
    if (leadId) {
      conditions.push(eq(appointments.leadId, leadId));
    }
    const where = and(...conditions);
    const offset = (page - 1) * perPage;
    const ascending = isAscendingRange(bounds);

    const rows = await db
      .select(APPOINTMENT_LIST_COLUMNS)
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(leads, eq(appointments.leadId, leads.id))
      .leftJoin(sales, eq(appointments.saleId, sales.id))
      .where(where)
      // Desempate por `id` em todas as ordenações (RF-05).
      .orderBy(
        ascending ? asc(appointments.startsAt) : desc(appointments.startsAt),
        ascending ? asc(appointments.id) : desc(appointments.id),
      )
      .limit(perPage)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(appointments)
      .where(where);

    return {
      rows: rows.map(toAppointmentListItem),
      total: totalRow?.value ?? 0,
    };
  };

  const getById = (
    consultantId: string,
    id: string,
  ): Promise<Appointment | undefined> => loadAppointment(db, consultantId, id);

  // Edição (RF-07): guard `status='scheduled'` para o payload completo; em
  // status terminal aceita SÓ `notes` (qualquer outro campo presente ⇒ 409).
  // FKs de pessoa omitidas são preservadas (merge com o valor atual); `null`
  // explícito desvincula. Troca de `clientId` revalida compatibilidade com
  // `sale_id` vinculado (ponto de rigor #6) — tudo na MESMA transação, para
  // que uma incompatibilidade não altere nada.
  const update = async (
    consultantId: string,
    id: string,
    input: UpdateAppointment,
  ): Promise<Appointment> => {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: appointments.status,
          clientId: appointments.clientId,
          saleId: appointments.saleId,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.consultantId, consultantId),
          ),
        )
        .limit(1);

      if (!current) {
        throw new AppointmentNotFoundError();
      }

      const isTerminal = current.status !== SCHEDULED_STATUS;
      const inputKeys = Object.keys(input);
      const hasOnlyNotes = inputKeys.every((key) => key === "notes");
      if (isTerminal && !hasOnlyNotes) {
        throw new AppointmentStateError(UPDATE_TERMINAL_ONLY_NOTES_MESSAGE);
      }

      const nextClientId =
        "clientId" in input ? (input.clientId ?? null) : current.clientId;

      // RF-07/RF-10: a invariante só protege contra TROCAR para uma cliente
      // diferente da venda vinculada. Desvincular a cliente (`nextClientId ===
      // null`) é legal — o RF-10 já admite "compromisso sem cliente + venda
      // completed de qualquer cliente" por outro caminho (vincular a venda
      // depois), então o mesmo estado não pode ser recusado aqui.
      if (current.saleId !== null && nextClientId !== null) {
        const saleClientId = await findSaleClientId(
          tx,
          consultantId,
          current.saleId,
        );
        if (
          saleClientId !== undefined &&
          saleClientId !== null &&
          saleClientId !== nextClientId
        ) {
          throw new InvalidAppointmentSaleError();
        }
      }

      const setValues: Partial<typeof appointments.$inferInsert> = {};
      if ("clientId" in input) {
        setValues.clientId = input.clientId ?? null;
      }
      if ("leadId" in input) {
        setValues.leadId = input.leadId ?? null;
      }
      if ("kind" in input && input.kind !== undefined) {
        setValues.kind = input.kind;
      }
      if ("title" in input) {
        setValues.title = input.title ?? null;
      }
      if ("startsAt" in input && input.startsAt !== undefined) {
        setValues.startsAt = new Date(input.startsAt);
      }
      if ("durationMinutes" in input && input.durationMinutes !== undefined) {
        setValues.durationMinutes = input.durationMinutes;
      }
      if ("location" in input) {
        setValues.location = input.location ?? null;
      }
      if ("notes" in input) {
        setValues.notes = input.notes ?? null;
      }

      const guard = isTerminal
        ? ne(appointments.status, SCHEDULED_STATUS)
        : eq(appointments.status, SCHEDULED_STATUS);

      const updated = await tx
        .update(appointments)
        .set(setValues)
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.consultantId, consultantId),
            guard,
          ),
        )
        .returning({ id: appointments.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: appointments.status })
          .from(appointments)
          .where(
            and(
              eq(appointments.id, id),
              eq(appointments.consultantId, consultantId),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new AppointmentNotFoundError();
        }
        throw new AppointmentStateError(UPDATE_INVALID_STATE_MESSAGE);
      }

      const result = await loadAppointment(tx, consultantId, id);
      if (!result) {
        throw new Error("Falha ao carregar compromisso após edição");
      }
      return result;
    });
  };

  // Transição scheduled → done (RF-08). SEM `saleId`: preserva o `sale_id`
  // existente (não sobrescreve com null) — o SET só inclui `saleId` quando o
  // corpo trouxe um valor. COM `saleId`: a venda é validada ANTES do UPDATE
  // que grava a FK (nunca crua) — se inválida, o throw aborta a transação
  // inteira e o compromisso permanece `scheduled` sem vínculo (ponto de rigor
  // #4/RF-08.1).
  const markDone = async (
    consultantId: string,
    id: string,
    saleId?: string,
  ): Promise<Appointment> => {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          clientId: appointments.clientId,
          status: appointments.status,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.consultantId, consultantId),
          ),
        )
        .limit(1);

      // Prioridade do guard de estado sobre a validação de venda (caminho
      // sequencial comum: chamar `done` num compromisso já terminal com um
      // `saleId` também inválido deve responder 409, não 422). A exclusividade
      // sob concorrência continua garantida pelo UPDATE condicional abaixo —
      // este early-return só cobre o caso não-concorrente.
      if (!current) {
        throw new AppointmentNotFoundError();
      }
      if (current.status !== SCHEDULED_STATUS) {
        throw new AppointmentStateError(DONE_INVALID_TRANSITION_MESSAGE);
      }

      if (saleId !== undefined) {
        await assertLinkableSale(tx, consultantId, saleId, current.clientId);
      }

      const setValues: Partial<typeof appointments.$inferInsert> = {
        status: DONE_STATUS,
      };
      if (saleId !== undefined) {
        setValues.saleId = saleId;
      }

      const updated = await tx
        .update(appointments)
        .set(setValues)
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.consultantId, consultantId),
            eq(appointments.status, SCHEDULED_STATUS),
          ),
        )
        .returning({ id: appointments.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: appointments.status })
          .from(appointments)
          .where(
            and(
              eq(appointments.id, id),
              eq(appointments.consultantId, consultantId),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new AppointmentNotFoundError();
        }
        throw new AppointmentStateError(DONE_INVALID_TRANSITION_MESSAGE);
      }

      const result = await loadAppointment(tx, consultantId, id);
      if (!result) {
        throw new Error("Falha ao carregar compromisso concluído");
      }
      return result;
    });
  };

  // Transições scheduled → {no_show, canceled} (RF-08): SEMPRE limpam
  // `sale_id` no MESMO UPDATE — invariante "encontro não realizado não tem
  // venda vinculada", que sob concorrência (RF-08.1) vale em qualquer ordem
  // de commit sem precisar de lock.
  const transitionClearingSale = async (
    consultantId: string,
    id: string,
    targetStatus: AppointmentStatus,
    invalidTransitionMessage: string,
  ): Promise<Appointment> => {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(appointments)
        .set({ status: targetStatus, saleId: null })
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.consultantId, consultantId),
            eq(appointments.status, SCHEDULED_STATUS),
          ),
        )
        .returning({ id: appointments.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: appointments.status })
          .from(appointments)
          .where(
            and(
              eq(appointments.id, id),
              eq(appointments.consultantId, consultantId),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new AppointmentNotFoundError();
        }
        throw new AppointmentStateError(invalidTransitionMessage);
      }

      const result = await loadAppointment(tx, consultantId, id);
      if (!result) {
        throw new Error("Falha ao carregar compromisso após transição");
      }
      return result;
    });
  };

  const markNoShow = (consultantId: string, id: string): Promise<Appointment> =>
    transitionClearingSale(
      consultantId,
      id,
      NO_SHOW_STATUS,
      NO_SHOW_INVALID_TRANSITION_MESSAGE,
    );

  const cancel = (consultantId: string, id: string): Promise<Appointment> =>
    transitionClearingSale(
      consultantId,
      id,
      CANCELED_STATUS,
      CANCEL_INVALID_TRANSITION_MESSAGE,
    );

  // Vínculo de venda (RF-10), permitido em `scheduled` e `done`. `saleId:
  // null` desvincula sem validação adicional; `saleId` presente é validado
  // ANTES do UPDATE que grava a FK (nunca crua), na mesma transação.
  const linkSale = async (
    consultantId: string,
    id: string,
    saleId: string | null,
  ): Promise<Appointment> => {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          clientId: appointments.clientId,
          status: appointments.status,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.consultantId, consultantId),
          ),
        )
        .limit(1);

      // Mesma prioridade de `markDone`: guard de estado antes da validação
      // de venda no caminho sequencial; a exclusividade sob concorrência
      // continua garantida pelo UPDATE condicional abaixo.
      if (!current) {
        throw new AppointmentNotFoundError();
      }
      if (
        current.status !== SCHEDULED_STATUS &&
        current.status !== DONE_STATUS
      ) {
        throw new AppointmentStateError(LINK_SALE_INVALID_STATE_MESSAGE);
      }

      if (saleId !== null) {
        await assertLinkableSale(tx, consultantId, saleId, current.clientId);
      }

      const updated = await tx
        .update(appointments)
        .set({ saleId })
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.consultantId, consultantId),
            inArray(appointments.status, [SCHEDULED_STATUS, DONE_STATUS]),
          ),
        )
        .returning({ id: appointments.id });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ status: appointments.status })
          .from(appointments)
          .where(
            and(
              eq(appointments.id, id),
              eq(appointments.consultantId, consultantId),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new AppointmentNotFoundError();
        }
        throw new AppointmentStateError(LINK_SALE_INVALID_STATE_MESSAGE);
      }

      const result = await loadAppointment(tx, consultantId, id);
      if (!result) {
        throw new Error("Falha ao carregar compromisso após vínculo de venda");
      }
      return result;
    });
  };

  // Exclusão (RF-09): SEM guard de status — compromisso não é registro
  // financeiro, `DELETE` é a correção de "marquei por engano" em qualquer
  // estado.
  const remove = async (consultantId: string, id: string): Promise<void> => {
    const deleted = await db
      .delete(appointments)
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.consultantId, consultantId),
        ),
      )
      .returning({ id: appointments.id });

    if (deleted.length === 0) {
      throw new AppointmentNotFoundError();
    }
  };

  // Conflitos (RF-11): intervalos semiabertos `[starts_at, starts_at +
  // duration)`; limites tocando não são conflito; só `scheduled`; ordem
  // ascendente por `starts_at` (desempate por `id`); `limit` 20. A condição
  // `starts_at < fimConsultado` é sargável (usa o índice); a segunda metade
  // do intersecção (fimExistente > inícioConsultado) soma duration_minutes ao
  // starts_at do candidato já filtrado — não é recorte de dia, então não cai
  // na proibição de função sobre a coluna do ponto de rigor #1.
  const findConflicts = async (
    consultantId: string,
    { startsAt, durationMinutes, excludeId }: FindConflictsParams,
  ): Promise<AppointmentListItem[]> => {
    const queriedStart = new Date(startsAt);
    const queriedEnd = new Date(
      queriedStart.getTime() + durationMinutes * 60_000,
    );

    const conditions: SQL[] = [
      eq(appointments.consultantId, consultantId),
      eq(appointments.status, SCHEDULED_STATUS),
      lt(appointments.startsAt, queriedEnd),
      // O lado esquerdo é uma expressão SQL crua (sem coluna tipada) — o
      // driver não infere `timestamptz` para o parâmetro automaticamente
      // como faz ao comparar direto com uma coluna, então o `Date` cru falha
      // na serialização (comprovado: `gt(sql\`...\`, Date)` quebra contra
      // Postgres real). ISO string funciona igual: Postgres compara
      // `timestamptz` com literal ISO sem ambiguidade.
      gt(
        sql`${appointments.startsAt} + (${appointments.durationMinutes} || ' minutes')::interval`,
        queriedStart.toISOString(),
      ),
    ];
    if (excludeId) {
      conditions.push(ne(appointments.id, excludeId));
    }

    const rows = await db
      .select(APPOINTMENT_LIST_COLUMNS)
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(leads, eq(appointments.leadId, leads.id))
      .leftJoin(sales, eq(appointments.saleId, sales.id))
      .where(and(...conditions))
      .orderBy(asc(appointments.startsAt), asc(appointments.id))
      .limit(CONFLICTS_LIMIT);

    return rows.map(toAppointmentListItem);
  };

  return {
    findClientById,
    findLeadById,
    create,
    list,
    getById,
    update,
    markDone,
    markNoShow,
    cancel,
    linkSale,
    remove,
    findConflicts,
  };
};
