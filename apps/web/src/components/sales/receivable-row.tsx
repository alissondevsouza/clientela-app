"use client";

import type { ReceivableListItem } from "@clientela/shared";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setReceivablePaidAction } from "@/app/(crm)/crm/sales/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { receivableWhatsAppUrl } from "@/lib/dashboard-messages";
import { formatBRL, formatDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";

const DUE_DATE_LABEL = "Vencimento";
const OVERDUE_TEXT = "Atrasada";
const MARK_PAID_LABEL = "Dar baixa";
const VIEW_SALE_LABEL = "Ver venda";
const NO_CLIENT_TEXT = "—";

const saleDetailHref = (id: string): string => `/crm/sales/${id}`;

const whatsappAriaLabel = (name: string): string =>
  `Cobrar ${name} no WhatsApp`;

// Linha das visões "A receber"/"Atrasadas" (RF-11/RF-17): valor, vencimento,
// cliente e atalho de cobrança por WhatsApp COM a mensagem pronta do RF-19
// (`receivableWhatsAppUrl` decide a variante atrasada/vence hoje/a vencer por
// `dueDate` × `todayIso`; sem `dueDate` ⇒ link sem mensagem; telefone
// ausente/inválido ⇒ sem botão). "Atrasada" é destacada TEXTUALMENTE (a cor é
// só reforço — a11y). A baixa dispara a Server Action com `useTransition`
// (desabilita o botão enquanto roda; erro em `role="alert"`), mesmo padrão de
// `LeadActions` — não é `<form>` puro para dar feedback de erro à usuária sem
// recarregar (web.md: estado de erro obrigatório).
export function ReceivableRow({
  receivable,
  todayIso,
}: {
  receivable: ReceivableListItem;
  todayIso: string;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const clientLabel =
    receivable.clientName.length > 0 ? receivable.clientName : NO_CLIENT_TEXT;

  const whatsappHref = receivableWhatsAppUrl(receivable, todayIso);

  const runMarkPaid = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await setReceivablePaidAction(
        receivable.id,
        true,
        receivable.saleId,
      );
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-heading text-lg font-semibold">
            {formatBRL(receivable.amountCents)}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {clientLabel}
          </p>
          <p className="text-sm text-muted-foreground">
            {DUE_DATE_LABEL}:{" "}
            {receivable.dueDate
              ? formatDateBr(receivable.dueDate)
              : receivable.dueKind === "on_delivery"
                ? "Na entrega"
                : "Data histórica indisponível"}
          </p>
          {receivable.overdue ? (
            <p className="text-sm font-medium text-destructive">
              {OVERDUE_TEXT}
            </p>
          ) : null}
        </div>

        {whatsappHref !== null ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={whatsappAriaLabel(clientLabel)}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "size-11 shrink-0 md:size-9",
            )}
          >
            <MessageCircle aria-hidden />
          </a>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          disabled={isPending}
          onClick={runMarkPaid}
          className="h-11 md:h-8"
        >
          {MARK_PAID_LABEL}
        </Button>
        <Link
          href={saleDetailHref(receivable.saleId)}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-8")}
        >
          {VIEW_SALE_LABEL}
        </Link>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
