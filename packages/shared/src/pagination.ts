import { z } from "zod";

const PAGE_MIN = 1;
const PAGE_DEFAULT = 1;
const PER_PAGE_MIN = 1;
const PER_PAGE_MAX = 100;
const PER_PAGE_DEFAULT = 20;

// Query de paginação reutilizável por todos os CRUDs (api.md exige default e
// máximo). `coerce` converte a query string (`?page=2`); `default` só dispara
// quando a chave está AUSENTE. Acima do máximo é REJEITADO (422), não clampado:
// explícito > silencioso (plan.md).
export const paginationQuerySchema = z.object({
  page: z.coerce
    .number({ error: "A página deve ser um número inteiro" })
    .int("A página deve ser um número inteiro")
    .min(PAGE_MIN, "A página deve ser no mínimo 1")
    .default(PAGE_DEFAULT),
  perPage: z.coerce
    .number({ error: "O limite por página deve ser um número inteiro" })
    .int("O limite por página deve ser um número inteiro")
    .min(PER_PAGE_MIN, "O limite por página deve ser no mínimo 1")
    .max(PER_PAGE_MAX, "O limite por página deve ser no máximo 100")
    .default(PER_PAGE_DEFAULT),
});

export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;
export type PaginationQuery = z.output<typeof paginationQuerySchema>;

// Envelope de lista paginada `{ data, page, perPage, total }`. Fábrica genérica:
// cada recurso passa o schema do item e ganha o contrato completo tipado.
export const paginated = <ItemSchema extends z.ZodType>(
  itemSchema: ItemSchema,
) =>
  z.object({
    data: z.array(itemSchema),
    page: z.number().int(),
    perPage: z.number().int(),
    total: z.number().int(),
  });

export type Paginated<Item> = {
  data: Item[];
  page: number;
  perPage: number;
  total: number;
};
