import type { OrderItem } from "@clientela/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  cancelOrderAction,
  deliverOrderAction,
  placeOrderAction,
  quickCreateClientAction,
  replaceOrderItemsAction,
  searchClientsAction,
} from "@/app/(crm)/crm/orders/actions";
import type { OrderFormProduct } from "@/components/orders/order-items-form";
import { OrderItemsForm } from "@/components/orders/order-items-form";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderTransitionButtons } from "@/components/orders/order-transition-buttons";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { listClients } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import { centsToReaisInput, formatBRL, formatDateBr } from "@/lib/format";
import { getOrder } from "@/lib/orders-api";
import { listProducts } from "@/lib/products-api";

const PAGE_TITLE = "Pedido";
const BACK_LABEL = "Voltar para pedidos";
const LIST_HREF = "/crm/orders";
const LOGIN_PATH = "/login";

const CREATED_LABEL = "Criado em";
const PLACED_LABEL = "Pedido em";
const DELIVERED_LABEL = "Entregue em";
const CANCELED_LABEL = "Cancelado em";
const TOTAL_LABEL = "Total";
const ITEMS_HEADING = "Itens";
const NO_ITEMS_TEXT = "Este pedido não tem itens.";
const EDIT_ITEMS_LABEL = "Salvar itens";
const QTY_TIMES = "×";
const FOR_CLIENT_PREFIX = "para";

const ISO_DATE_TIME_SEPARATOR = "T";
const PRODUCTS_PAGE_SIZE = 100;
const CLIENTS_PAGE_SIZE = 100;

const toDatePart = (isoDateTime: string): string =>
  isoDateTime.split(ISO_DATE_TIME_SEPARATOR)[0] ?? isoDateTime;

const itemSubtotalCents = (item: OrderItem): number =>
  item.qty * item.unitCostCents;

// Produto excluído (`productId` null — ADR-0013/RF-05): o item permanece no
// histórico do pedido, mas não pode ser oferecido no seletor de edição (não
// existe mais no catálogo). Filtrado do form de rascunho; ainda assim aparece
// na leitura do detalhe (via `productName` snapshot).
const hasProductId = (
  item: OrderItem,
): item is OrderItem & { productId: string } => item.productId !== null;

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

// Detalhe/edição de pedido (RSC async, server-first — RF-02/RF-03/RF-06/RF-07):
// `params` é uma Promise (Next 15). Busca o pedido e o catálogo (para o form
// de itens/sugestão de estoque baixo) EM PARALELO (`Promise.all`); 404 do
// pedido (inclui cross-tenant) ⇒ `notFound()`. Em `draft`, os itens são
// editáveis (`OrderItemsForm` ligado a `replaceOrderItemsAction` por `.bind` —
// referência DIRETA, lesson 2026-07-19); nos demais status, os itens são
// somente leitura. Botões de transição conforme o status atual.
export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { id } = await params;

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };

  const [orderResult, productsResult, clientsResult] = await Promise.all([
    getOrder(id, deps),
    listProducts({ perPage: PRODUCTS_PAGE_SIZE }, deps),
    listClients({ perPage: CLIENTS_PAGE_SIZE }, deps),
  ]);

  if (!orderResult.ok) {
    if (orderResult.notFound) {
      notFound();
    }
    throw new Error(orderResult.message);
  }

  const { order } = orderResult;
  const isDraft = order.status === "draft";

  // O catálogo e a lista de clientes só são indispensáveis para renderizar o
  // form de EDIÇÃO (draft); nos demais status a falha não impede ver o
  // pedido (itens são somente leitura, vindos do próprio pedido — RF-07).
  if (!productsResult.ok && isDraft) {
    throw new Error(productsResult.message);
  }
  if (!clientsResult.ok && isDraft) {
    throw new Error(clientsResult.message);
  }

  const products: OrderFormProduct[] = productsResult.ok
    ? productsResult.data.map((product) => ({
        id: product.id,
        name: product.name,
        costCents: product.costCents,
        stockQty: product.stockQty,
      }))
    : [];
  const lowStockProducts: OrderFormProduct[] = productsResult.ok
    ? productsResult.data
        .filter((product) => product.lowStock)
        .map((product) => ({
          id: product.id,
          name: product.name,
          costCents: product.costCents,
          stockQty: product.stockQty,
        }))
    : [];
  const clients = clientsResult.ok
    ? clientsResult.data.map((client) => ({
        id: client.id,
        name: client.name,
      }))
    : [];

  // Cliente excluída após criar o pedido ⇒ `clientId` E `clientName` vêm
  // null (RF-03/LGPD, vínculo apagado). Item de rascunho volta a "sem
  // cliente" na edição (consequência natural do SET NULL, decisão do plan).
  const defaultItems = order.items.filter(hasProductId).map((item) => ({
    productId: item.productId,
    qty: String(item.qty),
    unitCost: centsToReaisInput(item.unitCostCents),
    clientId: item.clientId ?? "",
  }));

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
          <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{TOTAL_LABEL}</dt>
          <dd className="font-heading text-lg font-semibold">
            {formatBRL(order.totalCents)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{CREATED_LABEL}</dt>
          <dd>{formatDateBr(toDatePart(order.createdAt))}</dd>
        </div>
        {order.placedAt ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{PLACED_LABEL}</dt>
            <dd>{formatDateBr(toDatePart(order.placedAt))}</dd>
          </div>
        ) : null}
        {order.deliveredAt ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{DELIVERED_LABEL}</dt>
            <dd>{formatDateBr(toDatePart(order.deliveredAt))}</dd>
          </div>
        ) : null}
        {order.canceledAt ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{CANCELED_LABEL}</dt>
            <dd>{formatDateBr(toDatePart(order.canceledAt))}</dd>
          </div>
        ) : null}
      </dl>

      {isDraft ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            {ITEMS_HEADING}
          </h2>
          <OrderItemsForm
            products={products}
            lowStockProducts={lowStockProducts}
            clients={clients}
            searchClientsAction={searchClientsAction}
            quickCreateClientAction={quickCreateClientAction}
            defaultItems={defaultItems}
            onSubmit={replaceOrderItemsAction.bind(null, order.id)}
            submitLabel={EDIT_ITEMS_LABEL}
          />
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            {ITEMS_HEADING}
          </h2>
          {order.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{NO_ITEMS_TEXT}</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {item.productName}
                    </span>
                    <span className="text-muted-foreground">
                      {item.qty} {QTY_TIMES} {formatBRL(item.unitCostCents)}
                    </span>
                    {item.clientName ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {FOR_CLIENT_PREFIX} {item.clientName}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-medium">
                    {formatBRL(itemSubtotalCents(item))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <OrderTransitionButtons
        order={order}
        placeOrderAction={placeOrderAction}
        deliverOrderAction={deliverOrderAction}
        cancelOrderAction={cancelOrderAction}
      />
    </div>
  );
}
