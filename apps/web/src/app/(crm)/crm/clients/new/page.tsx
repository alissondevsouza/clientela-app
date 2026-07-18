import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClientAction } from "@/app/(crm)/crm/clients/actions";
import { ClientForm } from "@/components/clients/client-form";

const PAGE_TITLE = "Nova cliente";
const SUBMIT_LABEL = "Cadastrar";
const BACK_LABEL = "Voltar para clientes";
const LIST_HREF = "/crm/clients";

// Robots (noindex) é herdado do layout do grupo `(crm)`.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Cadastro de cliente (RSC, server-first): o form é o único trecho client (folha).
// A Server Action `createClientAction` valida, cria e redireciona para o detalhe.
export default function NewClientPage() {
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

      <ClientForm
        mode="create"
        submitLabel={SUBMIT_LABEL}
        onSubmit={createClientAction}
      />
    </div>
  );
}
