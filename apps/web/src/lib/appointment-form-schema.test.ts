import { describe, expect, it } from "vitest";
import { buildAppointmentFormPayload } from "./appointment-form-payload";
import type { AppointmentFormFieldValues } from "./appointment-form-schema";
import {
  appointmentFormSchema,
  EMPTY_APPOINTMENT_FORM_VALUES,
  resolveAppointmentFormPersonDefaults,
} from "./appointment-form-schema";

const CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
const OTHER_CLIENT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e70";
const LEAD_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e60";

// Campos comuns não relacionados a pessoa, reutilizados nos cenários abaixo.
const baseFormFields: Omit<
  AppointmentFormFieldValues,
  "clientId" | "clientName" | "leadId" | "leadName"
> = {
  kind: "demo",
  dateIso: "2026-08-05",
  timeHm: "20:00",
  durationMinutes: "60",
  location: "",
  title: "",
  notes: "",
};

// Este arquivo cobre o pipeline `defaultValues → appointmentFormSchema`
// (resolver do RHF) → `buildAppointmentFormPayload`, com fixtures que
// espelham o que o RSC de detalhe (`[id]/page.tsx`) produz — usando a MESMA
// função de projeção (`resolveAppointmentFormPersonDefaults`), chamada aqui
// diretamente.
//
// O que este arquivo NÃO garante (ALERTA #2 da rodada 3, corrigindo uma
// afirmação falsa que estava aqui antes): que o RSC de detalhe continua, de
// fato, chamando `resolveAppointmentFormPersonDefaults` ao montar o objeto
// passado a `<AppointmentForm defaultValues={...}>`. Nenhum teste deste
// arquivo importa `app/(crm)/crm/appointments/[id]/page.tsx`, e o projeto não
// tem infraestrutura de teste de componente (`spec.md`: "Sem teste de
// componente no web"). Se alguém remover essa chamada do RSC e voltar a
// montar `defaultValues` manualmente com as duas FKs cruas, os testes abaixo
// continuam verdes — isso só é pego por teste de componente/E2E (pendência
// declarada, REL-01/Playwright). A garantia real destes testes é: a FUNÇÃO de
// projeção (`resolveAppointmentFormPersonDefaults`) produz um estado aceito
// pelo schema, e o payload resultante preserva/desvincula as FKs
// corretamente — incluindo o desvínculo explícito pós-conversão (ALERTA #1).
describe("appointmentFormSchema — wiring ponta a ponta com os defaultValues reais do detalhe (RF-07/RF-12/RF-18)", () => {
  it("compromisso pós-conversão de lead (client_id E lead_id REAIS, RF-12): os defaultValues resolvidos são ACEITOS pelo schema e o payload final preserva as duas FKs", () => {
    const appointment = {
      clientId: CLIENT_ID,
      clientName: "Maria Cliente",
      leadId: LEAD_ID,
      leadName: "Maria Lead",
    };

    const personDefaults = resolveAppointmentFormPersonDefaults(appointment);
    // Precedência cliente>lead (RF-02): só a cliente entra nos defaultValues.
    expect(personDefaults).toEqual({
      clientId: CLIENT_ID,
      clientName: "Maria Cliente",
      leadId: null,
      leadName: "",
    });

    const defaultValues: AppointmentFormFieldValues = {
      ...baseFormFields,
      ...personDefaults,
    };

    // Antes da correção do CRÍTICO da rodada 2, este `safeParse` FALHAVA
    // (issues em `clientId`/`leadId` via `personExclusivityRefinement`)
    // porque os defaultValues do detalhe carregavam as duas FKs reais — o
    // `handleSubmit` do RHF nunca chegava a chamar `buildAppointmentFormPayload`.
    const parsed = appointmentFormSchema.safeParse(defaultValues);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const initialPerson = {
      clientId: personDefaults.clientId,
      leadId: personDefaults.leadId,
    };

    const payload = buildAppointmentFormPayload(
      "edit",
      parsed.data,
      initialPerson,
    );

    // Nenhuma mudança de pessoa ⇒ as duas FKs ficam OMITIDAS do payload; o
    // `PUT` (RF-07) preserva o que já está no banco — inclusive o `lead_id`,
    // que nunca chegou a entrar no estado do formulário.
    expect("clientId" in payload).toBe(false);
    expect("leadId" in payload).toBe(false);
  });

  it("modo create inalterado: EMPTY_APPOINTMENT_FORM_VALUES continua sem pessoa (estado inicial da tela de criação, antes de data/hora serem preenchidas)", () => {
    // `EMPTY_APPOINTMENT_FORM_VALUES` é o estado ANTES de a usuária preencher
    // data/hora — `dateIso`/`timeHm` vazios são esperados e só ficam
    // inválidos no submit real (mensagens já cobertas nos testes do próprio
    // `appointment-form.tsx`/`createAppointmentSchema`). Aqui o que importa
    // para este achado é: nenhuma pessoa pré-selecionada, sem violar o
    // refine de exclusividade.
    expect(EMPTY_APPOINTMENT_FORM_VALUES).toMatchObject({
      clientId: null,
      leadId: null,
    });

    const parsed = appointmentFormSchema.safeParse({
      ...EMPTY_APPOINTMENT_FORM_VALUES,
      dateIso: "2026-08-05",
      timeHm: "20:00",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const payload = buildAppointmentFormPayload("create", parsed.data, {
      clientId: null,
      leadId: null,
    });

    expect(payload).toMatchObject({ clientId: null, leadId: null });
    expect("clientId" in payload).toBe(true);
    expect("leadId" in payload).toBe(true);
  });

  it("troca de cliente num compromisso pós-conversão: o payload envia só o novo clientId e OMITE leadId, preservando o lead_id real no banco (SUGESTÃO #4 da rodada 2)", () => {
    const appointment = {
      clientId: CLIENT_ID,
      clientName: "Maria Cliente",
      leadId: LEAD_ID,
      leadName: "Maria Lead",
    };
    const personDefaults = resolveAppointmentFormPersonDefaults(appointment);
    const initialPerson = {
      clientId: personDefaults.clientId,
      leadId: personDefaults.leadId,
    };

    // `PersonSelect` limpa o campo rival por construção ao selecionar um
    // novo cliente — reproduzido aqui como o estado pós-interação real.
    const afterPersonSelectChange: AppointmentFormFieldValues = {
      ...baseFormFields,
      clientId: OTHER_CLIENT_ID,
      clientName: "Outra Cliente",
      leadId: null,
      leadName: "",
    };

    const parsed = appointmentFormSchema.safeParse(afterPersonSelectChange);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const payload = buildAppointmentFormPayload(
      "edit",
      parsed.data,
      initialPerson,
    );

    expect(payload).toMatchObject({ clientId: OTHER_CLIENT_ID });
    expect("leadId" in payload).toBe(false);
  });

  it("desvínculo explícito (Remover pessoa) num compromisso só com cliente: o payload envia clientId: null e leadId: null (ALERTA #1 da rodada 3)", () => {
    const appointment = {
      clientId: CLIENT_ID,
      clientName: "Maria Cliente",
      leadId: null,
      leadName: null,
    };
    const personDefaults = resolveAppointmentFormPersonDefaults(appointment);
    const initialPerson = {
      clientId: personDefaults.clientId,
      leadId: personDefaults.leadId,
    };

    const afterRemovePerson: AppointmentFormFieldValues = {
      ...baseFormFields,
      clientId: null,
      clientName: "",
      leadId: null,
      leadName: "",
    };

    const parsed = appointmentFormSchema.safeParse(afterRemovePerson);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const payload = buildAppointmentFormPayload(
      "edit",
      parsed.data,
      initialPerson,
    );

    expect(payload).toMatchObject({ clientId: null, leadId: null });
  });

  it("ALERTA #1 da rodada 3: desvínculo explícito (Remover pessoa) num compromisso PÓS-CONVERSÃO (client_id E lead_id REAIS, RF-12) — o payload preserva as duas FKs num submit sem mudança, mas ao remover a pessoa envia clientId: null E leadId: null, desvinculando de fato o lead que a projeção escondia", () => {
    const appointment = {
      clientId: CLIENT_ID,
      clientName: "Maria Cliente",
      leadId: LEAD_ID,
      leadName: "Maria Lead",
    };
    const personDefaults = resolveAppointmentFormPersonDefaults(appointment);
    // Precedência cliente>lead (RF-02): `defaultValues` só carrega a
    // cliente — é exatamente o estado que escondia o `lead_id` real do
    // diff antes da correção do ALERTA #1.
    expect(personDefaults).toEqual({
      clientId: CLIENT_ID,
      clientName: "Maria Cliente",
      leadId: null,
      leadName: "",
    });

    const defaultValues: AppointmentFormFieldValues = {
      ...baseFormFields,
      ...personDefaults,
    };
    const initialPerson = {
      clientId: personDefaults.clientId,
      leadId: personDefaults.leadId,
    };

    const afterRemovePerson: AppointmentFormFieldValues = {
      ...defaultValues,
      clientId: null,
      clientName: "",
      leadId: null,
      leadName: "",
    };

    const parsed = appointmentFormSchema.safeParse(afterRemovePerson);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const payload = buildAppointmentFormPayload(
      "edit",
      parsed.data,
      initialPerson,
    );

    // Antes da correção: `leadId` ficava OMITIDO do payload (diff via
    // `null === null` na projeção) e o `lead_id` real sobrevivia no banco,
    // voltando a ser exibido como a pessoa do compromisso. Agora as duas
    // chaves vão explícitas.
    expect(payload).toMatchObject({ clientId: null, leadId: null });
    expect("clientId" in payload).toBe(true);
    expect("leadId" in payload).toBe(true);
  });

  it("defaultValues com as duas FKs reais SEM projeção (regressão direta do bug): safeParse falha com issues em clientId e leadId", () => {
    // Prova, isolada do resto, que o SCHEMA rejeita o estado bruto que
    // causou o CRÍTICO (as duas FKs reais, sem passar por
    // `resolveAppointmentFormPersonDefaults`). NÃO prova que o RSC de
    // detalhe continua chamando essa função — ver o comentário no topo do
    // arquivo (ALERTA #2 da rodada 3). A garantia real aqui é "o schema
    // recusa o estado inválido", não "a fiação do RSC está certa".
    const rawBothFks: AppointmentFormFieldValues = {
      ...baseFormFields,
      clientId: CLIENT_ID,
      clientName: "Maria Cliente",
      leadId: LEAD_ID,
      leadName: "Maria Lead",
    };

    const parsed = appointmentFormSchema.safeParse(rawBothFks);
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    const paths = parsed.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain("clientId");
    expect(paths).toContain("leadId");
  });
});
