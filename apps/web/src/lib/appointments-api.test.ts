import type {
  Appointment,
  AppointmentListItem,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  type AppointmentsApiDeps,
  createAppointment,
  deleteAppointment,
  getAppointment,
  getAppointmentConflicts,
  linkAppointmentSale,
  listAppointments,
  transitionAppointment,
  updateAppointment,
} from "./appointments-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";
const APPOINTMENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const CLIENT_ID = "018f9c2e-6666-7b3d-9e21-0a1b2c3d4e5f";
const LEAD_ID = "018f9c2e-7777-7b3d-9e21-0a1b2c3d4e5f";
const SALE_ID = "018f9c2e-8888-7b3d-9e21-0a1b2c3d4e5f";

const sampleAppointment: Appointment = {
  id: APPOINTMENT_ID,
  clientId: CLIENT_ID,
  clientName: "Maria Souza",
  clientWhatsapp: "+5511999999999",
  leadId: null,
  leadName: null,
  leadWhatsapp: null,
  saleId: null,
  saleTotalCents: null,
  kind: "demo",
  title: "Sessão demonstrativa",
  startsAt: "2026-08-10T14:00:00.000Z",
  durationMinutes: 60,
  status: "scheduled",
  location: "Casa da cliente",
  notes: null,
  createdAt: "2026-08-05T12:00:00.000Z",
  updatedAt: "2026-08-05T12:00:00.000Z",
};

const sampleListItem: AppointmentListItem = {
  id: APPOINTMENT_ID,
  clientId: CLIENT_ID,
  clientName: "Maria Souza",
  leadId: null,
  leadName: null,
  saleId: null,
  saleTotalCents: null,
  kind: "demo",
  title: "Sessão demonstrativa",
  startsAt: "2026-08-10T14:00:00.000Z",
  durationMinutes: 60,
  status: "scheduled",
  location: "Casa da cliente",
  createdAt: "2026-08-05T12:00:00.000Z",
  updatedAt: "2026-08-05T12:00:00.000Z",
};

const validCreateValues: CreateAppointmentInput = {
  clientId: CLIENT_ID,
  kind: "demo",
  startsAt: "2026-08-10T14:00:00.000Z",
  durationMinutes: 60,
};

const validUpdateValues: UpdateAppointmentInput = {
  title: "Sessão remarcada",
  location: "Estúdio",
};

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

// Fetch fake que registra a chamada e delega a resposta a um responder
// (testing.md: fake explícito injetado, sem vi.mock).
const stubFetch = (
  responder: () => Response,
): { fetchImpl: FetchImpl; calls: FetchCall[] } => {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchImpl = async (input, init) => {
    calls.push({ url: String(input), init });
    return responder();
  };
  return { fetchImpl, calls };
};

const headerValue = (
  init: RequestInit | undefined,
  key: string,
): string | null => {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    return null;
  }
  return headers[key] ?? null;
};

const depsWith = (fetchImpl: FetchImpl): AppointmentsApiDeps => ({
  fetchImpl,
  apiUrl: API_URL,
  token: TOKEN,
});

const errorEnvelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message } });

describe("listAppointments", () => {
  it("faz GET /appointments com Bearer e monta a query com page/perPage/range/status/kind/clientId/leadId", async () => {
    const body = JSON.stringify({
      data: [sampleListItem],
      page: 2,
      perPage: 10,
      total: 1,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await listAppointments(
      {
        page: 2,
        perPage: 10,
        range: "upcoming",
        status: "scheduled",
        kind: "demo",
        clientId: CLIENT_ID,
        leadId: LEAD_ID,
      },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: true,
      data: [sampleListItem],
      page: 2,
      perPage: 10,
      total: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments?page=2&perPage=10&range=upcoming&status=scheduled&kind=demo&clientId=${CLIENT_ID}&leadId=${LEAD_ID}`,
    );
  });

  it("monta a query com range=day e date", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listAppointments(
      { range: "day", date: "2026-08-05" },
      depsWith(fetchImpl),
    );

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/appointments?range=day&date=2026-08-05",
    );
  });

  it("omite todos os filtros ausentes", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listAppointments({}, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/appointments");
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Filtro inválido"), {
          status: 422,
        }),
    );

    const result = await listAppointments({}, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Filtro inválido" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await listAppointments({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await listAppointments({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getAppointment", () => {
  it("faz GET /appointments/:id com Bearer e retorna o detalhe", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleAppointment), { status: 200 }),
    );

    const result = await getAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, appointment: sampleAppointment });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${APPOINTMENT_ID}`,
    );
  });

  it("faz encodeURIComponent do id na URL", async () => {
    const dirtyId = "abc/../def id";
    const { fetchImpl, calls } = stubFetch(
      () =>
        new Response(errorEnvelope("APPOINTMENT_NOT_FOUND", "x"), {
          status: 404,
        }),
    );

    await getAppointment(dirtyId, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${encodeURIComponent(dirtyId)}`,
    );
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("APPOINTMENT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await getAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.message).toMatch(/não encontrado/i);
  });

  it("retorna ok:false sem notFound para outros status de erro", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), { status: 500 }),
    );

    const result = await getAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(false);
    expect(result.message).toBe("falhou");
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await getAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await getAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(false);
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("createAppointment", () => {
  it("faz POST /appointments com Bearer, JSON e corpo validado; retorna 201", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleAppointment), { status: 201 }),
    );

    const result = await createAppointment(
      validCreateValues,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, appointment: sampleAppointment });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/appointments");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      clientId: CLIENT_ID,
      kind: "demo",
      startsAt: "2026-08-10T14:00:00.000Z",
      durationMinutes: 60,
    });
  });

  it("não envia requisição quando o input é inválido (cliente e lead juntos)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleAppointment), { status: 201 }),
    );

    const result = await createAppointment(
      { ...validCreateValues, leadId: LEAD_ID },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("mapeia erro da API para mensagem pt-BR do envelope (422, pessoa inválida)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "INVALID_APPOINTMENT_PERSON",
            "Cliente ou lead inválido para este compromisso.",
          ),
          { status: 422 },
        ),
    );

    const result = await createAppointment(
      validCreateValues,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: false,
      message: "Cliente ou lead inválido para este compromisso.",
    });
  });

  it("retorna ok:false quando o 201 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 201 }),
    );

    const result = await createAppointment(
      validCreateValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await createAppointment(
      validCreateValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("updateAppointment", () => {
  it("faz PUT /appointments/:id com Bearer, JSON e corpo validado; retorna 200", async () => {
    const updated: Appointment = { ...sampleAppointment, ...validUpdateValues };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(updated), { status: 200 }),
    );

    const result = await updateAppointment(
      APPOINTMENT_ID,
      validUpdateValues,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, appointment: updated });
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${APPOINTMENT_ID}`,
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(validUpdateValues);
  });

  it("não envia requisição quando o input é inválido (corpo vazio)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleAppointment), { status: 200 }),
    );

    const result = await updateAppointment(
      APPOINTMENT_ID,
      {},
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.invalid).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("APPOINTMENT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await updateAppointment(
      APPOINTMENT_ID,
      validUpdateValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
    expect(result.invalid).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409 (campo além de notes em status terminal)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "APPOINTMENT_STATE",
            "Só é possível alterar observações de um compromisso concluído",
          ),
          { status: 409 },
        ),
    );

    const result = await updateAppointment(
      APPOINTMENT_ID,
      validUpdateValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.invalid).toBe(false);
    expect(result.message).toMatch(/observações/);
  });

  it("marca invalid com a mensagem da API em 422 (venda incompatível)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "INVALID_APPOINTMENT_SALE",
            "Venda inválida para este compromisso.",
          ),
          { status: 422 },
        ),
    );

    const result = await updateAppointment(
      APPOINTMENT_ID,
      { clientId: CLIENT_ID },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.invalid).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.conflict).toBe(false);
    expect(result.message).toBe("Venda inválida para este compromisso.");
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await updateAppointment(
      APPOINTMENT_ID,
      validUpdateValues,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("deleteAppointment", () => {
  it("faz DELETE /appointments/:id com Bearer; 204 retorna ok:true", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(null, { status: 204 }),
    );

    const result = await deleteAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.init?.method).toBe("DELETE");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${APPOINTMENT_ID}`,
    );
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("APPOINTMENT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await deleteAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result).toEqual({
      ok: false,
      notFound: true,
      message: "Compromisso não encontrado.",
    });
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await deleteAppointment(APPOINTMENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(false);
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("transitionAppointment", () => {
  it("done faz POST /appointments/:id/done com Bearer, JSON e corpo { saleId }; 200 retorna o compromisso", async () => {
    const done: Appointment = {
      ...sampleAppointment,
      status: "done",
      saleId: SALE_ID,
      saleTotalCents: 7100,
    };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(done), { status: 200 }),
    );

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "done",
      { saleId: SALE_ID },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, appointment: done });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${APPOINTMENT_ID}/done`,
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      saleId: SALE_ID,
    });
  });

  it("done sem body envia {} e não quebra", async () => {
    const done: Appointment = { ...sampleAppointment, status: "done" };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(done), { status: 200 }),
    );

    await transitionAppointment(
      APPOINTMENT_ID,
      "done",
      undefined,
      depsWith(fetchImpl),
    );

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({});
  });

  it("no-show faz POST /appointments/:id/no-show sem corpo JSON", async () => {
    const noShow: Appointment = { ...sampleAppointment, status: "no_show" };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(noShow), { status: 200 }),
    );

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "no-show",
      undefined,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, appointment: noShow });
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${APPOINTMENT_ID}/no-show`,
    );
    expect(calls[0]?.init?.body).toBeUndefined();
  });

  it("cancel faz POST /appointments/:id/cancel sem corpo JSON", async () => {
    const canceled: Appointment = { ...sampleAppointment, status: "canceled" };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(canceled), { status: 200 }),
    );

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "cancel",
      undefined,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, appointment: canceled });
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${APPOINTMENT_ID}/cancel`,
    );
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("APPOINTMENT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "cancel",
      undefined,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
    expect(result.invalid).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409 (transição de status terminal)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "APPOINTMENT_STATE",
            "Só é possível concluir um compromisso agendado",
          ),
          { status: 409 },
        ),
    );

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "done",
      undefined,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.invalid).toBe(false);
    expect(result.message).toMatch(/agendado/);
  });

  it("marca invalid com a mensagem da API em 422 (saleId inválido em done)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "INVALID_APPOINTMENT_SALE",
            "Venda inválida para este compromisso.",
          ),
          { status: 422 },
        ),
    );

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "done",
      { saleId: SALE_ID },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.invalid).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.conflict).toBe(false);
    expect(result.message).toBe("Venda inválida para este compromisso.");
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "cancel",
      undefined,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await transitionAppointment(
      APPOINTMENT_ID,
      "no-show",
      undefined,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("linkAppointmentSale", () => {
  it("faz PUT /appointments/:id/sale com Bearer, JSON e corpo { saleId }; 200 retorna o compromisso", async () => {
    const linked: Appointment = {
      ...sampleAppointment,
      saleId: SALE_ID,
      saleTotalCents: 7100,
    };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(linked), { status: 200 }),
    );

    const result = await linkAppointmentSale(
      APPOINTMENT_ID,
      SALE_ID,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, appointment: linked });
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/${APPOINTMENT_ID}/sale`,
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      saleId: SALE_ID,
    });
  });

  it("saleId null desvincula", async () => {
    const unlinked: Appointment = {
      ...sampleAppointment,
      saleId: null,
      saleTotalCents: null,
    };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(unlinked), { status: 200 }),
    );

    const result = await linkAppointmentSale(
      APPOINTMENT_ID,
      null,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, appointment: unlinked });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      saleId: null,
    });
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("APPOINTMENT_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await linkAppointmentSale(
      APPOINTMENT_ID,
      SALE_ID,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
    expect(result.invalid).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409 (fora de scheduled/done)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "APPOINTMENT_STATE",
            "Não é possível vincular venda a um compromisso cancelado",
          ),
          { status: 409 },
        ),
    );

    const result = await linkAppointmentSale(
      APPOINTMENT_ID,
      SALE_ID,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.invalid).toBe(false);
    expect(result.message).toMatch(/cancelado/);
  });

  it("marca invalid com a mensagem da API em 422 (venda incompatível)", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope(
            "INVALID_APPOINTMENT_SALE",
            "Venda inválida para este compromisso.",
          ),
          { status: 422 },
        ),
    );

    const result = await linkAppointmentSale(
      APPOINTMENT_ID,
      SALE_ID,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.invalid).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.conflict).toBe(false);
    expect(result.message).toBe("Venda inválida para este compromisso.");
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await linkAppointmentSale(
      APPOINTMENT_ID,
      SALE_ID,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await linkAppointmentSale(
      APPOINTMENT_ID,
      SALE_ID,
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getAppointmentConflicts", () => {
  it("faz GET /appointments/conflicts com Bearer e monta a query com startsAt/durationMinutes/excludeId", async () => {
    const body = JSON.stringify({ data: [sampleListItem] });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await getAppointmentConflicts(
      {
        startsAt: "2026-08-10T14:00:00.000Z",
        durationMinutes: 60,
        excludeId: APPOINTMENT_ID,
      },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, data: [sampleListItem] });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/appointments/conflicts?startsAt=2026-08-10T14%3A00%3A00.000Z&durationMinutes=60&excludeId=${APPOINTMENT_ID}`,
    );
  });

  it("omite excludeId quando ausente", async () => {
    const body = JSON.stringify({ data: [] });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await getAppointmentConflicts(
      { startsAt: "2026-08-10T14:00:00.000Z", durationMinutes: 60 },
      depsWith(fetchImpl),
    );

    expect(calls[0]?.url).toBe(
      "http://localhost:3001/appointments/conflicts?startsAt=2026-08-10T14%3A00%3A00.000Z&durationMinutes=60",
    );
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Parâmetros inválidos"), {
          status: 422,
        }),
    );

    const result = await getAppointmentConflicts(
      { startsAt: "2026-08-10T14:00:00.000Z", durationMinutes: 60 },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: false, message: "Parâmetros inválidos" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await getAppointmentConflicts(
      { startsAt: "2026-08-10T14:00:00.000Z", durationMinutes: 60 },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await getAppointmentConflicts(
      { startsAt: "2026-08-10T14:00:00.000Z", durationMinutes: 60 },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});
