import { calculateGrossMargin } from "@clientela/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateProductAction } from "@/app/(crm)/crm/products/actions";
import { DeleteProductButton } from "@/components/products/delete-product-button";
import { ProductForm } from "@/components/products/product-form";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadWebEnv } from "@/lib/env";
import { centsToReaisInput, formatBRL } from "@/lib/format";
import {
  formatMarginPercentage,
  formatPercentage,
} from "@/lib/product-pricing";
import { getProduct } from "@/lib/products-api";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Produto";
const EDIT_HEADING = "Editar dados";
const SAVE_LABEL = "Salvar alterações";
const BACK_LABEL = "Voltar para produtos";
const LIST_HREF = "/crm/products";
const LOGIN_PATH = "/login";

const BRAND_CODE_LABEL = "Código Mary Kay";
const PRICE_LABEL = "Preço sugerido";
const COST_MODE_LABEL = "Forma do custo";
const COST_LABEL = "Custo atual";
const MARGIN_LABEL = "Margem bruta estimada";
const STOCK_LABEL = "Estoque";
const LOW_STOCK_THRESHOLD_LABEL = "Alerta em";
const LOW_STOCK_BADGE = "Estoque baixo";
const NOT_INFORMED = "Não informado";
const MANUAL_COST_MODE = "Informado diretamente";
const MARGIN_DISCLAIMER =
  "Estimativa bruta sobre o preço sugerido; não representa lucro líquido.";
const UNIT_SINGULAR = "unidade";
const UNIT_PLURAL = "unidades";

const SINGLE = 1;

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

const unitLabel = (qty: number): string =>
  qty === SINGLE ? UNIT_SINGULAR : UNIT_PLURAL;

// Detalhe/edição de produto (RSC async, server-first): `params` é uma Promise
// (Next 15) — await antes de usar. Busca o produto com o Bearer do cookie; 404 ⇒
// `notFound()` (usa o `not-found.tsx` local); falha genérica ⇒ `throw` (cai no
// `error.tsx` local). O form de edição liga a Server Action `updateProductAction`
// com o id fixado por `.bind`; os valores monetários são pré-preenchidos em reais
// (centavos → "R$ x,yy" só na exibição via `centsToReaisInput`).
export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { id } = await params;

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }

  const result = await getProduct(id, {
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

  const { product } = result;
  const margin = calculateGrossMargin(product.priceCents, product.costCents);
  const costMode =
    product.purchaseDiscountBps === null
      ? MANUAL_COST_MODE
      : `${formatPercentage(product.purchaseDiscountBps)} de desconto na compra`;

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
            {product.name}
          </h1>
          {product.lowStock ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
              )}
            >
              {LOW_STOCK_BADGE}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{BRAND_CODE_LABEL}</dt>
          <dd>{product.brandCode ?? NOT_INFORMED}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{PRICE_LABEL}</dt>
          <dd>{formatBRL(product.priceCents)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{COST_MODE_LABEL}</dt>
          <dd>{costMode}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{COST_LABEL}</dt>
          <dd>{formatBRL(product.costCents)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{MARGIN_LABEL}</dt>
          <dd className="flex flex-col gap-0.5">
            <span>
              {formatBRL(margin.marginCents)} (
              {formatMarginPercentage(margin.marginBps)})
            </span>
            <span className="text-xs text-muted-foreground">
              {MARGIN_DISCLAIMER}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{STOCK_LABEL}</dt>
          <dd>
            {product.stockQty} {unitLabel(product.stockQty)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{LOW_STOCK_THRESHOLD_LABEL}</dt>
          <dd>
            {product.lowStockThreshold} {unitLabel(product.lowStockThreshold)}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold">{EDIT_HEADING}</h2>
        <ProductForm
          mode="edit"
          submitLabel={SAVE_LABEL}
          onSubmit={updateProductAction.bind(null, product.id)}
          purchaseDiscountBps={product.purchaseDiscountBps}
          defaultValues={{
            name: product.name,
            brandCode: product.brandCode ?? "",
            costCents: centsToReaisInput(product.costCents),
            priceCents: centsToReaisInput(product.priceCents),
            stockQty: String(product.stockQty),
            lowStockThreshold: String(product.lowStockThreshold),
          }}
        />
      </section>

      <DeleteProductButton productId={product.id} />
    </div>
  );
}
