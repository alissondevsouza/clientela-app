import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createProductAction } from "@/app/(crm)/crm/products/actions";
import { ProductForm } from "@/components/products/product-form";

const PAGE_TITLE = "Novo produto";
const SUBMIT_LABEL = "Cadastrar";
const BACK_LABEL = "Voltar para produtos";
const LIST_HREF = "/crm/products";

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Cadastro de produto (RSC, server-first): o form é o único trecho client (folha).
// A Server Action `createProductAction` valida, cria e redireciona para o detalhe.
export default function NewProductPage() {
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

      <ProductForm
        mode="create"
        submitLabel={SUBMIT_LABEL}
        onSubmit={createProductAction}
      />
    </div>
  );
}
