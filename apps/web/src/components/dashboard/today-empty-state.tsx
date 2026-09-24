// Estado único "Tudo em dia por hoje" (RF-20/RF-20a): sem nada a resolver no
// bloco Hoje. Usado tanto no cartão compacto da home (`today-section.tsx`)
// quanto na página de detalhe `/crm/today` (`today-details.tsx`) — extraído
// para não duplicar o mesmo card nos dois lugares.

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ALL_CAUGHT_UP_TEXT = "Tudo em dia por hoje.";
const REGISTER_SALE_LABEL = "Registrar venda";
const NEW_SALE_HREF = "/crm/sales/new";

export function TodayEmptyState() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{ALL_CAUGHT_UP_TEXT}</p>
        <Link
          href={NEW_SALE_HREF}
          className={cn(buttonVariants(), "h-11 md:h-8")}
        >
          {REGISTER_SALE_LABEL}
        </Link>
      </CardContent>
    </Card>
  );
}
