import type { Client, CrmLead } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  convertLead,
  LEAD_STATUS_LABELS,
  type LeadsApiDeps,
  listLeads,
  updateLeadStatus,
} from "./leads-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";
const LEAD_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e60";

const sampleLead: CrmLead = {
  id: LEAD_ID,
  name: "Maria Silva",
  whatsapp: "11912345678",
  interest: "Base e batom",
  source: "landing",
  status: "new",
  clientId: null,
  createdAt: "2026-07-17T12:00:00.000Z",
};

const sampleClient: Client = {
  id: CLIENT_ID,
  name: "Maria Silva",
  whatsapp: "11912345678",
  birthday: null,
  skinTone: null,
  notes: "Interesse (lead): Base e batom",
  createdAt: "2026-07-17T12:00:00.000Z",
  updatedAt: "2026-07-17T12:00:00.000Z",
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

const depsWith = (fetchImpl: FetchImpl): LeadsApiDeps => ({
  fetchImpl,
  apiUrl: API_URL,
  token: TOKEN,
});

const errorEnvelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message } });

describe("listLeads", () => {
  it("faz GET /leads com Bearer e monta a query com page/status", async () => {
    const body = JSON.stringify({
      data: [sampleLead],
      page: 2,
      perPage: 20,
      total: 1,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await listLeads(
      { page: 2, status: "contacted" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: true,
      data: [sampleLead],
      page: 2,
      perPage: 20,
      total: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      "http://localhost:3001/leads?page=2&status=contacted",
    );
  });

  it("omite parâmetros ausentes e a query quando não há nenhum", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listLeads({}, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/leads");
  });

  it("envia apenas o status quando só ele é informado", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listLeads({ status: "new" }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/leads?status=new");
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Status de lead inválido"), {
          status: 422,
        }),
    );

    const result = await listLeads({}, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Status de lead inválido" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await listLeads({}, depsWith(fetchImpl));

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

    const result = await listLeads({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("updateLeadStatus", () => {
  it("faz PATCH /leads/:id/status com Bearer, JSON e corpo { status }; retorna 200", async () => {
    const updated: CrmLead = { ...sampleLead, status: "contacted" };
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(updated), { status: 200 }),
    );

    const result = await updateLeadStatus(
      LEAD_ID,
      "contacted",
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, lead: updated });
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/leads/${LEAD_ID}/status`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      status: "contacted",
    });
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("LEAD_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await updateLeadStatus(
      LEAD_ID,
      "discarded",
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
  });

  it("marca conflict com a mensagem da API em 409", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope("LEAD_ALREADY_CONVERTED", "Lead já convertido"),
          { status: 409 },
        ),
    );

    const result = await updateLeadStatus(
      LEAD_ID,
      "contacted",
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.message).toBe("Lead já convertido");
  });

  it("retorna erro genérico para outros status sem notFound nem conflict", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), { status: 500 }),
    );

    const result = await updateLeadStatus(
      LEAD_ID,
      "contacted",
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(false);
    expect(result.conflict).toBe(false);
    expect(result.message).toBe("falhou");
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );

    const result = await updateLeadStatus(
      LEAD_ID,
      "contacted",
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
  });
});

describe("convertLead", () => {
  it("faz POST /leads/:id/convert com Bearer e retorna a cliente (201)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleClient), { status: 201 }),
    );

    const result = await convertLead(LEAD_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, client: sampleClient });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(
      `http://localhost:3001/leads/${LEAD_ID}/convert`,
    );
  });

  it("aceita 200 e retorna a cliente", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify(sampleClient), { status: 200 }),
    );

    const result = await convertLead(LEAD_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, client: sampleClient });
  });

  it("marca conflict com a mensagem da API em 409", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(
          errorEnvelope("LEAD_ALREADY_CONVERTED", "Lead já convertido"),
          { status: 409 },
        ),
    );

    const result = await convertLead(LEAD_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.conflict).toBe(true);
    expect(result.notFound).toBe(false);
    expect(result.message).toBe("Lead já convertido");
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("LEAD_NOT_FOUND", "não encontrado"), {
          status: 404,
        }),
    );

    const result = await convertLead(LEAD_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.conflict).toBe(false);
  });

  it("retorna ok:false quando o corpo de sucesso é malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 201 }),
    );

    const result = await convertLead(LEAD_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await convertLead(LEAD_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("LEAD_STATUS_LABELS", () => {
  it("cobre os quatro status do funil em pt-BR", () => {
    expect(LEAD_STATUS_LABELS).toEqual({
      new: "Novo",
      contacted: "Contatado",
      converted: "Convertido",
      discarded: "Descartado",
    });
  });
});
