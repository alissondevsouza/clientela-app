"use client";

import type { UpdateAppointmentInput } from "@clientela/shared";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import type {
  AppointmentActionResult,
  LinkableSale,
} from "@/app/(crm)/crm/appointments/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatDateBr } from "@/lib/format";
import { cn } from "@/lib/utils";

const COMPLETE_LABEL = "Marcar como realizado";
const COMPLETING_LABEL = "Marcando...";
const COMPLETE_CONFIRM_TITLE =
  "Confirmar que o compromisso foi realizado? Você pode vincular a venda gerada agora ou depois.";
const COMPLETE_CONFIRM_LABEL = "Confirmar realizado";
const COMPLETE_SALE_LABEL = "Venda gerada (opcional)";
const COMPLETE_SALE_NONE_OPTION = "Sem venda vinculada";
const COMPLETE_SALE_SELECT_ID = "appointment-complete-sale";

const NO_SHOW_LABEL = "Marcar não compareceu";
const NO_SHOW_PENDING_LABEL = "Marcando...";
const NO_SHOW_CONFIRM_WARNING =
  "Marcar como não compareceu encerra o compromisso e remove a venda vinculada, se houver. Esta ação não pode ser desfeita.";
const NO_SHOW_CONFIRM_LABEL = "Confirmar não compareceu";

const CANCEL_LABEL = "Cancelar compromisso";
const CANCEL_PENDING_LABEL = "Cancelando...";
const CANCEL_CONFIRM_WARNING =
  "Cancelar o compromisso encerra o agendamento e remove a venda vinculada, se houver. Esta ação não pode ser desfeita.";
const CANCEL_CONFIRM_LABEL = "Confirmar cancelamento";

const DELETE_LABEL = "Excluir compromisso";
const DELETING_LABEL = "Excluindo...";
const DELETE_CONFIRM_WARNING =
  "Excluir remove o compromisso definitivamente ('marquei por engano'). Para um encontro que existiu e não vai mais acontecer, use Cancelar. Esta ação não pode ser desfeita.";
const DELETE_CONFIRM_LABEL = "Confirmar exclusão";

const CONVERT_LEAD_LABEL = "Converter em cliente";
const CONVERT_LEAD_PENDING_LABEL = "Convertendo...";
const CONVERT_LEAD_CONFIRM_WARNING =
  "Converter cria o cadastro de cliente com os dados do lead. Este compromisso passa a exibir a cliente. Confirmar?";
const CONVERT_LEAD_CONFIRM_LABEL = "Confirmar conversão";

const KEEP_LABEL = "Voltar";

const NOTES_FIELD_ID = "appointment-notes-only";
const NOTES_LABEL = "Observações";
const SAVE_NOTES_LABEL = "Salvar observações";
const SAVING_NOTES_LABEL = "Salvando...";

const ISO_DATE_TIME_SEPARATOR = "T";

const SELECT_CLASS_NAME =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm";

const toDatePart = (isoDateTime: string): string =>
  isoDateTime.split(ISO_DATE_TIME_SEPARATOR)[0] ?? isoDateTime;

const describeSale = (sale: LinkableSale): string =>
  `${sale.clientName} · ${formatBRL(sale.totalCents)} · ${formatDateBr(toDatePart(sale.soldAt))}`;

type NoArgAction = () => Promise<AppointmentActionResult>;

// Botão "Realizado" (RF-08/RF-19): confirmação em dois passos; oferece, no
// mesmo passo, o vínculo opcional da venda gerada (`completeAppointmentAction`
// aceita `saleId` — RF-08). Sem vendas ofertáveis, o passo de confirmação
// segue sem o seletor (a lista pode estar vazia sem impedir o desfecho).
function CompleteButton({
  linkableSales,
  completeAppointmentAction,
}: {
  linkableSales: LinkableSale[];
  completeAppointmentAction: (
    saleId?: string,
  ) => Promise<AppointmentActionResult>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      const result = await completeAppointmentAction(
        selectedSaleId.length > 0 ? selectedSaleId : undefined,
      );
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
          size="lg"
          onClick={startConfirm}
          className="h-11 md:w-auto md:self-start md:px-6"
        >
          {COMPLETE_LABEL}
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">{COMPLETE_CONFIRM_TITLE}</p>
      {linkableSales.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={COMPLETE_SALE_SELECT_ID}>{COMPLETE_SALE_LABEL}</Label>
          <select
            id={COMPLETE_SALE_SELECT_ID}
            value={selectedSaleId}
            onChange={(event) => setSelectedSaleId(event.target.value)}
            className={SELECT_CLASS_NAME}
          >
            <option value="">{COMPLETE_SALE_NONE_OPTION}</option>
            {linkableSales.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {describeSale(sale)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          disabled={isPending}
          onClick={confirm}
          className="h-11 md:px-6"
        >
          {isPending ? COMPLETING_LABEL : COMPLETE_CONFIRM_LABEL}
        </Button>
        <Button
          type="button"
          variant="outline"
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

// Botão de confirmação em dois passos sem argumento (padrão
// `ConfirmTransitionButton`/`DeleteProductButton`): usado para "não
// compareceu", "cancelar" e "excluir" — a Server Action já chega com o id do
// compromisso fixado (`.bind`) pelo RSC pai, referência DIRETA (lesson
// 2026-07-19).
function ConfirmActionButton({
  action,
  triggerLabel,
  pendingLabel,
  confirmWarning,
  confirmLabel,
  variant,
}: {
  action: NoArgAction;
  triggerLabel: string;
  pendingLabel: string;
  confirmWarning: string;
  confirmLabel: string;
  variant: "outline" | "destructive";
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
      const result = await action();
      // No sucesso da exclusão a action redireciona (a promise não resolve
      // com valor observável); só o caminho de falha retorna aqui.
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
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        variant === "destructive"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-card",
      )}
    >
      <p className="text-sm font-medium">{confirmWarning}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant={variant}
          size="lg"
          disabled={isPending}
          onClick={confirmAction}
          className="h-11 px-6"
        >
          {isPending ? pendingLabel : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={isPending}
          onClick={keep}
          className="h-11 px-6"
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

export type AppointmentActionsProps = {
  status: "scheduled" | "done" | "no_show" | "canceled";
  linkableSales: LinkableSale[];
  /** `null` quando a pessoa vinculada não é um lead convertível (RF-25):
   * sem cliente/sem pessoa, ou lead já `converted`/`discarded`. */
  convertLeadAction: NoArgAction | null;
  completeAppointmentAction: (
    saleId?: string,
  ) => Promise<AppointmentActionResult>;
  noShowAppointmentAction: NoArgAction;
  cancelAppointmentAction: NoArgAction;
  deleteAppointmentAction: NoArgAction;
};

// Ações do detalhe (RF-08/RF-09/RF-19/RF-25): as três transições SÓ são
// renderizadas (nem desabilitadas — ausentes) quando `status === "scheduled"`,
// para nunca oferecer um clique que a API recusaria com 409. A exclusão
// (RF-09) e a conversão de lead (RF-25) ficam disponíveis em QUALQUER
// status — nenhuma das duas depende do compromisso estar `done`.
export function AppointmentActions({
  status,
  linkableSales,
  convertLeadAction,
  completeAppointmentAction,
  noShowAppointmentAction,
  cancelAppointmentAction,
  deleteAppointmentAction,
}: AppointmentActionsProps) {
  return (
    <div className="flex flex-col gap-4">
      {status === "scheduled" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <CompleteButton
            linkableSales={linkableSales}
            completeAppointmentAction={completeAppointmentAction}
          />
          <ConfirmActionButton
            action={noShowAppointmentAction}
            triggerLabel={NO_SHOW_LABEL}
            pendingLabel={NO_SHOW_PENDING_LABEL}
            confirmWarning={NO_SHOW_CONFIRM_WARNING}
            confirmLabel={NO_SHOW_CONFIRM_LABEL}
            variant="outline"
          />
          <ConfirmActionButton
            action={cancelAppointmentAction}
            triggerLabel={CANCEL_LABEL}
            pendingLabel={CANCEL_PENDING_LABEL}
            confirmWarning={CANCEL_CONFIRM_WARNING}
            confirmLabel={CANCEL_CONFIRM_LABEL}
            variant="destructive"
          />
        </div>
      ) : null}

      {convertLeadAction !== null ? (
        <ConfirmActionButton
          action={convertLeadAction}
          triggerLabel={CONVERT_LEAD_LABEL}
          pendingLabel={CONVERT_LEAD_PENDING_LABEL}
          confirmWarning={CONVERT_LEAD_CONFIRM_WARNING}
          confirmLabel={CONVERT_LEAD_CONFIRM_LABEL}
          variant="outline"
        />
      ) : null}

      <ConfirmActionButton
        action={deleteAppointmentAction}
        triggerLabel={DELETE_LABEL}
        pendingLabel={DELETING_LABEL}
        confirmWarning={DELETE_CONFIRM_WARNING}
        confirmLabel={DELETE_CONFIRM_LABEL}
        variant="destructive"
      />
    </div>
  );
}

export type AppointmentNotesFormProps = {
  defaultNotes: string;
  updateAppointmentAction: (
    values: UpdateAppointmentInput,
  ) => Promise<AppointmentActionResult>;
};

// Edição embutida em status TERMINAL (RF-07/RF-19): o único campo aceito pela
// API fora de `scheduled` é `notes` — qualquer outro campo devolveria 409, por
// isso este form (deliberadamente) não reusa `AppointmentForm` (que envia o
// payload completo). Vazio (após trim) grava `null` (limpa a observação).
export function AppointmentNotesForm({
  defaultNotes,
  updateAppointmentAction,
}: AppointmentNotesFormProps) {
  const [notes, setNotes] = useState(defaultNotes);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const trimmed = notes.trim();
      const result = await updateAppointmentAction({
        notes: trimmed.length === 0 ? null : trimmed,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={NOTES_FIELD_ID}>{NOTES_LABEL}</Label>
        <Textarea
          id={NOTES_FIELD_ID}
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="h-11 w-full text-base md:w-auto md:self-start md:px-6"
      >
        {isPending ? SAVING_NOTES_LABEL : SAVE_NOTES_LABEL}
      </Button>
    </form>
  );
}
