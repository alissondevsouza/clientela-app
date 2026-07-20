import { z } from "zod";
import { MONEY_MAX_CENTS } from "./products";

const GOAL_TYPE_MESSAGE =
  "Informe a meta em centavos (número inteiro) ou remova a meta";
const GOAL_MIN_MESSAGE = "A meta deve ser maior que zero";
const GOAL_MAX_MESSAGE = "A meta deve ser no máximo R$ 1.000.000,00";
const MONTH_LABEL_MESSAGE = "Informe o rótulo do mês";

// Agregado do painel `/crm` (RF-03/RF-04). `monthProfitCents` é a única
// grandeza monetária COM SINAL do projeto: uma venda com `unitPriceCents`
// abaixo do custo produz margem negativa e o schema não pode rejeitá-la — do
// contrário a serialização de um mês no prejuízo quebra (500). As demais
// somas/contagens nunca são negativas; `monthlyGoalCents` é `null` quando a
// consultora não definiu meta (RF-05: vira CTA em vez de barra).
export const dashboardSummarySchema = z.object({
  monthSalesCents: z.number().int().min(0),
  monthProfitCents: z.number().int(),
  monthSalesCount: z.number().int().min(0),
  pendingReceivablesCents: z.number().int().min(0),
  overdueReceivablesCents: z.number().int().min(0),
  overdueReceivablesCount: z.number().int().min(0),
  monthlyGoalCents: z.number().int().min(1).nullable(),
  monthLabel: z.string().min(1, MONTH_LABEL_MESSAGE),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

// Contrato de `PUT /dashboard/goal`: meta em centavos, inteiro > 0 e até o
// teto monetário do projeto (`MONEY_MAX_CENTS`, reusado de `products.ts` —
// core.md: nunca redefinir o número), OU `null` para remover a meta. Zero é
// inválido (evita divisão por zero no progresso e não é uma meta válida de
// produto). `error` no nível do `z.number()` cobre também o campo ausente
// (`{}`) em pt-BR — mesma técnica do `intField` de `products.ts`.
export const updateGoalSchema = z.object({
  monthlyGoalCents: z
    .number({ error: GOAL_TYPE_MESSAGE })
    .int(GOAL_TYPE_MESSAGE)
    .min(1, GOAL_MIN_MESSAGE)
    .max(MONEY_MAX_CENTS, GOAL_MAX_MESSAGE)
    .nullable(),
});

export type UpdateGoalInput = z.input<typeof updateGoalSchema>;
export type UpdateGoal = z.output<typeof updateGoalSchema>;
