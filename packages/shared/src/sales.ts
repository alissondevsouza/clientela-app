import { z } from "zod";
import { paginationQuerySchema } from "./pagination";
import { appLocalDateIso } from "./time";

// ---------------------------------------------------------------------------
// Enums + labels pt-BR (fonte única shared ← db; o schema Drizzle importa daqui,
// e o web precisa dos labels/enums sem tocar em `db/`). Padrão de leadStatus.
// ---------------------------------------------------------------------------

// `credit` permanece apenas para ler o histórico anterior ao CRM-12. Novas
// vendas expressam o parcelamento em `paymentCondition`.
export const paymentMethodValues = ["cash", "pix", "card", "credit"] as const;

export type PaymentMethod = (typeof paymentMethodValues)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  card: "Cartão",
  credit: "A prazo",
};

export const createPaymentMethodValues = ["cash", "pix", "card"] as const;

export type CreatePaymentMethod = (typeof createPaymentMethodValues)[number];

// Venda não se apaga — cancela-se (invariante 5 do domínio).
export const saleStatusValues = ["open", "completed", "canceled"] as const;

export type SaleStatus = (typeof saleStatusValues)[number];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  open: "Em aberto",
  completed: "Concluída",
  canceled: "Cancelada",
};

export const deliveryStatusValues = ["pending", "delivered"] as const;

export type DeliveryStatus = (typeof deliveryStatusValues)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Aguardando entrega",
  delivered: "Entregue",
};

export const paymentStatusValues = [
  "pending",
  "partial",
  "paid",
  "voided",
] as const;

export type PaymentStatus = (typeof paymentStatusValues)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendente",
  partial: "Parcialmente paga",
  paid: "Paga",
  voided: "Anulada",
};

export const paymentConditionValues = [
  "received",
  "on_delivery",
  "installments",
] as const;

export type PaymentCondition = (typeof paymentConditionValues)[number];

export const PAYMENT_CONDITION_LABELS: Record<PaymentCondition, string> = {
  received: "Já recebi",
  on_delivery: "Receber na entrega",
  installments: "Parcelado",
};

export const cardTypeValues = ["debit", "credit"] as const;

export type CardType = (typeof cardTypeValues)[number];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  debit: "Débito",
  credit: "Crédito",
};

export const dueKindValues = ["scheduled", "on_delivery", "unknown"] as const;

export type DueKind = (typeof dueKindValues)[number];

export const DUE_KIND_LABELS: Record<DueKind, string> = {
  scheduled: "Agendado",
  on_delivery: "Na entrega",
  unknown: "Data histórica indisponível",
};

export const receivableStatusValues = ["pending", "paid", "voided"] as const;

export type ReceivableStatus = (typeof receivableStatusValues)[number];

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  pending: "Pendente",
  paid: "Paga",
  voided: "Anulada",
};

// ---------------------------------------------------------------------------
// Funções puras — aritmética de inteiros/string. Sem `Date` com fuso: datas ISO
// `yyyy-mm-dd` são manipuladas por partes para evitar drift de timezone.
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_PER_YEAR = 12;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const FEBRUARY = 2;
const LEAP_DAY = 29;

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

// Dias no mês (mês 1..12), com fevereiro bissexto correto.
const daysInMonth = (year: number, month: number): number => {
  if (month === FEBRUARY && isLeapYear(year)) {
    return LEAP_DAY;
  }
  const length = MONTH_LENGTHS[month - 1];
  if (length === undefined) {
    throw new Error(`Mês inválido: ${month}`);
  }
  return length;
};

const padNumber = (value: number, length: number): string =>
  String(value).padStart(length, "0");

const formatIsoDate = (year: number, month: number, day: number): string =>
  `${padNumber(year, 4)}-${padNumber(month, 2)}-${padNumber(day, 2)}`;

/**
 * Divide `totalCents` em `installments` parcelas inteiras cuja soma é exatamente
 * o total. Base = floor(total/n); o resto de centavos é distribuído +1 nas
 * PRIMEIRAS parcelas. Lança para inputs inválidos (n < 1 ou total < n) — a
 * validação de negócio (ex.: `total_cents >= installments`) acontece antes, no
 * service; aqui um input inválido é erro de programação, não da usuária.
 */
export function splitInstallmentAmounts(
  totalCents: number,
  installments: number,
): number[] {
  if (!Number.isInteger(installments) || installments < 1) {
    throw new Error(`Número de parcelas inválido: ${installments}`);
  }
  if (!Number.isInteger(totalCents) || totalCents < installments) {
    throw new Error(
      `Total (${totalCents}) menor que o número de parcelas (${installments})`,
    );
  }
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents - base * installments;
  return Array.from({ length: installments }, (_unused, index) =>
    index < remainder ? base + 1 : base,
  );
}

/**
 * Soma `monthsToAdd` meses a uma data ISO `yyyy-mm-dd`, ancorada no DIA ORIGINAL
 * (sem drift): 31/jan +1 = 28/fev, mas 31/jan +2 = 31/mar (não 28/mar). Quando o
 * dia não existe no mês alvo, faz clamp para o último dia daquele mês; anos
 * bissextos tratados corretamente.
 */
export function addMonthsClamped(isoDate: string, monthsToAdd: number): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (match === null) {
    throw new Error(`Data ISO inválida: ${isoDate}`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    throw new Error(`Data ISO inválida: ${isoDate}`);
  }
  if (!Number.isInteger(monthsToAdd)) {
    throw new Error(`Meses a somar inválido: ${monthsToAdd}`);
  }
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const totalMonthIndex = year * MONTHS_PER_YEAR + (month - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonthIndex / MONTHS_PER_YEAR);
  const targetMonth = (totalMonthIndex % MONTHS_PER_YEAR) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return formatIsoDate(targetYear, targetMonth, targetDay);
}

// ---------------------------------------------------------------------------
// Schemas de contrato
// ---------------------------------------------------------------------------

const QTY_MIN = 1;
const QTY_MAX = 1000;
const UNIT_PRICE_MAX_CENTS = 100_000_000;
const ITEMS_MIN = 1;
const ITEMS_MAX = 50;
const INSTALLMENTS_MIN = 1;
const INSTALLMENTS_MAX = 24;

const CLIENT_ID_INVALID_MESSAGE = "Cliente inválida";
const PRODUCT_ID_INVALID_MESSAGE = "Produto inválido";
const QTY_TYPE_MESSAGE = "Informe a quantidade (número inteiro)";
const QTY_MIN_MESSAGE = "A quantidade deve ser no mínimo 1";
const QTY_MAX_MESSAGE = "A quantidade deve ser no máximo 1.000";
const UNIT_PRICE_TYPE_MESSAGE =
  "Informe o preço unitário em centavos (número inteiro)";
const UNIT_PRICE_MIN_MESSAGE = "O preço unitário não pode ser negativo";
const UNIT_PRICE_MAX_MESSAGE =
  "O preço unitário deve ser no máximo R$ 1.000.000,00";
const ITEMS_INVALID_MESSAGE = "Informe ao menos um item da venda";
const ITEMS_MAX_MESSAGE = "A venda deve ter no máximo 50 itens";
const INSTALLMENTS_TYPE_MESSAGE = "Informe o número de parcelas (inteiro)";
const INSTALLMENTS_MIN_MESSAGE = "O número de parcelas deve ser no mínimo 1";
const INSTALLMENTS_MAX_MESSAGE = "O número de parcelas deve ser no máximo 24";
const FIRST_DUE_DATE_INVALID_MESSAGE =
  "Informe o primeiro vencimento (data válida)";
const FIRST_DUE_DATE_REQUIRED_MESSAGE =
  "Informe o primeiro vencimento para pagamento parcelado";
const FIRST_DUE_DATE_PAST_MESSAGE =
  "O primeiro vencimento não pode ser anterior à data da venda";
const SOLD_ON_INVALID_MESSAGE = "Informe a data da venda (data válida)";
const SOLD_ON_FUTURE_MESSAGE = "A data da venda não pode ser no futuro";
// Piso para barrar erro de digitação de ano (ex.: "2005") sem bloquear
// histórico legítimo (RF-01). Consultora começou o negócio depois dessa data.
export const SOLD_ON_MIN_DATE = "2015-01-01";
const SOLD_ON_MIN_DATE_MESSAGE =
  "A data da venda não pode ser anterior a 01/01/2015";
const STATUS_INVALID_MESSAGE = "Status de venda inválido";
const PAYMENT_METHOD_REQUIRED_MESSAGE = "Escolha a forma de pagamento";
const DELIVERY_STATUS_REQUIRED_MESSAGE = "Informe a situação da entrega";
const PAYMENT_CONDITION_REQUIRED_MESSAGE = "Escolha a condição de pagamento";
const CARD_TYPE_REQUIRED_MESSAGE = "Escolha o tipo do cartão";
const CARD_TYPE_FORBIDDEN_MESSAGE =
  "Tipo de cartão só pode ser informado para pagamento com cartão";
const INSTALLMENTS_FORBIDDEN_MESSAGE =
  "Esta condição de pagamento permite somente 1 parcela";
const INSTALLMENTS_REQUIRED_MESSAGE =
  "Informe ao menos 2 parcelas para pagamento parcelado";
const INSTALLMENTS_CONDITION_INVALID_MESSAGE =
  "Esta forma de pagamento não permite parcelamento";
const FIRST_DUE_DATE_FORBIDDEN_MESSAGE =
  "O primeiro vencimento só pode ser informado para pagamento parcelado";
export const TOTAL_CENTS_INSTALLMENTS_MESSAGE =
  "O total da venda precisa ter ao menos R$ 0,01 por parcela";

// Item do payload de criação. `unitPriceCents` opcional: ausente ⇒ o service usa
// o preço atual do produto (snapshot). Sempre inteiro em centavos.
const createSaleItemSchema = z.object({
  productId: z.uuid({ error: PRODUCT_ID_INVALID_MESSAGE }),
  qty: z
    .number({ error: QTY_TYPE_MESSAGE })
    .int(QTY_TYPE_MESSAGE)
    .min(QTY_MIN, QTY_MIN_MESSAGE)
    .max(QTY_MAX, QTY_MAX_MESSAGE),
  unitPriceCents: z
    .number({ error: UNIT_PRICE_TYPE_MESSAGE })
    .int(UNIT_PRICE_TYPE_MESSAGE)
    .min(0, UNIT_PRICE_MIN_MESSAGE)
    .max(UNIT_PRICE_MAX_CENTS, UNIT_PRICE_MAX_MESSAGE)
    .optional(),
});

// O total vem do catálogo travado pelo service, por isso sua regra não pertence
// ao payload HTTP. Este schema só aceita os métodos criáveis; `credit` existe
// exclusivamente nos contratos de leitura do histórico.
export const createSaleSchema = z
  .object({
    clientId: z
      .uuid({ error: CLIENT_ID_INVALID_MESSAGE })
      .nullable()
      .optional(),
    items: z
      .array(createSaleItemSchema, { error: ITEMS_INVALID_MESSAGE })
      .min(ITEMS_MIN, ITEMS_INVALID_MESSAGE)
      .max(ITEMS_MAX, ITEMS_MAX_MESSAGE),
    paymentMethod: z.enum(createPaymentMethodValues, {
      error: PAYMENT_METHOD_REQUIRED_MESSAGE,
    }),
    deliveryStatus: z
      .enum(deliveryStatusValues, {
        error: DELIVERY_STATUS_REQUIRED_MESSAGE,
      })
      .default("delivered"),
    paymentCondition: z
      .enum(paymentConditionValues, {
        error: PAYMENT_CONDITION_REQUIRED_MESSAGE,
      })
      .default("received"),
    cardType: z.enum(cardTypeValues).optional(),
    installments: z
      .number({ error: INSTALLMENTS_TYPE_MESSAGE })
      .int(INSTALLMENTS_TYPE_MESSAGE)
      .min(INSTALLMENTS_MIN, INSTALLMENTS_MIN_MESSAGE)
      .max(INSTALLMENTS_MAX, INSTALLMENTS_MAX_MESSAGE)
      .default(1),
    firstDueDate: z.iso
      .date({ error: FIRST_DUE_DATE_INVALID_MESSAGE })
      .optional(),
    // Dia local (`yyyy-mm-dd`) em que a venda aconteceu, distinto do `soldAt`
    // (instante) da resposta. Ausente ⇒ o service assume hoje — mantém
    // compatibilidade com todo chamador atual (plan.md).
    soldOn: z.iso.date({ error: SOLD_ON_INVALID_MESSAGE }).optional(),
  })
  .superRefine((value, ctx) => {
    const isCard = value.paymentMethod === "card";
    const isCreditCard = value.cardType === "credit";
    const isInstallments = value.paymentCondition === "installments";
    const todayIso = appLocalDateIso(new Date().toISOString());

    if (value.soldOn !== undefined) {
      if (value.soldOn > todayIso) {
        ctx.addIssue({
          code: "custom",
          path: ["soldOn"],
          message: SOLD_ON_FUTURE_MESSAGE,
        });
      } else if (value.soldOn < SOLD_ON_MIN_DATE) {
        ctx.addIssue({
          code: "custom",
          path: ["soldOn"],
          message: SOLD_ON_MIN_DATE_MESSAGE,
        });
      }
    }

    if (isCard && value.cardType === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["cardType"],
        message: CARD_TYPE_REQUIRED_MESSAGE,
      });
    }

    if (!isCard && value.cardType !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["cardType"],
        message: CARD_TYPE_FORBIDDEN_MESSAGE,
      });
    }

    if (isInstallments) {
      if (value.paymentMethod === "cash" || (isCard && !isCreditCard)) {
        ctx.addIssue({
          code: "custom",
          path: ["paymentCondition"],
          message: INSTALLMENTS_CONDITION_INVALID_MESSAGE,
        });
      }
      if (value.installments === 1) {
        ctx.addIssue({
          code: "custom",
          path: ["installments"],
          message: INSTALLMENTS_REQUIRED_MESSAGE,
        });
      }
      if (value.firstDueDate === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["firstDueDate"],
          message: FIRST_DUE_DATE_REQUIRED_MESSAGE,
        });
      } else if (value.firstDueDate < (value.soldOn ?? todayIso)) {
        ctx.addIssue({
          code: "custom",
          path: ["firstDueDate"],
          message: FIRST_DUE_DATE_PAST_MESSAGE,
        });
      }
      return;
    }

    if ((!isCard || !isCreditCard) && value.installments !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: INSTALLMENTS_FORBIDDEN_MESSAGE,
      });
    }
    if (value.firstDueDate !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["firstDueDate"],
        message: FIRST_DUE_DATE_FORBIDDEN_MESSAGE,
      });
    }
  });

export type CreateSaleInput = z.input<typeof createSaleSchema>;
export type CreateSale = z.output<typeof createSaleSchema>;

// Regra autoritativa aplicada APÓS o cálculo do total pelo servidor. O schema
// preserva o path `installments` para a API devolver 422 no campo acionável.
export const saleTotalInstallmentsSchema = z
  .object({
    totalCents: z.number().int().min(0),
    installments: z.number().int().min(INSTALLMENTS_MIN).max(INSTALLMENTS_MAX),
  })
  .superRefine((value, ctx) => {
    if (value.totalCents !== 0 && value.totalCents < value.installments) {
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: TOTAL_CENTS_INSTALLMENTS_MESSAGE,
      });
    }
  });

export const validateSaleTotalCents = (
  totalCents: number,
  installments: number,
) => saleTotalInstallmentsSchema.safeParse({ totalCents, installments });

// Item da venda na resposta (snapshot). `productId` nullable: produto excluído
// ⇒ SET NULL, mas `productName` preserva o histórico legível.
export const saleItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  productName: z.string(),
  qty: z.number().int(),
  unitPriceCents: z.number().int(),
});

export type SaleItem = z.infer<typeof saleItemSchema>;

// Recebível na resposta. A API deriva `status` e `overdue` dentro do mesmo
// snapshot de leitura; cobranças anuladas nunca têm ação de baixa/estorno.
export const receivableSchema = z
  .object({
    id: z.uuid(),
    saleId: z.uuid(),
    amountCents: z.number().int(),
    dueDate: z.iso.date().nullable(),
    dueKind: z.enum(dueKindValues),
    paidAt: z.iso.datetime().nullable(),
    voidedAt: z.iso.datetime().nullable(),
    status: z.enum(receivableStatusValues),
    overdue: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((value, ctx) => {
    const needsScheduledDate = value.dueKind === "scheduled";
    if (needsScheduledDate && value.dueDate === null) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Informe a data para vencimento agendado",
      });
    }
    if (!needsScheduledDate && value.dueDate !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Este tipo de vencimento não possui data agendada",
      });
    }
  });

export type Receivable = z.infer<typeof receivableSchema>;

// Item da lista "quem me deve" (RF-06): recebível + dados da venda/cliente para
// exibir e contatar. `clientId` null e `clientWhatsapp` null quando a venda não
// tem cliente vinculada (anônima) ou a cliente foi excluída (SET NULL);
// `clientName` é o snapshot preservado na venda.
export const receivableListItemSchema = receivableSchema.extend({
  clientId: z.uuid().nullable(),
  clientName: z.string(),
  clientWhatsapp: z.string().nullable(),
});

export type ReceivableListItem = z.infer<typeof receivableListItemSchema>;

// Resposta completa da venda (detalhe): venda + itens + recebíveis num payload.
// `clientId` nullable (cliente excluída ⇒ SET NULL); `clientName` é snapshot.
export const saleSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid().nullable(),
  clientName: z.string(),
  totalCents: z.number().int(),
  paymentMethod: z.enum(paymentMethodValues),
  paymentCondition: z.enum(paymentConditionValues),
  cardType: z.enum(cardTypeValues).nullable(),
  installments: z.number().int().min(INSTALLMENTS_MIN).max(INSTALLMENTS_MAX),
  paymentPlanKnown: z.boolean(),
  status: z.enum(saleStatusValues),
  deliveryStatus: z.enum(deliveryStatusValues),
  paymentStatus: z.enum(paymentStatusValues),
  paidCents: z.number().int().min(0),
  outstandingCents: z.number().int().min(0),
  soldAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  items: z.array(saleItemSchema),
  receivables: z.array(receivableSchema),
});

export type Sale = z.infer<typeof saleSchema>;

// Item da listagem: mesma venda SEM os arrays (itens/recebíveis) — a listagem
// não carrega os agregados.
export const saleListItemSchema = saleSchema.omit({
  items: true,
  receivables: true,
});

export type SaleListItem = z.infer<typeof saleListItemSchema>;

// Query da listagem de vendas: paginação padrão + filtros opcionais.
export const salesListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(saleStatusValues, { error: STATUS_INVALID_MESSAGE })
    .optional(),
  clientId: z.uuid({ error: CLIENT_ID_INVALID_MESSAGE }).optional(),
});

export type SalesListQueryInput = z.input<typeof salesListQuerySchema>;
export type SalesListQuery = z.output<typeof salesListQuerySchema>;

// Query string traz "true"/"false" (texto); coagimos para boolean real. Mesmo
// padrão de `lowStock` em products: `z.coerce.boolean` não serve ("false" viraria
// true). `pending` default true ⇒ a lista "quem me deve" mostra só pendentes.
const pendingQuerySchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => (typeof value === "boolean" ? value : value === "true"))
  .default(true);

export const receivablesListQuerySchema = paginationQuerySchema.extend({
  pending: pendingQuerySchema,
});

export type ReceivablesListQueryInput = z.input<
  typeof receivablesListQuerySchema
>;
export type ReceivablesListQuery = z.output<typeof receivablesListQuerySchema>;

// Agregado "a receber" (SUM SQL escopado): pendente total, atrasado e contagem
// de atrasados. Total financeiro nunca derivado de lista paginada.
export const receivablesSummarySchema = z.object({
  pendingCents: z.number().int().min(0),
  overdueCents: z.number().int().min(0),
  overdueCount: z.number().int().min(0),
});

export type ReceivablesSummary = z.infer<typeof receivablesSummarySchema>;
