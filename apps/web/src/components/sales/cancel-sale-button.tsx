"use client";

import { useState, useTransition } from "react";
import { cancelSaleAction } from "@/app/(crm)/crm/sales/actions";
import { Button } from "@/components/ui/button";

const CANCEL_SALE_LABEL = "Cancelar venda";
// O texto depende da entrega: só a venda já entregue repõe estoque, e essa
// reposição pressupõe que a cliente devolveu os produtos (RF-08).
const CONFIRM_WARNING_DELIVERED =
  "Cancelar anula as parcelas pendentes e devolve os itens ao estoque — confirme antes que a cliente devolveu os produtos. Esta ação não pode ser desfeita.";
const CONFIRM_WARNING_PENDING =
  "Cancelar anula as parcelas pendentes e libera a reserva dos itens. Esta ação não pode ser desfeita.";
const CONFIRM_LABEL = "Confirmar cancelamento";
const KEEP_LABEL = "Manter venda";
const CANCELING_LABEL = "Cancelando...";

// Cancelamento em dois passos (RF-10): o 1º clique NÃO cancela — abre um aviso
// explícito (efeito no estoque conforme a entrega, anulação das parcelas
// pendentes, irreversível) antes de confirmar. Renderizado só para venda ativa
// (a page controla). No sucesso
// a action revalida o próprio detalhe (a usuária PERMANECE nele, agora exibindo
// "Venda cancelada"); a falha (409 com parcela paga / já cancelada) vira mensagem
// pt-BR em `role="alert"`. Padrão de `DeleteProductButton`, mas sem redirect.
export function CancelSaleButton({
  saleId,
  delivered,
}: {
  saleId: string;
  delivered: boolean;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const startConfirm = () => {
    setErrorMessage(null);
    setIsConfirming(true);
  };

  const keep = () => {
    setIsConfirming(false);
  };

  const confirmCancel = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await cancelSaleAction(saleId);
      // No sucesso a revalidação re-renderiza o detalhe como "Venda cancelada"
      // e este botão deixa de existir; só o caminho de falha precisa de feedback.
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
          {CANCEL_SALE_LABEL}
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
      <p className="text-sm font-medium">
        {delivered ? CONFIRM_WARNING_DELIVERED : CONFIRM_WARNING_PENDING}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="destructive"
          size="lg"
          disabled={isPending}
          onClick={confirmCancel}
          className="h-11 md:px-6"
        >
          {isPending ? CANCELING_LABEL : CONFIRM_LABEL}
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
