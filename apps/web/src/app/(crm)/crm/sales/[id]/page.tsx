import {
  CARD_TYPE_LABELS,
  DELIVERY_STATUS_LABELS,
  PAYMENT_CONDITION_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type Sale,
  type SaleItem,
} from "@clientela/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CancelSaleButton } from "@/components/sales/cancel-sale-button";
import { DeliverSaleButton } from "@/components/sales/deliver-sale-button";
import { SaleReceivableRow } from "@/components/sales/sale-receivable-row";
import { SaleStatusBadge } from "@/components/sales/sale-status-badge";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { formatBRL, formatDateBr } from "@/lib/format";
import { getSale } from "@/lib/sales-api";

const PAGE_TITLE = "Venda";
const BACK_LABEL = "Voltar para vendas";
const LIST_HREF = "/crm/sales";
const LOGIN_PATH = "/login";

const CLIENT_LABEL = "Cliente";
const SOLD_AT_LABEL = "Data";
const PAYMENT_LABEL = "Forma de pagamento";
const STATUS_LABEL = "Status";
const ITEMS_HEADING = "Itens";
const RECEIVABLES_HEADING = "Recebíveis";
const TOTAL_LABEL = "Total";
const NO_CLIENT_TEXT = "—";
const QTY_TIMES = "×";
const CANCELED_NOTICE = "Venda cancelada";
const CANCELED_NOTICE_DETAIL =
  "Esta venda foi cancelada: as parcelas pendentes foram anuladas e seguem no histórico. Os itens já entregues voltaram ao estoque.";

const DELIVERY_LABEL = "Entrega";
const DELIVERED_AT_PREFIX = "Entregue em";
const PAYMENT_STATUS_LABEL = "Pagamento";
const OUTSTANDING_PREFIX = "Falta receber:";
const UNKNOWN_PLAN_NOTICE =
  "Detalhes do parcelamento não disponíveis no histórico.";

const PLAN_SEPARATOR = " · ";

const ISO_DATE_TIME_SEPARATOR = "T";
const SALE_CANCELED = "canceled";

// Plano de pagamento em uma linha: forma, tipo de cartão quando houver e
// condição (com o número de parcelas quando parcelado). Histórico sem plano
// recuperável mostra só o que existe — o aviso fica no bloco abaixo.
const describePaymentPlan = (sale: Sale): string => {
  const parts = [PAYMENT_METHOD_LABELS[sale.paymentMethod]];
  if (sale.cardType !== null) {
    parts.push(CARD_TYPE_LABELS[sale.cardType]);
  }
  if (!sale.paymentPlanKnown) {
    return parts.join(PLAN_SEPARATOR);
  }
  parts.push(
    sale.paymentCondition === "installments"
      ? `${PAYMENT_CONDITION_LABELS.installments} em ${sale.installments}×`
      : PAYMENT_CONDITION_LABELS[sale.paymentCondition],
  );
  return parts.join(PLAN_SEPARATOR);
};

const clientDetailHref = (clientId: string): string =>
  `/crm/clients/${clientId}`;

// `soldAt` chega como ISO datetime; a UI mostra só a data (dd/mm/aaaa).
// `formatDateBr` espera `yyyy-mm-dd`, então extraímos a parte antes do `T`
// (fail-safe: valor cru se o formato fugir do esperado).
const toDatePart = (isoDateTime: string): string =>
  isoDateTime.split(ISO_DATE_TIME_SEPARATOR)[0] ?? isoDateTime;

const itemSubtotalCents = (item: SaleItem): number =>
  item.qty * item.unitPriceCents;

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type SaleDetailPageProps = {
  params: Promise<{ id: string }>;
};

// Detalhe da venda (RSC async, server-first — RF-10): `params` é Promise (Next 15).
// Busca a venda com o Bearer do cookie; 404 (inclui cross-tenant) ⇒ `notFound()`
// (usa o `not-found.tsx` local); falha genérica ⇒ `throw` (cai no `error.tsx`).
// Mostra cliente (link para o cadastro quando vinculada; senão o snapshot puro —
// cliente excluída/anônima), itens com snapshot de nome/preço e subtotal, total,
// recebíveis (baixa/estorno) e o cancelamento em 2 passos (só para venda ativa).
export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const { id } = await params;

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const result = await getSale(id, {
    fetchImpl: fetch,
    apiUrl: loadWebEnv().API_URL,
    token,
  });

  if (!result.ok) {
    if (result.notFound) {
      notFound();
    }
    throw new Error(result.message);
  }

  const { sale } = result;
  const isCanceled = sale.status === SALE_CANCELED;
  const clientLabel =
    sale.clientName.length > 0 ? sale.clientName : NO_CLIENT_TEXT;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={LIST_HREF}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {BACK_LABEL}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold break-words">
            {PAGE_TITLE}
          </h1>
          <SaleStatusBadge status={sale.status} />
        </div>
      </div>

      {isCanceled ? (
        <div className="flex flex-col gap-1 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            {CANCELED_NOTICE}
          </p>
          <p className="text-sm text-muted-foreground">
            {CANCELED_NOTICE_DETAIL}
          </p>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{CLIENT_LABEL}</dt>
          <dd>
            {sale.clientId !== null ? (
              <Link
                href={clientDetailHref(sale.clientId)}
                className="font-medium text-primary hover:underline focus-visible:underline"
              >
                {clientLabel}
              </Link>
            ) : (
              clientLabel
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{SOLD_AT_LABEL}</dt>
          <dd>{formatDateBr(toDatePart(sale.soldAt))}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{PAYMENT_LABEL}</dt>
          <dd>{describePaymentPlan(sale)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{STATUS_LABEL}</dt>
          <dd>
            <SaleStatusBadge status={sale.status} />
          </dd>
        </div>
        {/* Entrega e pagamento são estados INDEPENDENTES do status (CRM-12):
            "Em aberto" sozinho não diz o que falta. Sempre em texto. */}
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{DELIVERY_LABEL}</dt>
          <dd>
            {DELIVERY_STATUS_LABELS[sale.deliveryStatus]}
            {sale.deliveredAt !== null ? (
              <span className="block text-xs text-muted-foreground">
                {DELIVERED_AT_PREFIX}{" "}
                {formatDateBr(toDatePart(sale.deliveredAt))}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{PAYMENT_STATUS_LABEL}</dt>
          <dd>
            {PAYMENT_STATUS_LABELS[sale.paymentStatus]}
            {sale.outstandingCents > 0 ? (
              <span className="block text-xs text-muted-foreground">
                {OUTSTANDING_PREFIX} {formatBRL(sale.outstandingCents)}
              </span>
            ) : null}
          </dd>
        </div>
        {!sale.paymentPlanKnown ? (
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <dd className="text-xs text-muted-foreground">
              {UNKNOWN_PLAN_NOTICE}
            </dd>
          </div>
        ) : null}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">{ITEMS_HEADING}</h2>
        <ul className="flex list-none flex-col gap-2 p-0">
          {sale.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium break-words">
                  {item.productName}
                </span>
                <span className="text-muted-foreground">
                  {item.qty} {QTY_TIMES} {formatBRL(item.unitPriceCents)}
                </span>
              </div>
              <span className="shrink-0 font-medium">
                {formatBRL(itemSubtotalCents(item))}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="font-medium">{TOTAL_LABEL}</span>
          <span className="font-heading text-lg font-semibold">
            {formatBRL(sale.totalCents)}
          </span>
        </div>
      </section>

      {sale.receivables.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            {RECEIVABLES_HEADING}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {sale.receivables.map((receivable) => (
              <li key={receivable.id}>
                <SaleReceivableRow
                  receivable={receivable}
                  saleId={sale.id}
                  canManage={!isCanceled}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isCanceled && sale.deliveryStatus === "pending" ? (
        <DeliverSaleButton saleId={sale.id} />
      ) : null}
      {!isCanceled ? (
        <CancelSaleButton
          saleId={sale.id}
          delivered={sale.deliveryStatus === "delivered"}
        />
      ) : null}
    </div>
  );
}
