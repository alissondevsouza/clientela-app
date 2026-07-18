import type { LeadCaptureRequestInput } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { type FetchImpl, submitLead } from "./submit-lead";

const API_URL = "http://localhost:3001";

const validValues: LeadCaptureRequestInput = {
  name: "Maria Silva",
  whatsapp: "11912345678",
  interest: "Cuidados com a pele",
  consent: true,
  website: "",
};

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

// Fetch fake que registra a chamada e delega a resposta a um responder
// (testing.md: fake explícito injetado, sem vi.mock). O responder pode lançar
// para simular queda de rede.
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

describe("submitLead", () => {
  it("retorna ok em resposta 201", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 201 }),
    );

    const result = await submitLead(validValues, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({ ok: true });
  });

  it("repassa a mensagem do envelope em 422", async () => {
    const envelope = {
      error: { code: "VALIDATION", message: "Dados inválidos: nome" },
    };
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify(envelope), { status: 422 }),
    );

    const result = await submitLead(validValues, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({ ok: false, message: "Dados inválidos: nome" });
  });

  it("repassa a mensagem do rate limit em 429", async () => {
    const envelope = {
      error: {
        code: "RATE_LIMITED",
        message: "Muitas solicitações em pouco tempo.",
      },
    };
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify(envelope), { status: 429 }),
    );

    const result = await submitLead(validValues, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result).toEqual({
      ok: false,
      message: "Muitas solicitações em pouco tempo.",
    });
  });

  it("retorna mensagem genérica quando a rede falha", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new Error("network down");
    });

    const result = await submitLead(validValues, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando a resposta de erro não é JSON", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response("<html>500</html>", { status: 500 }),
    );

    const result = await submitLead(validValues, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("esperado falha");
    }
    expect(result.message).toMatch(/conexão/i);
  });

  it("retorna mensagem genérica quando o erro tem shape inesperado", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(JSON.stringify({ oops: true }), { status: 500 }),
    );

    const result = await submitLead(validValues, {
      fetchImpl,
      apiUrl: API_URL,
    });

    expect(result.ok).toBe(false);
  });

  it("envia x-forwarded-for quando clientIp é fornecido", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 201 }),
    );

    await submitLead(validValues, {
      fetchImpl,
      apiUrl: API_URL,
      clientIp: "5.6.7.8",
    });

    expect(calls).toHaveLength(1);
    expect(headerValue(calls[0]?.init, "x-forwarded-for")).toBe("5.6.7.8");
    expect(calls[0]?.url).toBe("http://localhost:3001/leads");
  });

  it("omite x-forwarded-for quando clientIp está ausente", async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify({ id: "x" }), { status: 201 }),
    );

    await submitLead(validValues, { fetchImpl, apiUrl: API_URL });

    expect(headerValue(calls[0]?.init, "x-forwarded-for")).toBeNull();
  });
});
