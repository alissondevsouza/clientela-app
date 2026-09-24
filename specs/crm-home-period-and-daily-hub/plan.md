---
feature: crm-home-period-and-daily-hub
module: api, web, shared
phase: plan
status: draft
created: 2026-09-23
updated: 2026-09-23
depends_on: [spec.md, research.md]
---

# Plan: crm-home-period-and-daily-hub

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| **Período resolvido por função pura em `packages/shared/src/dashboard-period.ts`** (schema RF-01, resolução RF-02, comparação RF-03, helpers de calendário `yyyy-mm`/`yyyy-mm-dd` e `periodBoundsUtc(startDate, endDate)` → `{ startUtc, endUtc }` com `endUtc` = 00:00 local do dia seguinte a `endDate`) | A API usa para recortar (autoritativa) e a web para montar URLs/rótulos — uma regra só, sem duplicar. Os bounds reusam `appLocalDateTimeToUtc` (duas passadas, cobre DST de antes de 2019) — ADR-0018 |
| **Métricas derivadas e ritmo da meta em `packages/shared/src/dashboard-metrics.ts`** (ticket, margem, variação, ritmo, janela de aniversário com a regra de 29/02) | Regras de exibição testáveis sem jsdom (lesson); a API calcula `nextOn`/janela com a mesma função que os testes exercitam |
| **"Hoje" vem do relógio injetado no service** (`clock` → `appLocalDateIso`); o repository recebe instantes/datas prontos | Padrão ADR-0018; integração controla a borda do dia e do mês com relógio fixo em vez de depender de `now()` do Postgres |
| **Service de vendas ganha `clock`**; `overdue` vira `receivableOverdueExpression(today)` com `today` passado pelo service a toda leitura que projeta cobranças (detalhe, criação, baixa/estorno, listagem, resumo) | Decisão 4 do humano: "atrasado" no fuso local em todo lugar — se só o painel mudasse, home e tela de vendas discordariam das 21h à meia-noite |
| **Expressões derivadas compartilhadas em `apps/api/src/db/derived-expressions.ts`**: `reservedQtyExpression`, `availableQtyExpression` (movidas de `products.repository.ts`) e `receivableOverdueExpression(today)` (movida de `sales.repository.ts`) | O painel precisa das mesmas regras de reserva e atraso; copiar a expressão faria a regra divergir (como o `toSafeInteger` já replicado). Fica na camada `db/` (conhecimento de schema), não em internals de módulo — api.md continua respeitado |
| **Módulo `dashboard` continua sendo o read-model cross-tabela** (ADR-0014): lê `sales`, `sale_items`, `receivables`, `clients`, `appointments`, `leads`, `products` e `monthly_goals` por SQL próprio, cada endpoint numa transação read-only `repeatable read` | Mesmo racional do ADR-0014 (agregado de leitura é o domínio do painel); injetar services de outros módulos traria N+1 (ex.: WhatsApp do compromisso só existe no detalhe) ou exporia campos que as listas minimizam de propósito |
| **Três endpoints para três blocos**: `GET /dashboard/today`, `GET /dashboard/performance` e — para Posição — os já existentes `GET /receivables/summary` + `GET /products/summary` | Cada bloco falha e carrega isolado (RF-18) sem endpoint novo desnecessário; `GET /dashboard/summary` sai (RF-13) |
| **Série de 12 meses numa query com tabela derivada de bounds** (`(VALUES (month, start, end), …) AS m` montado com `sql.join` de parâmetros; `LEFT JOIN` em `sales`/`sale_items` por `sold_at >= start AND sold_at < end`) | Agrupa por mês local sem `AT TIME ZONE`/`date_trunc` na coluna (ADR-0018) e sem 12 round-trips. Arrays JS não podem ir crus ao template do Drizzle (viram lista de parâmetros) — por isso VALUES explícito |
| **Top produtos agrupados por `COALESCE(product_id::text, 'snapshot:' \|\| product_name)`**, nome atual via `LEFT JOIN products` (snapshot quando o produto foi excluído); top clientes só `client_id` não nulo, nome atual via join | Produto renomeado não se divide em duas linhas; produto excluído continua aparecendo (ADR-0013); venda anônima não é "cliente" |
| **`status=sold` como valor de filtro** (`salesListStatusFilterValues = [...saleStatusValues, "sold"]`, rótulo "Vendidas") mapeado para `status IN ('open','completed')` | O drill-down do Vendido precisa de uma lista cujo total **seja** o cartão (invariante RF-14); "Todas" incluiria canceladas |
| **Meta por mês: tabela `monthly_goals`** (`id` uuidv7, `consultant_id` FK cascade, `month_start date` com CHECK de dia 1, `goal_cents integer NULL` com CHECK `> 0 AND <= MONEY_MAX_CENTS` quando presente — via `sql.raw(String(MONEY_MAX_CENTS))`, precedente de `PERCENT_BASIS_POINTS` em `products.ts` —, timestamps, UNIQUE `(consultant_id, month_start)` — o índice único cobre a FK por ter `consultant_id` na frente) | RF-07; `NULL` com significado explícito ("sem meta a partir daqui"); teto único do projeto, sem magic number (core.md) |
| **Meta efetiva** = `SELECT goal_cents, month_start … WHERE month_start <= $mês ORDER BY month_start DESC LIMIT 1`; **upsert** = `INSERT … ON CONFLICT (consultant_id, month_start) DO UPDATE SET goal_cents, updated_at` | Herança sem materializar meses; sem corrida de duplicata |
| **Coluna `consultants.monthly_goal_cents` mantida e ignorada** (expand sem contract) | Rollback do deploy volta ao código antigo com a meta intacta; remoção fica como known-issue (database.md: destrutiva exige plano próprio) |
| **Backfill em migração custom `0016`** com `date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date` | Migração SQL não importa TS; é a única exceção ao "literal do fuso só em `time.ts`" (ADR-0018), comentada no arquivo. Roda uma vez, no deploy |
| **Índice `sales_consultant_sold_at_idx (consultant_id, sold_at)`**; o `sales_consultant_id_idx` existente é mantido | Recortes por período e a ordem `sold_at desc` da listagem usam o par; remover o índice antigo não traz ganho mensurável e é mais uma mudança no deploy. Sem índice em `receivables.paid_at`: volume de uma consultora não justifica (database.md) |
| **Aniversários por `to_char(birthday, 'MM-DD') IN (…)`** com a lista de 8 `MM-DD` (+ `02-29` quando a janela contém 28/02 de ano não bissexto) calculada no service | Coluna `date` sem fuso; a janela e a regra de 29/02 ficam numa função pura testada; tabela de clientes de uma consultora dispensa sargabilidade aqui |
| **Web: um `Suspense` por bloco** com Server Component assíncrono que chama helper de resultado discriminado; `ok: false` ⇒ `SectionError` (client, `router.refresh()` em `startTransition`) | Isolamento de falha sem nova dependência (sem `react-error-boundary`); exceção inesperada ainda cai no `error.tsx` da rota |
| **Período na URL** (`?period=&month=&year=&from=&to=`), saneado na page com `.catch` + clamp de futuro para o mês corrente (usando o relógio do servidor web em `APP_TIME_ZONE`); `key` do `Suspense` do Desempenho = período | Navegação por link/GET form (server-first, funciona sem JS); trocar período só re-suspende o bloco de Desempenho |
| **Gráfico em CSS** (barras `div` com altura percentual calculada por helper puro), cada barra um `Link` com `aria-label` por extenso; cores pelos tokens do tema (`bg-primary`, `bg-muted`, `text-muted-foreground`), destaque do período por contraste + borda, nunca só por cor | web.md: sem lib grande no client sem justificativa; a11y (cor não é o único sinal). O orchestrator repassa ao implementer as diretrizes da skill de visualização de dados disponível na sessão |
| **Mensagens de WhatsApp em `apps/web/src/lib/dashboard-messages.ts`** + wrapper `safeWhatsAppUrl` que devolve `null` quando `buildWhatsAppUrl` lançaria | `buildWhatsAppUrl` lança com número inválido; renderização nunca pode quebrar por dado da cliente (RF-19) |
| **Factories de teste em `apps/api/test/factories/`** (consultora+sessão, cliente, produto, venda com itens e cobranças, compromisso, lead, meta) usadas pelos testes **novos** | `testing.md` exige; migrar os testes antigos está fora do escopo (diff enorme sem ganho de comportamento) |
| **Período futuro ⇒ `InvalidDashboardPeriodError`** (`dashboard.errors.ts`), mapeado para 422 `VALIDATION_ERROR` no `plugins/error-handler.ts`; o resto da validação de período fica no schema Zod | O "futuro" depende do relógio injetado e não cabe no Zod; um `Error` cru viraria 500 (api.md: erro de domínio nomeado, mapeado na fronteira) |
| **Encomenda sem estoque (disponível < 0) no Hoje; estoque baixo só na Posição** | Com `stock_qty = 0`/`low_stock_threshold = 1` por padrão, todo produto sem estoque é "baixo" — a seção nunca sumiria e viraria ruído; o que exige ação hoje é a encomenda que não tem produto para entregar |
| **`/dashboard/today` devolve WhatsApp da pessoa do compromisso** (diverge da minimização da listagem de agenda, crm-appointments) | É o dado necessário para o botão "Confirmar" sem N+1; trafega só API → servidor web e vira link `wa.me`; limitado aos compromissos de hoje (≤ 5) |
| **Arredondamento meio-para-longe-do-zero** em margem e variação (helper próprio; `Math.round` arredonda −12,5 para −12) | Simetria entre alta e queda; progresso da meta segue `floor` de propósito (RF-06) |
| **`PUT /dashboard/goal` mantém o body** e passa a responder `{ month, monthlyGoalCents }` | Web e API sobem juntos (ADR-0011); o cliente antigo, se existir por instantes, ainda parseia `monthlyGoalCents` |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/dashboard-period.ts` (+ `.test.ts`) | Schema e resolução de período, comparação, calendário, bounds UTC |
| `packages/shared/src/dashboard-metrics.ts` (+ `.test.ts`) | Ticket, margem, variação, ritmo da meta, janela de aniversário |
| `apps/api/src/db/schema/monthly-goals.ts` | Tabela `monthly_goals` |
| `apps/api/drizzle/0015_*.sql` (gerada) | Tabela `monthly_goals` + índice `sales_consultant_sold_at_idx` |
| `apps/api/drizzle/0016_monthly_goals_backfill.sql` (custom) | Backfill da meta atual |
| `apps/api/src/db/monthly-goals-table.integration.test.ts` | CHECKs, unicidade, cascade |
| `apps/api/src/db/monthly-goals-migration.integration.test.ts` | Backfill sobre dados no formato anterior |
| `apps/api/src/db/derived-expressions.ts` | Reserva/disponível e atraso compartilhados |
| `apps/api/src/modules/dashboard/dashboard.errors.ts` | `InvalidDashboardPeriodError` |
| `apps/api/test/factories/*.ts` | Factories dos testes novos |
| `apps/api/src/modules/dashboard/dashboard-performance.integration.test.ts` | RF-05/07/09/10/11/14/15 (invariantes) |
| `apps/api/src/modules/dashboard/dashboard-today.integration.test.ts` | RF-04/12 |
| `apps/api/src/modules/sales/sales-filters.integration.test.ts` | RF-04 (atraso local) + RF-14/15 |
| `apps/web/src/lib/dashboard-period-params.ts` (+ test) | searchParams → query, atalhos, setas, rótulos |
| `apps/web/src/lib/dashboard-links.ts` (+ test) | hrefs de drill-down e "Ver todos" |
| `apps/web/src/lib/dashboard-messages.ts` (+ test) | Mensagens de WhatsApp + `safeWhatsAppUrl` |
| `apps/web/src/lib/dashboard-today-view.ts` (+ test) | Seções visíveis, "Tudo em dia" |
| `apps/web/src/lib/monthly-bars.ts` (+ test) | Alturas, rótulos e destaque das barras |
| `apps/web/src/lib/sales-list-params.ts` (+ test) | searchParams/hrefs de `/crm/sales` e `/crm/sales/receivables` |
| `apps/web/src/components/dashboard/today-section.tsx` | Bloco Hoje |
| `apps/web/src/components/dashboard/performance-section.tsx` | Bloco Desempenho |
| `apps/web/src/components/dashboard/position-section.tsx` | Bloco Posição agora |
| `apps/web/src/components/dashboard/period-selector.tsx` | Atalhos, setas, personalizado |
| `apps/web/src/components/dashboard/kpi-card.tsx` | Cartão clicável com variação |
| `apps/web/src/components/dashboard/monthly-bars.tsx` | Gráfico de 12 meses |
| `apps/web/src/components/dashboard/top-lists.tsx` | Mais vendidos / melhores clientes |
| `apps/web/src/components/dashboard/quick-actions.tsx` | Ações rápidas |
| `apps/web/src/components/dashboard/section-error.tsx` | Erro por bloco com retry (client) |
| `apps/web/src/components/dashboard/section-skeletons.tsx` | Skeleton por bloco |
| `apps/web/src/components/sales/paid-receivable-row.tsx` | Linha de cobrança recebida (sem ação) |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/dashboard.ts` (+ test) | Novos schemas `dashboardPerformanceSchema`, `dashboardTodaySchema`, `updateGoalResponseSchema`; remove `dashboardSummarySchema` (M6) |
| `packages/shared/src/sales.ts` (+ test) | `soldFrom`/`soldTo`/`status=sold`/`delivery`; `overdue`/`paidFrom`/`paidTo` com refinamentos pt-BR |
| `packages/shared/src/index.ts` | Exportar os módulos novos |
| `apps/api/src/db/schema/index.ts`, `sales.ts` | Exportar `monthly_goals`; índice novo |
| `apps/api/src/modules/products/products.repository.ts` | Usar as expressões de `db/derived-expressions.ts` (sem mudança de comportamento) |
| `apps/api/src/modules/sales/sales.service.ts`, `sales.repository.ts`, `sales.routes.ts` | `clock`/`today`, filtros novos |
| `apps/api/src/modules/dashboard/dashboard.{service,repository,routes}.ts` | Reescrita: performance, today, goals; remove summary |
| `apps/api/src/plugins/error-handler.ts` (+ test) | Mapear `InvalidDashboardPeriodError` → 422 `VALIDATION_ERROR` |
| `apps/api/src/index.ts` e todo `buildApp` de teste que instancia `createSalesService` | Injetar `clock` |
| `apps/api/src/modules/dashboard/dashboard.integration.test.ts`, `dashboard.service.test.ts` | Substituídos pelos testes novos (arquivo antigo removido ou reescrito) |
| `apps/web/src/lib/dashboard-api.ts` (+ test) | `getDashboardPerformance`, `getDashboardToday`, `updateGoal` com `month`; remove `getDashboardSummary` |
| `apps/web/src/lib/sales-api.ts` (+ test) | Parâmetros novos em `listSales`/`listReceivables` |
| `apps/web/src/app/(crm)/crm/page.tsx`, `loading.tsx`, `error.tsx`, `actions.ts` | Nova composição; skeleton e erro dos três blocos; retorno com `month` |
| `apps/web/src/components/dashboard/goal-card.tsx` | Meta efetiva, origem, ritmo, edição só no mês corrente |
| `apps/web/src/components/dashboard/summary-cards.tsx` | Removido |
| `apps/web/src/app/(crm)/crm/sales/page.tsx` | Aba Vendidas, filtro de período (troca De > Até), `clientId`, chips, contagem com filtro, vazio de filtro, paginação com filtros |
| `apps/web/src/app/(crm)/crm/sales/receivables/page.tsx` | Visões A receber / Atrasadas / Recebidas, contagem e vazios por visão |
| `apps/web/src/components/sales/receivable-row.tsx` | WhatsApp com mensagem de cobrança |

## Cobertura de Testes (decisão obrigatória — critérios em .claude/rules/workflow/spec-format.md)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | sim | Regras novas de período, comparação, derivados, ritmo, janela de aniversário (shared); composição/bounds do `dashboard.service` e `today` do `sales.service` com fakes e relógio fixo; helpers web de URL, rótulo, mensagem, barras e visibilidade (substituem teste de componente — sem jsdom) |
| Integração (Testcontainers) | **sim** | Muda schema (tabela + índice + backfill), contrato da API (endpoints do painel, filtros de vendas/cobranças) e regra central (faturamento = Vendido; atraso no fuso local). Postgres real com relógio injetado fixo; inclui as invariantes lista = cartão (RF-14/15) e o ensaio de migração sobre dados no formato anterior |
| E2E | pendência (sem infra — REL-01) | A home não está na lista de fluxos críticos, mas é a tela mais usada; registrar no handoff. Substituída por QA de runtime em build de produção (lesson: Server Action só é exercitável no build de produção) |
| Regressão (se BUG-NNN) | n.a. | Não é `BUG-NNN`; os testes de borda de fuso (RF-04) funcionam como regressão dos dois known-issues de fuso e devem falhar contra o código atual |

## Migração de Banco

- **`0015` (gerada, aditiva)**: `CREATE TABLE monthly_goals (…)` com CHECKs e UNIQUE; `CREATE INDEX sales_consultant_sold_at_idx ON sales (consultant_id, sold_at)`.
- **`0016` (custom)**: `INSERT INTO monthly_goals (consultant_id, month_start, goal_cents) SELECT id, <mês local>, monthly_goal_cents FROM consultants WHERE monthly_goal_cents IS NOT NULL ON CONFLICT DO NOTHING`.
- **Não destrutiva**: nenhuma coluna removida/renomeada; nenhum dado existente alterado.
- **Rollback**: voltar a imagem anterior funciona sem mexer no banco (código antigo ignora a tabela nova e lê a coluna antiga, que continua com o valor pré-deploy). Limpeza manual opcional: `DROP TABLE monthly_goals; DROP INDEX sales_consultant_sold_at_idx;` e remover as entradas `0015`/`0016` de `drizzle.__drizzle_migrations`. Metas editadas depois do deploy se perdem no rollback (aceito).
- Ensaio antes do deploy: o snapshot pré-migração do INF-07 cobre; `drizzle-safe-migrations` consultada na implementação.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Injetar `clock` no service de vendas quebra vários `buildApp` de teste | alta | Task dedicada (3.1) que ajusta todos os call sites e roda a suíte inteira antes de seguir |
| Números da home mudam no deploy e confundem a consultora | média | ADR novo, nota no handoff com o que muda e por quê; rótulos explícitos ("Vendido", "Recebido") |
| Divergência entre cartão e lista do drill-down | média | Invariantes RF-14/RF-15 testadas em integração com o MESMO período |
| Parâmetros de array no template do Drizzle (série de 12 meses) | média | VALUES com `sql.join`, coberto pela integração da série |
| Borda de mês/dia e DST | média | Bounds só por `appLocalDateTimeToUtc`; unidade com mês de 2018 (DST) e integração com relógio fixo às 23h/22h locais |
| Escopo L com muitas telas | alta | Milestones com checkpoint de lint/typecheck/test; helpers puros primeiro; QA de runtime com checklist por RF |
| Leitura de leads sem escopo por consultora | baixa | Drift já aceito; mesmo comportamento do módulo de leads |
| `buildWhatsAppUrl` lança com número inválido e derruba o bloco | média | `safeWhatsAppUrl` + teste |

## Definition of Done
- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos workspaces afetados
- [ ] `bun run test` (incluindo integração com Docker) verde
- [ ] `bun run build` (web) ok
- [ ] Ensaio de migração `0000`→`0014` com dados → `0015`/`0016` verde
- [ ] QA de runtime em build de produção com checklist dos RF-16..RF-25 (375px e desktop)
- [ ] Conformidade com `.claude/rules/*` e ADRs; ADR novo para Vendido/meta por mês; known-issues de fuso fechados
