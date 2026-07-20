import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

// ---------------------------------------------------------------------------
// Enums + labels pt-BR (fonte única shared ← db; o schema Drizzle importa daqui,
// e o web precisa dos labels/enums sem tocar em `db/`). Padrão de leadStatus.
// ---------------------------------------------------------------------------

// `credit` = venda a prazo/fiado (gera recebíveis); os demais são à vista.
export const paymentMethodValues = ["cash", "pix", "card", "credit"] as const;

export type PaymentMethod = (typeof paymentMethodValues)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  card: "Cartão",
  credit: "A prazo",
};

// Venda não se apaga — cancela-se (invariante 5 do domínio).
export const saleStatusValues = ["completed", "canceled"] as const;

export type SaleStatus = (typeof saleStatusValues)[number];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: "Concluída",
  canceled: "Cancelada",
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

// Dia anterior a uma data (por partes): cruza fronteira de mês/ano sem `Date`.
const previousDayIso = (year: number, month: number, day: number): string => {
  if (day > 1) {
    return formatIsoDate(year, month, day - 1);
  }
  const previousMonthIndex = year * MONTHS_PER_YEAR + (month - 1) - 1;
  const previousYear = Math.floor(previousMonthIndex / MONTHS_PER_YEAR);
  const previousMonth = (previousMonthIndex % MONTHS_PER_YEAR) + 1;
  return formatIsoDate(
    previousYear,
    previousMonth,
    daysInMonth(previousYear, previousMonth),
  );
};

// "Ontem" pela data corrente do runtime (tolerância de 1 dia sobre a data do
// servidor — cobre o fuso da consultora sem lógica de timezone). Usa componentes
// locais do relógio; a aritmética de subtração é por partes.
const yesterdayIso = (): string => {
  const now = new Date();
  return previousDayIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

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
const INSTALLMENTS_DEFAULT = 1;

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
const PAYMENT_METHOD_INVALID_MESSAGE = "Forma de pagamento inválida";
const INSTALLMENTS_TYPE_MESSAGE = "Informe o número de parcelas (inteiro)";
const INSTALLMENTS_MIN_MESSAGE = "O número de parcelas deve ser no mínimo 1";
const INSTALLMENTS_MAX_MESSAGE = "O número de parcelas deve ser no máximo 24";
const FIRST_DUE_DATE_INVALID_MESSAGE =
  "Informe o primeiro vencimento (data válida)";
const FIRST_DUE_DATE_REQUIRED_MESSAGE =
  "Informe o primeiro vencimento para venda a prazo";
const FIRST_DUE_DATE_PAST_MESSAGE =
  "O primeiro vencimento não pode ser no passado";
const STATUS_INVALID_MESSAGE = "Status de venda inválido";

const CREDIT_PAYMENT_METHOD: PaymentMethod = "credit";

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

// Contrato de criação de venda. `total_cents >= installments` NÃO é validado
// aqui: o total é calculado no servidor (o cliente não o envia), então essa
// regra é do service. `firstDueDate` só é obrigatória para `credit` — via
// superRefine, que também recusa datas anteriores a ontem (comparação
// lexicográfica de ISO `yyyy-mm-dd`, válida por construção do formato).
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
    paymentMethod: z.enum(paymentMethodValues, {
      error: PAYMENT_METHOD_INVALID_MESSAGE,
    }),
    installments: z
      .number({ error: INSTALLMENTS_TYPE_MESSAGE })
      .int(INSTALLMENTS_TYPE_MESSAGE)
      .min(INSTALLMENTS_MIN, INSTALLMENTS_MIN_MESSAGE)
      .max(INSTALLMENTS_MAX, INSTALLMENTS_MAX_MESSAGE)
      .default(INSTALLMENTS_DEFAULT),
    firstDueDate: z.iso
      .date({ error: FIRST_DUE_DATE_INVALID_MESSAGE })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentMethod !== CREDIT_PAYMENT_METHOD) {
      return;
    }
    if (value.firstDueDate === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["firstDueDate"],
        message: FIRST_DUE_DATE_REQUIRED_MESSAGE,
      });
      return;
    }
    if (value.firstDueDate < yesterdayIso()) {
      ctx.addIssue({
        code: "custom",
        path: ["firstDueDate"],
        message: FIRST_DUE_DATE_PAST_MESSAGE,
      });
    }
  });

export type CreateSaleInput = z.input<typeof createSaleSchema>;
export type CreateSale = z.output<typeof createSaleSchema>;

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

// Recebível na resposta. `paidAt` null = pendente; `overdue` derivado pela API
// (`due_date < hoje && !paid_at`) com a data do servidor.
export const receivableSchema = z.object({
  id: z.uuid(),
  saleId: z.uuid(),
  amountCents: z.number().int(),
  dueDate: z.iso.date(),
  paidAt: z.iso.datetime().nullable(),
  overdue: z.boolean(),
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
  status: z.enum(saleStatusValues),
  soldAt: z.iso.datetime(),
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
