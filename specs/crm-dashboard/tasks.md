---
feature: crm-dashboard
module: api, web, shared
phase: tasks
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [plan.md]
---

# Tasks: crm-dashboard

## Milestone 1: Contratos, colunas e snapshot de custo

- [x] **Task 1.1** — Shared: `dashboard.ts` (dashboardSummarySchema, updateGoalSchema — goal int > 0 ≤ teto ou null) + testes + reexports
  - Arquivos: `packages/shared/src/dashboard.ts` (+ teste), `index.ts`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run packages/shared` verde
  - Implementado por: —
- [x] **Task 1.2** — Colunas: `sale_items.cost_cents` (NOT NULL default 0, CHECK ≥ 0) e `consultants.monthly_goal_cents` (nullable, CHECK > 0) + migração + **createSale captura cost_cents**: ampliar a projeção de `findProductsByIds` (hoje só `id, name, priceCents`) p/ incluir `costCents`, estender os tipos `SaleProductSnapshot` + `SaleItemData`, service compõe o `costCents`, repository grava no insert (hoje não envia) + extensão dos testes de sales (unidade: item com costCents do produto; integração: snapshot provado — mudar custo depois não afeta) + integração das colunas
  - Arquivos: `apps/api/src/db/schema/{sale-items,consultants}.ts`, `apps/api/drizzle/0006_*.sql`, `apps/api/src/modules/sales/{sales.service,sales.repository,sales.service.test,sales.integration.test}.ts` (estender), `apps/api/src/db/sales-tables.integration.test.ts` (estender)
  - Dependências: nenhuma · Paralelizável: sim (com 1.1)
  - Verificação: `bunx vitest run apps/api` verde completo
  - Implementado por: —

## Milestone 2: API — módulo dashboard

- [x] **Task 2.1** — Módulo dashboard: repository (summary SQL — mês corrente `date_trunc`, lucro por snapshot com bigint+guarda, recebíveis, meta; updateGoal), service, rotas (GET /dashboard/summary, PUT /dashboard/goal), wiring app/index + fakes, unidade + integração (fixtures exatas: mês/cancelada/mês-anterior/escopo/zeros; goal grava/remove/0 ⇒ 422; 401)
  - Arquivos: `apps/api/src/modules/dashboard/*` (5 arquivos), `apps/api/src/{app,index}.ts` (+ fakes das suítes)
  - Dependências: 1.1, 1.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde
  - Implementado por: —

## Milestone 3: Web — painel

- [x] **Task 3.1** — Helpers: `dashboard-api.ts` (getDashboardSummary, updateGoal) + `goal-progress.ts` (goalProgressPercent puro: 0/parcial/100/>100/inteiros) + testes
  - Arquivos: `apps/web/src/lib/{dashboard-api,goal-progress}.ts` (+ testes)
  - Dependências: 1.1 · Paralelizável: sim (com M2)
  - Verificação: `bunx vitest run apps/web` verde
  - Implementado por: —
- [x] **Task 3.2** — Home `/crm`: placeholder → painel (summary-cards: vendas do mês, lucro estimado c/ nota, a receber c/ atrasadas destacadas + link; goal-card client: CTA/progresso/form em reais; links rápidos) + `updateGoalAction` em **novo** `crm/actions.ts` (NÃO existe hoje; NÃO tocar o `(crm)/actions.ts` do logout, um nível acima) + loading/error da home
  - Arquivos: `apps/web/src/app/(crm)/crm/{page,loading,error}.tsx`, `apps/web/src/app/(crm)/crm/actions.ts` (**criar**), `apps/web/src/components/dashboard/{summary-cards,goal-card}.tsx`
  - Dependências: 3.1, 2.1 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes
  - Implementado por: —

## Milestone 4: Checkpoint

- [ ] **Task 4.1** — lint + typecheck + test (raiz) + build web
  - Verificação: tudo verde
  - Implementado por: —

## Ordem de Execução

(1.1 ∥ 1.2) → 2.1; 3.1 após 1.1 (∥ 2.1) → 3.2 → 4.1.

## Definition of Done (agregado)

- [ ] Critérios testados · verdes · build ok · rules/ADRs
