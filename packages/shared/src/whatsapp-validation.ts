import { z } from "zod";

const WHATSAPP_MIN_DIGITS = 10;
const WHATSAPP_MAX_DIGITS = 13;

// Mensagem pt-BR única (core.md/security.md). Exportada para que consumidores
// possam assertar/reusar a mesma string sem duplicar o literal.
export const WHATSAPP_INVALID_MESSAGE = "Informe um WhatsApp válido com DDD";

// Regra única de validação de WhatsApp (fonte de verdade compartilhada por
// `leads` e `clients` — core.md: nunca duplicar contrato). Normaliza para só
// dígitos e exige DDD (10–13 dígitos). O `error` no nível do tipo cobre também
// o campo AUSENTE em pt-BR (lesson Zod v4 2026-07-17): sem ele o `invalid_type`
// responderia em inglês.
export const whatsappSchema = z
  .string({ error: WHATSAPP_INVALID_MESSAGE })
  .transform((value) => value.replace(/\D/g, ""))
  .refine(
    (digits) =>
      digits.length >= WHATSAPP_MIN_DIGITS &&
      digits.length <= WHATSAPP_MAX_DIGITS,
    WHATSAPP_INVALID_MESSAGE,
  );
