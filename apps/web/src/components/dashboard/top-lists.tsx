// Rankings do período (RF-11/RF-24): "Mais vendidos" e "Melhores clientes",
// cada item com link para o produto/cliente. Server Component, sem estado.

import type { DashboardPerformance } from "@clientela/shared";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clientHref, productHref } from "@/lib/dashboard-links";
import { formatBRL } from "@/lib/format";

const TOP_PRODUCTS_TITLE = "Mais vendidos";
const TOP_CLIENTS_TITLE = "Melhores clientes";
const EMPTY_TEXT = "Nenhuma venda neste período";
const UNIT_LABEL = "un.";
const PURCHASE_SINGULAR = "compra";
const PURCHASE_PLURAL = "compras";
const SINGLE = 1;

const productLine = (qty: number, soldCents: number): string =>
  `${qty} ${UNIT_LABEL} · ${formatBRL(soldCents)}`;

const clientLine = (salesCount: number, soldCents: number): string =>
  `${salesCount} ${salesCount === SINGLE ? PURCHASE_SINGULAR : PURCHASE_PLURAL} · ${formatBRL(soldCents)}`;

export type TopListsProps = {
  topProducts: DashboardPerformance["topProducts"];
  topClients: DashboardPerformance["topClients"];
};

export function TopLists({ topProducts, topClients }: TopListsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{TOP_PRODUCTS_TITLE}</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {topProducts.map((product) => (
                <li
                  key={product.productId ?? product.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  {product.productId === null ? (
                    <span className="truncate">{product.name}</span>
                  ) : (
                    <Link
                      href={productHref(product.productId)}
                      className="truncate font-medium text-foreground hover:underline focus-visible:underline"
                    >
                      {product.name}
                    </Link>
                  )}
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                    {productLine(product.qty, product.soldCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{TOP_CLIENTS_TITLE}</CardTitle>
        </CardHeader>
        <CardContent>
          {topClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {topClients.map((client) => (
                <li
                  key={client.clientId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <Link
                    href={clientHref(client.clientId)}
                    className="truncate font-medium text-foreground hover:underline focus-visible:underline"
                  >
                    {client.name}
                  </Link>
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                    {clientLine(client.salesCount, client.soldCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
