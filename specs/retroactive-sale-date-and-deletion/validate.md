---
feature: Data retroativa da venda e exclusão de venda
phase: qa
round: 4
date: 2026-09-19
verdict: approved
---

# Validação QA — rodada 4

## Escopo auditado

Diff corrente contra `feature/sales-lifecycle-payment-plans`, `spec.md`, `plan.md`, `tasks.md`, `progress.md`, regras TypeScript/segurança/testes e ADRs 0013, 0018, 0023, 0024 e 0025.

## Comandos executados

| Comando | Resultado | Evidência |
|---|---|---|
| `bun run lint` | passou | Biome: `Checked 424 files ... No fixes applied.` |
| `bun run typecheck` | passou | `@clientela/shared`, `@clientela/web` e `@clientela/api` saíram com código 0. |
| `bun run test` | passou | suíte completa executada sem falhas; enumeração da suíte: 1317 testes. |
| `bun run build` | passou | script raiz `bun run --filter='@clientela/web' build`; Next 16.2.10 compilou, verificou TypeScript e gerou as 20 páginas com código 0. |
| `bunx vitest run apps/api/src/db/sales-lifecycle-migration.integration.test.ts --reporter=verbose` | passou | 1 arquivo, 14 testes, 0 falhas; aplica a cadeia legada `0000`–`0010` e depois `0011` → `0012` → `0013` → `0014` em PostgreSQL 18 real. |
| `git diff --check feature/sales-lifecycle-payment-plans --` | passou | sem erro de whitespace. |
| busca de regressão RF-07 | passou | nenhum `toDatePart` nos quatro pontos do escopo; os quatro usam `formatLocalDateBr`. |

## Migração e build

- `0014_brief_lifeguard.sql` contém somente DROP/ADD dos dois CHECKs temporais, sem placeholders SQL e sem alteração destrutiva de dados.
- O ensaio de migração parte do estado anterior ao CRM-12 e valida explicitamente a sequência até `0014`; preserva snapshots, estoque e valores e testa falhas fechadas das invariantes remanescentes.
- O build da raiz é reproduzível pelo script versionado. O único workspace com build de aplicação é `@clientela/web`; a API é executada por Bun e é coberta pelo typecheck, pela suíte com Postgres real e pelas imagens de deploy.

## Cobertura dos critérios de aceite

Todos atendidos por testes de contrato/unidade, integrações com Testcontainers e build. Inclui: piso e data futura; instante local ao meio-dia; matriz temporal e cobranças retroativas; vencimento parcelado; formatação local nos quatro pontos; exclusão nos três estados, paga, cross-tenant, antiga, órfã e concorrente; preservação de compromisso; defaults retroativos; e agregado mensal por `sold_at`.

Pendências de E2E já declaradas pela spec permanecem limitadas à interação/renderização React, pois não há infraestrutura Playwright/jsdom no projeto; as decisões de UI foram extraídas para helpers puros cobertos por testes.
