"use client";

import type { Receivable } from "@clientela/shared";
import { useState, useTransition } from "react";
import { setReceivablePaidAction } from "@/app/(crm)/crm/sales/actions";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";

const DUE_DATE_LABEL = "Vencimento";
const PAID_LABEL = "Paga";
const OVERDUE_LABEL = "Atrasada";
const PENDING_LABEL = "Pendente";
const MARK_PAID_LABEL = "Dar baixa";
const REVERSE_LABEL = "Estornar";
const CONFIRM_LABEL = "Confirmar";
const KEEP_LABEL = "Voltar";
const RUNNING_LABEL = "Processando...";

// Status textual da parcela (a cor é só reforço — a11y/RF-10): paga tem
// prioridade; senão atrasada; senão pendente.
type ReceivableStatus = "paid" | "overdue" | "pending";

const resolveStatus = (receivable: Receivable): ReceivableStatus => {
  if (receivable.paidAt !== null) {
    return "paid";
  }
  if (receivable.overdue) {
    return "overdue";
  }
  return "pending";
};

const STATUS_LABELS: Record<ReceivableStatus, string> = {
  paid: PAID_LABEL,
  overdue: OVERDUE_LABEL,
  pending: PENDING_LABEL,
};

const STATUS_CLASSES: Record<ReceivableStatus, string> = {
  paid: "bg-secondary text-secondary-foreground ring-1 ring-border",
  overdue: "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
  pending: "bg-muted text-muted-foreground ring-1 ring-border",
};

// Parcela na seção de recebíveis do DETALHE da venda (RF-10). Diferente de
// `ReceivableRow` (lista "Quem me deve", só pendentes): aqui a parcela pode estar
// paga, então oferece "Dar baixa" (pendente) OU "Estornar" (paga) com CONFIRMAÇÃO
// LEVE em dois passos (o 1º clique não age). A baixa/estorno dispara a Server
// Action com `useTransition` (feedback de erro em `role="alert"` sem recarregar) e
// passa o `saleId` para revalidar o próprio detalhe. Ações só quando a venda está
// ativa (`canManage`) — venda cancelada exibe as parcelas sem botões.
export function SaleReceivableRow({
  receivable,
  saleId,
  canManage,
}: {
  receivable: Receivable;
  saleId: string;
  canManage: boolean;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const status = resolveStatus(receivable);
  const isPaid = status === "paid";
  const actionLabel = isPaid ? REVERSE_LABEL : MARK_PAID_LABEL;

  const startConfirm = () => {
    setErrorMessage(null);
    setIsConfirming(true);
  };

  const keep = () => {
    setIsConfirming(false);
  };

  const confirm = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await setReceivablePaidAction(
        receivable.id,
        !isPaid,
        saleId,
      );
      if (result.ok) {
        setIsConfirming(false);
        return;
      }
      setErrorMessage(result.message);
      setIsConfirming(false);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-heading text-lg font-semibold">
            {formatBRL(receivable.amountCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            {DUE_DATE_LABEL}: {formatDateBr(receivable.dueDate)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_CLASSES[status],
          )}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      {canManage ? (
        isConfirming ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant={isPaid ? "destructive" : "default"}
              disabled={isPending}
              onClick={confirm}
              className="h-11 md:h-8"
            >
              {isPending ? RUNNING_LABEL : CONFIRM_LABEL}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={keep}
              className="h-11 md:h-8"
            >
              {KEEP_LABEL}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant={isPaid ? "outline" : "default"}
            onClick={startConfirm}
            className="h-11 self-start md:h-8"
          >
            {actionLabel}
          </Button>
        )
      ) : null}

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
