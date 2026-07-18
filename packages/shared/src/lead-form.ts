import { z } from "zod";
import { leadCaptureRequestSchema } from "./leads";

// Mensagem LGPD do consentimento (security.md): finalidade e obrigatoriedade.
const CONSENT_REQUIRED_MESSAGE =
  "É necessário aceitar o uso dos seus dados para contato";

// Variante do contrato de captura para react-hook-form. Deriva de
// `leadCaptureRequestSchema` (que já inclui o honeypot `website`) para que o
// resolver NÃO stripe o campo — sem ele, o bot seria persistido silenciosamente.
//
// `consent`: input `boolean` (RHF precisa de `defaultValues.consent = false`
// sem `as`) que passa por `.pipe(z.literal(true))` — o output é o literal `true`,
// atribuível por tipo a `LeadCaptureRequest`. `website`: `.default("")` para o
// RHF registrar o campo controlado e o valor sobreviver ao parse.
export const leadFormSchema = leadCaptureRequestSchema.extend({
  consent: z
    .boolean()
    .pipe(z.literal(true, { error: CONSENT_REQUIRED_MESSAGE })),
  website: z.string().default(""),
});

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormValues = z.output<typeof leadFormSchema>;
