"use client";

import { useState, useTransition } from "react";
import { deleteProductAction } from "@/app/(crm)/crm/products/actions";
import { Button } from "@/components/ui/button";

const DELETE_LABEL = "Excluir produto";
const CONFIRM_PROMPT = "Confirmar exclusão? Esta ação não pode ser desfeita.";
const CONFIRM_LABEL = "Confirmar exclusão";
const CANCEL_LABEL = "Cancelar";
const DELETING_LABEL = "Excluindo...";

// Exclusão em dois passos (RF-08): o 1º clique NÃO exclui — troca para uma
// confirmação explícita, evitando exclusão acidental. No sucesso a action
// redireciona para a lista; falha vira mensagem pt-BR em `role="alert"`.
export function DeleteProductButton({ productId }: { productId: string }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const startConfirm = () => {
    setErrorMessage(null);
    setIsConfirming(true);
  };

  const cancel = () => {
    setIsConfirming(false);
  };

  const confirmDelete = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deleteProductAction(productId);
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
          {DELETE_LABEL}
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
      <p className="text-sm font-medium">{CONFIRM_PROMPT}</p>
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
          onClick={cancel}
          className="h-11 md:px-6"
        >
          {CANCEL_LABEL}
        </Button>
      </div>
    </div>
  );
}
