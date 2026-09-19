"use client";

import { useState, useTransition } from "react";
import { deleteSaleAction } from "@/app/(crm)/crm/sales/actions";
import { Button } from "@/components/ui/button";
import { saleDeleteWarning } from "@/lib/sale-delete-warning";

const DELETE_SALE_LABEL = "Excluir venda";
const CONFIRM_LABEL = "Confirmar exclusão";
const KEEP_LABEL = "Manter venda";
const DELETING_LABEL = "Excluindo...";

// Exclusão em dois passos (RF-08): o 1º clique NÃO exclui — abre um aviso com
// as consequências reais do estado da venda (`saleDeleteWarning`, helper
// puro testado em `.test.ts`); o 2º confirma. Disponível para QUALQUER venda,
// inclusive cancelada (RF-13 — sem trava de prazo). No sucesso a action
// REDIRECIONA para a lista (o detalhe deixa de existir); só o caminho de
// falha (404 cross-tenant, rede) precisa de feedback aqui, em `role="alert"`.
// Padrão de `CancelSaleButton`/`DeleteProductButton`.
export function DeleteSaleButton({
  saleId,
  delivered,
  canceled,
  paidCents,
}: {
  saleId: string;
  delivered: boolean;
  canceled: boolean;
  paidCents: number;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const warning = saleDeleteWarning({ delivered, canceled, paidCents });

  const startConfirm = () => {
    setErrorMessage(null);
    setIsConfirming(true);
  };

  const keep = () => {
    setIsConfirming(false);
  };

  const confirmDelete = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deleteSaleAction(saleId);
      // Só o caminho de falha retorna: no sucesso a action redireciona.
      if (!result.ok) {
        setErrorMessage(result.message);
        setIsConfirming(false);
      }
    });
  };

  if (!isConfirming) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={startConfirm}
          className="h-11 md:w-auto md:self-start md:px-6"
        >
          {DELETE_SALE_LABEL}
        </Button>
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm font-medium">{warning}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="destructive"
          size="lg"
          disabled={isPending}
          onClick={confirmDelete}
          className="h-11 md:px-6"
        >
          {isPending ? DELETING_LABEL : CONFIRM_LABEL}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={isPending}
          onClick={keep}
          className="h-11 md:px-6"
        >
          {KEEP_LABEL}
        </Button>
      </div>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
