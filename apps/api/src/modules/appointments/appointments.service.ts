import type {
  Appointment,
  AppointmentConflictsQuery,
  AppointmentConflictsResponse,
  AppointmentKind,
  AppointmentListItem,
  AppointmentStatus,
  AppointmentsListQuery,
  CompleteAppointment,
  CreateAppointment,
  LinkAppointmentSale,
  Paginated,
  UpdateAppointment,
} from "@clientela/shared";
import { appLocalDateIso, appLocalDayRangeUtc } from "@clientela/shared";
import {
  AppointmentNotFoundError,
  InvalidAppointmentPersonError,
} from "./appointments.errors";

// ---------------------------------------------------------------------------
// Portas e tipos de dados entre service e repository (api.md: o service não
// conhece Drizzle nem o schema). O recorte de `range` é resolvido AQUI, em
// TypeScript, com `appLocalDayRangeUtc` — o repository só recebe bounds
// prontos e compara `starts_at` contra eles (nunca `AT TIME ZONE`/
// `CURRENT_DATE` no SQL, ADR-0018/plan.md).
// ---------------------------------------------------------------------------

// Referência mínima de pessoa para validar o vínculo (RF-03): só o id
// importa — sem snapshot de nome (derivado por join na leitura).
export type AppointmentPersonRef = {
  id: string;
};

// Bounds do recorte de `range` (RF-05), já resolvidos no fuso `APP_TIME_ZONE`
// pelo service. O repository só compara `starts_at` contra os instantes
// prontos — comparação sargável, sem função sobre a coluna.
export type AppointmentsRangeBounds =
  | { range: "upcoming"; startUtc: string }
  | { range: "pending"; startUtc: string }
  | { range: "history" }
  | { range: "day"; startUtc: string; endUtc: string }
  | { range: "all" };

export type ListAppointmentsParams = {
  page: number;
  perPage: number;
  bounds: AppointmentsRangeBounds;
  status?: AppointmentStatus;
  kind?: AppointmentKind;
  clientId?: string;
  leadId?: string;
};

export type FindConflictsParams = {
  startsAt: string;
  durationMinutes: number;
  excludeId?: string;
};

// Porta do repositório de compromissos. TODA operação recebe `consultantId`
// para escopar por consultora. As guardas de transição/vínculo de venda e a
// invariante "encontro não realizado não tem venda" (RF-08) vivem DENTRO das
// transações do repository; o service compõe/traduz e delega.
export type AppointmentsRepositoryPort = {
  // Carrega a cliente/lead (escopados) para o service validar o vínculo de
  // pessoa (RF-03) ANTES de persistir — leads não têm `consultant_id`
  // (drift documentado), então a checagem é só de existência.
  findClientById: (
    consultantId: string,
    clientId: string,
  ) => Promise<AppointmentPersonRef | undefined>;
  findLeadById: (leadId: string) => Promise<AppointmentPersonRef | undefined>;
  create: (
    consultantId: string,
    input: CreateAppointment,
  ) => Promise<Appointment>;
  list: (
    consultantId: string,
    params: ListAppointmentsParams,
  ) => Promise<{ rows: AppointmentListItem[]; total: number }>;
  getById: (
    consultantId: string,
    id: string,
  ) => Promise<Appointment | undefined>;
  update: (
    consultantId: string,
    id: string,
    input: UpdateAppointment,
  ) => Promise<Appointment>;
  markDone: (
    consultantId: string,
    id: string,
    saleId?: string,
  ) => Promise<Appointment>;
  markNoShow: (consultantId: string, id: string) => Promise<Appointment>;
  cancel: (consultantId: string, id: string) => Promise<Appointment>;
  linkSale: (
    consultantId: string,
    id: string,
    saleId: string | null,
  ) => Promise<Appointment>;
  remove: (consultantId: string, id: string) => Promise<void>;
  findConflicts: (
    consultantId: string,
    params: FindConflictsParams,
  ) => Promise<AppointmentListItem[]>;
};

export type AppointmentsServiceDeps = {
  repository: AppointmentsRepositoryPort;
  // Clock injetado (testing.md/lessons): nunca `new Date()` direto no service
  // — os recortes de `range` dependem do "hoje" local, que precisa ser
  // determinístico em teste.
  clock: () => Date;
};

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;

export const createAppointmentsService = ({
  repository,
  clock,
}: AppointmentsServiceDeps) => {
  // Validação de pessoa (RF-03): clientId deve existir E pertencer à
  // consultora; leadId deve existir (leads não têm consultant_id). Mesma
  // mensagem para "inexistente" e "de outra consultora" — não revela
  // existência. `!= null` ignora tanto ausência (undefined) quanto
  // desvínculo explícito (null): nesses casos não há o que validar.
  const assertPerson = async (
    consultantId: string,
    clientId: string | null | undefined,
    leadId: string | null | undefined,
  ): Promise<void> => {
    if (clientId != null) {
      const client = await repository.findClientById(consultantId, clientId);
      if (!client) {
        throw new InvalidAppointmentPersonError();
      }
    }
    if (leadId != null) {
      const lead = await repository.findLeadById(leadId);
      if (!lead) {
        throw new InvalidAppointmentPersonError();
      }
    }
  };

  const create = async (
    consultantId: string,
    input: CreateAppointment,
  ): Promise<Appointment> => {
    await assertPerson(consultantId, input.clientId, input.leadId);
    return repository.create(consultantId, input);
  };

  // Resolve `range`/`date` em bounds `[startUtc, endUtc)` no fuso da app
  // (RF-05/RF-15/ADR-0018). Única fonte da regra — nunca reimplementada no
  // repository. `today` deriva do clock injetado, nunca de `new Date()`
  // direto.
  const resolveBounds = (
    query: AppointmentsListQuery,
  ): AppointmentsRangeBounds => {
    if (query.range === "history") {
      return { range: "history" };
    }
    if (query.range === "all") {
      return { range: "all" };
    }
    if (query.range === "day") {
      // Garantido pelo refine do schema (date obrigatório quando range=day) —
      // checagem aqui é narrowing de tipo, não `as` (core.md): a validação
      // real já aconteceu na fronteira Zod.
      if (query.date === undefined) {
        throw new Error(
          "Parâmetro 'date' ausente para range=day (violação de contrato já validado pelo Zod)",
        );
      }
      const { startUtc, endUtc } = appLocalDayRangeUtc(query.date);
      return { range: "day", startUtc, endUtc };
    }

    const today = appLocalDateIso(clock().toISOString());
    const { startUtc } = appLocalDayRangeUtc(today);
    return { range: query.range, startUtc };
  };

  const list = async (
    consultantId: string,
    query: AppointmentsListQuery,
  ): Promise<Paginated<AppointmentListItem>> => {
    const bounds = resolveBounds(query);
    const { rows, total } = await repository.list(consultantId, {
      page: query.page,
      perPage: query.perPage,
      bounds,
      status: query.status,
      kind: query.kind,
      clientId: query.clientId,
      leadId: query.leadId,
    });

    return {
      data: rows,
      page: query.page,
      perPage: query.perPage,
      total,
    };
  };

  const getById = async (
    consultantId: string,
    id: string,
  ): Promise<Appointment> => {
    const appointment = await repository.getById(consultantId, id);
    if (!appointment) {
      throw new AppointmentNotFoundError();
    }
    return appointment;
  };

  const update = async (
    consultantId: string,
    id: string,
    input: UpdateAppointment,
  ): Promise<Appointment> => {
    await assertPerson(consultantId, input.clientId, input.leadId);
    return repository.update(consultantId, id, input);
  };

  const markDone = (
    consultantId: string,
    id: string,
    input: CompleteAppointment,
  ): Promise<Appointment> =>
    repository.markDone(consultantId, id, input.saleId);

  const markNoShow = (consultantId: string, id: string): Promise<Appointment> =>
    repository.markNoShow(consultantId, id);

  const cancel = (consultantId: string, id: string): Promise<Appointment> =>
    repository.cancel(consultantId, id);

  const linkSale = (
    consultantId: string,
    id: string,
    input: LinkAppointmentSale,
  ): Promise<Appointment> =>
    repository.linkSale(consultantId, id, input.saleId);

  const remove = (consultantId: string, id: string): Promise<void> =>
    repository.remove(consultantId, id);

  const findConflicts = async (
    consultantId: string,
    query: AppointmentConflictsQuery,
  ): Promise<AppointmentConflictsResponse> => {
    const data = await repository.findConflicts(consultantId, {
      startsAt: query.startsAt,
      durationMinutes: query.durationMinutes,
      excludeId: query.excludeId,
    });
    return { data };
  };

  return {
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
