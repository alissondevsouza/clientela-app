"use client";

import type { DashboardPerformance, UpdateGoalInput } from "@clientela/shared";
import { updateGoalSchema } from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { UpdateGoalActionResult } from "@/app/(crm)/crm/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToReaisInput, formatBRL, parseBRLToCents } from "@/lib/format";
import { goalProgressPercent } from "@/lib/goal-progress";
import { goalOriginText, goalPaceText } from "@/lib/goal-view";

const TITLE = "Meta do mês";
const GOAL_INPUT_ID = "monthly-goal";
const GOAL_LABEL = "Meta (R$)";
const GOAL_PLACEHOLDER = "0,00";
const GOAL_INVALID_MESSAGE = "Meta inválida — use o formato 1.500,00";
const NO_GOAL_TEXT = "Você ainda não definiu uma meta para este mês.";
const NO_GOAL_PAST_MONTH_TEXT = "Sem meta neste mês.";
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
// (RF-06/RF-10).
const progressText = (
  soldCents: number,
  goalCents: number,
  percent: number,
): string =>
  `${formatBRL(soldCents)} de ${formatBRL(goalCents)} (${percent}% da meta)`;

type GoalCardMode = "view" | "edit";

// Qual ação está em voo (S1, rodada 2): sem isso, o botão errado mostrava
// "Removendo..." durante um SALVAMENTO (os dois botões compartilhavam o mesmo
// `isPending` do `useTransition`, que não distingue qual ação disparou a
// transição).
type PendingGoalAction = "save" | "remove" | null;

// Bloco `goal` de `GET /dashboard/performance` (RF-10/RF-11) — só presente
// quando o período é um mês isolado (`period.kind === "month"`); o próprio
// `GoalCard` só é montado pela `PerformanceSection` quando `goal !== null`.
export type DashboardGoal = NonNullable<DashboardPerformance["goal"]>;

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
  /** Bloco `goal` do RF-10/RF-11 (não nulo — a `PerformanceSection` só renderiza este card quando há). */
  goal: DashboardGoal;
  /** Vendido (RF-05) do mês da meta — base do progresso e do ritmo, nunca "vendas concluídas". */
  soldCents: number;
  /** Mês (`yyyy-mm`) do período exibido — `performance.period.fromMonth` (S2, rodada 2: distingue mês corrente de mês passado no texto de origem). */
  month: string;
  // Referência direta à Server Action (`updateGoalAction`, `"use server"`) —
  // NÃO um closure/adaptador criado no Server Component: só a própria action
  // pode cruzar a fronteira RSC → client como prop de função (web.md/lesson
  // RSC×client). O client component adapta o valor em centavos para o shape
  // `UpdateGoalInput` do contrato aqui dentro.
  onUpdateGoal: (values: UpdateGoalInput) => Promise<UpdateGoalActionResult>;
};

type GoalProgressViewProps = {
  soldCents: number;
  goalCents: number;
  source: DashboardGoal["source"];
  inheritedFromMonth: string | null;
  month: string;
  editable: boolean;
  daysRemaining: number;
  pendingAction: PendingGoalAction;
  onEdit: () => void;
  onRemove: () => void;
};

// Progresso com meta definida: origem (explícita/herdada), barra visual
// CAPADA em 100% (`clampPercent`) + texto com o percentual REAL (sem cap) e,
// no mês corrente, o ritmo (RF-10). Mês passado mostra o resultado sem ritmo
// e sem botões de edição.
function GoalProgressView({
  soldCents,
  goalCents,
  source,
  inheritedFromMonth,
  month,
  editable,
  daysRemaining,
  pendingAction,
  onEdit,
  onRemove,
}: GoalProgressViewProps) {
  const percent = goalProgressPercent(soldCents, goalCents);
  const originText = goalOriginText(
    source,
    inheritedFromMonth,
    month,
    editable,
  );
  const paceText = editable
    ? goalPaceText({ soldCents, goalCents, daysRemaining })
    : null;
  const isRemoving = pendingAction === "remove";
  const isBusy = pendingAction !== null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{originText}</p>
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
        {progressText(soldCents, goalCents, percent)}
      </p>
      {paceText !== null ? (
        <p className="text-sm font-medium">{paceText}</p>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            disabled={isBusy}
            className="h-11 md:h-8"
          >
            {EDIT_LABEL}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            disabled={isBusy}
            className="h-11 md:h-8"
          >
            {isRemoving ? REMOVING_LABEL : REMOVE_LABEL}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type NoGoalViewProps = {
  editable: boolean;
  isBusy: boolean;
  onDefine: () => void;
};

// Sem meta (RF-10/RF-24): CTA no mês corrente ("Definir meta"); no mês
// passado só o resultado ("Sem meta neste mês"), sem ação.
function NoGoalView({ editable, isBusy, onDefine }: NoGoalViewProps) {
  if (!editable) {
    return (
      <p className="text-sm text-muted-foreground">{NO_GOAL_PAST_MONTH_TEXT}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{NO_GOAL_TEXT}</p>
      <Button
        type="button"
        onClick={onDefine}
        disabled={isBusy}
        className="h-11 w-full md:h-9 md:w-auto md:self-start"
      >
        {CTA_LABEL}
      </Button>
    </div>
  );
}

// Card de meta mensal (Client Component — RF-10/RF-24, única folha
// interativa do bloco Desempenho). Edição/remoção só quando `goal.editable`
// (mês corrente — RF-10 não permite editar mês passado/futuro nesta feature).
export function GoalCard({
  goal,
  soldCents,
  month,
  onUpdateGoal,
}: GoalCardProps) {
  const [mode, setMode] = useState<GoalCardMode>("view");
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<PendingGoalAction>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Se a última ação terminou com sucesso — só sai do modo de edição quando a
  // transição REALMENTE termina (`isPending` volta a `false`), nunca logo
  // depois do `await` da action (S1, rodada 2): até lá o `goal` da prop ainda
  // é o valor ANTIGO (o RSC só recarrega quando a transição termina); sair do
  // modo de edição mais cedo mostrava o card de volta com o valor antigo.
  const succeededActionRef = useRef(false);

  const form = useForm<GoalFormFieldValues, unknown, GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: goalDefaultValue(goal.goalCents),
  });

  useEffect(() => {
    if (isPending) {
      return;
    }
    if (succeededActionRef.current) {
      succeededActionRef.current = false;
      setMode("view");
    }
    setPendingAction(null);
  }, [isPending]);

  const openEdit = () => {
    form.reset(goalDefaultValue(goal.goalCents));
    setErrorMessage(null);
    setMode("edit");
  };

  const closeEdit = () => {
    setErrorMessage(null);
    setMode("view");
  };

  const applyGoal = (
    nextGoalCents: number | null,
    action: Exclude<PendingGoalAction, null>,
  ) => {
    setErrorMessage(null);
    setPendingAction(action);
    startTransition(async () => {
      const result = await onUpdateGoal({ monthlyGoalCents: nextGoalCents });
      if (!result.ok) {
        setErrorMessage(result.message);
        succeededActionRef.current = false;
        return;
      }
      succeededActionRef.current = true;
    });
  };

  const submit = (values: GoalFormValues) => {
    applyGoal(values.monthlyGoalCents, "save");
  };

  const removeGoal = () => {
    applyGoal(null, "remove");
  };

  const isBusy = pendingAction !== null;
  const isSaving = pendingAction === "save";
  const isRemoving = pendingAction === "remove";

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
        <Button type="submit" disabled={isBusy} className="h-11 md:h-8">
          {isSaving ? SAVING_LABEL : SAVE_LABEL}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={closeEdit}
          disabled={isBusy}
          className="h-11 md:h-8"
        >
          {CANCEL_LABEL}
        </Button>
        {goal.goalCents !== null ? (
          <Button
            type="button"
            variant="ghost"
            onClick={removeGoal}
            disabled={isBusy}
            className="h-11 md:h-8"
          >
            {isRemoving ? REMOVING_LABEL : REMOVE_LABEL}
          </Button>
        ) : null}
      </div>
    </form>
  );

  const viewContent =
    goal.goalCents === null ? (
      <NoGoalView
        editable={goal.editable}
        isBusy={isBusy}
        onDefine={openEdit}
      />
    ) : (
      <GoalProgressView
        soldCents={soldCents}
        goalCents={goal.goalCents}
        source={goal.source}
        inheritedFromMonth={goal.inheritedFromMonth}
        month={month}
        editable={goal.editable}
        daysRemaining={goal.daysRemaining}
        pendingAction={pendingAction}
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
