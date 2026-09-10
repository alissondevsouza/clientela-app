import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

const NAME_MIN_LENGTH = 2;
const BRAND_CODE_MAX_LENGTH = 40;
const SEARCH_MAX_LENGTH = 100;

export const BASIS_POINTS_PER_PERCENT = 100;
export const PERCENT_BASIS_POINTS = 100 * BASIS_POINTS_PER_PERCENT;
const HALF_PERCENT_BASIS_POINTS = PERCENT_BASIS_POINTS / 2;

// Teto monetário: R$ 1.000.000,00 em centavos. Barra valores absurdos na
// fronteira (422 pt-BR) antes de o Postgres estourar integer (erro 22003).
// Exportado: teto único do projeto (core.md — nunca redefinir o número em
// outro módulo; dashboard.ts reusa este valor para a meta mensal).
export const MONEY_MAX_CENTS = 100_000_000;
// Teto de quantidade: estoque/limiar em unidades.
const QTY_MAX = 1_000_000;
const STOCK_QTY_DEFAULT = 0;
const LOW_STOCK_THRESHOLD_DEFAULT = 1;

const NAME_INVALID_MESSAGE = "Informe o nome do produto (mínimo 2 caracteres)";
const BRAND_CODE_MAX_MESSAGE =
  "O código Mary Kay deve ter no máximo 40 caracteres";
const SEARCH_MAX_MESSAGE = "A busca deve ter no máximo 100 caracteres";
const UPDATE_EMPTY_MESSAGE = "Informe ao menos um campo para atualizar";
const COST_MODE_AMBIGUOUS_MESSAGE =
  "Informe o custo diretamente ou o desconto de compra, mas não os dois";

const COST_CENTS_INT_MESSAGE = "Informe o custo em centavos (número inteiro)";
const COST_CENTS_MIN_MESSAGE = "O custo não pode ser negativo";
const COST_CENTS_MAX_MESSAGE = "O custo deve ser no máximo R$ 1.000.000,00";
const PRICE_CENTS_INT_MESSAGE = "Informe o preço em centavos (número inteiro)";
const PRICE_CENTS_MIN_MESSAGE = "O preço não pode ser negativo";
const PRICE_CENTS_MAX_MESSAGE = "O preço deve ser no máximo R$ 1.000.000,00";
const PURCHASE_DISCOUNT_BPS_INT_MESSAGE =
  "Informe o desconto de compra em pontos-base (número inteiro)";
const PURCHASE_DISCOUNT_BPS_MIN_MESSAGE =
  "O desconto de compra não pode ser negativo";
const PURCHASE_DISCOUNT_BPS_MAX_MESSAGE =
  "O desconto de compra deve ser no máximo 100%";
const STOCK_QTY_INT_MESSAGE =
  "Informe a quantidade em estoque (número inteiro)";
const STOCK_QTY_MIN_MESSAGE = "A quantidade em estoque não pode ser negativa";
const STOCK_QTY_MAX_MESSAGE =
  "A quantidade em estoque deve ser no máximo 1.000.000";
const LOW_STOCK_THRESHOLD_INT_MESSAGE =
  "Informe o limiar de estoque baixo (número inteiro)";
const LOW_STOCK_THRESHOLD_MIN_MESSAGE =
  "O limiar de estoque baixo não pode ser negativo";
const LOW_STOCK_THRESHOLD_MAX_MESSAGE =
  "O limiar de estoque baixo deve ser no máximo 1.000.000";

type IntFieldMessages = { type: string; min: string; max: string };

// Campo inteiro ≥ 0 com teto. `error` no nível do tipo cobre o campo AUSENTE
// (lesson Zod v4) e o não-número; `.int` roda antes de `.min`/`.max`, então um
// valor fracionário (ex.: 12.34) cai na mensagem de centavos, não na de limite.
const intField = (max: number, messages: IntFieldMessages) =>
  z
    .number({ error: messages.type })
    .int(messages.type)
    .min(0, messages.min)
    .max(max, messages.max);

const costCentsSchema = intField(MONEY_MAX_CENTS, {
  type: COST_CENTS_INT_MESSAGE,
  min: COST_CENTS_MIN_MESSAGE,
  max: COST_CENTS_MAX_MESSAGE,
});
const priceCentsSchema = intField(MONEY_MAX_CENTS, {
  type: PRICE_CENTS_INT_MESSAGE,
  min: PRICE_CENTS_MIN_MESSAGE,
  max: PRICE_CENTS_MAX_MESSAGE,
});
export const purchaseDiscountBpsSchema = intField(PERCENT_BASIS_POINTS, {
  type: PURCHASE_DISCOUNT_BPS_INT_MESSAGE,
  min: PURCHASE_DISCOUNT_BPS_MIN_MESSAGE,
  max: PURCHASE_DISCOUNT_BPS_MAX_MESSAGE,
});
const stockQtySchema = intField(QTY_MAX, {
  type: STOCK_QTY_INT_MESSAGE,
  min: STOCK_QTY_MIN_MESSAGE,
  max: STOCK_QTY_MAX_MESSAGE,
});
const lowStockThresholdSchema = intField(QTY_MAX, {
  type: LOW_STOCK_THRESHOLD_INT_MESSAGE,
  min: LOW_STOCK_THRESHOLD_MIN_MESSAGE,
  max: LOW_STOCK_THRESHOLD_MAX_MESSAGE,
});

export const calculateDiscountedCostCents = (
  priceCents: number,
  purchaseDiscountBps: number,
): number => {
  const remainingBasisPoints = PERCENT_BASIS_POINTS - purchaseDiscountBps;
  return Math.floor(
    (priceCents * remainingBasisPoints + HALF_PERCENT_BASIS_POINTS) /
      PERCENT_BASIS_POINTS,
  );
};

export type GrossMargin = {
  marginCents: number;
  marginBps: number | null;
};

export const calculateGrossMargin = (
  priceCents: number,
  costCents: number,
): GrossMargin => {
  const marginCents = priceCents - costCents;
  if (priceCents === 0) {
    return { marginCents, marginBps: null };
  }

  const absoluteNumerator = Math.abs(marginCents * PERCENT_BASIS_POINTS);
  const roundedAbsoluteMarginBps = Math.floor(
    (absoluteNumerator + Math.floor(priceCents / 2)) / priceCents,
  );
  const marginBps = Math.sign(marginCents) * roundedAbsoluteMarginBps;

  return { marginCents, marginBps };
};

// `brandCode` (código Mary Kay) opcional/nullable: ausência = não informado,
// `null` = limpar explicitamente no PATCH.
const brandCodeSchema = z
  .string()
  .trim()
  .max(BRAND_CODE_MAX_LENGTH, BRAND_CODE_MAX_MESSAGE)
  .nullable()
  .optional();

// Campos base sem os `.default` de estoque/limiar: reusados pelo update, onde
// aplicar default injetaria valor em PATCH que omite a chave (zeraria estoque).
const productBaseFields = {
  name: z
    .string({ error: NAME_INVALID_MESSAGE })
    .trim()
    .min(NAME_MIN_LENGTH, NAME_INVALID_MESSAGE),
  brandCode: brandCodeSchema,
  costCents: costCentsSchema,
  purchaseDiscountBps: purchaseDiscountBpsSchema.nullable(),
  priceCents: priceCentsSchema,
  stockQty: stockQtySchema,
  lowStockThreshold: lowStockThresholdSchema,
} as const;

// Contrato de criação: custo direto e desconto são modos mutuamente exclusivos;
// estoque default 0 e limiar default 1 quando ausentes.
export const createProductSchema = z
  .object({
    ...productBaseFields,
    costCents: costCentsSchema.optional(),
    purchaseDiscountBps: purchaseDiscountBpsSchema.nullable().optional(),
    stockQty: stockQtySchema.default(STOCK_QTY_DEFAULT),
    lowStockThreshold: lowStockThresholdSchema.default(
      LOW_STOCK_THRESHOLD_DEFAULT,
    ),
  })
  .superRefine((value, context) => {
    const hasCost = value.costCents !== undefined;
    const hasDiscount =
      value.purchaseDiscountBps !== undefined &&
      value.purchaseDiscountBps !== null;

    if (!hasCost && !hasDiscount) {
      context.addIssue({
        code: "custom",
        path: ["costCents"],
        message: COST_CENTS_INT_MESSAGE,
      });
    }

    if (hasCost && hasDiscount) {
      context.addIssue({
        code: "custom",
        path: ["purchaseDiscountBps"],
        message: COST_MODE_AMBIGUOUS_MESSAGE,
      });
    }
  });

export type CreateProductInput = z.input<typeof createProductSchema>;
export type CreateProduct = z.output<typeof createProductSchema>;

// PATCH parcial (sem os defaults): toda chave opcional; `brandCode` e a taxa
// aceitam `null` explícito. Custo direto e taxa não nula são ambíguos.
export const updateProductSchema = z
  .object(productBaseFields)
  .partial()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({ code: "custom", message: UPDATE_EMPTY_MESSAGE });
    }

    if (
      value.costCents !== undefined &&
      value.purchaseDiscountBps !== undefined &&
      value.purchaseDiscountBps !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["purchaseDiscountBps"],
        message: COST_MODE_AMBIGUOUS_MESSAGE,
      });
    }
  });

export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type UpdateProduct = z.output<typeof updateProductSchema>;

// Contrato de resposta (API → front). `stockQty` é físico; `reservedQty` e
// `availableQty` são derivados pela API. A disponibilidade pode ser negativa
// quando um ajuste físico ficar abaixo das reservas ativas (RF-05).
export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  brandCode: z.string().nullable(),
  costCents: z.number().int(),
  purchaseDiscountBps: purchaseDiscountBpsSchema.nullable(),
  priceCents: z.number().int(),
  stockQty: z.number().int(),
  reservedQty: z.number().int().min(0),
  availableQty: z.number().int(),
  lowStockThreshold: z.number().int(),
  lowStock: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Product = z.infer<typeof productSchema>;

// Query string traz "true"/"false" (texto); coagimos para boolean real.
// `z.coerce.boolean` não serve: qualquer string não-vazia vira true (inclusive
// "false"). `.optional()` fica por fora para não injetar a chave quando ausente.
const lowStockQuerySchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => (typeof value === "boolean" ? value : value === "true"))
  .optional();

// Query da listagem: paginação padrão + busca livre + filtro de estoque baixo.
export const productsListQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH, SEARCH_MAX_MESSAGE)
    .optional(),
  lowStock: lowStockQuerySchema,
});

export type ProductsListQueryInput = z.input<typeof productsListQuerySchema>;
export type ProductsListQuery = z.output<typeof productsListQuerySchema>;

// Agregado da consultora: capital parado, valor de venda do estoque e contagem
// de produtos em estoque baixo.
export const productsSummarySchema = z.object({
  stockCostCents: z.number().int().min(0),
  stockPriceCents: z.number().int().min(0),
  lowStockCount: z.number().int().min(0),
});

export type ProductsSummary = z.infer<typeof productsSummarySchema>;
