import { describe, expect, it } from "vitest";
import { resolveConvertibleLead } from "./appointment-lead-conversion";

const LEAD_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";

describe("resolveConvertibleLead", () => {
  it("compromisso vinculado a CLIENTE nunca oferece conversão, mesmo com leadId presente (RF-12 pós-conversão)", () => {
    const result = resolveConvertibleLead(
      { clientId: CLIENT_ID, leadId: LEAD_ID },
      "new",
    );

    expect(result).toBeNull();
  });

  it("compromisso SEM pessoa vinculada não oferece conversão", () => {
    const result = resolveConvertibleLead(
      { clientId: null, leadId: null },
      null,
    );

    expect(result).toBeNull();
  });

  it("lead já CONVERTIDO não oferece conversão", () => {
    const result = resolveConvertibleLead(
      { clientId: null, leadId: LEAD_ID },
      "converted",
    );

    expect(result).toBeNull();
  });

  it("lead DESCARTADO não oferece conversão", () => {
    const result = resolveConvertibleLead(
      { clientId: null, leadId: LEAD_ID },
      "discarded",
    );

    expect(result).toBeNull();
  });

  it("lead NOVO oferece conversão e devolve o leadId", () => {
    const result = resolveConvertibleLead(
      { clientId: null, leadId: LEAD_ID },
      "new",
    );

    expect(result).toBe(LEAD_ID);
  });

  it("lead CONTATADO oferece conversão e devolve o leadId", () => {
    const result = resolveConvertibleLead(
      { clientId: null, leadId: LEAD_ID },
      "contacted",
    );

    expect(result).toBe(LEAD_ID);
  });

  it("falha ao buscar o status do lead (fail-closed) não oferece conversão", () => {
    const result = resolveConvertibleLead(
      { clientId: null, leadId: LEAD_ID },
      null,
    );

    expect(result).toBeNull();
  });
});
