"use client";

import { useState, useTransition } from "react";
import { deliverSaleAction } from "@/app/(crm)/crm/sales/actions";
import { Button } from "@/components/ui/button";

export function DeliverSaleButton({ saleId }: { saleId: string }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deliver = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deliverSaleAction(saleId);
      if (!result.ok) setErrorMessage(result.message);
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        disabled={isPending}
        onClick={deliver}
        className="h-11 md:w-auto md:self-start md:px-6"
      >
        {isPending ? "Registrando entrega..." : "Registrar entrega"}
      </Button>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
