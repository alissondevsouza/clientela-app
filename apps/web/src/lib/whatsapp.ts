// Builder puro do link wa.me. Sem dependência de React/HTTP — testável por unidade
// e reutilizável (LP-05 monta mensagens por produto).

const WA_ME_BASE_URL = "https://wa.me";

// E.164: número internacional tem no mínimo 10 e no máximo 15 dígitos.
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

const NON_DIGIT = /\D/g;

export type BuildWhatsAppUrlInput = {
  phone: string;
  message?: string;
};

// Mantém só dígitos: aceita entradas com "+", espaços, hífens e parênteses.
const normalizePhone = (phone: string): string => phone.replace(NON_DIGIT, "");

export function buildWhatsAppUrl({
  phone,
  message,
}: BuildWhatsAppUrlInput): string {
  const digits = normalizePhone(phone);

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    throw new Error(
      `Número de WhatsApp inválido: informe de ${MIN_PHONE_DIGITS} a ${MAX_PHONE_DIGITS} dígitos, incluindo o código do país (ex.: 5511912345678).`,
    );
  }

  const baseUrl = `${WA_ME_BASE_URL}/${digits}`;

  if (message === undefined || message.length === 0) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

// Normaliza um número BR (só dígitos, como armazenado) para E.164 antes do
// `buildWhatsAppUrl` (RF-08): 10–11 dígitos são um número local (DDD + fixo/celular)
// e ganham o código do país "55"; 12–13 dígitos já iniciando em "55" já estão em
// E.164 e passam direto. Qualquer outro caso é ambíguo → passa como está
// (fallthrough total): a validação final fica com `buildWhatsAppUrl`, sem adivinhar.
const LOCAL_MIN_DIGITS = 10;
const LOCAL_MAX_DIGITS = 11;
const E164_MIN_DIGITS = 12;
const E164_MAX_DIGITS = 13;
const BR_COUNTRY_CODE = "55";

export function toWaPhone(digits: string): string {
  const length = digits.length;

  if (length >= LOCAL_MIN_DIGITS && length <= LOCAL_MAX_DIGITS) {
    return `${BR_COUNTRY_CODE}${digits}`;
  }

  if (
    length >= E164_MIN_DIGITS &&
    length <= E164_MAX_DIGITS &&
    digits.startsWith(BR_COUNTRY_CODE)
  ) {
    return digits;
  }

  return digits;
}

export { MAX_PHONE_DIGITS, MIN_PHONE_DIGITS };
