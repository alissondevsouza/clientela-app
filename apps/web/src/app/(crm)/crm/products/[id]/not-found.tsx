import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NOT_FOUND_TITLE = "Produto não encontrado";
const NOT_FOUND_DESCRIPTION =
  "O produto que você procura não existe ou foi excluído.";
const BACK_LABEL = "Voltar para produtos";
const LIST_HREF = "/crm/products";

// UI do `notFound()` do detalhe: mensagem pt-BR + link de volta à lista.
export default function ProductNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{NOT_FOUND_TITLE}</p>
        <p className="text-sm text-muted-foreground">{NOT_FOUND_DESCRIPTION}</p>
      </div>
      <Link
        href={LIST_HREF}
        className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-8")}
      >
        {BACK_LABEL}
      </Link>
    </div>
  );
}
