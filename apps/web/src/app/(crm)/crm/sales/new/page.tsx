import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SaleForm } from "@/components/sales/sale-form";

const PAGE_TITLE = "Nova venda";
const BACK_LABEL = "Voltar para vendas";
const LIST_HREF = "/crm/sales";

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Registro de venda (RSC, server-first): o form é o único trecho client (folha).
// A Server Action `createSaleAction` valida, registra e redireciona para o
// detalhe da venda.
export default function NewSalePage() {
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

      <SaleForm />
    </div>
  );
}
