"use client";

import { type UpdateGoalInput, updateGoalSchema } from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { UpdateGoalActionResult } from "@/app/(crm)/crm/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToReaisInput, formatBRL, parseBRLToCents } from "@/lib/format";
import { goalProgressPercent } from "@/lib/goal-progress";

const TITLE = "Meta do mês";
const GOAL_INPUT_ID = "monthly-goal";
const GOAL_LABEL = "Meta (R$)";
const GOAL_PLACEHOLDER = "0,00";
const GOAL_INVALID_MESSAGE = "Meta inválida — use o formato 1.500,00";
const NO_GOAL_TEXT = "Você ainda não definiu uma meta para este mês.";
const CTA_LABEL = "Definir meta";
const EDIT_LABEL = "Editar meta";
const REMOVE_LABEL = "Remover meta";
const CANCEL_LABEL = "Cancelar";
const SAVE_LABEL = "Salvar meta";
const SAVING_LABEL = "Salvando...";
const REMOVING_LABEL = "Removendo...";

const ARIA_MIN = 0;
const ARIA_MAX = 100;

const clampPercent = (percent: number): number =>
  Math.min(Math.max(percent, ARIA_MIN), ARIA_MAX);

// Texto de progresso (equivalente acessível ao `aria-valuetext`): o percentual
// REAL (sem cap) sempre aparece no texto — só a barra visual é capada em 100%
// (RF-05/RF-07).
const progressText = (
  salesCents: number,
  goalCents: number,
  percent: number,
): string =>
  `${formatBRL(salesCents)} de ${formatBRL(goalCents)} (${percent}% da meta)`;

type GoalCardMode = "view" | "edit";

// Campo de dinheiro digitado em reais (mesmo padrão de `product-form.tsx`): a
// string é convertida para centavos por `parseBRLToCents` (aritmética de
// string, sem float) e então validada pelas regras do contrato compartilhado
// (`updateGoalSchema` — inteiro, > 0, ≤ teto), via `.unwrap()` para remover o
// `.nullable()` do campo do contrato (este formulário sempre define um valor
// numérico; a remoção da meta é uma ação própria, fora do form).
const goalFormSchema = z.object({
  monthlyGoalCents: z
    .string()
    .transform((value, ctx) => {
      const cents = parseBRLToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: GOAL_INVALID_MESSAGE });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(updateGoalSchema.shape.monthlyGoalCents.unwrap()),
});

type GoalFormFieldValues = z.input<typeof goalFormSchema>;
type GoalFormValues = z.output<typeof goalFormSchema>;

const goalDefaultValue = (
  monthlyGoalCents: number | null,
): GoalFormFieldValues => ({
  monthlyGoalCents:
    monthlyGoalCents === null ? "" : centsToReaisInput(monthlyGoalCents),
});

export type GoalCardProps = {
  monthlyGoalCents: number | null;
  monthSalesCents: number;
  // Referência direta à Server Action (`updateGoalAction`, `"use server"`) —
  // NÃO um closure/adaptador criado no Server Component: só a própria action
  // pode cruzar a fronteira RSC → client como prop de função (web.md/lesson
  // RSC×client). O client component adapta o valor em centavos para o shape
  // `UpdateGoalInput` do contrato aqui dentro.
  onUpdateGoal: (values: UpdateGoalInput) => Promise<UpdateGoalActionResult>;
};

type GoalProgressViewProps = {
  monthSalesCents: number;
  monthlyGoalCents: number;
  isPending: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

// Progresso com meta definida: barra visual CAPADA em 100% (`clampPercent`) +
// texto com o percentual REAL (sem cap) — extraído do `GoalCard` para evitar
// IIFE no JSX (core.md: funções pequenas com uma responsabilidade).
function GoalProgressView({
  monthSalesCents,
  monthlyGoalCents,
  isPending,
  onEdit,
  onRemove,
}: GoalProgressViewProps) {
  const percent = goalProgressPercent(monthSalesCents, monthlyGoalCents);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="progressbar"
        aria-valuemin={ARIA_MIN}
        aria-valuemax={ARIA_MAX}
        aria-valuenow={clampPercent(percent)}
        aria-valuetext={`${percent}% da meta atingida`}
        className="h-3 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${clampPercent(percent)}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {progressText(monthSalesCents, monthlyGoalCents, percent)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onEdit}
          disabled={isPending}
          className="h-11 md:h-8"
        >
          {EDIT_LABEL}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          disabled={isPending}
          className="h-11 md:h-8"
        >
          {isPending ? REMOVING_LABEL : REMOVE_LABEL}
        </Button>
      </div>
    </div>
  );
}

// Card de meta mensal (Client Component — RF-05, única folha interativa do
// painel; a página `/crm` permanece RSC). Sem meta ⇒ CTA "Definir meta". Com
// meta ⇒ barra de progresso (CAPADA visualmente em 100%, `%` REAL exibido no
// texto — pode passar de 100) + edição/remoção em reais. A11y (RF-07):
// `role="progressbar"` com `aria-valuenow` clampado a [0,100] (contrato ARIA
// exige o valor dentro do range) e `aria-valuetext` com o percentual real por
// extenso — o texto visível ao lado também mostra o número real, sem cap.
export function GoalCard({
  monthlyGoalCents,
  monthSalesCents,
  onUpdateGoal,
}: GoalCardProps) {
  const [mode, setMode] = useState<GoalCardMode>("view");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<GoalFormFieldValues, unknown, GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: goalDefaultValue(monthlyGoalCents),
  });

  const openEdit = () => {
    form.reset(goalDefaultValue(monthlyGoalCents));
    setErrorMessage(null);
    setMode("edit");
  };

  const closeEdit = () => {
    setErrorMessage(null);
    setMode("view");
  };

  const applyGoal = (nextGoalCents: number | null) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await onUpdateGoal({ monthlyGoalCents: nextGoalCents });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setMode("view");
    });
  };

  const submit = (values: GoalFormValues) => {
    applyGoal(values.monthlyGoalCents);
  };

  const removeGoal = () => {
    applyGoal(null);
  };

  const goalError = form.formState.errors.monthlyGoalCents?.message;

  const editForm = (
    <form
      onSubmit={form.handleSubmit(submit)}
      noValidate
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={GOAL_INPUT_ID}>{GOAL_LABEL}</Label>
        <Input
          id={GOAL_INPUT_ID}
          type="text"
          inputMode="decimal"
          placeholder={GOAL_PLACEHOLDER}
          className="h-11 md:h-9"
          aria-invalid={goalError ? true : undefined}
          aria-describedby={goalError ? `${GOAL_INPUT_ID}-error` : undefined}
          {...form.register("monthlyGoalCents")}
        />
        {goalError ? (
          <p id={`${GOAL_INPUT_ID}-error`} className="text-sm text-destructive">
            {goalError}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending} className="h-11 md:h-8">
          {isPending ? SAVING_LABEL : SAVE_LABEL}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={closeEdit}
          disabled={isPending}
          className="h-11 md:h-8"
        >
          {CANCEL_LABEL}
        </Button>
        {monthlyGoalCents !== null ? (
          <Button
            type="button"
            variant="ghost"
            onClick={removeGoal}
            disabled={isPending}
            className="h-11 md:h-8"
          >
            {isPending ? REMOVING_LABEL : REMOVE_LABEL}
          </Button>
        ) : null}
      </div>
    </form>
  );

  const viewContent =
    monthlyGoalCents === null ? (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{NO_GOAL_TEXT}</p>
        <Button
          type="button"
          onClick={openEdit}
          className="h-11 w-full md:h-9 md:w-auto md:self-start"
        >
          {CTA_LABEL}
        </Button>
      </div>
    ) : (
      <GoalProgressView
        monthSalesCents={monthSalesCents}
        monthlyGoalCents={monthlyGoalCents}
        isPending={isPending}
        onEdit={openEdit}
        onRemove={removeGoal}
      />
    );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent>{mode === "edit" ? editForm : viewContent}</CardContent>
    </Card>
  );
}
