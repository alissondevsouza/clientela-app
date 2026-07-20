import type { Product } from "@clientela/shared";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

const BRAND_CODE_LABEL = "Código";
const PRICE_LABEL = "Preço";
const STOCK_LABEL = "Estoque";
const LOW_STOCK_TEXT = "Estoque baixo";

const productDetailHref = (id: string): string => `/crm/products/${id}`;

// Badge textual de estoque baixo: o texto pt-BR é SEMPRE o portador da
// informação; a cor (token de tema) é só reforço, nunca o único sinal (a11y/RF-09).
function LowStockBadge() {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
      )}
    >
      {LOW_STOCK_TEXT}
    </span>
  );
}

// Card da listagem de produtos (RSC): nome como link para o detalhe, código
// Mary Kay quando houver, preço formatado (R$), quantidade em estoque e badge
// textual "Estoque baixo" quando `lowStock`. Sem interatividade → Server Component.
export function ProductCard({ product }: { product: Product }) {
  return (
    <Card size="sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">
            <Link
              href={productDetailHref(product.id)}
              className="outline-none hover:underline focus-visible:underline"
            >
              {product.name}
            </Link>
          </CardTitle>
          {product.brandCode ? (
            <p className="truncate text-sm text-muted-foreground">
              {BRAND_CODE_LABEL}: {product.brandCode}
            </p>
          ) : null}
        </div>
        {product.lowStock ? <LowStockBadge /> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{PRICE_LABEL}:</span>{" "}
          {formatBRL(product.priceCents)}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{STOCK_LABEL}:</span>{" "}
          {product.stockQty}
        </p>
      </CardContent>
    </Card>
  );
}
