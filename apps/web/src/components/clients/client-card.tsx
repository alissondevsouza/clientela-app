import type { Client } from "@clientela/shared";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl, toWaPhone } from "@/lib/whatsapp";

const BIRTHDAY_LABEL = "Aniversário";

const clientDetailHref = (id: string): string => `/crm/clients/${id}`;

const whatsappAriaLabel = (name: string): string =>
  `Conversar com ${name} no WhatsApp`;

// Card da listagem (RSC): nome como link para o detalhe, WhatsApp, aniversário
// formatado dd/mm/aaaa quando informado, e atalho de conversa que normaliza o
// número armazenado (só dígitos) para E.164 antes de montar o link wa.me (RF-08).
// O botão tem alvo de toque >= 44px no mobile (web.md).
export function ClientCard({ client }: { client: Client }) {
  const waHref = buildWhatsAppUrl({ phone: toWaPhone(client.whatsapp) });

  return (
    <Card size="sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">
            <Link
              href={clientDetailHref(client.id)}
              className="outline-none hover:underline focus-visible:underline"
            >
              {client.name}
            </Link>
          </CardTitle>
          <p className="truncate text-sm text-muted-foreground">
            {client.whatsapp}
          </p>
          {client.birthday ? (
            <p className="text-sm text-muted-foreground">
              {BIRTHDAY_LABEL}: {formatDateBr(client.birthday)}
            </p>
          ) : null}
        </div>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={whatsappAriaLabel(client.name)}
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "size-11 shrink-0 md:size-9",
          )}
        >
          <MessageCircle aria-hidden />
        </a>
      </CardHeader>
    </Card>
  );
}
