import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NOT_FOUND_TITLE = "Compromisso não encontrado";
const NOT_FOUND_DESCRIPTION =
  "O compromisso que você procura não existe ou não está disponível.";
const BACK_LABEL = "Voltar para a agenda";
const LIST_HREF = "/crm/appointments";

// UI do `notFound()` do detalhe (RF-06/RF-19): mensagem pt-BR + link de volta
// à lista. Cobre tanto compromisso inexistente quanto acesso cross-tenant e
// id malformado (a API devolve 404 idêntico nos três casos).
export default function AppointmentNotFound() {
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
