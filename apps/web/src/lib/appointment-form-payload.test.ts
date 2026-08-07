import { describe, expect, it } from "vitest";
import {
  type AppointmentFormPayloadValues,
  type AppointmentFormPersonValues,
  buildAppointmentFormPayload,
} from "./appointment-form-payload";

const CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const OTHER_CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e70";
const LEAD_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e60";

const NONE_PERSON: AppointmentFormPersonValues = {
  clientId: null,
  leadId: null,
};

const baseValues: AppointmentFormPayloadValues = {
  kind: "demo",
  dateIso: "2026-08-05",
  timeHm: "20:00",
  durationMinutes: 60,
  clientId: null,
  leadId: null,
  title: undefined,
  location: undefined,
  notes: undefined,
};

describe("buildAppointmentFormPayload — mode create", () => {
  it("envia clientId/leadId sempre explícitos, refletindo o estado atual do seletor", () => {
    const payload = buildAppointmentFormPayload(
      "create",
      { ...baseValues, clientId: CLIENT_ID, leadId: null },
      NONE_PERSON,
    );

    expect(payload).toMatchObject({ clientId: CLIENT_ID, leadId: null });
    expect("clientId" in payload).toBe(true);
    expect("leadId" in payload).toBe(true);
  });

  it("mantém title/location/notes como undefined (omitidos do corpo) quando vazios", () => {
    const payload = buildAppointmentFormPayload(
      "create",
      baseValues,
      NONE_PERSON,
    );

    expect(payload.title).toBeUndefined();
    expect(payload.location).toBeUndefined();
    expect(payload.notes).toBeUndefined();
  });

  it("compõe startsAt via appLocalDateTimeToUtc (fuso da aplicação, RF-16)", () => {
    const payload = buildAppointmentFormPayload(
      "create",
      baseValues,
      NONE_PERSON,
    );

    expect(payload.startsAt).toBe("2026-08-05T23:00:00.000Z");
  });
});

describe("buildAppointmentFormPayload — mode edit (achado CRÍTICO da revisão)", () => {
  it("compromisso com AS DUAS FKs preenchidas (pós-conversão de lead, RF-12) e nenhuma mudança de pessoa ⇒ payload SEM clientId/leadId", () => {
    const initialPerson: AppointmentFormPersonValues = {
      clientId: CLIENT_ID,
      leadId: LEAD_ID,
    };
    const values: AppointmentFormPayloadValues = {
      ...baseValues,
      clientId: CLIENT_ID,
      leadId: LEAD_ID,
    };

    const payload = buildAppointmentFormPayload("edit", values, initialPerson);

    expect("clientId" in payload).toBe(false);
    expect("leadId" in payload).toBe(false);
  });

  it("troca de cliente (lead permanece como estava) ⇒ envia só clientId", () => {
    const initialPerson: AppointmentFormPersonValues = {
      clientId: CLIENT_ID,
      leadId: null,
    };
    const values: AppointmentFormPayloadValues = {
      ...baseValues,
      clientId: OTHER_CLIENT_ID,
      leadId: null,
    };

    const payload = buildAppointmentFormPayload("edit", values, initialPerson);

    expect(payload).toMatchObject({ clientId: OTHER_CLIENT_ID });
    expect("leadId" in payload).toBe(false);
  });

  it("ALERTA #1 da rodada 3: desvínculo explícito (Remover pessoa) com estado inicial só de clientId ⇒ envia clientId: null E leadId: null, mesmo com leadId já null", () => {
    // `initialPerson.leadId === null` cobre DOIS estados reais: (a) o
    // compromisso nunca teve lead — remover a cliente é um no-op inofensivo
    // em `leadId`; (b) compromisso PÓS-CONVERSÃO (RF-12, `client_id` E
    // `lead_id` reais no banco), cujos `defaultValues` são PROJETADOS
    // (cliente > lead, RF-02) — aqui `leadId: null` é só a pessoa perdedora
    // da projeção, não o valor real no banco. A função não recebe informação
    // suficiente para distinguir (a) de (b), então o desvínculo total precisa
    // tratar os dois iguais: antes da correção, o diff via `leadId` "sem
    // mudança" (`null === null`) e o omitia do payload — no caso (b) o
    // `lead_id` real sobrevivia no banco e voltava a aparecer como a pessoa
    // do compromisso.
    const initialPerson: AppointmentFormPersonValues = {
      clientId: CLIENT_ID,
      leadId: null,
    };
    const values: AppointmentFormPayloadValues = {
      ...baseValues,
      clientId: null,
      leadId: null,
    };

    const payload = buildAppointmentFormPayload("edit", values, initialPerson);

    expect(payload).toMatchObject({ clientId: null, leadId: null });
    expect("clientId" in payload).toBe(true);
    expect("leadId" in payload).toBe(true);
  });

  it("nenhuma pessoa no estado inicial + nenhuma pessoa no submit ⇒ payload sem clientId/leadId (não é desvínculo, não há nada a desvincular)", () => {
    const payload = buildAppointmentFormPayload(
      "edit",
      baseValues,
      NONE_PERSON,
    );

    expect("clientId" in payload).toBe(false);
    expect("leadId" in payload).toBe(false);
  });

  it("desvínculo explícito do lead (troca só o lead, mantém a mesma cliente) ⇒ envia leadId: null e omite clientId", () => {
    const initialPerson: AppointmentFormPersonValues = {
      clientId: CLIENT_ID,
      leadId: LEAD_ID,
    };
    const values: AppointmentFormPayloadValues = {
      ...baseValues,
      clientId: CLIENT_ID,
      leadId: null,
    };

    const payload = buildAppointmentFormPayload("edit", values, initialPerson);

    expect("clientId" in payload).toBe(false);
    expect(payload).toMatchObject({ leadId: null });
  });

  it("normaliza title/location/notes vazios para null explícito (limpa o campo)", () => {
    const payload = buildAppointmentFormPayload(
      "edit",
      baseValues,
      NONE_PERSON,
    );

    expect(payload.title).toBeNull();
    expect(payload.location).toBeNull();
    expect(payload.notes).toBeNull();
  });

  it("preserva title/location/notes informados", () => {
    const values: AppointmentFormPayloadValues = {
      ...baseValues,
      title: "Follow-up especial",
      location: "Estúdio",
      notes: "Cliente pediu reagendar se chover",
    };

    const payload = buildAppointmentFormPayload("edit", values, NONE_PERSON);

    expect(payload.title).toBe("Follow-up especial");
    expect(payload.location).toBe("Estúdio");
    expect(payload.notes).toBe("Cliente pediu reagendar se chover");
  });
});
