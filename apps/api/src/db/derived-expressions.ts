import { type SQL, sql } from "drizzle-orm";
import { products, receivables } from "./schema";

// Expressões SQL derivadas compartilhadas entre módulos (produtos, vendas e o
// painel). Vivem em `db/` (conhecimento de schema), não em internals de um
// módulo — api.md: módulos não importam internals uns dos outros; isto evita
// a regra de reserva/atraso divergir por cópia (plan.md, crm-home-period-and-
// daily-hub).

// Reserva é derivada, nunca persistida: considera só itens ainda vinculados a
// vendas abertas e não entregues da mesma consultora. Correlacionada com a
// tabela `products` do FROM externo (literais de identificador, não colunas
// Drizzle) — movida de `products.repository.ts` sem mudar o SQL gerado.
export const reservedQtyExpression = sql<string>`COALESCE((
  SELECT SUM("sale_items"."qty"::bigint)
  FROM "sale_items"
  INNER JOIN "sales" ON "sales"."id" = "sale_items"."sale_id"
  WHERE "sale_items"."product_id" = "products"."id"
    AND "sales"."consultant_id" = "products"."consultant_id"
    AND "sales"."status" = 'open'
    AND "sales"."delivered_at" IS NULL
), 0)`;

export const availableQtyExpression = sql<number>`${products.stockQty} - ${reservedQtyExpression}`;

// `overdue` derivado no SQL a partir de `todayIso` ("hoje" no fuso local da
// consultora), calculado pelo service com o relógio injetado — nunca
// CURRENT_DATE (fuso do servidor Postgres) — ADR-0018. Parcela vencida =
// due_date estritamente anterior a `todayIso` E ainda não paga E não anulada.
// COALESCE obrigatório: due_date é NULL em on_delivery/unknown e a comparação
// devolveria NULL, quebrando o contrato (overdue é boolean). Só cobrança
// scheduled participa de atraso. `todayIso` é uma data local `yyyy-mm-dd`,
// passada como parâmetro (nunca interpolada como SQL cru) com cast `::date`.
export const receivableOverdueExpression = (todayIso: string): SQL<boolean> =>
  sql<boolean>`COALESCE(${receivables.dueDate} < ${todayIso}::date, false)
    AND (${receivables.paidAt} IS NULL)
    AND (${receivables.voidedAt} IS NULL)`;

// Mesma regra, sem o COALESCE — para uso em WHERE/FILTER, onde uma condição
// NULL já é tratada como falsa (padrão hoje de
// `sales.repository#receivablesSummary`, que filtra por `due_date <
// CURRENT_DATE` sem COALESCE). Evita duplicar a regra quando a query soma/
// conta em vez de projetar uma coluna booleana.
export const receivableOverdueCondition = (todayIso: string): SQL<boolean> =>
  sql<boolean>`${receivables.dueDate} < ${todayIso}::date
    AND ${receivables.paidAt} IS NULL
    AND ${receivables.voidedAt} IS NULL`;
