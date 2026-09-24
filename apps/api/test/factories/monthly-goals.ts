import type { Database } from "../../src/db/client";
import { monthlyGoals } from "../../src/db/schema";

// `monthStart` é sempre o dia 1 do mês local ("yyyy-mm-01" — CHECK
// `monthly_goals_month_start_day_check`). `goalCents` nulo tem significado
// explícito: "sem meta a partir deste mês" (plan.md).
export const createMonthlyGoal = async (
  db: Database,
  consultantId: string,
  monthStart: string,
  goalCents: number | null,
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(monthlyGoals)
    .values({ consultantId, monthStart, goalCents })
    .returning({ id: monthlyGoals.id });

  if (!row) {
    throw new Error(
      "factory createMonthlyGoal: falha ao inserir a meta mensal",
    );
  }

  return { id: row.id };
};
