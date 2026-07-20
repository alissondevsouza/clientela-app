import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createOrderAction,
  quickCreateClientAction,
  searchClientsAction,
} from "@/app/(crm)/crm/orders/actions";
import type { OrderFormProduct } from "@/components/orders/order-items-form";
import { OrderItemsForm } from "@/components/orders/order-items-form";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { listClients } from "@/lib/clients-api";
import { loadWebEnv } from "@/lib/env";
import { listProducts } from "@/lib/products-api";

const PAGE_TITLE = "Novo pedido";
const SUBMIT_LABEL = "Criar pedido";
const BACK_LABEL = "Voltar para pedidos";
const LIST_HREF = "/crm/orders";
const LOGIN_PATH = "/login";

// Teto de paginação de produtos (`PER_PAGE_MAX` do contrato compartilhado):
// cobre o catálogo típico de uma consultora Mary Kay num único fetch. Sem
// busca/paginação no seletor de itens nesta task — escopo do form é a lista
// completa recebida do RSC (RF-07/RF-08).
const PRODUCTS_PAGE_SIZE = 100;

// Primeira página de clientes (RF-05) para popular o seletor por item sem
// depender de busca digitada logo de cara; a base cresce sem limite, então a
// busca (`searchClientsAction`) cobre o restante.
const CLIENTS_PAGE_SIZE = 100;

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Criação de pedido em rascunho (RSC, server-first — RF-01/RF-07/RF-08): busca
// o catálogo da consultora (para o seletor de itens e a sugestão de estoque
// baixo, já filtrada aqui no servidor via `product.lowStock`) e renderiza o
// form em modo criação. A Server Action `createOrderAction` valida, cria e
// redireciona para o detalhe.
export default async function NewOrderPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const deps = { fetchImpl: fetch, apiUrl: loadWebEnv().API_URL, token };
  const [productsResult, clientsResult] = await Promise.all([
    listProducts({ perPage: PRODUCTS_PAGE_SIZE }, deps),
    listClients({ perPage: CLIENTS_PAGE_SIZE }, deps),
  ]);

  if (!productsResult.ok) {
    throw new Error(productsResult.message);
  }
  if (!clientsResult.ok) {
    throw new Error(clientsResult.message);
  }

  const products: OrderFormProduct[] = productsResult.data.map((product) => ({
    id: product.id,
    name: product.name,
    costCents: product.costCents,
    stockQty: product.stockQty,
  }));
  const lowStockProducts = productsResult.data
    .filter((product) => product.lowStock)
    .map((product) => ({
      id: product.id,
      name: product.name,
      costCents: product.costCents,
      stockQty: product.stockQty,
    }));
  const clients = clientsResult.data.map((client) => ({
    id: client.id,
    name: client.name,
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
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
      </div>

      <OrderItemsForm
        products={products}
        lowStockProducts={lowStockProducts}
        clients={clients}
        searchClientsAction={searchClientsAction}
        quickCreateClientAction={quickCreateClientAction}
        onSubmit={createOrderAction}
        submitLabel={SUBMIT_LABEL}
      />
    </div>
  );
}
