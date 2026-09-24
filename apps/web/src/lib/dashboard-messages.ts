// Construtores puros das mensagens de WhatsApp do bloco Hoje (RF-19) — textos
// EXATOS da spec. `{nome}` = primeiro nome (nome vazio ⇒ sem saudação
// nominal); `{valor}` = `formatBRL`; `{data}` = `dd/mm` (SEM ano — diferente
// de `formatDateBr`, que é `dd/mm/aaaa`; o WhatsApp usa o formato curto da
// spec). `safeWhatsAppUrl` nunca deixa `buildWhatsAppUrl` lançar (número
// ausente/inválido ⇒ sem botão, nunca erro de renderização).

import type { DashboardToday, ReceivableListItem } from "@clientela/shared";
import { formatBRL } from "./format";
import { buildWhatsAppUrl, toWaPhone } from "./whatsapp";

const SINGLE_INSTALLMENT = 1;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// `dd/mm` a partir de uma data local `yyyy-mm-dd` (sem instante — `dueDate`/
// `oldestDueDate` já são dias locais, nunca precisam de fuso). Fail-safe:
// entrada fora do formato ISO volta como está, nunca lança (mesmo padrão de
// `format.ts`).
const formatDayMonth = (dateIso: string): string => {
  const match = ISO_DATE_PATTERN.exec(dateIso);
  if (match === null) {
    return dateIso;
  }
  const [, , month, day] = match;
  return `${day}/${month}`;
};

/**
 * Primeiro nome (primeiro termo, sem espaços) — `null` para nome vazio/só
 * espaços (RF-19: "sem saudação nominal").
 */
export function firstName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const [first] = trimmed.split(/\s+/);
  return first ?? null;
}

const greeting = (name: string): string => {
  const first = firstName(name);
  return first === null ? "Olá!" : `Olá, ${first}!`;
};

const birthdayGreeting = (name: string): string => {
  const first = firstName(name);
  return first === null ? "Feliz aniversário!" : `Feliz aniversário, ${first}!`;
};

/** Cobrança atrasada (1 ou N parcelas — RF-19). */
export function overdueCollectionMessage(
  name: string,
  installmentsCount: number,
  amountCents: number,
  oldestDueDate: string,
): string {
  const valor = formatBRL(amountCents);
  const data = formatDayMonth(oldestDueDate);
  if (installmentsCount === SINGLE_INSTALLMENT) {
    return `${greeting(name)} Tudo bem? Passando para lembrar da parcela de ${valor} que venceu em ${data}. Consegue me dizer quando pode acertar? Obrigada!`;
  }
  return `${greeting(name)} Tudo bem? Passando para lembrar das ${installmentsCount} parcelas em aberto, no total de ${valor}. A mais antiga venceu em ${data}. Consegue me dizer quando pode acertar? Obrigada!`;
}

/** Cobrança que vence hoje (1 ou N parcelas — RF-19). */
export function dueTodayCollectionMessage(
  name: string,
  installmentsCount: number,
  amountCents: number,
): string {
  const valor = formatBRL(amountCents);
  if (installmentsCount === SINGLE_INSTALLMENT) {
    return `${greeting(name)} Tudo bem? Passando para lembrar que a parcela de ${valor} vence hoje. Qualquer dúvida, estou à disposição!`;
  }
  return `${greeting(name)} Tudo bem? Passando para lembrar que ${installmentsCount} parcelas, no total de ${valor}, vencem hoje. Qualquer dúvida, estou à disposição!`;
}

/** Cobrança a vencer (1 parcela — só a tela de cobranças, RF-19/RF-17). */
export function upcomingCollectionMessage(
  name: string,
  amountCents: number,
  dueDate: string,
): string {
  const valor = formatBRL(amountCents);
  const data = formatDayMonth(dueDate);
  return `${greeting(name)} Tudo bem? Passando para lembrar da parcela de ${valor} com vencimento em ${data}. Qualquer dúvida, estou à disposição!`;
}

/** Aniversário (RF-19). */
export function birthdayMessage(name: string): string {
  return `${birthdayGreeting(name)} Desejo um dia lindo e um novo ano cheio de coisas boas. Um beijo!`;
}

/** Lead novo, com ou sem interesse declarado (RF-19). */
export function newLeadMessage(name: string, interest: string | null): string {
  const hasInterest = interest !== null && interest.trim().length > 0;
  if (hasInterest) {
    return `${greeting(name)} Tudo bem? Recebi seu cadastro no meu site, com interesse em ${interest}. Posso te ajudar a escolher o produto ideal?`;
  }
  return `${greeting(name)} Tudo bem? Recebi seu cadastro no meu site. Posso te ajudar a escolher o produto ideal?`;
}

/**
 * Wrapper seguro de `buildWhatsAppUrl` (RF-19): `phone` nulo/vazio ou
 * inválido (fora de 10–15 dígitos) ⇒ `null`, NUNCA lança — a renderização de
 * uma lista de 5 itens não pode quebrar por causa de um número mal
 * cadastrado.
 */
export function safeWhatsAppUrl(
  phone: string | null,
  message?: string,
): string | null {
  if (phone === null || phone.length === 0) {
    return null;
  }
  try {
    return buildWhatsAppUrl({ phone: toWaPhone(phone), message });
  } catch {
    return null;
  }
}

export type CollectionGroupWhatsAppInput = Pick<
  DashboardToday["collections"]["groups"][number],
  "name" | "whatsapp" | "amountCents" | "installmentsCount" | "oldestDueDate"
>;

/**
 * URL de cobrança de um grupo do bloco Hoje (RF-20): atrasada ou vence hoje,
 * decidido por `oldestDueDate` × `todayIso` (nunca confia só no `overdue` da
 * API — função pura, independente do transporte).
 */
export function collectionGroupWhatsAppUrl(
  group: CollectionGroupWhatsAppInput,
  todayIso: string,
): string | null {
  const message =
    group.oldestDueDate < todayIso
      ? overdueCollectionMessage(
          group.name,
          group.installmentsCount,
          group.amountCents,
          group.oldestDueDate,
        )
      : dueTodayCollectionMessage(
          group.name,
          group.installmentsCount,
          group.amountCents,
        );
  return safeWhatsAppUrl(group.whatsapp, message);
}

export type ReceivableWhatsAppInput = Pick<
  ReceivableListItem,
  "clientWhatsapp" | "clientName" | "amountCents" | "dueDate"
>;

/**
 * URL de cobrança de UM recebível (tela de cobranças, RF-17/RF-19): atrasada,
 * vence hoje ou a vencer, por `dueDate` × `todayIso`; sem `dueDate`
 * (`on_delivery`/`unknown`) ⇒ link sem mensagem, como hoje.
 */
export function receivableWhatsAppUrl(
  receivable: ReceivableWhatsAppInput,
  todayIso: string,
): string | null {
  if (receivable.dueDate === null) {
    return safeWhatsAppUrl(receivable.clientWhatsapp);
  }
  if (receivable.dueDate < todayIso) {
    return safeWhatsAppUrl(
      receivable.clientWhatsapp,
      overdueCollectionMessage(
        receivable.clientName,
        SINGLE_INSTALLMENT,
        receivable.amountCents,
        receivable.dueDate,
      ),
    );
  }
  if (receivable.dueDate === todayIso) {
    return safeWhatsAppUrl(
      receivable.clientWhatsapp,
      dueTodayCollectionMessage(
        receivable.clientName,
        SINGLE_INSTALLMENT,
        receivable.amountCents,
      ),
    );
  }
  return safeWhatsAppUrl(
    receivable.clientWhatsapp,
    upcomingCollectionMessage(
      receivable.clientName,
      receivable.amountCents,
      receivable.dueDate,
    ),
  );
}

export type BirthdayWhatsAppInput = Pick<
  DashboardToday["birthdays"][number],
  "name" | "whatsapp"
>;

/** URL de "Dar parabéns no WhatsApp" (RF-20). */
export function birthdayWhatsAppUrl(
  item: BirthdayWhatsAppInput,
): string | null {
  return safeWhatsAppUrl(item.whatsapp, birthdayMessage(item.name));
}

export type NewLeadWhatsAppInput = Pick<
  DashboardToday["newLeads"]["items"][number],
  "name" | "whatsapp" | "interest"
>;

/** URL de primeiro contato com um lead novo (RF-20). */
export function newLeadWhatsAppUrl(lead: NewLeadWhatsAppInput): string | null {
  return safeWhatsAppUrl(
    lead.whatsapp,
    newLeadMessage(lead.name, lead.interest),
  );
}
