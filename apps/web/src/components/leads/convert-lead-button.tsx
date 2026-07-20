"use client";

import { useState, useTransition } from "react";
import { convertLeadAction } from "@/app/(crm)/crm/leads/actions";
import { Button } from "@/components/ui/button";

const CONVERT_LABEL = "Converter em cliente";
const CONFIRM_PROMPT =
  "Converter cria o cadastro de cliente com os dados do lead. Confirmar?";
const CONFIRM_LABEL = "Confirmar conversão";
const CANCEL_LABEL = "Cancelar";
const CONVERTING_LABEL = "Convertendo...";

// Conversão em dois passos (RF-08): o 1º clique NÃO converte — troca para uma
// confirmação explícita, evitando criar cadastro de cliente por acidente. No
// sucesso a action redireciona para o detalhe da cliente; falha vira mensagem
// pt-BR em `role="alert"`.
export function ConvertLeadButton({ leadId }: { leadId: string }) {
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

  const confirmConvert = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await convertLeadAction(leadId);
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
          variant="default"
          onClick={startConfirm}
          className="h-11 md:h-8"
        >
          {CONVERT_LABEL}
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium">{CONFIRM_PROMPT}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="default"
          disabled={isPending}
          onClick={confirmConvert}
          className="h-11 md:h-8"
        >
          {isPending ? CONVERTING_LABEL : CONFIRM_LABEL}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={cancel}
          className="h-11 md:h-8"
        >
          {CANCEL_LABEL}
        </Button>
      </div>
    </div>
  );
}
