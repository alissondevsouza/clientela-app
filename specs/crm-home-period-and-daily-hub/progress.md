---
feature: crm-home-period-and-daily-hub
module: api, web, shared
phase: handoff
status: completed
updated: 2026-09-24
---

# Progress: crm-home-period-and-daily-hub

**Status:** completed
**Current Phase:** handoff
**Current Task:** — (aguardando revisão e commit do humano)

Branch de trabalho: `feature/crm-home-period-and-daily-hub` (criada a partir da `main` em `e41cc4c`). O working tree já trazia alterações não commitadas de sessões anteriores em `specs/ROADMAP.md` (CRM-13 `[x]`) e em `specs/retroactive-sale-date-and-deletion/{review,validate}.md` — não são desta feature.

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-09-23 | intake | Uma spec só para Hoje + Desempenho + Posição + filtros de listagem | Pedido explícito do humano ("inclua tudo em um spec só"); size L |
| 2026-09-23 | intake | "Vendido" (não canceladas por `sold_at`) é o número principal e a base da meta | Decisão 1 do humano; emenda ADR-0023/0025 — ADR novo na graduação |
| 2026-09-23 | intake | A home vira a central do dia; REL-05 cancelado (absorvido), REL-03 absorvido | Decisão 2 do humano; roadmap atualizado |
| 2026-09-23 | intake | Meta por mês com histórico (tabela nova, migração aditiva) | Decisão 3 do humano |
| 2026-09-23 | intake | Borda de mês e "atrasado" no `APP_TIME_ZONE`, inclusive no módulo de vendas | Decisão 4 do humano; fecha os dois known-issues de fuso |
| 2026-09-23 | spec | Comparação: 1 mês ⇒ mês anterior; 2–12 meses ⇒ mesmos meses do ano anterior; > 12 ou "tudo" ⇒ sem comparação; sempre o mesmo trecho quando o período está em andamento | Evita comparar mês pela metade com mês fechado (padrão Shopify) e respeita a sazonalidade de cosméticos (Dia das Mães, Natal) nos intervalos |
| 2026-09-23 | spec | Meta herdada do último mês com meta definida; `NULL` explícito remove a partir do mês | Mantém o comportamento atual (a meta "continua valendo") e dá histórico sem materializar meses |
| 2026-09-23 | spec | Meta editável só no mês corrente; mês decidido pelo servidor | Escopo mínimo que atende o uso; relógio do cliente é forjável |
| 2026-09-23 | spec | Posição agora reusa `/receivables/summary` e `/products/summary`; `/dashboard/summary` removido | Sem endpoint redundante; o "Previsto para receber" enganoso sai junto |
| 2026-09-23 | spec | Painel segue como read-model cross-tabela (ADR-0014); reserva e atraso extraídos para `db/derived-expressions.ts` | Evita N+1 e duplicação de regra entre módulos |
| 2026-09-23 | spec | `status=sold` como filtro da listagem de vendas | Garante a invariante lista = cartão no drill-down |
| 2026-09-23 | spec | Factories novas em `apps/api/test/factories/` só para os testes novos | `testing.md` exige; migrar testes antigos fica fora do escopo |
| 2026-09-23 | spec | Revisão neutra de spec, rodada 1: **APROVADO** com 8 ALERTAS e 7 SUGESTÕES — todos incorporados antes da implementação (itens abaixo) | Nenhum CRÍTICO; os alertas eram contradições internas e lacunas de verificabilidade |
| 2026-09-23 | spec | Comparação passa a depender do `kind` (`year` sempre 12 meses, inclusive em janeiro) | ALERTA 1: a regra por N comparava "Este ano" de janeiro com dezembro |
| 2026-09-23 | spec | Período futuro ⇒ `InvalidDashboardPeriodError` → 422 no error-handler | ALERTA 2: regra dependente do relógio não cabe no Zod e viraria 500 |
| 2026-09-23 | spec | Grupo de cobrança com cliente ⇒ `/crm/sales?status=open&clientId={id}` (a tela de vendas passa a repassar `clientId`, só o id na URL) | ALERTA 3: destino indefinido; nome na URL iria para logs de acesso |
| 2026-09-23 | spec | Textos exatos das mensagens de WhatsApp fixados no RF-19 | ALERTA 4: teste de "texto exato" precisa derivar da spec |
| 2026-09-23 | spec | Graduação emenda também o ADR-0014 (meta escalar, endpoint único, mês UTC) | ALERTA 5 |
| 2026-09-23 | spec | Hoje mostra só **encomenda sem estoque** (disponível < 0); estoque baixo fica na Posição | ALERTA 6: com os defaults de produto, "estoque baixo" nunca zeraria e o "Tudo em dia" nunca apareceria |
| 2026-09-23 | spec | Listas filtradas mostram a contagem total e têm vazio de filtro com "Limpar filtros"; vazios do Desempenho definidos | ALERTAS 7 e 8 (web.md: estados obrigatórios; drill-down precisa bater com o cartão) |
| 2026-09-23 | spec | Números sem drill-down declarados (clientes atendidas, margem); regras de setas/limites, troca De > Até na web, `paidFrom`/`paidTo` independentes, chaves desconhecidas ignoradas; arredondamento meio-para-longe-do-zero; CHECK via `sql.raw(String(MONEY_MAX_CENTS))`; datas de instante com `formatLocalDateBr`; 5.3→5.4 serial; verificação no M7; mês esperado do backfill pelo `now()` do container; aniversariantes do mês inteiro fora de escopo (REL-03 continua para isso) | SUGESTÕES 1–7 |
| 2026-09-23 | spec | `/dashboard/today` devolve o WhatsApp da pessoa dos compromissos de hoje | Diverge conscientemente da minimização da listagem de agenda (crm-appointments): é o dado do botão "Confirmar", sem N+1, limitado a ≤ 5 itens e só servidor→servidor |
| 2026-09-23 | implement | Datas de dia no bloco Hoje em `dd/mm` (sem ano); RF-20 emendado | Desvio levantado pelo implementer da 6.1: o prompt pedia `dd/mm` e a spec `formatDateBr`; formato curto evita ruído em lista densa e coincide com a mensagem de WhatsApp. Continua sem conversão de fuso (a regra que importa) |
| 2026-09-23 | implement | "Ver todas" das cobranças só aparece quando há grupos | Com só "próximos 7 dias", o link do resumo já leva à mesma lista |
| 2026-09-23 | implement | Portas novas do service do painel ficaram opcionais durante a 4.1–4.3; a 4.4 as torna obrigatórias | Evitou editar 10 `buildApp` em edição concorrente pela 3.1; um erro de configuração em runtime não é aceitável no estado final |
| 2026-09-23 | implement | `MAX(uuid)` não existe no Postgres ⇒ agregação com `MAX(col::text)` nos agrupamentos por `COALESCE` | Achado na integração real |

## Milestones

- [x] Milestone 1: Contratos e regras puras (shared) — checkpoint 2026-09-23: 391 testes do shared, typecheck verde (lint pendente só por arquivo em andamento da 2.3)
- [x] Milestone 2: Banco e base de testes (api) — 2.1 (139 testes de `db/`), 2.2 (73), 2.3 (10) verdes
- [x] Milestone 3: Vendas e cobranças (api) — 688 testes da API verdes após a 3.3
- [x] Milestone 4: Painel (api) — 694 testes da API, 1778 no repositório
- [x] Milestone 5: Web — helpers e listagens — 5.1 (61), 5.2 (614 em `lib/`), 5.3 (32 + build), 5.4 (90 + build)
- [x] Milestone 6: Web — nova home — 1769 testes no repo, lint/typecheck/build verdes (2026-09-23)
- [x] Milestone 8: Home mais enxuta (emenda de 2026-09-24) — 1853 testes, lint/typecheck verdes
- [x] Milestone 7: Graduação — ADR-0026/0027, emendas em 0014/0018/0023/0025, `04-domain-model`, `03-features`, `known-issues`, `lessons`, roadmap

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-09-23 | 1 | intake/spec | Análise crítica da home + pesquisa de mercado; decisões do humano; branch; roadmap (CRM-14 `[>]`, REL-03 `[>]`, REL-05 `[-]`); spec/research/plan/tasks | — |
| 2026-09-23 | 1 | spec | Revisão neutra rodada 1 APROVADO; correções dos alertas aplicadas | — |
| 2026-09-23 | 1 | implement | M1 (1.1–1.4) e 2.1/2.2 concluídas por implementers separados; 2.3, 5.1 e 5.2 em andamento em paralelo | 1.1–1.3: `classifyDelta` marca `no_activity` só com ambos 0 (anterior negativo ⇒ `no_base`); 1.4: `sold` repassado como `undefined` ao repository até a 3.2 |
| 2026-09-23 | 1 | implement | 3.1 e M5 concluídos; 3.2–3.3, 4.1–4.3, 6.1 e 6.2 interrompidos por limite de sessão da API por volta das 19h e retomados às 21h23 com o contexto de cada implementer preservado | Trabalho parcial ficou no working tree; cada implementer foi instruído a reler os arquivos antes de continuar |
| 2026-09-23 | 1 | implement | M3, M4 e M6 concluídos (tasks 3.2–6.3); implementação completa, 1769 testes, lint/typecheck/build verdes | — |
| 2026-09-23 | 1 | qa | QA rodada 1 (verifier neutro): **REPROVADO** — 1 CRÍTICO (gráfico corta o mês selecionado em 375px), 6 ALERTAS (limite antes da ordem nos aniversariantes, contagem ausente em 4 seções do Hoje, testes faltando para `previous`/limites/atraso no dia seguinte, atalhos de período cortados em 375px, marcador "prejuízo" truncado, meta removida com `source` ≠ `none`), 8 SUGESTÕES. Suíte 1769 verde, lint/typecheck/build ok; números e drill-downs batem em runtime | Fixer rodada 1 recebe CRÍTICO + ALERTAS + sugestões 1–5 e 7; sugestão 6 (DST pré-2019 no `appLocalDateTimeToUtc`) vira known-issue; sugestão 8 (`?page=99` sem filtro) é comportamento pré-existente fora do escopo |
| 2026-09-24 | 1 | qa | Fixer rodada 1 (interrompido por limite de sessão e retomado): 13 achados corrigidos — gráfico em grade de 12 colunas com rótulo fora do fluxo e regra anticolisão; aniversariantes ordenados pela posição na janela antes do `LIMIT`; contagens nas seções do Hoje; atalhos com `flex-wrap`; marcador de prejuízo compacto; meta removida ⇒ `source: none`; ações rápidas sem truncar; rótulo visível nos botões de WhatsApp; ano na tabela `sr-only`; PII fora da mensagem de erro; desempates por id. 1789 testes (+20), lint/typecheck/build verdes; regressões provadas revertendo o fix | Verifier NOVO para a rodada 2 |
| 2026-09-24 | 1 | qa | QA rodada 2 (verifier novo): **REPROVADO** — 1 CRÍTICO (tabela `sr-only` do gráfico alarga a página para 396px quando há mês com prejuízo — regressão da correção S3), 3 ALERTAS (rótulos do gráfico ainda colidem a 2 colunas, em empate e sobre a legenda; rótulo de `range` em andamento sem o trecho parcial; `9999-12-31` em `soldTo`/`paidTo` vira 500), 7 SUGESTÕES. Suíte 1789 verde, lint/typecheck/build ok; números, invariantes, meta e mensagens conferidos em runtime | Rodada de correção 2 de 3 (teto `MAX_IMPL_ROUNDS`). Decisão do orquestrador: gráfico passa a ter **um único rótulo de valor** (mês selecionado ou, em período de vários meses, o maior dentro dele), eliminando a classe de colisão; tooltip e tabela acessível carregam o resto |
| 2026-09-24 | 1 | qa | Fixer rodada 2: tabela acessível do gráfico dentro de `div.sr-only` (página = 360px em 375 com 4 meses de prejuízo e valores de 6 dígitos); um único rótulo de valor no gráfico (comparação por `soldCents`, empate ⇒ mais recente) + `pt-5`; tooltip ancorado; rótulos de `range` em andamento e `range` de 1 mês como `month`; teto `2099-12-31` e piso 2015-01-01 nos filtros de data (422 na API, descarte na web); estado de ação pendente no `GoalCard`; "Definida para <mês>" fora do mês corrente; `aria-label` começando pelo texto visível; desempate final no top produtos; variação que arredonda a 0% ⇒ `flat`. 1814 testes, lint/typecheck/build verdes | Três comentários históricos sobre o `/dashboard/summary` mantidos (já no passado, deixam claro que o endpoint saiu). Verifier NOVO para a rodada 3 (última) |
| 2026-09-24 | 1 | qa | QA rodada 3 (verifier novo): **APROVADO** — 1814 testes, lint/typecheck/build ok, `drizzle-kit generate` sem diff, 375px sem rolagem horizontal em 9 cenários de estresse, invariante lista = cartão em 8 períodos; 10 SUGESTÕES remanescentes listadas no `review.md` para o humano decidir | Loop de QA encerrado dentro do teto (3 rodadas) |
| 2026-09-24 | 1 | graduate/handoff | Graduação concluída (docs corrigidos conforme a sugestão de documentação da rodada 3); roadmap CRM-14 `[R]`; handoff entregue | Código não foi alterado depois da aprovação |
| 2026-09-24 | 1 | pós-QA (clientela-fix) | Pedido do humano: corrigir as sugestões S1 e S2 da QA rodada 3. S1: tooltip do gráfico ancorado pela metade do gráfico (`tooltipAnchor` em `apps/web/src/lib/monthly-bars.ts`), em vez de só 1ª/última coluna. S2: `error` pt-BR no `z.string()` de `month`/`year`/`from`/`to` em `dashboardPeriodQuerySchema` (parâmetro repetido na URL). 12 testes de regressão falharam antes e passam depois; 1826 testes, lint/typecheck/build verdes | Correção pontual fora do loop de QA, a pedido do humano; o S1 é CSS e foi validado pelo helper puro + cálculo de largura (coluna 5 ⇒ até 303px, coluna 6 ⇒ a partir de 41px, gráfico de 343px em 375), sem nova captura em browser |
| 2026-09-24 | 1 | spec (emenda) | Validação local do humano: home "muito poluída". Pedido: Desempenho acima do Hoje; cartões do Hoje só com resumo + link, lado a lado. Emenda: RF-18 (ordem), RF-20a (cartões-resumo na home), RF-28 (página `/crm/today` com as seções detalhadas e WhatsApp) | Decisão do orquestrador: as listas com WhatsApp não somem — vão para `/crm/today`, porque aniversariantes não têm tela própria e os botões prontos são o valor da central do dia; um destino único com âncoras mantém a navegação previsível |
| 2026-09-24 | 1 | qa (M8) | QA neutra da emenda: **REPROVADO** — 2 CRÍTICOS ("faltam N un." soma só os 5 itens exibidos; âncoras de `/crm/today` não rolam porque o conteúdo chega depois do skeleton), 1 ALERTA ("próximo" compromisso pode já ter passado), 6 SUGESTÕES. 1845 testes, lint/typecheck/build ok; 375px sem rolagem horizontal | Correção real do total: `missingQtyTotal` no contrato de `/dashboard/today` (em vez de mascarar como "35+"). Resumo de Cobranças "N vencem hoje" (em vez de "N hoje") aceito por ser mais claro. `apps/web/next-env.d.ts` alterado pelo `next dev` não entra no commit |
| 2026-09-24 | 1 | qa (M8) | Fixer da emenda: `missingQtyTotal` no contrato e na query, `ScrollToHash` em `/crm/today` (21/21 navegações corretas em 375px), próximo compromisso futuro, `h2` nas seções, âncoras numa constante, "Nome e mais N fazem hoje", "Ver tudo" oculto no vazio. 1853 testes | **A pedido do humano ("acelere, era uma alteração simples"), a 2ª verificação neutra da emenda foi interrompida**; validação final feita pelo orquestrador: lint, typecheck e 1853 testes verdes. Checagem visual fica com a validação local do humano |
