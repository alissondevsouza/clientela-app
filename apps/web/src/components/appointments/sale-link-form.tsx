"use client";

import { SALE_STATUS_LABELS } from "@clientela/shared";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import type {
  AppointmentActionResult,
  LinkableSale,
} from "@/app/(crm)/crm/appointments/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatBRL, formatDateBr } from "@/lib/format";

const SELECT_LABEL = "Venda vinculada";
const NONE_OPTION_LABEL = "Sem venda vinculada";
const SAVE_LABEL = "Salvar vínculo";
const SAVING_LABEL = "Salvando...";
const EMPTY_HINT = "Nenhuma venda ativa disponível para vincular no momento.";
const SELECT_ID = "appointment-sale-link";
const CURRENT_SALE_FALLBACK_LABEL = "Venda vinculada atual";

const ISO_DATE_TIME_SEPARATOR = "T";

const SELECT_CLASS_NAME =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm";

const toDatePart = (isoDateTime: string): string =>
  isoDateTime.split(ISO_DATE_TIME_SEPARATOR)[0] ?? isoDateTime;

// O status entra no rótulo: a lista agora mistura venda em aberto e concluída
// (CRM-12), e a diferença precisa aparecer em TEXTO, não só na escolha.
const describeSale = (sale: LinkableSale): string =>
  `${sale.clientName} · ${formatBRL(sale.totalCents)} · ${formatDateBr(toDatePart(sale.soldAt))} · ${SALE_STATUS_LABELS[sale.status]}`;

export type SaleLinkFormProps = {
  currentSaleId: string | null;
  sales: LinkableSale[];
  linkAppointmentSaleAction: (
    saleId: string | null,
  ) => Promise<AppointmentActionResult>;
};

// Vínculo/desvínculo de venda do compromisso (RF-10/RF-19), disponível só em
// `scheduled`/`done` (a página não renderiza este componente em
// `canceled`/`no_show` — a API devolveria 409). A lista `sales` já chega do
// servidor filtrada pela regra do RF-19 (da cliente vinculada quando existe;
// sem cliente, as `completed` mais recentes da consultora). Recebe a Server
// Action com o id do compromisso já fixado (`.bind` no RSC pai) como
// referência DIRETA (lesson 2026-07-19).
export function SaleLinkForm({
  currentSaleId,
  sales,
  linkAppointmentSaleAction,
}: SaleLinkFormProps) {
  const [selectedSaleId, setSelectedSaleId] = useState(currentSaleId ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const result = await linkAppointmentSaleAction(
        selectedSaleId.length > 0 ? selectedSaleId : null,
      );
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  if (sales.length === 0 && currentSaleId === null) {
    return <p className="text-sm text-muted-foreground">{EMPTY_HINT}</p>;
  }

  // A venda atualmente vinculada pode não estar entre as ofertáveis (ex.: a
  // origem mudou entre carregamentos) — garante que ela continue selecionável
  // sem perder a seleção corrente ao renderizar.
  const hasCurrentInOptions = sales.some((sale) => sale.id === currentSaleId);
  const showCurrentFallbackOption =
    currentSaleId !== null && !hasCurrentInOptions;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={SELECT_ID}>{SELECT_LABEL}</Label>
        <select
          id={SELECT_ID}
          value={selectedSaleId}
          onChange={(event) => setSelectedSaleId(event.target.value)}
          className={SELECT_CLASS_NAME}
        >
          <option value="">{NONE_OPTION_LABEL}</option>
          {showCurrentFallbackOption ? (
            <option value={currentSaleId}>{CURRENT_SALE_FALLBACK_LABEL}</option>
          ) : null}
          {sales.map((sale) => (
            <option key={sale.id} value={sale.id}>
              {describeSale(sale)}
            </option>
          ))}
        </select>
      </div>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full md:w-auto md:self-start md:px-6"
      >
        {isPending ? SAVING_LABEL : SAVE_LABEL}
      </Button>
    </form>
  );
}
