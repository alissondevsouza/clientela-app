---
feature: crm-home-period-and-daily-hub
module: api, web, shared
phase: tasks
status: done
created: 2026-09-23
updated: 2026-09-23
depends_on: [plan.md]
---

# Tasks: crm-home-period-and-daily-hub

<!-- Milestone fechado = checkpoint: `bun run lint`, `bun run typecheck`, `bun run test`. Sem commit — git é do humano (ADR-0006). -->

## Milestone 1: Contratos e regras puras (shared)

- [x] **Task 1.1** — Período: `dashboardPeriodQuerySchema` (RF-01), `resolveDashboardPeriod(query, todayIso)` com `inProgress` e comparação (RF-02/RF-03), helpers de calendário (`addMonths`, último dia do mês, dia seguinte, meses entre dois `yyyy-mm`) e `periodBoundsUtc(startDate, endDate)`; exportar no `index.ts`.
  - Arquivos: `packages/shared/src/dashboard-period.ts`, `dashboard-period.test.ts`, `index.ts`
  - Dependências: nenhuma
  - Paralelizável: sim (com 1.2 e 1.4)
  - Verificação: `bunx vitest run packages/shared/src/dashboard-period.test.ts` cobrindo todos os casos dos critérios RF-01/02/03, incluindo um mês de 2018 (DST) nos bounds
  - Implementado por: clientela-implementer (instância "1.1–1.3", 2026-09-23)
- [x] **Task 1.2** — Derivados: `averageTicketCents`, `marginPercent`, `deltaPercent` (+ classificação `up | down | flat | no_base | no_activity`), `goalPace` (falta, por dia, excedente, dias restantes), `birthdayWindow(todayIso, days)` (lista de `MM-DD` com regra 29/02) e `nextBirthdayInWindow(birthday, todayIso, days)`.
  - Arquivos: `packages/shared/src/dashboard-metrics.ts`, `dashboard-metrics.test.ts`, `index.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: testes de unidade dos critérios RF-06/RF-10 e da janela 27/12→03/01 e 29/02
  - Implementado por: clientela-implementer (instância "1.1–1.3", 2026-09-23)
- [x] **Task 1.3** — Contratos do painel: `dashboardPerformanceSchema` (period, current/previous, series de 12, topProducts, topClients, goal), `dashboardTodaySchema` (collections, appointments, deliveries, newLeads, restock, birthdays), `updateGoalResponseSchema` (`{ month, monthlyGoalCents }`). **Não** remover `dashboardSummarySchema` ainda (sai na 6.3).
  - Arquivos: `packages/shared/src/dashboard.ts`, `dashboard.test.ts`
  - Dependências: 1.1 (tipo do período resolvido)
  - Paralelizável: não
  - Verificação: testes de unidade aceitando payload válido, lucro negativo, `previous`/`goal` nulos, `series` com tamanho ≠ 12 rejeitado
  - Implementado por: clientela-implementer (instância "1.1–1.3", 2026-09-23) — 391 testes de `packages/shared` verdes
- [x] **Task 1.4** — Filtros das listagens: `salesListStatusFilterValues` (+ rótulo "Vendidas"), `soldFrom`/`soldTo`/`delivery` em `salesListQuerySchema`; `overdue`/`paidFrom`/`paidTo` em `receivablesListQuerySchema`, com os refinamentos de combinação e ordem das datas (RF-14/RF-15), mensagens pt-BR.
  - Arquivos: `packages/shared/src/sales.ts`, `sales.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: testes de unidade de aceite/rejeição de cada combinação
  - Implementado por: clientela-implementer (instância "1.4", 2026-09-23) — 38 testes de `sales.test.ts`; ajuste mínimo em `sales.service.ts` (`sold` ⇒ `undefined` com TODO para a Task 3.2)

## Milestone 2: Banco e base de testes (api)

- [x] **Task 2.1** — Tabela `monthly_goals` (plan: colunas, CHECKs, UNIQUE) e índice `sales_consultant_sold_at_idx`; gerar `0015`; criar custom `0016_monthly_goals_backfill` (RF-08); teste de tabela (CHECK de dia 1, CHECK do valor, unicidade, cascade) e teste de migração (aplica até `0014`, semeia consultoras com e sem meta no formato antigo, aplica `0015`/`0016`, confere linhas).
  - Arquivos: `apps/api/src/db/schema/monthly-goals.ts`, `schema/index.ts`, `schema/sales.ts`, `apps/api/drizzle/0015_*.sql`, `0016_monthly_goals_backfill.sql`, `drizzle/meta/*`, `apps/api/src/db/monthly-goals-table.integration.test.ts`, `monthly-goals-migration.integration.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim (com 2.2)
  - Verificação: `bunx vitest run apps/api/src/db/` verde; `drizzle-kit generate` sem diff pendente após a task
  - Implementado por: clientela-implementer (instância "2.1", 2026-09-23) — `0015_known_triathlon` + `0016_monthly_goals_backfill`; 139 testes de `apps/api/src/db/` verdes; `db:generate` sem diff
- [x] **Task 2.2** — `apps/api/src/db/derived-expressions.ts` com `reservedQtyExpression`, `availableQtyExpression` e `receivableOverdueExpression(todayIso)`; `products.repository.ts` passa a importar as duas primeiras (refactor sem mudança de comportamento).
  - Arquivos: `apps/api/src/db/derived-expressions.ts`, `apps/api/src/modules/products/products.repository.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `bunx vitest run apps/api/src/modules/products` verde sem alterar testes
  - Implementado por: clientela-implementer (instância "2.2", 2026-09-23) — 73 testes de products + derived-expressions verdes
- [x] **Task 2.3** — Factories em `apps/api/test/factories/`: consultora + sessão (login real), cliente, produto, venda (status, `soldAt`, `deliveredAt`, itens, cobranças com `dueDate`/`paidAt`/`voidedAt`, respeitando a matriz temporal), compromisso, lead, meta mensal.
  - Arquivos: `apps/api/test/factories/*.ts`
  - Dependências: 2.1
  - Paralelizável: não
  - Verificação: typecheck da API verde; cada factory exercitada pelos testes das tasks 3.x/4.x
  - Implementado por: clientela-implementer (instância "2.3", 2026-09-23) — 10 testes de fumaça; sessão inserida direto (hash SHA-256); validação Σ de TODAS as cobranças = total (venda cancelada tem cobranças anuladas)

## Milestone 3: Vendas e cobranças (api)

- [x] **Task 3.1** — Relógio no service de vendas: `createSalesService({ repository, clock })`; `today` (dia local) passado a toda leitura que projeta `overdue` e ao resumo de cobranças, via `receivableOverdueExpression(today)`; remover `CURRENT_DATE` do módulo; atualizar `apps/api/src/index.ts` e **todos** os `buildApp` de teste que instanciam o service. Testes de borda de fuso (RF-04): vencimento hoje às 22h locais não atrasado em summary, listagem, detalhe e baixa; atrasado no dia seguinte.
  - Arquivos: `apps/api/src/modules/sales/sales.{service,repository}.ts`, `apps/api/src/index.ts`, testes com `buildApp`, `apps/api/src/modules/sales/sales-filters.integration.test.ts`, `sales.service.test.ts`
  - Dependências: 2.2, 2.3
  - Paralelizável: não
  - Verificação: suíte completa da API verde (`bunx vitest run apps/api`); `grep CURRENT_DATE apps/api/src/modules/sales` vazio
  - Implementado por: clientela-implementer (instância "3.1", 2026-09-23) — 638 testes da API (antes da edição concorrente do painel); teste de fuso falha contra `CURRENT_DATE` (provado revertendo); PATCH verificado via releitura da venda (o endpoint devolve só a parcela alterada)
- [x] **Task 3.2** — Filtros da listagem de vendas (RF-14): `soldFrom`/`soldTo` convertidos em bounds pelo service (dias locais inclusivos), `status=sold`, `delivery`; testes de integração de bordas, combinações e 422.
  - Arquivos: `apps/api/src/modules/sales/sales.{routes,service,repository}.ts`, `sales-filters.integration.test.ts`
  - Dependências: 1.4, 3.1
  - Paralelizável: não
  - Verificação: integração verde
  - Implementado por: clientela-implementer (instância "3.2–3.3", 2026-09-23, retomada após limite de sessão)
- [x] **Task 3.3** — Filtros da listagem de cobranças (RF-15): `overdue`, `paidFrom`/`paidTo` (bounds locais, ordem `paid_at desc, id desc`); testes de integração e 422.
  - Arquivos: `apps/api/src/modules/sales/sales.{routes,service,repository}.ts`, `sales-filters.integration.test.ts`
  - Dependências: 1.4, 3.1
  - Paralelizável: não (mesmos arquivos da 3.2)
  - Verificação: integração verde
  - Implementado por: clientela-implementer (instância "3.2–3.3", 2026-09-23, retomada após limite de sessão) — 104 testes de sales, 688 da API

## Milestone 4: Painel (api)

- [x] **Task 4.1** — Repository de desempenho e metas: métricas de um intervalo (Vendido, contagem, lucro, recebido, clientes distintas), série de 12 meses (VALUES de bounds), top produtos, top clientes, meta efetiva e upsert da meta.
  - Arquivos: `apps/api/src/modules/dashboard/dashboard.repository.ts`
  - Dependências: 2.1, 2.2
  - Paralelizável: sim (com 4.2 se feitos em arquivos separados; senão sequencial)
  - Verificação: coberto pelos testes da 4.4
  - Implementado por: clientela-implementer (instância "4.1–4.3", 2026-09-23, retomada após limite de sessão)
- [x] **Task 4.2** — Repository do "hoje": grupos e contagens de cobrança, compromissos do dia (com WhatsApp de cliente/lead), entregas pendentes, leads novos, encomendas sem estoque (disponível < 0, `shortCount`, `missingQty`), aniversariantes por lista de `MM-DD`. Todas as listas com `LIMIT`.
  - Arquivos: `apps/api/src/modules/dashboard/dashboard.repository.ts` (ou `dashboard-today.repository.ts`)
  - Dependências: 2.2
  - Paralelizável: ver 4.1
  - Verificação: coberto pelos testes da 4.4
  - Implementado por: clientela-implementer (instância "4.1–4.3", 2026-09-23, retomada após limite de sessão)
- [x] **Task 4.3** — Service do painel: `getPerformance(consultantId, query)` (resolve período com o relógio, lança `InvalidDashboardPeriodError` para futuro, bounds, comparação, série terminando em `toMonth`, meta só em `month` com origem e dias restantes); `getToday(consultantId)` (hoje, bounds do dia, janela de 7 dias, janela de aniversários e `nextOn`); `updateGoal` no mês corrente. Unidade com fakes e relógio fixo (inclui 23h locais do último dia do mês ⇒ ainda o mês local).
  - Arquivos: `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.errors.ts`, `dashboard.service.test.ts`
  - Dependências: 1.1, 1.2, 1.3, 4.1, 4.2
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/modules/dashboard/dashboard.service.test.ts`
  - Implementado por: clientela-implementer (instância "4.1–4.3", 2026-09-23, retomada após limite de sessão) — 50 testes do módulo dashboard; portas novas opcionais em `DashboardServiceDeps` (a 4.4 deve torná-las obrigatórias); `MAX(uuid)` inexistente ⇒ `MAX(col::text)`
- [x] **Task 4.4** — Rotas `GET /dashboard/performance`, `GET /dashboard/today`, `PUT /dashboard/goal` (resposta nova); remover `GET /dashboard/summary`; composition root. Integração (relógio fixo): critérios RF-04/05/07/09/10/11/12 e as invariantes lista = cartão de RF-14/RF-15; substituir/remover `dashboard.integration.test.ts` antigo.
  - Arquivos: `apps/api/src/modules/dashboard/dashboard.routes.ts`, `apps/api/src/plugins/error-handler.ts` (+ test), `apps/api/src/index.ts`, `apps/api/src/app.ts` (se preciso), `dashboard-performance.integration.test.ts`, `dashboard-today.integration.test.ts`, `dashboard.integration.test.ts`
  - Dependências: 3.2, 3.3, 4.3
  - Paralelizável: não
  - Verificação: suíte completa verde
  - Implementado por: clientela-implementer (instância "4.4", 2026-09-23) — 694 testes da API, 1778 no repo; portas obrigatórias; `InvalidDashboardPeriodError` ⇒ 422 `VALIDATION_ERROR`; suíte antiga do `/dashboard/summary` removida (cobertura portada)

## Milestone 5: Web — helpers e listagens

- [x] **Task 5.1** — Helpers de API: `getDashboardPerformance(query, deps)`, `getDashboardToday(deps)`, `updateGoal` com `month`; `listSales`/`listReceivables` com os parâmetros novos. Todos nunca lançam.
  - Arquivos: `apps/web/src/lib/dashboard-api.ts`, `sales-api.ts` (+ testes)
  - Dependências: 1.3, 1.4
  - Paralelizável: sim (com 5.2)
  - Verificação: testes de unidade com `fetchImpl` fake
  - Implementado por: clientela-implementer (instância "5.1", 2026-09-23) — 61 testes; exportou `salesListStatusFilterValues`/`SalesListStatusFilter`/`SALES_LIST_STATUS_FILTER_LABELS` no `index.ts` do shared (faltavam)
- [x] **Task 5.2** — Helpers puros da home: `dashboard-period-params` (searchParams → query com clamp, atalhos, setas, rótulos por extenso do período e da comparação), `dashboard-links` (drill-down e "Ver todos"), `dashboard-messages` (cobrança/aniversário/lead + `safeWhatsAppUrl`), `dashboard-today-view` (seções visíveis, "Tudo em dia"), `monthly-bars` (alturas, rótulos, destaque).
  - Arquivos: `apps/web/src/lib/dashboard-{period-params,links,messages,today-view}.ts`, `monthly-bars.ts` (+ testes)
  - Dependências: 1.1, 1.2, 1.3
  - Paralelizável: sim
  - Verificação: testes de unidade dos critérios RF-19..RF-23
  - Implementado por: clientela-implementer (instância "5.2", 2026-09-23) — 614 testes de `apps/web/src/lib`; decisões: `{data}` dd/mm, `0% vs …` para igual, rótulo curto sem ano, variante da cobrança decidida por `todayIso`
- [x] **Task 5.3** — Tela de vendas (RF-16): aba Vendidas, formulário De/Até (GET, troca De > Até), `clientId`, chips removíveis, contagem com filtro ativo, vazio de filtro com "Limpar filtros", abas e paginação preservando filtros; helpers de URL/estado em `sales-list-params.ts`.
  - Arquivos: `apps/web/src/app/(crm)/crm/sales/page.tsx`, `apps/web/src/lib/sales-list-params.ts` (+ teste)
  - Dependências: 5.1
  - Paralelizável: não (5.4 edita o mesmo `sales-list-params.ts`)
  - Verificação: testes dos helpers; `bun run build` ok
  - Implementado por: clientela-implementer (instância "5.3", 2026-09-23) — 32 testes do helper, 560 da web; build ok
- [x] **Task 5.4** — Tela de cobranças (RF-17): visões A receber / Atrasadas / Recebidas no período (troca De > Até), contagem e vazio por visão, `PaidReceivableRow`, mensagem de cobrança no `ReceivableRow`.
  - Arquivos: `apps/web/src/app/(crm)/crm/sales/receivables/page.tsx`, `apps/web/src/components/sales/{receivable-row,paid-receivable-row}.tsx`, `sales-list-params.ts`
  - Dependências: 5.1, 5.2, 5.3
  - Paralelizável: não
  - Verificação: testes dos helpers; `bun run build` ok
  - Implementado por: clientela-implementer (instância "5.4", 2026-09-23) — 90 testes dos helpers, 662 da web; build ok; contagem sempre visível nas cobranças (RF-17)

## Milestone 6: Web — nova home

- [x] **Task 6.1** — Blocos Hoje e Posição: `today-section`, `position-section`, `quick-actions`, `section-error`, skeletons correspondentes.
  - Arquivos: `apps/web/src/components/dashboard/{today-section,position-section,quick-actions,section-error,section-skeletons}.tsx`
  - Dependências: 5.1, 5.2
  - Paralelizável: sim (com 6.2)
  - Verificação: typecheck/lint; `bun run build` ok
  - Implementado por: clientela-implementer (instância "6.1", 2026-09-23, retomada após limite de sessão) — 667 testes da web; build ok; helper novo `dashboard-today-format.ts`
- [x] **Task 6.2** — Bloco Desempenho: `performance-section`, `period-selector`, `kpi-card`, `monthly-bars`, `top-lists`, `goal-card` adaptado (meta efetiva, origem, ritmo, edição só no corrente), vazios do RF-22/23/24 e `actions.ts` com o retorno novo. Seguir as diretrizes de visualização repassadas pelo orchestrator no prompt da task.
  - Arquivos: `apps/web/src/components/dashboard/{performance-section,period-selector,kpi-card,monthly-bars,top-lists,goal-card}.tsx`, `apps/web/src/app/(crm)/crm/actions.ts`
  - Dependências: 5.1, 5.2
  - Paralelizável: sim
  - Verificação: typecheck/lint; `bun run build` ok
  - Implementado por: clientela-implementer (instância "6.2", 2026-09-23, retomada após limite de sessão) — 694 testes da web; build ok; helpers novos `dashboard-kpis.ts`, `goal-view.ts`, `monthly-bars-value-label.ts`; mock temporário de `DashboardGoal` na page (sai na 6.3)
- [x] **Task 6.3** — Composição da page (três `Suspense` independentes, chamadas em paralelo, `key` do Desempenho = período), `loading.tsx`/`error.tsx` atualizados; remover `summary-cards.tsx`, `getDashboardSummary`, `dashboardSummarySchema` e seus testes (RF-13).
  - Arquivos: `apps/web/src/app/(crm)/crm/{page,loading,error}.tsx`, `apps/web/src/components/dashboard/summary-cards.tsx`, `apps/web/src/lib/dashboard-api.ts`, `packages/shared/src/dashboard.ts` (+ testes)
  - Dependências: 6.1, 6.2, 4.4
  - Paralelizável: não
  - Verificação: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` verdes; busca do critério RF-13 vazia
  - Implementado por: clientela-implementer (instância "6.3", 2026-09-23) — 1769 testes no repo, lint/typecheck/build verdes; grep RF-13 só com comentários históricos

## Milestone 8: Home mais enxuta (emenda de 2026-09-24)

- [x] **Task 8.1** — Helper puro `buildTodayTiles(today)` (RF-20a) com testes; componente `TodaySummaryTiles` (grade de cartões-resumo, Server Component) usado pelo `TodaySection` da home; página `/crm/today` (RF-28) reaproveitando as seções detalhadas atuais com âncoras, `loading.tsx`/`error.tsx`; ordem da home Desempenho → Hoje (RF-18).
  - Arquivos: `apps/web/src/lib/dashboard-today-tiles.ts` (+ teste), `apps/web/src/components/dashboard/today-section.tsx` (e/ou `today-summary-tiles.tsx`, `today-details.tsx`), `apps/web/src/app/(crm)/crm/page.tsx`, `apps/web/src/app/(crm)/crm/today/{page,loading,error}.tsx`, `section-skeletons.tsx`
  - Dependências: M6
  - Paralelizável: não
  - Verificação: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`; checagem em 375px
  - Implementado por: clientela-implementer (instância "8.1", 2026-09-24) — 1845 testes; helper `dashboard-today-tiles.ts`; página `/crm/today`; "faltam N un." soma só os itens exibidos (aproximação — a revisar na QA)

## Milestone 7: Graduação (orchestrator, Phase 5)

- [x] **Task 7.1** — ADR-0026 (Vendido como faturamento principal — emenda 0023/0025; lucro estimado sobre o Vendido; Recebido por `paid_at`; read-model do painel ampliado para agenda, leads, clientes e produtos), ADR-0027 (meta mensal com histórico e herança — **supera** a decisão 3 do ADR-0014), notas de emenda no ADR-0014 (decisões 3 e 4 e a consequência "mês em UTC" substituídas) e no ADR-0018 (dashboard e atraso migrados; exceção do literal de fuso na migração `0016`), índice de ADRs.
  - Verificação: `project-memory/decisions/README.md` lista 0026 e 0027; cada ADR emendado tem a linha **Emendado por** apontando para o novo; `grep -n "0026\|0027" project-memory/decisions/0014-* 0018-* 0023-* 0025-*` retorna as notas
- [x] **Task 7.2** — `04-domain-model.md` (entidade MonthlyGoal, invariante 10 reescrita, invariante de atraso local), `03-features.md` (dashboard e central do dia), `known-issues.md` (fechar os dois de fuso; abrir "remover `consultants.monthly_goal_cents`"; atualizar o de `toSafeInteger` se surgir 4ª cópia), `lessons.md` se houver gotcha.
  - Verificação: `known-issues.md` sem os dois itens de fuso abertos (marcados resolvidos com data e spec) e com o item da coluna antiga; invariante 10 do `04-domain-model.md` cita "Vendido" e `monthly_goals`
- [x] **Task 7.3** — ROADMAP: CRM-14 `[R]` no handoff; REL-03 volta a `[ ]` com o escopo restante (lista do mês inteiro), registrando que a janela de 8 dias foi entregue pelo CRM-14.
  - Verificação: `grep -n "CRM-14\|REL-03" specs/ROADMAP.md` mostra os status novos

## Ordem de Execução

1. M1: 1.1, 1.2 e 1.4 em paralelo → 1.3.
2. M2: 2.1 e 2.2 em paralelo → 2.3.
3. M3: 3.1 → 3.2 → 3.3.
4. M4: 4.1 e 4.2 → 4.3 → 4.4.
5. M5: 5.1 e 5.2 em paralelo → 5.3 → 5.4.
6. M6: 6.1 e 6.2 em paralelo → 6.3.
7. QA (Phase 4) → M7.

## Definition of Done (agregado)
- [ ] Todos os critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos
- [ ] `bun run test` (com integração) verde
- [ ] `bun run build` ok
- [ ] Ensaio de migração com dados no formato anterior verde
- [ ] QA de runtime em build de produção (375px e desktop) com checklist por RF
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
