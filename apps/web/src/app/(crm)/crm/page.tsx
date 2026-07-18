import type { Metadata } from "next";

const PAGE_TITLE = "Início";
const PAGE_DESCRIPTION =
  "Seu painel com resumo de clientes, vendas e estoque chega em breve, nesta Fase 2.";

// Robots (noindex) é herdado do layout do grupo `(crm)` — a page só define o título.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Home "Início" do CRM: placeholder até o dashboard (CRM-07). O shell (header com
// "Sair" e navegação) é montado pelo layout do grupo — esta page é só conteúdo.
export default function CrmHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
        <p className="text-muted-foreground">{PAGE_DESCRIPTION}</p>
      </header>
    </div>
  );
}
