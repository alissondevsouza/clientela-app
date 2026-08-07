// Mensagem de confirmação de compromisso e o link `wa.me` correspondente
// (RF-20). Função pura: sem pessoa vinculada ou sem WhatsApp válido, devolve
// `null` — nunca deixa `buildWhatsAppUrl` lançar (ele lança fora de 10–15
// dígitos), sob pena de derrubar a página de detalhe.

import {
  type Appointment,
  appLocalDateIso,
  appLocalTimeHm,
  resolveAppointmentPerson,
} from "@clientela/shared";
import { buildWhatsAppUrl, toWaPhone } from "./whatsapp";

export type AppointmentMessageInput = Pick<
  Appointment,
  | "clientId"
  | "clientName"
  | "clientWhatsapp"
  | "leadId"
  | "leadName"
  | "leadWhatsapp"
  | "startsAt"
>;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// `dd/mm` (sem ano — RF-20) a partir do dia local (`yyyy-mm-dd`) já resolvido
// no `APP_TIME_ZONE` por `appLocalDateIso`.
const formatDayMonth = (localDateIso: string): string => {
  const match = ISO_DATE_PATTERN.exec(localDateIso);
  if (!match) {
    return localDateIso;
  }
  const [, , month, day] = match;
  return `${day}/${month}`;
};

const buildMessage = (name: string, dayMonth: string, timeHm: string): string =>
  `Olá, ${name}! Passando para confirmar nosso compromisso no dia ${dayMonth} às ${timeHm}. Podemos manter o horário?`;

// Devolve a whatsapp bruta (não normalizada) da pessoa resolvida pela
// precedência única do shared (cliente > lead, RF-02).
const whatsappOf = (
  appointment: AppointmentMessageInput,
  personKind: "client" | "lead" | "none",
): string | null => {
  if (personKind === "client") {
    return appointment.clientWhatsapp;
  }
  if (personKind === "lead") {
    return appointment.leadWhatsapp;
  }
  return null;
};

export function buildConfirmationWhatsAppUrl(
  appointment: AppointmentMessageInput,
): string | null {
  const person = resolveAppointmentPerson(appointment);
  if (person.kind === "none" || person.name === null) {
    return null;
  }

  const whatsapp = whatsappOf(appointment, person.kind);
  if (whatsapp === null || whatsapp.length === 0) {
    return null;
  }

  const dayMonth = formatDayMonth(appLocalDateIso(appointment.startsAt));
  const timeHm = appLocalTimeHm(appointment.startsAt);
  const message = buildMessage(person.name, dayMonth, timeHm);

  try {
    return buildWhatsAppUrl({ phone: toWaPhone(whatsapp), message });
  } catch {
    return null;
  }
}
