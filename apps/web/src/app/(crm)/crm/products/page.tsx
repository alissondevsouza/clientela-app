import type { Metadata } from "next";
import { CRM_COMING_SOON_TEXT } from "../coming-soon";

const PAGE_TITLE = "Produtos";

// Robots (noindex) é herdado do layout do grupo `(crm)` — a page só define o título.
export const metadata: Metadata = {
  title: PAGE_TITLE,
};

// Placeholder da seção Produtos até o CRM-05. O shell (header + navegação) vem
// do layout do grupo — esta page é só conteúdo.
export default function CrmProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">{PAGE_TITLE}</h1>
        <p className="text-muted-foreground">{CRM_COMING_SOON_TEXT}</p>
      </header>
    </div>
  );
}
