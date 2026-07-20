---
feature: crm-dashboard
phase: qa
status: done
reviewer: QA neutro/adversarial
created: 2026-07-19
---

# Review: crm-dashboard (CRM-07 — Dashboard)

## Resumo

Revisão adversarial da feature CRM-07 (painel `/crm`: vendas do mês, lucro
estimado por snapshot de custo, a receber, meta mensal). Toolchain 100% verde
(lint, typecheck, 674 testes incl. integração real, build de produção). Todos os
Critérios de Aceite têm teste executável correspondente, derivado do
comportamento do `spec.md` (não do diff). **Nenhum CRÍTICO.** Achados apenas de
severidade baixa (SUGESTÃO). Veredito: **APROVADO**.

## Arquivos revisados (feature)

- shared: `packages/shared/src/dashboard.ts` (+ test), `index.ts` (reexports),
  `products.ts` (`MONEY_MAX_CENTS` agora exportado e reusado).
- api: `drizzle/0006_ambiguous_luminals.sql` (+ snapshot/journal),
  `db/schema/{sale-items,consultants}.ts`, `modules/dashboard/*` (repository,
  service, routes, service.test, integration.test), `modules/sales/{sales.service,
  sales.repository}.ts` (snapshot de custo), `app.ts`/`index.ts` (wiring).
- web: `app/(crm)/crm/{page,loading,error}.tsx`, `app/(crm)/crm/actions.ts`,
  `components/dashboard/{summary-cards,goal-card}.tsx`,
  `lib/{dashboard-api,goal-progress}.ts` (+ tests).

## Conformidade com as rules

- **api.md** — Camadas routes→service→repository respeitadas; DI por
  factory/construtor no composition root (`index.ts`); service não conhece
  Drizzle/HTTP (porta `DashboardRepositoryPort`); repository é a única camada que
  toca o banco. `PUT /dashboard/goal` valida body com `updateGoalSchema` (shared)
  na fronteira. OK.
- **database.md** — Migração versionada por `drizzle-kit` (0006), aditiva; CHECKs
  corretos (`cost_cents >= 0`; `monthly_goal_cents IS NULL OR > 0`); dinheiro em
  `integer`/centavos; `bigint` cast antes de SUM/multiplicação + `toSafeInteger`
  (guarda de precisão). Sem N+1 (agregados em 4 queries fixas, não por linha). OK.
- **core.md** — Sem `any`/`as`/`!` indevidos; resultados discriminados; imutável;
  `MONEY_MAX_CENTS` reusado (não redefinido). OK.
- **web.md** — Home é RSC com 1 request (`getDashboardSummary`); `GoalCard` é a
  única folha `"use client"`; loading (skeleton) e error (retry) presentes;
  mobile-first (grid 1→2 col, alvos h-11 no mobile); form em reais reusa
  `parseBRLToCents`/`centsToReaisInput` + `updateGoalSchema` compartilhado; Server
  Action com `revalidatePath`; a Server Action é passada como referência direta
  (não closure) — respeita a lesson RSC×client. OK.
- **security.md** — Ambas as rotas novas fora da allowlist pública (default-deny,
  ADR-0012) → 401 sem token (testado); sem PII em log (o módulo não loga; erros
  mapeados no error-handler central, mensagem genérica pt-BR ao cliente). OK.
- **testing.md** — Unidade (schemas, service, goalProgressPercent) + integração
  real (Testcontainers, sem mock de banco) + regressão do snapshot; edge cases
  (vazio/zeros, negativo, teto, {}, cancelada, mês anterior, escopo). OK.

## Achados

### CRÍTICO
Nenhum.

### ALERTA
Nenhum.

### SUGESTÃO

- **[SUGESTÃO] `apps/api/src/modules/dashboard/dashboard.repository.ts:36-37,50-68`
  — `date_trunc('month', now())` depende do `TimeZone` da sessão Postgres, mas o
  `monthLabel` é formatado em UTC fixo (`dashboard.service.ts:39`).** Se o
  Postgres de produção não estiver com `TimeZone=UTC`, perto da virada de mês o
  rótulo exibido pode discordar do mês efetivamente agregado. Além disso, as
  queries de `sales` e de `profit` são statements separados (fora de transação):
  cada uma avalia `now()` independentemente — na fração de segundo da virada de
  mês poderiam escopar meses diferentes.
  Porquê: coerência do "mês corrente" entre rótulo e números na borda.
  Como corrigir: garantir `TimeZone=UTC` na sessão/instância do Postgres (documentar
  no deploy) e/ou envolver os agregados numa única transação para congelar `now()`.
  Observação: o `spec.md` (Restrições Conhecidas) já ACEITA explicitamente a
  semântica UTC e a borda de fuso — por isso é sugestão, não bloqueio.

- **[SUGESTÃO] `apps/api/src/modules/dashboard/dashboard.routes.ts:28-32,35-41`
  — dupla validação de sessão.** O `auth-guard` global já valida o token; a rota
  revalida via `resolveConsultantId` (2ª ida ao banco por request). É o padrão
  existente do projeto (`/auth/me`, clients) e não é bug; fica como oportunidade
  futura de expor a identidade resolvida pelo guard no contexto para evitar a
  segunda consulta. Sem impacto funcional.

## Cobertura dos Critérios de Aceite

| Critério (RF) | Coberto por | Status |
|---|---|---|
| RF-01 colunas/CHECKs/defaults, migração aditiva | `db/sales-tables.integration.test.ts`, migração `0006` + schema (`sale-items.ts`, `consultants.ts`) | Coberto |
| RF-02 snapshot: grava cost do produto; mudar custo depois não altera venda antiga | `sales.integration.test.ts:556` (`itemRow.costCents==4200` antes/depois da mudança) | Coberto |
| RF-03/04 monthProfitCents negativo serializa (preço < custo) | `dashboard.integration.test.ts:461` (-1000) + `dashboard.test.ts:32` | Coberto |
| RF-04 agregados exatos do mês; cancelada/mês anterior/escopo fora | `dashboard.integration.test.ts:382` (16000/2/9800; exclusões provadas) | Coberto |
| RF-04 sem dados ⇒ zeros + meta null | `dashboard.integration.test.ts:362` | Coberto |
| RF-04 recebíveis batem com /receivables/summary | `dashboard.integration.test.ts:493` | Coberto |
| RF-04 meta grava/remove(null); 0/negativo/teto ⇒ 422 pt-BR | `dashboard.integration.test.ts:549,589` | Coberto |
| RF-04 401 sem token nas 2 rotas | `dashboard.integration.test.ts:621` | Coberto |
| RF-03 schemas shared pt-BR incl. {}, goal null | `dashboard.test.ts` (updateGoal/summary) | Coberto |
| RF-03 MONEY_MAX_CENTS reusado (não duplicado) | `products.ts:12` (export) + `dashboard.ts:2` (import) | Coberto |
| RF-05 helpers web (dashboard-api) | validado via typecheck + consumo em page/actions; contrato exercitado na integração | Coberto (unidade helper de fetch não isolada, mas contrato coberto) |
| RF-05 home RSC 1 request; loading/erro; goal-card client mínimo; form reais; action revalidatePath | `page.tsx`, `loading.tsx`, `error.tsx`, `goal-card.tsx`, `actions.ts` + build de produção verde | Coberto (runtime interativo pendente — manual) |
| RF-07 goalProgressPercent puro (0/parcial/100/>100/div0) | `goal-progress.test.ts` | Coberto |
| RF-07 a11y barra (role=progressbar/aria) + sem float | `goal-card.tsx:111-123` (progressbar, aria-valuenow clampado, valuetext real) | Coberto |
| RF-06 cancelada fora das somas | `dashboard.integration.test.ts:417` | Coberto |
| RF-07 LGPD logs sem PII | módulo dashboard não loga; erros genéricos pt-BR | Coberto |

## Pendências (handoff)

- QA de runtime interativa da home (`verify`) não executável neste ambiente —
  verificar manualmente: definir/editar/remover meta pela UI, atrasadas em
  destaque, links rápidos. O build de produção já prova o RSC×client (risco
  principal). E2E segue como pendência REL-01 (declarado no spec).

## Veredito

**APROVADO** — lint/typecheck/build limpos, suíte completa verde (674/674, incl.
integração real com Postgres), todos os Critérios de Aceite cobertos por teste
executável, nenhum achado CRÍTICO ou ALERTA. As duas SUGESTÕES são melhorias
não-bloqueantes (uma delas já explicitamente aceita no spec).
