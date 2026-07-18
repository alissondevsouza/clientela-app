import { z } from "zod";

// Envelope de erro único da API HTTP (api.md): toda resposta de erro tem
// exatamente esta forma. Reusado pelo front para narrowing tipado.
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
