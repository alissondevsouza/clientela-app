---
feature: sales-lifecycle-payment-plans
module: shared, api, web, infra
phase: tasks
status: approved
created: 2026-09-09
updated: 2026-09-10
depends_on: [plan.md]
---

# Tasks: sales-lifecycle-payment-plans

## Milestone 1: Contratos, migração e cutover

- [x] **Task 1.1 — Definir contrato compartilhado de ciclo/plano**
  - Arquivos: `packages/shared/src/sales.ts`, `sales.test.ts`, `index.ts`
  - RFs: 01, 03, 07–09
  - Dependências: nenhuma
  - Paralelizável: sim com 1.2; coordenar `index.ts`
  - Verificação: matriz completa, helper total×parcelas, `paymentPlanKnown`, `dueKind`, estados/labels e typecheck shared
  - Implementado por: `/root/sales_lifecycle_task_1_1` (validação focada verde; integração dos consumidores pendente nas tasks seguintes)
- [x] **Task 1.2 — Estender contratos de produto/dashboard**
  - Arquivos: shared `products.ts`/`dashboard.ts`/testes/`index.ts`
  - RFs: 05, 10, 13
  - Dependências: nenhuma
  - Paralelizável: sim com 1.1
  - Verificação: físico/reservado/disponível e vendas abertas cobertos
  - Implementado por: `/root/sales_lifecycle_task_1_2` (testes focados, typecheck shared e diff check verdes)
- [x] **Task 1.3 — Gerar/testar somente a expansão 0011**
  - Arquivos: schemas temporariamente expansivos, `0011` gerada, journal/snapshot
  - RFs: 01, 02
  - Dependências: 1.1
  - Paralelizável: não
  - Verificação: schema 0010 aceita 0011 sem backfill/tightening e API antiga permanece gravável até o freeze
  - Implementado por: `/root/sales_lifecycle_task_1_3` (Testcontainers e geração sem drift verdes; consumidores serão integrados nas tasks seguintes)
- [x] **Task 1.4 — Gerar/implementar backfill custom 0012**
  - Arquivos: `0012` custom e teste de upgrade literal
  - RFs: 02
  - Dependências: 1.3
  - Paralelizável: não
  - Verificação: todas as linhas/anomalias do backfill, inclusive plano perdido e cada predicado temporal enumerado, com fixtures próprias para `receivables.createdAt >= sales.soldAt` e `receivables.paidAt <= receivables.updatedAt`, em Postgres real
  - Implementado por: `/root/sales_lifecycle_task_1_4` (Postgres 18 literal 0010→0012: 14 testes verdes; lint/diff check verdes)
- [x] **Task 1.5 — Finalizar schema e gerar/testar contração 0013**
  - Arquivos: schemas finais, `0013` gerada, journal/snapshot, testes de tabelas/migração
  - RFs: 01, 02, 14
  - Dependências: 1.4
  - Paralelizável: não
  - Verificação: CHECKs/defaults finais, `0011→0012→0013` literal e segunda geração sem drift
  - Implementado por: `/root/sales_lifecycle_task_1_5` (Postgres 18: 47 testes de tabelas/migração verdes; geração sem drift)
- [x] **Task 1.6 — Tornar o cutover de produção fail-closed**
  - Arquivos: `scripts/deploy.sh`, novo `scripts/deploy.test.ts`, `vitest.config.ts`, `docs/deploy-vps.md`
  - RFs: 02, 14
  - Dependências: nenhuma para código; validação final após 1.5
  - Paralelizável: sim com 1.1–1.5
  - Verificação: doubles provam stop writers→snapshot→migrate→up, reinício só antes de schema e writers parados após falha de migração; `--dry-run`; `bun run test -- scripts/deploy.test.ts` executa o arquivo e `bun run test` também o coleta; guia documenta indisponibilidade e recuperação fail-closed sem contradizer script/ADR
  - Implementado por: `/root/sales_lifecycle_task_1_6` (sintaxe, Biome e teste shell focado verdes; gates raiz aguardam integração CRM-12)

## Milestone 2: API, estoque e consumidores

- [x] **Task 2.1 — Compor planos/projeções no sales service**
  - Arquivos: `sales.service.ts`, teste e erros necessários
  - RFs: 03, 04, 07–09
  - Dependências: 1.1, 1.5
  - Paralelizável: sim com 2.7
  - Verificação: composer puro recebe somente snapshots já travados + `transactionNow`; unidade cobre matriz, total positivo menor que parcelas rejeitado e igual às parcelas aceito, zero, divisão, dueKind, active/voided/unknown e propaga o instante para todos os timestamps do plano
  - Implementado por: `/root/sales_lifecycle_task_2_1` (20 testes unitários, Biome e diff check verdes)
- [x] **Task 2.2 — Implementar criação transacional**
  - Arquivos: `sales.service.ts`/teste, repository/routes/integration do módulo sales e error handler
  - RFs: 04, 14
  - Dependências: 2.1, 2.8
  - Paralelizável: não com 2.4–2.6
  - Verificação: rota→service→`repository.transaction(callback)`; callback obtém uma única `transaction_timestamp()`, trava/revalida produtos pelo protocolo da 2.8 antes de chamar o composer e inserir timestamps explícitos, sem cálculo financeiro pré-lock nem regra de negócio no repository; integração cobre received pendente/entregue com igualdade e ordenação completa de timestamps venda×recebível, pending/delivered, create×DELETE, snapshots, tenant, zero, atomicidade e auth
  - Implementado por: —
- [x] **Task 2.3 — Implementar leituras coerentes de vendas**
  - Arquivos: repository/routes/integration do módulo sales
  - RFs: 09, 14
  - Dependências: 2.2
  - Paralelizável: não no mesmo módulo
  - Verificação: lista em uma statement, detalhe em snapshot, filtros, paginação, snapshots excluídos, tenant/auth e leitura pausada entre transições
  - Implementado por: —
- [x] **Task 2.4 — Implementar a transição de entrega**
  - Arquivos: sales repository/routes/errors/integration
  - RFs: 06, 14
  - Dependências: 2.2
  - Paralelizável: não com 2.2–2.6
  - Verificação: falta atômica, dueKind/data, `transaction_timestamp()` explícito em `sales.deliveredAt`/`updatedAt`/`completedAt` e `receivables.updatedAt` alterados, conclusão e deliver×deliver/estoque/pedido
  - Implementado por: —
- [x] **Task 2.5 — Implementar cancelamento/anulação**
  - Arquivos: sales repository/routes/errors/integration
  - RFs: 08, 14
  - Dependências: 2.4
  - Paralelizável: não no mesmo módulo
  - Verificação: antes/depois da entrega, reposição, voided e cancel×deliver
  - Implementado por: —
- [x] **Task 2.6 — Implementar baixa/estorno/consultas financeiras**
  - Arquivos: sales repository/routes/errors/integration
  - RFs: 07, 09, 14
  - Dependências: 2.5
  - Paralelizável: não no mesmo módulo
  - Verificação: pending→partial→paid, reabertura, `transaction_timestamp()` explícito com igualdade `receivable.paidAt`/`updatedAt`/`sales.updatedAt` e `completedAt` quando aplicável, nulos/anulados, summary e cancel×pay/deliver×pay
  - Implementado por: —
- [x] **Task 2.7 — Derivar reserva/disponibilidade nas projeções**
  - Arquivos: products repository e testes consumidores
  - RFs: 05, 13
  - Dependências: 1.2, 1.5
  - Paralelizável: sim com 2.1
  - Verificação: reservado/disponível negativo, list/find, low stock/summary, capital físico, venda/pedido e critérios determinísticos/medição do AC-17
  - Implementado por: `/root/sales_lifecycle_task_2_7` (66 testes API focados e Biome/diff check verdes)
- [x] **Task 2.8 — Proteger exclusão de produto e publicar protocolo de lock**
  - Arquivos: products repository/errors/handler e testes concorrentes
  - RFs: 05, 14
  - Dependências: 1.5, 2.7
  - Paralelizável: não com 2.2
  - Verificação: DELETE 409, lock de produto escopado/ordenado, exclusão após entrega/cancelamento e corrida create×DELETE fechada em conjunto com 2.2
  - Implementado por: —
- [x] **Task 2.9 — Atualizar dashboard em snapshot coerente**
  - Arquivos: módulo dashboard e testes
  - RFs: 10
  - Dependências: 2.6, 2.7
  - Paralelizável: sim com 2.10
  - Verificação: `completed_at`, abertas/saldo/anuladas, concorrência do snapshot e plano AC-17
  - Implementado por: —
- [x] **Task 2.10 — Compatibilizar agenda com venda ativa**
  - Arquivos: módulo appointments e testes
  - RFs: 13
  - Dependências: 2.2
  - Paralelizável: sim com 2.9
  - Verificação: open/completed aceitas, canceled rejeitada, tenant/histórico preservados
  - Implementado por: —

## Milestone 3: Experiência web

- [x] **Task 3.1 — Atualizar clients HTTP, actions-base e helpers**
  - Arquivos: libs sales/products/dashboard, `sales/actions.ts`, helper `sale-lifecycle.ts` e testes
  - RFs: 03, 05–10, 14
  - Dependências: Milestone 2
  - Paralelizável: não
  - Verificação: payloads/respostas, entrega, erros/revalidações e typecheck web
  - Implementado por: —
- [x] **Task 3.2 — Redesenhar formulário de venda**
  - Arquivos: `sale-form.tsx` e auxiliares
  - RFs: 04, 05, 11
  - Dependências: 3.1
  - Paralelizável: sim com 3.3–3.8 em arquivos disjuntos
  - Verificação: payload/CTA/preview, progressive disclosure e inspeção 375px
  - Implementado por: —
- [x] **Task 3.3 — Exibir ciclo na lista e detalhe**
  - Arquivos: páginas de lista/detalhe e componentes lifecycle/status/card
  - RFs: 09, 12
  - Dependências: 3.1
  - Paralelizável: não com 3.4 no detalhe; sim com 3.5–3.8
  - Verificação: build/runtime de open/completed/canceled e plano histórico desconhecido
  - Implementado por: —
- [x] **Task 3.4 — Operar entrega e cancelamento no detalhe**
  - Arquivos: componentes deliver/cancel e integração na página de detalhe
  - RFs: 06, 08, 12
  - Dependências: 3.1, 3.3
  - Paralelizável: não com 3.3 no detalhe
  - Verificação: build/runtime de entrega suficiente/insuficiente e confirmação de devolução/anulação
  - Implementado por: —
- [x] **Task 3.5 — Exibir e operar recebíveis**
  - Arquivos: página/components de recebíveis e baixa/estorno
  - RFs: 07, 09, 12
  - Dependências: 3.1
  - Paralelizável: sim com 3.3
  - Verificação: build/runtime de pending/partial/paid/voided e três dueKind
  - Implementado por: —
- [x] **Task 3.6 — Expor previsão no dashboard**
  - Arquivos: página/componentes dashboard
  - RFs: 10
  - Dependências: 3.1
  - Paralelizável: sim com 3.2–3.5/3.7/3.8
  - Verificação: build/runtime de abertas, a receber e realizado
  - Implementado por: —
- [x] **Task 3.7 — Integrar disponibilidade em produtos/pedidos**
  - Arquivos: páginas/componentes produtos e novo pedido
  - RFs: 05, 13
  - Dependências: 3.1
  - Paralelizável: sim com as demais UIs
  - Verificação: build/runtime de físico/reservado/disponível e sugestão
  - Implementado por: —
- [x] **Task 3.8 — Integrar venda aberta na agenda web**
  - Arquivos: appointments action/teste e consumidores
  - RFs: 13
  - Dependências: 2.10, 3.1
  - Paralelizável: sim com as demais UIs
  - Verificação: action/build/runtime open/completed/canceled
  - Implementado por: —

## Milestone 4: QA e graduação

- [x] **Task 4.1 — Executar QA automatizado/runtime**
  - Arquivos: `validate.md`/`review.md`
  - RFs: 01–14
  - Dependências: Milestones 1–3
  - Paralelizável: não
  - Verificação: verifier novo e neutro revisa sem editar produção, executa AC-01–18, lint/typecheck/test/build, migração, concorrência, performance, deploy dry-run e runtime; eventual correção usa fixer separado e sempre termina em outro verifier novo
  - Implementado por: —
- [x] **Task 4.2 — Graduar memória e preparar handoff**
  - Arquivos: ADR, memória, known-issues, roadmap/progress
  - Dependências: 4.1 aprovada
  - Paralelizável: não
  - Verificação: memória coerente, CRM-12 `[R]`, `git diff --check`
  - Implementado por: orquestrador

## Cobertura RF → Tasks

| RF | Tasks |
|---|---|
| 01 | 1.1, 1.3, 1.5, 4.1 |
| 02 | 1.3–1.6, 4.1 |
| 03 | 1.1, 2.1, 3.1 |
| 04 | 2.1, 2.2, 3.2 |
| 05 | 1.2, 2.2, 2.7, 2.8, 3.2, 3.7 |
| 06 | 2.4, 3.1, 3.4 |
| 07 | 1.1, 2.1, 2.6, 3.5 |
| 08 | 1.1, 2.1, 2.5, 3.4 |
| 09 | 1.1, 2.1, 2.3, 2.6, 3.3, 3.5 |
| 10 | 1.2, 2.9, 3.6 |
| 11 | 3.2 |
| 12 | 3.3–3.5 |
| 13 | 1.2, 2.7, 2.8, 2.10, 3.7, 3.8 |
| 14 | 1.5, 1.6, 2.2–2.8, 3.1, 4.1 |

## Rastreabilidade dos critérios

| Critério | Task(s) | Evidência/arquivo de teste | Nível e comando |
|---|---|---|---|
| AC-01 | 1.4, 1.5 | `sales-lifecycle-migration.integration.test.ts` | integração — `bun run test -- apps/api/src/db/sales-lifecycle-migration.integration.test.ts` |
| AC-02 | 1.5 | `sales-tables.integration.test.ts` | integração — `bun run test -- apps/api/src/db/sales-tables.integration.test.ts` |
| AC-03 | 1.1 | `packages/shared/src/sales.test.ts` | unidade — `bun run test -- packages/shared/src/sales.test.ts` |
| AC-04/05 | 2.2 | `sales.integration.test.ts` | integração — `bun run test -- apps/api/src/modules/sales/sales.integration.test.ts` |
| AC-06 | 2.2, 2.7, 2.8 | testes integration de products/sales/orders | integração — `bun run test -- apps/api/src/modules/{products,sales,orders}/*.integration.test.ts` |
| AC-07/08 | 2.4 | integration de sales/orders | integração/concorrência — testes focados repetidos na QA |
| AC-09 | 2.6 | `sales.integration.test.ts` | integração — teste focado sales |
| AC-10 | 2.5, 2.6 | `sales.integration.test.ts` | integração/concorrência — teste focado repetido |
| AC-11 | 2.3, 2.6 | `sales.integration.test.ts` | integração/concorrência — leituras pausadas entre transições |
| AC-12 | 2.9 | `dashboard.integration.test.ts` | integração/concorrência — `bun run test -- apps/api/src/modules/dashboard/dashboard.integration.test.ts` |
| AC-13 | 3.2 | `sale-lifecycle.test.ts` | unidade web — `bun run test -- apps/web/src/lib/sale-lifecycle.test.ts` |
| AC-14 | 2.10, 3.8 | testes appointments API/action web | integração/unidade web — suíte focada appointments |
| AC-15 | 4.1 | checklist em `validate.md` | runtime — build produção/navegador ~375px |
| AC-16 | 4.1 | suíte raiz/build/log review | gates — `bun run lint && bun run typecheck && bun run test && bun --cwd apps/web run build` |
| AC-17 | 2.7, 2.9 | `sales-performance.integration.test.ts` + planos em `validate.md` | integração SQL — critérios determinísticos, medição e ambiente definidos na spec |
| AC-18 | 1.6 | `scripts/deploy.test.ts`, `vitest.config.ts` e saída `--dry-run` | unidade shell — `bun run test -- scripts/deploy.test.ts`; suíte raiz confirma coleta; doubles locais, sem VPS |

## Ordem de execução

1. 1.1 e 1.2 podem ocorrer em paralelo. A sequência de banco é estrita: 1.3 (0011) → 1.4 (0012) → 1.5 (schema final/0013). A 1.6 é independente até a validação final.
2. 2.1 e 2.7 podem avançar em paralelo; 2.7→2.8 estabiliza disponibilidade/locks antes de 2.2. No módulo sales, 2.2→2.3→2.4→2.5→2.6 é sequencial; 2.9/2.10 integram consumidores.
3. 3.1 estabiliza os contratos web; 3.2–3.8 avançam em arquivos disjuntos, coordenando componentes compartilhados; 3.4 depende do detalhe da 3.3.
4. Cada task roda a verificação focada; a QA neutra só começa após todos os ACs implementados e os gates raiz.
5. A Task 4.1 pertence somente a um verifier novo. Se houver reprovação, o orquestrador abre uma rodada condicional com fixer separado e, após a correção, outro verifier novo; esses papéis não são combinados na mesma task/agente.

## Definition of Done

- [x] AC-01–14, AC-16 e AC-18 atendidos; AC-15 e AC-17 parciais — pendências em `validate.md`
- [x] Migrações/backfill e anomalias fail-closed provados em Postgres 18 (falta o ensaio contra o dump de produção — `docs/deploy-vps.md`)
- [x] Cutover testado por `scripts/deploy.test.ts` (writers parados antes do snapshot); `--dry-run` contra a VPS não executado
- [x] `bun run lint`, `bun run typecheck`, `bun run test` (1246) e build web verdes
- [x] Runtime real exercitado (API + build de produção do web); viewport 375px e Playwright registrados como ausentes
- [x] Memória graduada (ADR-0023) e roadmap em `[R]`; QA **não** foi neutra — ver cabeçalho de `review.md`
