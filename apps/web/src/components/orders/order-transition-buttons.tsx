"use client";

import type { Order } from "@clientela/shared";
import { useState, useTransition } from "react";
import type { OrderActionResult } from "@/app/(crm)/crm/orders/actions";
import { Button } from "@/components/ui/button";

const PLACE_LABEL = "Marcar como pedido";
const PLACING_LABEL = "Marcando...";
const DELIVER_LABEL = "Marcar como entregue";
const DELIVERING_LABEL = "Marcando...";
const CANCEL_DRAFT_LABEL = "Cancelar rascunho";
const CANCEL_PLACED_LABEL = "Cancelar pedido";
const CANCELING_LABEL = "Cancelando...";
const KEEP_LABEL = "Voltar";

const DELIVER_CONFIRM_WARNING =
  "Marcar como entregue credita o estoque de todos os itens do pedido. Esta ação não pode ser desfeita.";
const DELIVER_CONFIRM_LABEL = "Confirmar entrega";
const CANCEL_CONFIRM_WARNING =
  "Cancelar o pedido não tem efeito no estoque. Esta ação não pode ser desfeita.";
const CANCEL_CONFIRM_LABEL = "Confirmar cancelamento";

type TransitionAction = (id: string) => Promise<OrderActionResult>;

export type OrderTransitionButtonsProps = {
  order: Order;
  placeOrderAction: TransitionAction;
  deliverOrderAction: TransitionAction;
  cancelOrderAction: TransitionAction;
};

// Botão simples (sem confirmação): usado só para `place` — transição sem
// efeito destrutivo/irreversível de estoque (ao contrário de deliver/cancel).
function PlaceButton({
  orderId,
  placeOrderAction,
}: {
  orderId: string;
  placeOrderAction: TransitionAction;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePlace = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await placeOrderAction(orderId);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        disabled={isPending}
        onClick={handlePlace}
        className="h-11 md:w-auto md:self-start md:px-6"
      >
        {isPending ? PLACING_LABEL : PLACE_LABEL}
      </Button>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

// Botão com confirmação em dois passos (padrão `CancelSaleButton`/
// `DeleteProductButton`): usado para `deliver` (credita estoque) e `cancel`
// (irreversível) — o 1º clique NÃO aplica a transição, abre um aviso
// explícito antes de confirmar.
function ConfirmTransitionButton({
  orderId,
  action,
  triggerLabel,
  pendingLabel,
  confirmWarning,
  confirmLabel,
  variant,
}: {
  orderId: string;
  action: TransitionAction;
  triggerLabel: string;
  pendingLabel: string;
  confirmWarning: string;
  confirmLabel: string;
  variant: "default" | "destructive";
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

  const confirmAction = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await action(orderId);
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
          variant={variant}
          size="lg"
          onClick={startConfirm}
          className="h-11 md:w-auto md:self-start md:px-6"
        >
          {triggerLabel}
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
      <p className="text-sm font-medium">{confirmWarning}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant={variant}
          size="lg"
          disabled={isPending}
          onClick={confirmAction}
          className="h-11 md:px-6"
        >
          {isPending ? pendingLabel : confirmLabel}
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

// Botões de transição conforme o status atual (RF-03/RF-07): `draft` ⇒
// "Marcar como pedido" (sem confirmação) + "Cancelar rascunho" (com
// confirmação); `placed` ⇒ "Marcar como entregue" (com confirmação — credita
// estoque) + "Cancelar pedido" (com confirmação); `delivered`/`canceled` são
// terminais ⇒ nenhum botão. Recebe as Server Actions por REFERÊNCIA DIRETA
// (lesson 2026-07-19) — a adaptação (bind do `order.id`) acontece AQUI dentro,
// nunca num closure criado no RSC.
export function OrderTransitionButtons({
  order,
  placeOrderAction,
  deliverOrderAction,
  cancelOrderAction,
}: OrderTransitionButtonsProps) {
  if (order.status === "draft") {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <PlaceButton orderId={order.id} placeOrderAction={placeOrderAction} />
        <ConfirmTransitionButton
          orderId={order.id}
          action={cancelOrderAction}
          triggerLabel={CANCEL_DRAFT_LABEL}
          pendingLabel={CANCELING_LABEL}
          confirmWarning={CANCEL_CONFIRM_WARNING}
          confirmLabel={CANCEL_CONFIRM_LABEL}
          variant="destructive"
        />
      </div>
    );
  }

  if (order.status === "placed") {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <ConfirmTransitionButton
          orderId={order.id}
          action={deliverOrderAction}
          triggerLabel={DELIVER_LABEL}
          pendingLabel={DELIVERING_LABEL}
          confirmWarning={DELIVER_CONFIRM_WARNING}
          confirmLabel={DELIVER_CONFIRM_LABEL}
          variant="default"
        />
        <ConfirmTransitionButton
          orderId={order.id}
          action={cancelOrderAction}
          triggerLabel={CANCEL_PLACED_LABEL}
          pendingLabel={CANCELING_LABEL}
          confirmWarning={CANCEL_CONFIRM_WARNING}
          confirmLabel={CANCEL_CONFIRM_LABEL}
          variant="destructive"
        />
      </div>
    );
  }

  return null;
}
