import { z } from "zod";
import { paginationQuerySchema } from "./pagination";
import { MONEY_MAX_CENTS } from "./products";

// Ciclo de vida do pedido de reposição (spec.md — vocabulário de status):
// rascunho em montagem → pedido feito → entregue (credita estoque, terminal)
// ou cancelado (desistência antes da entrega, terminal). Sem soft delete —
// histórico preservado (invariante 5 do domínio, por analogia a sales).
export const orderStatusValues = [
  "draft",
  "placed",
  "delivered",
  "canceled",
] as const;

export type OrderStatus = (typeof orderStatusValues)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Rascunho",
  placed: "Pedido",
  delivered: "Entregue",
  canceled: "Cancelado",
};

// ---------------------------------------------------------------------------
// Schemas de contrato
// ---------------------------------------------------------------------------

const QTY_MIN = 1;
const QTY_MAX = 1000;
const ITEMS_MAX = 50;

const PRODUCT_ID_INVALID_MESSAGE = "Produto inválido";
const CLIENT_ID_INVALID_MESSAGE = "Cliente inválida";
const QTY_TYPE_MESSAGE = "Informe a quantidade (número inteiro)";
const QTY_MIN_MESSAGE = "A quantidade deve ser no mínimo 1";
const QTY_MAX_MESSAGE = "A quantidade deve ser no máximo 1.000";
const UNIT_COST_TYPE_MESSAGE =
  "Informe o custo unitário em centavos (número inteiro)";
const UNIT_COST_MIN_MESSAGE = "O custo unitário não pode ser negativo";
const UNIT_COST_MAX_MESSAGE =
  "O custo unitário deve ser no máximo R$ 1.000.000,00";
const CREATE_ITEMS_TYPE_MESSAGE = "A lista de itens do pedido é inválida";
const ITEMS_MAX_MESSAGE = "O pedido deve ter no máximo 50 itens";
const REPLACE_ITEMS_REQUIRED_MESSAGE =
  "Informe a lista de itens do pedido (pode ser vazia)";
const STATUS_INVALID_MESSAGE = "Status de pedido inválido";

// Item do payload de criação/substituição. `unitCostCents` opcional: ausente
// ⇒ o service usa o `costCents` atual do produto (snapshot, RF-01). `error` no
// nível do tipo cobre também o campo AUSENTE em pt-BR (lesson Zod v4).
// `clientId` opcional/nullable (RF-01): ausente ou null ⇒ item de reposição,
// sem cliente vinculada; informado ⇒ o service valida que pertence à
// consultora (RF-02).
const orderItemInputSchema = z.object({
  productId: z.uuid({ error: PRODUCT_ID_INVALID_MESSAGE }),
  clientId: z.uuid({ error: CLIENT_ID_INVALID_MESSAGE }).nullable().optional(),
  qty: z
    .number({ error: QTY_TYPE_MESSAGE })
    .int(QTY_TYPE_MESSAGE)
    .min(QTY_MIN, QTY_MIN_MESSAGE)
    .max(QTY_MAX, QTY_MAX_MESSAGE),
  unitCostCents: z
    .number({ error: UNIT_COST_TYPE_MESSAGE })
    .int(UNIT_COST_TYPE_MESSAGE)
    .min(0, UNIT_COST_MIN_MESSAGE)
    .max(MONEY_MAX_CENTS, UNIT_COST_MAX_MESSAGE)
    .optional(),
});

// Contrato de criação (RF-01): itens OPCIONAIS — um pedido pode nascer vazio
// (lista em montagem). Ausente ⇒ default `[]`; nunca há campo de total aqui,
// o `totalCents` é sempre calculado no servidor.
export const createOrderSchema = z.object({
  items: z
    .array(orderItemInputSchema, { error: CREATE_ITEMS_TYPE_MESSAGE })
    .max(ITEMS_MAX, ITEMS_MAX_MESSAGE)
    .default([]),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type CreateOrder = z.output<typeof createOrderSchema>;

// Contrato de `PUT /orders/:id/items` (RF-02): SUBSTITUI a lista completa,
// somente em `draft`. `items` é OBRIGATÓRIO (sem default) mas aceita lista
// VAZIA — esvaziar o rascunho é uma operação válida; o bloqueio de "pedido
// sem itens" só existe no `place`, não aqui.
export const replaceOrderItemsSchema = z.object({
  items: z
    .array(orderItemInputSchema, { error: REPLACE_ITEMS_REQUIRED_MESSAGE })
    .max(ITEMS_MAX, ITEMS_MAX_MESSAGE),
});

export type ReplaceOrderItemsInput = z.input<typeof replaceOrderItemsSchema>;
export type ReplaceOrderItems = z.output<typeof replaceOrderItemsSchema>;

// Item do pedido na resposta (snapshot, RF-05, consistente com ADR-0013).
// `productId` nullable: produto excluído ⇒ SET NULL, mas `productName`
// preserva o histórico legível.
// `clientId`/`clientName` (RF-01, RF-03): SEM snapshot — derivados por join
// com `clients` na leitura (nome atual, não histórico). Ambos null quando o
// item é de reposição (sem cliente) ou a cliente foi excluída (LGPD).
export const orderItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  productName: z.string(),
  clientId: z.uuid().nullable(),
  clientName: z.string().nullable(),
  qty: z.number().int(),
  unitCostCents: z.number().int(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;

// Resposta completa do pedido (detalhe): cabeçalho + itens num payload.
// `placedAt`/`deliveredAt`/`canceledAt` nullable — só preenchidos ao passar
// pela transição correspondente (RF-03).
export const orderSchema = z.object({
  id: z.uuid(),
  totalCents: z.number().int(),
  status: z.enum(orderStatusValues),
  placedAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  items: z.array(orderItemSchema),
});

export type Order = z.infer<typeof orderSchema>;

// Item da listagem: mesmo pedido SEM o array de itens — a listagem não
// carrega o agregado (padrão `saleListItemSchema`).
export const orderListItemSchema = orderSchema.omit({ items: true });

export type OrderListItem = z.infer<typeof orderListItemSchema>;

// Query da listagem de pedidos (RF-06): paginação padrão + filtro opcional de
// status.
export const ordersListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(orderStatusValues, { error: STATUS_INVALID_MESSAGE })
    .optional(),
});

export type OrdersListQueryInput = z.input<typeof ordersListQuerySchema>;
export type OrdersListQuery = z.output<typeof ordersListQuerySchema>;
