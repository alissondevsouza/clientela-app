-- Custom SQL migration file, put your code below! --
-- CRM-14 backfill (RF-08): copia a meta atual (consultants.monthly_goal_cents)
-- para uma linha em monthly_goals no mês local em que esta migração roda.
-- A coluna antiga permanece intocada (expand sem contract — rollback seguro).
--
-- Literal de fuso ('America/Sao_Paulo') inline: ADR-0018 determina que o
-- literal do fuso vive só em packages/shared/src/time.ts, mas migração SQL
-- não importa TypeScript — esta é a mesma exceção já aberta pela migração
-- 0012 (sales_lifecycle_backfill) para o mesmo motivo.
INSERT INTO monthly_goals (consultant_id, month_start, goal_cents)
SELECT
  c.id,
  date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date,
  c.monthly_goal_cents
FROM consultants c
WHERE c.monthly_goal_cents IS NOT NULL
ON CONFLICT (consultant_id, month_start) DO NOTHING;
