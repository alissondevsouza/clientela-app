import type {
  Client,
  CreateClientInput,
  UpdateClientInput,
} from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  type ClientsApiDeps,
  createClient,
  deleteClient,
  getClient,
  listClients,
  updateClient,
} from "./clients-api";
import type { FetchImpl } from "./submit-lead";

const API_URL = "http://localhost:3001";
const TOKEN = "session-token-abc";
const CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";

const sampleClient: Client = {
  id: CLIENT_ID,
  name: "Maria Silva",
  whatsapp: "11912345678",
  birthday: "1990-05-10",
  skinTone: "média",
  notes: null,
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

const depsWith = (fetchImpl: FetchImpl): ClientsApiDeps => ({
  fetchImpl,
  apiUrl: API_URL,
  token: TOKEN,
});

const errorEnvelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message } });

describe("listClients", () => {
  it("faz GET /clients com Bearer e monta a query com page/perPage/search URL-encoded", async () => {
    const body = JSON.stringify({
      data: [sampleClient],
      page: 2,
      perPage: 10,
      total: 1,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    const result = await listClients(
      { page: 2, perPage: 10, search: "maria silva" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({
      ok: true,
      data: [sampleClient],
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
      "http://localhost:3001/clients?page=2&perPage=10&search=maria+silva",
    );
  });

  it("omite parâmetros ausentes e a query quando não há nenhum", async () => {
    const body = JSON.stringify({
      data: [],
      page: 1,
      perPage: 20,
      total: 0,
    });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listClients({}, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/clients");
  });

  it("omite search vazio da query", async () => {
    const body = JSON.stringify({ data: [], page: 1, perPage: 20, total: 0 });
    const { fetchImpl, calls } = stubFetch(
      () => new Response(body, { status: 200 }),
    );

    await listClients({ page: 1, search: "" }, depsWith(fetchImpl));

    expect(calls[0]?.url).toBe("http://localhost:3001/clients?page=1");
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "Busca muito longa"), {
          status: 422,
        }),
    );

    const result = await listClients({}, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "Busca muito longa" });
  });

  it("retorna ok:false quando o 200 tem corpo malformado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    );

    const result = await listClients({}, depsWith(fetchImpl));

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

    const result = await listClients({}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});

describe("getClient", () => {
  it("faz GET /clients/:id com Bearer e retorna a cliente", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleClient), { status: 200 }),
    );

    const result = await getClient(CLIENT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, client: sampleClient });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/clients/${CLIENT_ID}`);
  });

  it("marca notFound em 404", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("CLIENT_NOT_FOUND", "não encontrada"), {
          status: 404,
        }),
    );

    const result = await getClient(CLIENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.notFound).toBe(true);
    expect(result.message).toMatch(/não encontrada/i);
  });

  it("retorna ok:false sem notFound para outros status de erro", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("SERVER_ERROR", "falhou"), { status: 500 }),
    );

    const result = await getClient(CLIENT_ID, depsWith(fetchImpl));

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

    const result = await getClient(CLIENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
  });
});

describe("createClient", () => {
  const validValues: CreateClientInput = {
    name: "Ana Souza",
    whatsapp: "11987654321",
  };

  it("faz POST /clients com Bearer, JSON e corpo validado; retorna 201", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleClient), { status: 201 }),
    );

    const result = await createClient(validValues, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true, client: sampleClient });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(headerValue(calls[0]?.init, "content-type")).toBe(
      "application/json",
    );
    expect(calls[0]?.url).toBe("http://localhost:3001/clients");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "Ana Souza",
      whatsapp: "11987654321",
    });
  });

  it("não envia requisição quando o input é inválido", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleClient), { status: 201 }),
    );

    const result = await createClient(
      { name: "A", whatsapp: "11987654321" },
      depsWith(fetchImpl),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("VALIDATION", "WhatsApp inválido"), {
          status: 422,
        }),
    );

    const result = await createClient(validValues, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "WhatsApp inválido" });
  });
});

describe("updateClient", () => {
  const validValues: UpdateClientInput = { notes: null };

  it("faz PATCH /clients/:id com Bearer e corpo parcial validado; retorna 200", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleClient), { status: 200 }),
    );

    const result = await updateClient(
      CLIENT_ID,
      validValues,
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: true, client: sampleClient });
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/clients/${CLIENT_ID}`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ notes: null });
  });

  it("não envia requisição quando o body está vazio (nenhum campo)", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify(sampleClient), { status: 200 }),
    );

    const result = await updateClient(CLIENT_ID, {}, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("CLIENT_NOT_FOUND", "não encontrada"), {
          status: 404,
        }),
    );

    const result = await updateClient(
      CLIENT_ID,
      { name: "Nova" },
      depsWith(fetchImpl),
    );

    expect(result).toEqual({ ok: false, message: "não encontrada" });
  });
});

describe("deleteClient", () => {
  it("faz DELETE /clients/:id com Bearer; 204 retorna ok", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(null, { status: 204 }),
    );

    const result = await deleteClient(CLIENT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.init?.method).toBe("DELETE");
    expect(headerValue(calls[0]?.init, "authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(calls[0]?.url).toBe(`http://localhost:3001/clients/${CLIENT_ID}`);
  });

  it("mapeia erro da API para mensagem pt-BR do envelope", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(errorEnvelope("CLIENT_NOT_FOUND", "não encontrada"), {
          status: 404,
        }),
    );

    const result = await deleteClient(CLIENT_ID, depsWith(fetchImpl));

    expect(result).toEqual({ ok: false, message: "não encontrada" });
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await deleteClient(CLIENT_ID, depsWith(fetchImpl));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });
});
