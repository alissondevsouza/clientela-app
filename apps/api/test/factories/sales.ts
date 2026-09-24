import type {
  CardType,
  DueKind,
  PaymentCondition,
  PaymentMethod,
  SaleStatus,
} from "@clientela/shared";
import type { Database } from "../../src/db/client";
import { receivables, saleItems, sales } from "../../src/db/schema";

const DEFAULT_CLIENT_NAME = "Cliente Factory";
const DEFAULT_PAYMENT_METHOD: PaymentMethod = "cash";
const DEFAULT_PAYMENT_CONDITION: PaymentCondition = "received";
const DEFAULT_INSTALLMENTS = 1;

export type SaleFactoryItem = {
  productId?: string | null;
  productName: string;
  qty: number;
  unitPriceCents: number;
  // Snapshot do custo no momento da venda (sale_items.costCents) — a factory
  // não deriva de um produto real; quem monta o cenário informa o valor.
  costCents: number;
};

export type SaleFactoryReceivable = {
  amountCents: number;
  dueKind: DueKind;
  // "yyyy-mm-dd"; exigido quando dueKind = "scheduled", proibido nos demais
  // (receivables_due_date_kind_check).
  dueDate?: string | null;
  paidAt?: Date | null;
  voidedAt?: Date | null;
};

export type SaleFactorySpec = {
  status: SaleStatus;
  soldAt: Date;
  // `true` ⇒ entregue no mesmo instante da venda; uma `Date` explícita ⇒
  // entregue naquele instante; omitido/`false` ⇒ não entregue.
  delivered?: boolean | Date;
  clientId?: string | null;
  clientName?: string;
  paymentMethod?: PaymentMethod;
  paymentCondition?: PaymentCondition;
  cardType?: CardType | null;
  installments?: number;
  items: SaleFactoryItem[];
  receivables: SaleFactoryReceivable[];
};

const resolveDeliveredAt = (
  delivered: boolean | Date | undefined,
  soldAt: Date,
): Date | null => {
  if (delivered instanceof Date) {
    return delivered;
  }
  return delivered === true ? soldAt : null;
};

const maxDate = (...dates: Array<Date | null | undefined>): Date => {
  const valid = dates.filter((date): date is Date => date instanceof Date);
  const [first, ...rest] = valid;
  if (!first) {
    throw new Error(
      "factory createSale: nenhum instante válido para calcular updated_at",
    );
  }
  return rest.reduce(
    (latest, current) => (current > latest ? current : latest),
    first,
  );
};

// Valida a spec ANTES de tocar o banco: uma spec incoerente vira uma
// mensagem clara aqui, não uma violação de CHECK genérica do Postgres.
const validateSpec = (
  spec: SaleFactorySpec,
  deliveredAt: Date | null,
  totalCents: number,
): void => {
  if (deliveredAt && deliveredAt < spec.soldAt) {
    throw new Error(
      "factory createSale: deliveredAt não pode ser anterior a soldAt",
    );
  }

  if (spec.status === "completed" && !deliveredAt) {
    throw new Error(
      "factory createSale: venda completed exige delivered/deliveredAt",
    );
  }

  // O total é a soma de TODAS as parcelas — pagas, pendentes OU anuladas.
  // Anular uma cobrança (sales.repository.ts#cancel) não apaga quanto ela
  // valia, só que ela deixou de ser exigível; totalCents (snapshot dos itens)
  // nunca muda com o cancelamento. Por isso a soma coerente inclui as
  // anuladas — do contrário não seria possível representar o estado real de
  // uma venda cancelada (todas as parcelas viram voided, sem tocar o total).
  const receivablesTotal = spec.receivables.reduce(
    (sum, receivable) => sum + receivable.amountCents,
    0,
  );
  if (receivablesTotal !== totalCents) {
    throw new Error(
      `factory createSale: soma das cobranças (${receivablesTotal}) difere ` +
        `do total dos itens (${totalCents})`,
    );
  }

  if (spec.status === "completed") {
    const allPaidAndActive = spec.receivables.every(
      (receivable) => receivable.paidAt && !receivable.voidedAt,
    );
    if (!allPaidAndActive) {
      throw new Error(
        "factory createSale: venda completed exige todas as cobranças pagas (nenhuma anulada)",
      );
    }
  }

  for (const receivable of spec.receivables) {
    if (receivable.paidAt && receivable.voidedAt) {
      throw new Error(
        "factory createSale: uma cobrança não pode estar paga e anulada ao mesmo tempo",
      );
    }
    if (receivable.voidedAt && receivable.voidedAt < spec.soldAt) {
      throw new Error(
        "factory createSale: voidedAt não pode ser anterior a soldAt",
      );
    }
    const expectsDueDate = receivable.dueKind === "scheduled";
    if (expectsDueDate && !receivable.dueDate) {
      throw new Error('factory createSale: dueKind "scheduled" exige dueDate');
    }
    if (!expectsDueDate && receivable.dueDate) {
      throw new Error(
        `factory createSale: dueKind "${receivable.dueKind}" exige dueDate nulo`,
      );
    }
  }
};

// Semeadura DIRETA da matriz temporal (venda + itens + cobranças), para os
// testes de integração dos Milestones 3/4 — bypassa POST /sales (que não
// aceita todo estado histórico possível, ex.: venda cancelada cujas parcelas
// já viraram voided). `createdAt` = `soldAt`: o CHECK de sales.ts NÃO
// relaciona created_at a sold_at (comentário em sales.ts), então usar o
// próprio soldAt evita depender do relógio real (testing.md) e simplifica o
// cálculo de updated_at — sempre o maior instante entre os campos da venda e
// das cobranças, o que satisfaz todo `<= updated_at` dos CHECKs por
// construção, para qualquer soldAt passado.
export const createSale = async (
  db: Database,
  consultantId: string,
  spec: SaleFactorySpec,
): Promise<{ id: string; totalCents: number }> => {
  const deliveredAt = resolveDeliveredAt(spec.delivered, spec.soldAt);
  const totalCents = spec.items.reduce(
    (sum, item) => sum + item.qty * item.unitPriceCents,
    0,
  );

  validateSpec(spec, deliveredAt, totalCents);

  const completedAt =
    spec.status === "completed" && deliveredAt
      ? maxDate(
          deliveredAt,
          ...spec.receivables.map((receivable) => receivable.paidAt ?? null),
        )
      : null;

  const canceledAt =
    spec.status === "canceled" ? (deliveredAt ?? spec.soldAt) : null;

  const updatedAt = maxDate(
    spec.soldAt,
    deliveredAt,
    completedAt,
    canceledAt,
    ...spec.receivables.flatMap((receivable) => [
      receivable.paidAt ?? null,
      receivable.voidedAt ?? null,
    ]),
  );

  const [row] = await db
    .insert(sales)
    .values({
      consultantId,
      clientId: spec.clientId ?? null,
      clientName: spec.clientName ?? DEFAULT_CLIENT_NAME,
      totalCents,
      paymentMethod: spec.paymentMethod ?? DEFAULT_PAYMENT_METHOD,
      paymentCondition: spec.paymentCondition ?? DEFAULT_PAYMENT_CONDITION,
      cardType: spec.cardType ?? null,
      installments: spec.installments ?? DEFAULT_INSTALLMENTS,
      status: spec.status,
      soldAt: spec.soldAt,
      deliveredAt,
      completedAt,
      canceledAt,
      createdAt: spec.soldAt,
      updatedAt,
    })
    .returning({ id: sales.id });

  if (!row) {
    throw new Error("factory createSale: falha ao inserir a venda");
  }

  if (spec.items.length > 0) {
    await db.insert(saleItems).values(
      spec.items.map((item) => ({
        saleId: row.id,
        productId: item.productId ?? null,
        productName: item.productName,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        costCents: item.costCents,
      })),
    );
  }

  if (spec.receivables.length > 0) {
    await db.insert(receivables).values(
      spec.receivables.map((receivable) => ({
        saleId: row.id,
        amountCents: receivable.amountCents,
        dueDate: receivable.dueDate ?? null,
        dueKind: receivable.dueKind,
        paidAt: receivable.paidAt ?? null,
        voidedAt: receivable.voidedAt ?? null,
        createdAt: spec.soldAt,
        updatedAt,
      })),
    );
  }

  return { id: row.id, totalCents };
};
