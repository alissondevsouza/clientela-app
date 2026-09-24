import { describe, expect, it } from "vitest";
import {
  birthdayMessage,
  birthdayWhatsAppUrl,
  collectionGroupWhatsAppUrl,
  dueTodayCollectionMessage,
  firstName,
  newLeadMessage,
  newLeadWhatsAppUrl,
  overdueCollectionMessage,
  receivableWhatsAppUrl,
  safeWhatsAppUrl,
  upcomingCollectionMessage,
} from "./dashboard-messages";

const TODAY = "2026-09-23";
const PHONE = "5511912345678";

// O Intl.NumberFormat pt-BR separa "R$" do valor com espaço não separável
// (U+00A0), não espaço comum (mesma convenção de format.test.ts).
const NBSP = " ";

describe("firstName", () => {
  it("devolve o primeiro termo do nome", () => {
    expect(firstName("Maria Silva Souza")).toBe("Maria");
  });

  it("nome com um só termo", () => {
    expect(firstName("Joana")).toBe("Joana");
  });

  it("nome vazio ou só espaços ⇒ null", () => {
    expect(firstName("")).toBeNull();
    expect(firstName("   ")).toBeNull();
  });
});

describe("mensagens de cobrança (RF-19)", () => {
  it("atrasada, 1 parcela", () => {
    expect(
      overdueCollectionMessage("Maria Silva", 1, 15_000, "2026-09-10"),
    ).toBe(
      `Olá, Maria! Tudo bem? Passando para lembrar da parcela de R$${NBSP}150,00 que venceu em 10/09. Consegue me dizer quando pode acertar? Obrigada!`,
    );
  });

  it("atrasada, N parcelas", () => {
    expect(
      overdueCollectionMessage("Maria Silva", 3, 45_000, "2026-09-05"),
    ).toBe(
      `Olá, Maria! Tudo bem? Passando para lembrar das 3 parcelas em aberto, no total de R$${NBSP}450,00. A mais antiga venceu em 05/09. Consegue me dizer quando pode acertar? Obrigada!`,
    );
  });

  it("vence hoje, 1 parcela", () => {
    expect(dueTodayCollectionMessage("Maria Silva", 1, 15_000)).toBe(
      `Olá, Maria! Tudo bem? Passando para lembrar que a parcela de R$${NBSP}150,00 vence hoje. Qualquer dúvida, estou à disposição!`,
    );
  });

  it("vence hoje, N parcelas", () => {
    expect(dueTodayCollectionMessage("Maria Silva", 2, 30_000)).toBe(
      `Olá, Maria! Tudo bem? Passando para lembrar que 2 parcelas, no total de R$${NBSP}300,00, vencem hoje. Qualquer dúvida, estou à disposição!`,
    );
  });

  it("a vencer, 1 parcela (tela de cobranças)", () => {
    expect(upcomingCollectionMessage("Maria Silva", 15_000, "2026-09-30")).toBe(
      `Olá, Maria! Tudo bem? Passando para lembrar da parcela de R$${NBSP}150,00 com vencimento em 30/09. Qualquer dúvida, estou à disposição!`,
    );
  });

  it("nome vazio ⇒ 'Olá!' sem saudação nominal", () => {
    expect(dueTodayCollectionMessage("", 1, 15_000)).toBe(
      `Olá! Tudo bem? Passando para lembrar que a parcela de R$${NBSP}150,00 vence hoje. Qualquer dúvida, estou à disposição!`,
    );
  });
});

describe("mensagem de aniversário (RF-19)", () => {
  it("com nome", () => {
    expect(birthdayMessage("Maria Silva")).toBe(
      "Feliz aniversário, Maria! Desejo um dia lindo e um novo ano cheio de coisas boas. Um beijo!",
    );
  });

  it("nome vazio ⇒ 'Feliz aniversário!' sem saudação nominal", () => {
    expect(birthdayMessage("")).toBe(
      "Feliz aniversário! Desejo um dia lindo e um novo ano cheio de coisas boas. Um beijo!",
    );
  });
});

describe("mensagens de lead novo (RF-19)", () => {
  it("com interesse declarado", () => {
    expect(newLeadMessage("Joana Souza", "batom matte")).toBe(
      "Olá, Joana! Tudo bem? Recebi seu cadastro no meu site, com interesse em batom matte. Posso te ajudar a escolher o produto ideal?",
    );
  });

  it("sem interesse declarado", () => {
    expect(newLeadMessage("Joana Souza", null)).toBe(
      "Olá, Joana! Tudo bem? Recebi seu cadastro no meu site. Posso te ajudar a escolher o produto ideal?",
    );
  });
});

describe("safeWhatsAppUrl", () => {
  it("monta a URL wa.me com a mensagem", () => {
    const url = safeWhatsAppUrl(PHONE, "Olá!");
    expect(url).not.toBeNull();
    const parsed = new URL(url as string);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`https://wa.me/${PHONE}`);
    expect(parsed.searchParams.get("text")).toBe("Olá!");
  });

  it("telefone nulo ⇒ null", () => {
    expect(safeWhatsAppUrl(null, "Olá!")).toBeNull();
  });

  it("telefone vazio ⇒ null", () => {
    expect(safeWhatsAppUrl("", "Olá!")).toBeNull();
  });

  it("telefone inválido ⇒ null, nunca lança", () => {
    expect(() => safeWhatsAppUrl("123", "Olá!")).not.toThrow();
    expect(safeWhatsAppUrl("123", "Olá!")).toBeNull();
  });
});

describe("collectionGroupWhatsAppUrl", () => {
  const baseGroup = {
    name: "Maria Silva",
    whatsapp: PHONE,
    amountCents: 15_000,
    installmentsCount: 1,
    oldestDueDate: "2026-09-10",
  };

  it("grupo atrasado usa a mensagem de atraso", () => {
    const url = collectionGroupWhatsAppUrl(baseGroup, TODAY);
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain("que venceu em 10/09");
  });

  it("grupo vencendo hoje usa a mensagem de hoje", () => {
    const url = collectionGroupWhatsAppUrl(
      { ...baseGroup, oldestDueDate: TODAY },
      TODAY,
    );
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain("vence hoje");
  });

  it("sem whatsapp ⇒ null", () => {
    expect(
      collectionGroupWhatsAppUrl({ ...baseGroup, whatsapp: null }, TODAY),
    ).toBeNull();
  });
});

describe("receivableWhatsAppUrl", () => {
  const baseReceivable = {
    clientWhatsapp: PHONE,
    clientName: "Maria Silva",
    amountCents: 15_000,
    dueDate: "2026-09-10" as string | null,
  };

  it("atrasada", () => {
    const url = receivableWhatsAppUrl(baseReceivable, TODAY);
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain("que venceu em 10/09");
  });

  it("vence hoje", () => {
    const url = receivableWhatsAppUrl(
      { ...baseReceivable, dueDate: TODAY },
      TODAY,
    );
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain("vence hoje");
  });

  it("a vencer", () => {
    const url = receivableWhatsAppUrl(
      { ...baseReceivable, dueDate: "2026-09-30" },
      TODAY,
    );
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain(
      "com vencimento em 30/09",
    );
  });

  it("sem dueDate (on_delivery/unknown) ⇒ link sem mensagem", () => {
    const url = receivableWhatsAppUrl(
      { ...baseReceivable, dueDate: null },
      TODAY,
    );
    expect(url).toBe(`https://wa.me/${PHONE}`);
  });

  it("sem whatsapp ⇒ null", () => {
    expect(
      receivableWhatsAppUrl({ ...baseReceivable, clientWhatsapp: null }, TODAY),
    ).toBeNull();
  });
});

describe("birthdayWhatsAppUrl / newLeadWhatsAppUrl", () => {
  it("aniversário monta a mensagem de parabéns", () => {
    const url = birthdayWhatsAppUrl({ name: "Maria Silva", whatsapp: PHONE });
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain(
      "Feliz aniversário, Maria!",
    );
  });

  it("lead novo com interesse", () => {
    const url = newLeadWhatsAppUrl({
      name: "Joana Souza",
      whatsapp: PHONE,
      interest: "batom matte",
    });
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).toContain(
      "interesse em batom matte",
    );
  });

  it("lead novo sem interesse não lança e não menciona interesse", () => {
    const url = newLeadWhatsAppUrl({
      name: "Joana Souza",
      whatsapp: PHONE,
      interest: null,
    });
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("text")).not.toContain("interesse");
  });
});
