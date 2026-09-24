---
feature: crm-home-period-and-daily-hub
module: api, web, shared
phase: review
status: done
round: 3
created: 2026-09-23
updated: 2026-09-24
depends_on: [spec.md, plan.md, validate.md]
---

# Review: crm-home-period-and-daily-hub (rodada 3)

QA neutro e adversarial da rodada 3, a última permitida pelo fluxo. Um revisor novo revalidou tudo do zero, com base em `spec.md`, `tasks.md`, `plan.md` e no Decisions Log de `progress.md`, contra o diff completo (`git diff main` mais os arquivos não rastreados, lidos por inteiro). Ficaram de fora as alterações alheias em `specs/ROADMAP.md` (CRM-14, REL-03, REL-05, MKT-01 e MKT-02 foram conferidos e estão coerentes com a spec) e em `specs/retroactive-sale-date-and-deletion/`. A graduação em `project-memory/` também foi revisada.

**Histórico.**
- **Rodada 1**: REPROVADO. CRÍTICO: o gráfico cortava o mês selecionado em 375px. Havia 6 ALERTAS: limite dos aniversariantes antes da ordem, contagens ausentes no Hoje, testes faltando, atalhos cortados, marcador "prejuízo" ilegível e `source` ambíguo na meta removida. O fixer corrigiu 13 itens.
- **Rodada 2**: REPROVADO. CRÍTICO: a tabela `sr-only` do gráfico alargava a home para 396px com qualquer mês de prejuízo, regressão da correção S3. Havia 3 ALERTAS: rótulos do gráfico colidindo, rótulo de `range` em andamento enganoso e `9999-12-31` virando 500, além de 7 SUGESTÕES. A situação de cada um nesta rodada está na seção "Situação dos achados da rodada 2".

## Resumo

Tudo o que a rodada 2 bloqueou está resolvido e foi provado em runtime de produção, com dados criados pelas rotas. Os cenários de estresse pedidos (4 meses de prejuízo na janela, valores de 6 e 7 dígitos em reais, empate exato no topo, `range` em andamento, `year` e `all`) **não produzem rolagem horizontal em 375px**, nem sob emulação mobile (`visualViewport = innerWidth = 375`) nem sob emulação desktop (`scrollX = 0`).

Também foram conferidos:
- O gráfico tem um único rótulo de valor, sem colisão e sem invadir a legenda.
- Os números batem com o cálculo à mão: current, previous, série, rankings, Hoje e Posição.
- As invariantes lista = cartão valem em 8 períodos distintos.
- Os drill-downs por clique real batem com os cartões.
- A meta passa pela Server Action com definir, editar e remover, a herança funciona e o mês passado fica sem edição.
- As mensagens de WhatsApp são idênticas ao RF-19.
- O isolamento de falha por bloco tem retry.
- Não há PII nos logs.

Lint, typecheck, 1814 testes (93 arquivos, integração com Postgres real), build e `drizzle-kit generate` sem diff estão verdes.

**Veredito: APROVADO**, sem CRÍTICO e sem ALERTA. Ficam 10 SUGESTÕES para o humano decidir. A mais visível é a S1: o tooltip do gráfico, sob foco de teclado, ainda sai da tela na 2ª e na 11ª coluna, e nesta última alarga o documento para 384px enquanto o foco estiver ali. É resíduo da S4 da rodada 2, que só ancorou a 1ª e a última coluna.

## Arquivos revisados

- **shared**: `dashboard-period.ts`, `dashboard-metrics.ts`, `dashboard.ts`, `sales.ts`, `index.ts` e os testes; `time.ts` como dependência.
- **api**:
  - `db/derived-expressions.ts`, `db/schema/{monthly-goals,sales,index,consultants}.ts`, `drizzle/0015_known_triathlon.sql`, `drizzle/0016_monthly_goals_backfill.sql`, `meta/_journal.json`.
  - `modules/dashboard/{dashboard.service,dashboard.routes,dashboard.errors,dashboard-performance.repository,dashboard-today.repository}.ts`.
  - `modules/sales/{sales.service,sales.repository}.ts`, `modules/products/products.repository.ts`, `plugins/error-handler.ts`, `index.ts`.
  - `test/factories/*` e todos os testes novos ou alterados. Os pré-existentes só ganharam a injeção de `clock`; nenhum assert foi relaxado.
- **web**:
  - `app/(crm)/crm/{page,loading,error,actions}.tsx`, `app/(crm)/crm/sales/page.tsx`, `app/(crm)/crm/sales/receivables/page.tsx`.
  - `components/dashboard/*`, `components/sales/{receivable-row,paid-receivable-row}.tsx`.
  - `lib/{dashboard-*,monthly-bars*,goal-view,sales-list-params,sales-api,dashboard-api}.ts` e os testes.
- **memória**: ADR-0026 e ADR-0027 (novos); emendas em 0014, 0018, 0023 e 0025; `decisions/README.md`, `03-features.md`, `04-domain-model.md`, `known-issues.md`, `lessons.md`.

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite; os números foram conferidos à mão em runtime (validate.md).
- [x] Fuso: bounds calculados em TS a partir do relógio injetado (`clock` em `sales` e `dashboard`), passados ao SQL como instantes ou datas. `grep` por `CURRENT_DATE`/`now()`/`date_trunc`/`AT TIME ZONE` em `apps/api/src` só acha comentários, os `now()` de `orders` (fora do escopo) e o literal da migração `0016`, que é a exceção registrada. DST pré-2019 está coberto por unidade (nov/2018 e fev/2019); o caso-limite do dia de início do DST virou known-issue.
- [x] Fronteiras de data: piso 2015-01-01 e teto 2099-12-31 no schema compartilhado; `9999-12-31` → 422 na API e descarte silencioso na web. Datas inexistentes (`2026-02-30`) → 422.
- [x] Agregações sem multiplicação por join: Vendido e Lucro em queries separadas; na série, CTEs `sold` e `profit` separadas; `::bigint` antes de multiplicar; `toSafeInteger`.
- [x] Limites: todas as listas do painel com `LIMIT` (5; aniversariantes 20, ordenados pelo rank da janela antes do `LIMIT`); desempates finais determinísticos (`groupKey`/`id`).
- [x] Erros: `InvalidDashboardPeriodError` → 422 no error-handler central; helpers da web nunca lançam; nenhum `catch` engolido. Exceção menor: o tipo inválido de `month`/`year`/`from`/`to` gera mensagem em inglês (S2).
- [x] Concorrência: leituras do painel em transação `repeatable read` read-only; upsert da meta com `ON CONFLICT`.

### Arquitetura (api.md, web.md)
- [x] routes → service → repository. O service não importa Elysia; o repository só executa bounds prontos. As expressões compartilhadas ficam em `db/derived-expressions.ts`, sem import de internals entre módulos.
- [x] Zod em toda fronteira: query e body com schemas de `packages/shared`; `updateGoal` revalida com `updateGoalSchema` antes do PUT; a web sanea `searchParams` com `.catch`.
- [x] Server Components por padrão; `"use client"` só em `goal-card`, `section-error` e `receivable-row`. Três `Suspense` independentes, cada bloco com a própria busca (sem waterfall; Posição usa `Promise.all`). O `key` do Desempenho é o período.
- [x] Estados loading, vazio e erro por bloco verificados em runtime, inclusive "Tudo em dia por hoje".
- [x] Mobile-first: 375px sem rolagem horizontal em todos os estados estáticos; o único transitório é o S1.
- [x] Dinheiro em centavos inteiros; formatação só na web (`formatBRL`).

### Banco (database.md)
- [x] `0015` gerada e `0016` custom versionadas; `drizzle-kit generate` sem diff; migrações aditivas.
- [x] Backfill testado sobre o formato anterior, com o mês pelo `now()` do mesmo container, e idempotência coberta.
- [x] `monthly_goals` tem uuidv7, timestamps, CHECKs de dia 1 e de faixa via `sql.raw(MONEY_MAX_CENTS)`, e FK cascade coberta pela UNIQUE `(consultant_id, month_start)`.
- [x] Índice `sales_consultant_sold_at_idx`.
- [x] Sem N+1.

### Segurança e LGPD (security.md)
- [x] Nenhuma rota pública nova; 401 sem token em performance, today e goal; `consultantId` sempre vem do token.
- [x] Sem PII em log: nos 500 provocados no runtime, o log só tem uuid, código, rota e classe; o grep por nomes, telefones, e-mail e senha deu 0. A mensagem de invariante dos aniversariantes só carrega `clientId`. Na URL só vão ids.
- [x] Sem segredo em código.

### Tipos e qualidade (core.md)
- [x] Sem `any` e sem `!`. O único `as` em código novo é um alargamento seguro (`dashboardPeriodKindValues as readonly string[]`, num type guard). Named exports, constantes nomeadas, sem `console`.
- [ ] Comentários e duplicações residuais (S6, S7, S8).

### Testes (testing.md)
- [x] Todo critério de aceite de API e shared tem teste executável derivado da spec. Os casos que falharam na rodada 2 ganharam teste: `9999-12-31` → 422 (integração), `range` em andamento (unidade), rótulo único e empate (unidade).
- [x] Limites testados com mais itens que o limite (grupos, agenda, leads, encomendas, entregas, >20 aniversariantes).
- [x] Nenhum teste relaxado ou pulado; factories em `apps/api/test/factories/`.
- [ ] Não há teste do posicionamento do tooltip; é o caso do S1, que só aparece em runtime.

### Escopo
- [x] Tasks 1.1–6.3 implementadas. A graduação (M7) foi escrita pelo orquestrador, mas as tasks 7.1–7.3 ainda estão desmarcadas em `tasks.md` (S9).
- [x] Nada fora do escopo foi modificado.

## Problemas Encontrados

Nenhum CRÍTICO. Nenhum ALERTA.

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| S1 | SUGESTÃO | **Tooltip do gráfico sai da tela sob foco de teclado na 2ª e na 11ª coluna.** A correção S4 da rodada 2 ancorou só a primeira e a última coluna. As demais centralizam um tooltip de até 160px (`max-w-40`) numa coluna de ~28px. Medido com Tab real em 375px: na coluna 2, `left = −24px` (o início do texto fica cortado); na coluna 11, `right = 384` e `document.documentElement.scrollWidth` vai a **384** enquanto o foco estiver ali. É transitório (só com foco visível de teclado; toque navega) e o nome acessível da barra e a tabela `sr-only` carregam a mesma informação. Por isso não bloqueia o RF-18, mas é o mesmo tipo de estouro que as rodadas anteriores cobraram. | `apps/web/src/components/dashboard/monthly-bars.tsx:172-186` | Ancorar à esquerda também a coluna 2 (`index <= 1`) e à direita a coluna 11 (`index >= length - 2`); ou limitar a largura (`max-w-[calc(100vw-2rem)]`) e ancorar pela metade do gráfico (colunas 0–5 à esquerda, 6–11 à direita). Revalidar com Tab em todas as barras, medindo `scrollWidth`. |
| S2 | SUGESTÃO | Mensagem em inglês no 422: `?period=month&month=2026-09&month=2026-08` devolve `Invalid input: expected string, received array`. O RF-01 pede mensagens pt-BR. `month`, `year`, `from` e `to` usam `z.string()` sem `error`, então o `invalid_type` cai no default do Zod. Só é alcançável com chamada direta à API, porque a web sanea arrays. | `packages/shared/src/dashboard-period.ts:67-70` | `z.string({ error: MONTH_FORMAT_MESSAGE })` (e equivalentes), mais um teste com parâmetro repetido. |
| S3 | SUGESTÃO | Rótulos desajeitados em bordas de calendário (corretos, mas estranhos): no dia 1 do mês, "comparado com 1–1 de setembro"; em 01/01, "2027 (até 1 de janeiro)" ao lado de "comparado com 1º de janeiro a 1º de janeiro de 2026" (ordinal num, cardinal noutro); rótulo curto de intervalo que cruza o ano: "▲ x% vs nov–fev/2025" (o novembro é de 2024). | `apps/web/src/lib/dashboard-period-params.ts:401,440,493` | Quando `startDay === endDay`, usar "1º de setembro"; aplicar `ordinalDay` também no rótulo do ano; no rótulo curto, incluir o ano inicial quando difere ("nov/2024–fev/2025"). |
| S4 | SUGESTÃO | "Remover meta" no modo de visualização não mostra erro se a action falhar: `errorMessage` só é renderizado dentro do formulário de edição, então uma falha de rede no remover fica silenciosa. É comportamento pré-existente (a `main` já era assim), mas o componente foi reescrito nesta feature. | `apps/web/src/components/dashboard/goal-card.tsx:330` | Renderizar o `role="alert"` também no `viewContent`. |
| S5 | SUGESTÃO | Critério RF-13 ("nenhuma referência a `/dashboard/summary`…"): o grep não sai vazio, porque restam 3 comentários históricos. A decisão de mantê-los está registrada no Session Log. Não há uso funcional; o humano decide se o critério literal importa. | `apps/api/src/modules/dashboard/dashboard.routes.ts:24`, `dashboard.service.ts:227,305` | Reescrever os comentários sem citar a rota ou aceitar como está. |
| S6 | SUGESTÃO | Comentário obsoleto: diz que `receivablesSummary` "filtra por `due_date < CURRENT_DATE`", o que deixou de ser verdade nesta feature. | `apps/api/src/db/derived-expressions.ts:39-43` | Atualizar o comentário. |
| S7 | SUGESTÃO | Helper duplicado: `formatDayMonth` (mensagens) e `formatDayMonthBr` (Hoje) são idênticos, e o próprio comentário diz que precisam produzir o mesmo texto. | `apps/web/src/lib/dashboard-messages.ts:20`, `apps/web/src/lib/dashboard-today-format.ts:13` | Reusar um só. |
| S8 | SUGESTÃO | O rótulo de valor do mês selecionado fica sobre o topo de uma barra vizinha mais alta: em "Este mês", "R$ 101.248,10" cobre ~10px da parte cinza da barra de julho. Continua legível (texto escuro sobre cinza claro). | `apps/web/src/components/dashboard/monthly-bars.tsx:163-170` | Aceitar, ou dar fundo (`bg-background/80`) ao rótulo. |
| S9 | SUGESTÃO | Documentação: em `04-domain-model.md` as invariantes aparecem na ordem 10, **12**, 11. A seção do `toSafeInteger` em `known-issues.md` ainda diz "copiada em … e agora `dashboard.repository.ts`" (arquivo removido), embora a atualização logo abaixo esteja certa (4 cópias, conferido). `progress.md` segue com "Current Task: QA rodada 1". `tasks.md` tem 7.1–7.3 desmarcadas, embora ADRs, emendas e roadmap já estejam escritos. | `project-memory/04-domain-model.md:33-35`, `project-memory/known-issues.md:42`, `specs/crm-home-period-and-daily-hub/progress.md:13`, `tasks.md:161-166` | Renumerar; alinhar o parágrafo "O quê"; atualizar `progress.md` e marcar o M7 no handoff. |
| S10 | SUGESTÃO | Pré-existente e fora do escopo (S8 da rodada 1, adiado): página além da última mostra o vazio errado. Sem filtro, `/crm/sales?page=99` diz "Nenhuma venda registrada ainda"; com filtro, `?status=sold&page=2` diz "Nenhuma venda com estes filtros". | `apps/web/src/app/(crm)/crm/sales/page.tsx` | Item próprio, se o humano quiser. |

## Situação dos achados da rodada 2

| Rodada 2 | Situação na rodada 3 |
|---|---|
| C1 (tabela `sr-only` alarga a página para 396px) | **Resolvido**: a tabela fica dentro de `div.sr-only`. Com 4 meses de prejuízo e 6/7 dígitos, `/crm`, `year`, `all` e `range` ficam com doc/body/innerWidth/visualViewport = 375 na emulação mobile e `scrollX = 0` na desktop |
| A1 (colisão de rótulos no gráfico) | **Resolvido**: um único rótulo (mês selecionado, ou o maior do período, com empate indo para o mais recente) e folga `pt-5`. Runtime com empate exato mar = jul sem sobreposição; unidade com empate e ignorando o maior fora do período. Resta a sobreposição sobre a barra vizinha (S8) |
| A2 (rótulo de `range` em andamento) | **Resolvido**: "jul/2026 – set/2026 (até dia 24)" com "comparado com jul/2025 – set/2025 (até 24 de setembro)"; `range` de 1 mês rotulado como `month`; testes em `dashboard-period-params.test.ts` |
| A3 (`9999-12-31` → 500) | **Resolvido**: piso e teto no schema compartilhado → 422 pt-BR (integração); a web descarta e cai no padrão (runtime `/crm/sales?soldTo=9999-12-31` e `paidTo=9999-12-31` sem erro) |
| S1 (estado pendente da meta enganoso) | **Resolvido**: `pendingAction` separa salvar de remover, e só sai da edição quando a transição termina; amostras a cada 120ms sem estado intermediário errado |
| S2 ("Definida para este mês" em mês passado) | **Resolvido**: "Definida para julho de 2026" |
| S3 (WCAG 2.5.3) | **Resolvido**: os nomes acessíveis começam pelo texto visível |
| S4 (tooltip sai da tela) | **Parcial**: 1ª e última colunas ancoradas; colunas 2 e 11 ainda saem (S1 desta rodada) |
| S5 (comentários sobre `/dashboard/summary`) | Mantidos por decisão (S5 desta rodada) |
| S6 (desempate final no top produtos) | **Resolvido**: `groupKey ASC`, com teste |
| S7 ("▲ 0%") | **Resolvido**: `classifyDelta` usa o percentual arredondado → `flat`, com testes |

## Cobertura: critério de aceite → teste / evidência

| Critério | Teste executável | Evidência de runtime (validate.md) | Status |
|---|---|---|---|
| RF-01 | `packages/shared/src/dashboard-period.test.ts` (aceite/rejeição por `period`, `{}`, pt-BR) | 422 pt-BR em 9 variações; chave desconhecida → 200 | OK (S2) |
| RF-02 | `dashboard-period.test.ts` (em andamento, fechado, ano limitado, `all` desde 2015-01, futuro/piso/`from > to`) | `period` resolvido em todos os `kind` | OK |
| RF-03 | `dashboard-period.test.ts` (23/09, 31/03 → 28 e 29/02, 15/01 → jan anterior, N = 1/3/13, `all`) + `dashboard.service.test.ts` | 1–24/08; 2025-01-01..09-24; 13 meses → `null` | OK |
| RF-04 | `dashboard-performance.integration` (23:30 de 31/08 → agosto), `dashboard-today.integration` (22h e dia seguinte), `sales-filters.integration` (summary, lista, detalhe e PATCH às 22h e no dia seguinte), `derived-expressions.integration`; grep limpo | Postgres em UTC; borda real não exercitável de madrugada (pendência) | OK |
| RF-05 | `dashboard-performance.integration` (aberta, entregue, concluída, cancelada, excluída, Recebido fora do período, `clientsCount`, lucro negativo, escopo) + repository | valores exatos em set/ago; cancelada e excluída fora | OK |
| RF-06 | `dashboard-metrics.test.ts` (12,5 → 13; −12,5 → −13; zeros; anterior negativo; alta/queda; <0,5% → flat) + `dashboard-format.test.ts` | ▲40480%, ▼100%, "sem base", "sem movimento", margem "—" | OK |
| RF-07 | `dashboard-performance.repository.integration` (herança, `null`, antes da 1ª linha, upsert) + `monthly-goals-table.integration` (UNIQUE) | jun `none`, jul explícita, ago herdada, set removida | OK |
| RF-08 | `monthly-goals-migration.integration` (formato anterior, mês pelo `now()` do container, idempotência) | migrate 0000→0016 no banco descartável | OK |
| RF-09 | `dashboard-performance.integration` (23:30 de 30/09 → setembro, upsert, `null`, 0/negativo/teto → 422, 401) | PUT com 0, −5, 100000001, 12,5, `{}`, "100" → 422 pt-BR; teto e `null` → 200 sem duplicar | OK |
| RF-10 | `dashboard-metrics.test.ts` (`goalPace`: falta, batida, último dia, sem meta) + `goal-view.test.ts` + integração | 67% com ritmo ceil; 101% com excedente; mês passado sem edição | OK (S4) |
| RF-11 | repository (série, tops, desempates, limite) + HTTP (`current`/`previous` exatos, 422, 401) | payload conferido à mão | OK |
| RF-12 | `dashboard-today.integration` + repository (grupos, `on_delivery` fora, agenda local, entregas, leads, encomenda só com reserva, virada de ano, 29/02, todos os limites) | todas as seções com itens conferidos | OK |
| RF-13 | grep: só 3 comentários históricos | `/dashboard/summary` → 404 | OK na intenção (S5) |
| RF-14 | `sales-filters.integration` (bordas locais, isolados, `status=sold`, `delivery`, 422, 9999) + invariante em `dashboard-performance.integration` | invariante 8/8 períodos | OK |
| RF-15 | `sales-filters.integration` (`overdue` local, anulada fora, bordas, `paid_at desc`, 422) + invariante | invariante 8/8 períodos, `paid_at desc` | OK |
| RF-16/17 | `sales-list-params.test.ts` (66 casos), `sales-api.test.ts` | abas, chips, De > Até (URL e formulário), contagens, vazios, três visões | OK |
| RF-18 | revisão (3 `Suspense`, helpers que não lançam, `SectionError`, paralelismo) | isolamento de Hoje e Desempenho com retry; 375px sem rolagem em 9 cenários | OK (S1 transitório) |
| RF-19 | `dashboard-messages.test.ts` (28 casos) | `wa.me` decodificados idênticos em 7 variantes | OK |
| RF-20 | `dashboard-today-view.test.ts`, `dashboard-links.test.ts`, `dashboard-today-format.test.ts` | cada seção com item, contagem e hrefs | OK |
| RF-21 | `dashboard-period-params.test.ts` (57 casos) | atalhos, setas, clamps e rótulos em `month`/`year`/`all`/`range` | OK (S3) |
| RF-22 | `dashboard-kpis.test.ts`, `dashboard-format.test.ts`, `dashboard-links.test.ts` | Vendido → "5 vendas" = R$ 101.248,10; Recebido → "3 recebimentos" = R$ 100.648,70 | OK |
| RF-23 | `monthly-bars.test.ts`, `monthly-bars-value-label.test.ts` | links, `aria-label` por extenso, marcador de prejuízo, estado vazio, rótulo único em 375px | OK (S1, S8) |
| RF-24 | QA de runtime (por spec) | definir, editar e remover; mês passado sem edição; rankings com links | OK |
| RF-25 | QA de runtime | bate com a lista de cobranças (R$ 1.148,30) e com `/products/summary` | OK |
| RF-26 | revisão + 401 | sem PII no log; só ids em URL | OK |
| RF-27 | revisão + `monthly-goals-table.integration` (índice) | limites observados (5/20) | OK |

## Conformidade

- **ADRs**:
  - ADR-0018 respeitado: fuso calculado em TS; o literal na `0016` é exceção comentada.
  - ADR-0014 estendido pelo ADR-0026 (read-model cross-tabela).
  - ADR-0006 respeitado: nenhum git de escrita.
- **Graduação** (ADR-0026/0027, emendas, `04-domain-model`, `03-features`, `known-issues`, `lessons`) descreve fielmente o código:
  - Vendido, Lucro e Recebido e seus escopos;
  - `receivableOverdueExpression(today)` e ausência de `CURRENT_DATE` em `dashboard`/`sales` (conferido);
  - tabela, CHECKs e UNIQUE de `monthly_goals`;
  - herança e `source: none` para meta nula;
  - PUT só no mês corrente;
  - migração expand-only;
  - 4 cópias de `toSafeInteger` (conferido: `products`, `sales`, `dashboard-performance`, `dashboard-today`);
  - known-issue do DST, cuja descrição do comportamento conferi à mão: 04/11/2018 00:00 → 23:00 da véspera.
  - Imprecisões só de texto: S9.
- **Decisions Log (desvios)**: todos aceitáveis — datas `dd/mm` no Hoje (spec emendada), "Ver todas" das cobranças só com grupos, portas obrigatórias, `MAX(col::text)`, um único rótulo de valor no gráfico e os comentários mantidos (S5).
- **Roadmap**: CRM-14 `[>]` (correto até o handoff, quando vira `[R]`); REL-03 `[ ]` com o escopo restante; REL-05 `[-]` absorvido; MKT-01 depende do CRM-14; MKT-02 com o escopo restante.
- **E2E**: pendência explícita (REL-01). O S1 é o tipo de caso que um E2E com Tab em 375px pegaria.

## Veredito

**APROVADO.** Lint e typecheck estão limpos, a suíte passa (1814/1814, com integração), o build está ok e o schema não tem migração pendente. Todos os critérios de aceite têm teste ou evidência de runtime. Não há CRÍTICO nem ALERTA. As 10 SUGESTÕES (S1–S10) ficam para o humano decidir; recomendo S1 e S2 antes do deploy, por serem pequenas e localizadas. As pendências para o handoff são o E2E (REL-01) e a borda real das 22h, esta coberta por integração com relógio fixo.

---

# Emenda M8 (2026-09-24)

## Resumo

QA neutra da emenda "home mais enxuta" (Task 8.1): RF-18 (ordem Desempenho → Hoje → Posição), RF-20a (cartões-resumo do Hoje na home), RF-20/RF-28 (página `/crm/today` com as seções detalhadas).

**O que está sólido**:
- Lint, typecheck, suíte (1845/1845, com integração) e build estão verdes.
- A ordem da home está certa.
- A grade de cartões está correta: 2 colunas em 375 e 3 em `sm+`, sem texto cortado nem rolagem horizontal.
- Os textos seguem singular/plural, e o atraso é dito em texto, com a cor só como reforço.
- Cartão vazio é omitido, e o "Tudo em dia" aparece na home e em `/crm/today`.
- `/crm/today` tem as seções completas com WhatsApp, `id` estáveis, `scroll-mt-20`, "← Início", metadata "Hoje", skeleton e `SectionError` isolado com retry funcional.

**Reprovações** (runtime com dados reais):
1. O cartão "Encomendas sem estoque" mostra um total de unidades **errado** quando há mais de 5 produtos em falta ("faltam 35 un." com 42 reais).
2. O clique no cartão **não leva à âncora** na maior parte das vezes: a URL fica com o hash certo, mas a página abre no topo.

Há ainda um ALERTA: o cartão Agenda chama de "próximo" um compromisso que já passou.

## Arquivos revisados

- `apps/web/src/lib/dashboard-today-tiles.ts` e `.test.ts`
- `apps/web/src/components/dashboard/today-section.tsx`, `today-summary-tiles.tsx`, `today-empty-state.tsx`, `today-details.tsx`, `section-skeletons.tsx`, `section-error.tsx`
- `apps/web/src/app/(crm)/crm/page.tsx` e `loading.tsx`
- `apps/web/src/app/(crm)/crm/today/page.tsx`, `loading.tsx` e `error.tsx`
- Apoio: `dashboard-today-view.ts`, `dashboard-messages.ts` (`firstName`), `packages/shared/src/dashboard.ts` (`dashboardRestockSchema`), `apps/api/src/modules/dashboard/dashboard-today.repository.ts` (`loadRestock`)

## Problemas Encontrados

### CRÍTICO

- **C1 — `apps/web/src/lib/dashboard-today-tiles.ts:170-186` (`restockTile`): "faltam N un." soma só os até 5 itens exibidos.**
  - **O quê**: o RF-20a pede "N produtos" e **o total de unidades que faltam**. Com mais de 5 produtos em falta, o número exibido é falso e sempre para menos.
  - **Runtime**: 7 produtos com reservas de 3 a 9 un. O cartão mostrou `7 produtos | faltam 35 un.`; o total real é **42**.
  - **Por que importa**: é um número de negócio usado para decidir a reposição. Um total subestimado, sem nenhuma indicação de que é parcial, leva a pedir menos do que o necessário.
  - **Teste**: `dashboard-today-tiles.test.ts:316` ("com a soma das unidades exibidas") congela a aproximação como comportamento. Foi derivado do código, não da spec, o que viola a regra de neutralidade de `spec-format.md`/`testing.md`. Falta o caso `shortCount > items.length`.
  - **Correção adequada, que preserva o RF-20a**: acrescentar `missingQtyTotal` ao bloco `restock` de `GET /dashboard/today`.
    - Contrato em `packages/shared/src/dashboard.ts` (`dashboardRestockSchema`).
    - Na query, é um `SUM(-available)` no mesmo `select` que já faz o `count()` em `loadRestock` (`dashboard-today.repository.ts:347-350`). Sem N+1, na mesma transação.
    - O cartão passa a usar `missingQtyTotal`.
    - Testes: integração com mais de 5 produtos em falta (`dashboard-today.repository.integration`/`dashboard-today.integration`, exigida por ser mudança de contrato) e unidade do helper com `shortCount > items.length`.
  - **Alternativa mínima** (só web, exige emendar o RF-20a no Decisions Log): exibir o total só quando `shortCount === items.length`. Caso contrário, trocar por um texto que não finja ser total, por exemplo "maior falta: 9 un." ou "faltam 35+ un.". Nunca exibir a soma parcial como total.

- **C2 — `apps/web/src/app/(crm)/crm/today/page.tsx:43` + `today/loading.tsx` + `today-details.tsx`: o cartão não leva à âncora (critério RF-28 "cada cartão da home leva à âncora certa").**
  - **O quê**: o `id` e o `scroll-mt` estão certos, mas o conteúdo de `/crm/today` chega por streaming (`loading.tsx` + `Suspense` com `TodayDetailsSkeleton`). A rolagem para o hash acontece quando a seção ainda não existe no DOM.
  - **Runtime** (375×812, clique real no cartão): em 12 cliques para seções abaixo da dobra, só **5** rolaram até a seção. Na carga direta de `/crm/today#estoque`, também ficou no topo.
  - **Evidência**: `qa/m8/today-375-anchor-estoque.png` (URL `#estoque`, viewport em "← Início"/"Cobranças") e a tabela em `validate.md` → Emenda M8.
  - **Por que importa**: o propósito do cartão é levar direto ao item. Pousar no topo de uma página longa (≈2.550px em 375) obriga a procurar a seção, justamente no celular, e anula a emenda.
  - **Como corrigir**: um Client Component folha mínimo (por exemplo `ScrollToHash`), renderizado **dentro** de `TodayDetails` depois dos dados. No `useEffect`, lê `location.hash` e chama `document.getElementById(id)?.scrollIntoView()`, que respeita o `scroll-mt`.
  - **Alternativa**: renderizar `/crm/today` sem streaming interno (retirar o `Suspense` interno e deixar só o `loading.tsx`), e comprovar em runtime que a rolagem acontece depois do commit. A primeira opção é mais robusta.
  - **Validar de novo**: clique em cada cartão, várias rodadas, e hard load com hash.

### ALERTA

- **A1 — `apps/web/src/lib/dashboard-today-tiles.ts:124-140` (`appointmentsTile`): "próximo às 09:00 · Ana" às 14:40.**
  - **O quê**: o helper pega o **primeiro** compromisso do dia (`appointments.items[0]`). O RF-12 devolve todos os `scheduled` de hoje, inclusive os que já passaram, e o RF-20a pede "o **próximo** horário com a pessoa".
  - **Runtime**: compromissos às 09:00 e às 18:00; às 14:40 o cartão dizia "próximo às 09:00".
  - **Por que importa**: a informação é enganosa, e o cartão existe para orientar o resto do dia.
  - **Como corrigir**: injetar o instante atual no helper (`buildTodayTiles(today, nowIso)`; a page já calcula `new Date()`), sem relógio real no helper. Escolher o primeiro item com `startsAt >= now`.
    - Se nenhum dos itens listados é futuro, trocar o texto (por exemplo "último às HH:MM" ou "N para hoje").
    - Lembrar que a lista é limitada a 5: com mais de 5 compromissos pela manhã, o próximo pode não estar nos itens.
    - Testes com relógio fixo: todos futuros, alguns passados e todos passados.

### SUGESTÃO

- **S1 — `today-details.tsx:143,160` e `today/page.tsx`: hierarquia de títulos `h1 "Hoje"` → `h3` por seção, sem `h2`.** O comentário da linha 143 ("h2 'Hoje' (bloco) → h3") ficou desatualizado depois da mudança para página própria. Usar `h2` nas seções de `/crm/today` (WCAG 1.3.1, navegação por títulos no leitor de tela).
- **S2 — `dashboard-today-tiles.ts:35` e `today-details.tsx:94`: as âncoras estão duplicadas** (`TILE_ANCHORS` × `SECTION_ANCHORS`), com um "contrato implícito" comentado e nenhum teste que garanta a igualdade. Exportar um único `TODAY_SECTION_ANCHORS` de `lib/dashboard-today-view.ts`, que é lib e não componente e por isso não acopla componentes, e usá-lo nos dois lugares.
- **S3 — `dashboard-today-tiles.ts:196`**: com mais de uma aniversariante hoje, o cartão mostra só a primeira ("Ana faz hoje"). Algo como "Ana e mais 1 fazem hoje" seria mais fiel. O `value` "N nesta semana" também herda o teto de 20 da API (RF-12) sem indicar truncamento; é raro, mas vale "20+".
- **S4 — `today-section.tsx:43`**: "Ver tudo" continua visível no estado "Tudo em dia" e leva a uma página com o mesmo vazio. Pode ser omitido quando `isTodayEmpty`.
- **S5 — Texto do resumo de Cobranças**: o RF-20a escreve "N atrasadas · N hoje", e o código usa "N vencem hoje"/"1 vence hoje". É mais claro e aceitável, mas registrar o desvio no Decisions Log.
- **S6 — `apps/web/next-env.d.ts`**: está alterado no diff contra a `main` só pelo `next dev` (`.next/dev/types`). Deve ficar de fora do que for versionado.

## Testes (emenda)

| Critério | Teste executável | Runtime | Status |
|---|---|---|---|
| RF-18 (ordem) | revisão de `page.tsx`/`loading.tsx` | h1/h2 = Início, Desempenho, Hoje, Posição agora | OK |
| RF-20a — helper puro | `dashboard-today-tiles.test.ts` (19 casos: textos, singular/plural, href com âncora, tom, omissão, ordem) + `dashboard-today-view` ("Tudo em dia") | 2 col em 375, 3 em 1280, sem lista/WhatsApp/botão, sem overflow | **FALHA**: C1 (teste congela a soma parcial; falta `shortCount > items.length`); A1 (sem caso de compromisso passado) |
| RF-28 — seções completas com WhatsApp | seções reusadas (helpers de mensagens e links já testados) | 6 seções, textos do RF-19, links certos | OK |
| RF-28 — cartão leva à âncora certa | nenhum automatizado (E2E inexistente) | 5 de 12 cliques abaixo da dobra rolaram | **FALHA** (C2) |
| RF-28 — erro isolado e skeleton | revisão | lock → skeleton; tabela quebrada → `SectionError` só no Hoje (home e página); retry recupera | OK |
| RF-20 — "Tudo em dia" / só próximos 7 dias | `dashboard-today-view.test.ts`, `dashboard-today-tiles.test.ts` | consultora B nos dois estados | OK |

## Conformidade

- **`web.md`**:
  - Server Components por padrão, com `"use client"` só em `SectionError`/`error.tsx`.
  - Dados buscados no servidor por um helper que nunca lança.
  - Estados de loading, vazio e erro presentes na página nova.
  - Mobile-first ok e textos em pt-BR.
  - A11y com problemas: cartão como `Link` inteiro com texto visível (ok), ícones `aria-hidden` (ok), hierarquia de títulos com salto (S1).
- **`core.md`**: sem `any`/`as`/`!`, named exports (exceto page/loading/error, exigidos pelo framework), constantes nomeadas.
- **`security.md`**: página autenticada (cookie checado mais o layout do grupo); nenhuma rota pública nova; sem PII nos logs (grep = 0).
- **`testing.md`/`spec-format.md`**: o teste do total de unidades foi derivado do código (C1). O critério de âncora não tem teste automatizado; a lacuna de E2E é conhecida (REL-01), mas a QA de runtime exigida pelo critério falhou.
- **Roadmap/progress**: Task 8.1 `[x]` no `tasks.md` e Milestone 8 `[ ]` no `progress.md` (coerente com a fase de QA).

## Veredito (Emenda M8)

**REPROVADO.** Lint, typecheck, suíte (1845/1845) e build estão ok, e não há regressão fora da emenda. Porém, dois critérios de aceite falham em runtime com dados reais:
- **C1**: o total de unidades do cartão Encomendas é falso com mais de 5 produtos (RF-20a).
- **C2**: o cartão não leva à âncora na maioria dos cliques (RF-28).

O **A1** (compromisso passado chamado de "próximo") também deve ser corrigido nesta rodada. As SUGESTÕES S1–S6 ficam para o humano decidir.
