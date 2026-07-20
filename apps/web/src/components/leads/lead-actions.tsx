"use client";

import type { LeadStatus, LeadStatusUpdate } from "@clientela/shared";
import { useState, useTransition } from "react";
import { updateLeadStatusAction } from "@/app/(crm)/crm/leads/actions";
import { ConvertLeadButton } from "@/components/leads/convert-lead-button";
import { Button } from "@/components/ui/button";

const MARK_CONTACTED_LABEL = "Marcar como contatado";
const DISCARD_LABEL = "Descartar";

const CONVERTED_STATUS = "converted";

type StatusAction = {
  label: string;
  target: LeadStatusUpdate;
};

// Ações de status disponíveis por status atual (RF-08). `converted` é terminal e
// nunca chega aqui (o card não renderiza children de convertido) — daí o tipo
// excluí-lo. Re-engajar descartado (→ contatado) é legítimo no funil da usuária.
const STATUS_ACTIONS: Record<
  Exclude<LeadStatus, typeof CONVERTED_STATUS>,
  readonly StatusAction[]
> = {
  new: [
    { label: MARK_CONTACTED_LABEL, target: "contacted" },
    { label: DISCARD_LABEL, target: "discarded" },
  ],
  contacted: [{ label: DISCARD_LABEL, target: "discarded" }],
  discarded: [{ label: MARK_CONTACTED_LABEL, target: "contacted" }],
};

// Ações do lead no card (RF-08): transições de status (contatar/descartar
// conforme o status atual) + conversão em cliente. `useTransition` desabilita os
// botões enquanto a Server Action roda; falha aparece em `role="alert"` compacto.
// Convertido é tratado pelo card (link da cliente), não por este componente.
export function LeadActions({
  leadId,
  status,
}: {
  leadId: string;
  status: LeadStatus;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Guarda defensiva: a page já não monta este componente para convertidos.
  if (status === CONVERTED_STATUS) {
    return null;
  }

  const runStatusChange = (target: LeadStatusUpdate) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await updateLeadStatusAction(leadId, target);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  const statusActions = STATUS_ACTIONS[status];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {statusActions.map((action) => (
          <Button
            key={action.target}
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => runStatusChange(action.target)}
            className="h-11 md:h-8"
          >
            {action.label}
          </Button>
        ))}
      </div>

      <ConvertLeadButton leadId={leadId} />

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
