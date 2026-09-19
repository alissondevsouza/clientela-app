---
feature: Data retroativa da venda e exclusão de venda
module: sales (packages/shared + apps/api + apps/web)
phase: tasks
status: draft
created: 2026-09-19
updated: 2026-09-19
depends_on: [plan.md]
---

# Tasks: Data retroativa da venda e exclusão de venda

## Milestone 1: Contrato (`packages/shared`)

- [x] **Task 1.1** — Adicionar `soldOn` opcional (`z.iso.date()`) ao `createSaleSchema`, com guarda de data futura no `superRefine`, **piso em 01/01/2015** (constante nomeada, mensagem "A data da venda não pode ser anterior a 01/01/2015") e constantes de mensagem no padrão do arquivo
  - Arquivos: `packages/shared/src/sales.ts`, `packages/shared/src/index.ts`
  - Dependências: nenhuma
  - Paralelizável: não (Task 1.2 toca o mesmo `superRefine`)
  - Verificação: teste unitário do schema com `vi.useFakeTimers` (a guarda herda dependência de relógio real do padrão existente) — `soldOn` ausente aceito; data passada aceita; data futura rejeitada com a mensagem exata; data anterior a 01/01/2015 rejeitada com a mensagem exata; 01/01/2015 aceita; formato inválido rejeitado
  - Implementado por: clientela-implementer (M1)
- [x] **Task 1.2** — Trocar a regra de `firstDueDate` de "não anterior a **hoje**" para "não anterior à **data da venda**" (`soldOn ?? hoje`), **reescrevendo também a mensagem** `FIRST_DUE_DATE_PAST_MESSAGE` (`sales.ts:225-226`, hoje "não pode ser no passado" — passaria a mentir) **e a asserção que a fixa** em `packages/shared/src/sales.test.ts:223`
  - Arquivos: `packages/shared/src/sales.ts`
  - Dependências: Task 1.1
  - Paralelizável: não
  - Verificação: teste unitário — venda retroativa com vencimento entre a venda e hoje é aceita; vencimento anterior à venda é rejeitado; venda de hoje mantém o comportamento. `sales.test.ts:223` **muda por decisão** (terceiro teste com premissa alterada, ver `plan.md`) — não é regressão
  - Implementado por: clientela-implementer (M1)

## Milestone 2: Migração de CHECK constraints (`apps/api/src/db`)

- [x] **Task 2.1** — Alterar `sales_temporal_matrix_check` no schema Drizzle: remover `created_at <= sold_at`, adicionar `created_at <= updated_at`, preservar todas as demais cláusulas
  - Arquivos: `apps/api/src/db/schema/sales.ts`
  - Dependências: nenhuma
  - Paralelizável: sim (com Task 2.2)
  - Verificação: `sql.raw` para literais de DDL (lesson 2026-07-16); nenhuma outra cláusula alterada
  - Implementado por: —
- [x] **Task 2.2** — Alterar `receivables_temporal_matrix_check`: remover `created_at <= paid_at`, manter `paid_at <= updated_at` e as cláusulas de `voided_at`
  - Arquivos: `apps/api/src/db/schema/receivables.ts`
  - Dependências: nenhuma
  - Paralelizável: sim (com Task 2.1)
  - Verificação: exclusão mútua pago×anulado preservada
  - Implementado por: —
- [x] **Task 2.3** — Gerar a migração com `drizzle-kit generate` e **conferir o SQL emitido** (literais inline, sem placeholders `$1..$n`; DROP + ADD dos dois CHECKs; nada além disso)
  - Arquivos: `apps/api/drizzle/0014_*.sql`, `apps/api/drizzle/meta/*`
  - Dependências: Task 2.1, Task 2.2
  - Paralelizável: não
  - Verificação: migração aplica limpa sobre banco novo **e** sobre restore de dump com dados do estado de produção, rodando `0010` → `0014` em sequência (produção está em `0009`) (venda + cobrança pré-existentes continuam válidas)
  - Implementado por: —

- [x] **Task 2.4** — Reescrever, em `sales-tables.integration.test.ts`, os dois casos de invariante temporal que a migração torna válidos: o caso `created_at > sold_at` (linha ~282) e o caso `created_at > paid_at` (linha ~623) deixam de ser rejeições esperadas e viram **casos positivos** (venda/cobrança retroativa é aceita). Acrescentar os casos negativos que passam a carregar o guard: `sold_at > updated_at` e `paid_at > updated_at` continuam rejeitados
  - Arquivos: `apps/api/src/db/sales-tables.integration.test.ts`
  - Dependências: Task 2.3
  - Paralelizável: não
  - Verificação: os casos derivam do `spec.md` (RF-02, RF-04, RF-05), nunca do diff. **Proibido** apenas remover os casos ou marcar `skip` — a premissa mudou, o teste continua existindo
  - Implementado por: —

## Milestone 3: Data retroativa na API

- [x] **Task 3.1** — Criar `InvalidSaleDateError` (422) e mapeá-lo no error-handler central
  - Arquivos: `apps/api/src/modules/sales/sales.errors.ts`, plugin de error-handler
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: erro mapeado para 422 com `{ error: { code, message } }`; sem vazar internals
  - Implementado por: —
- [x] **Task 3.2** — Em `composeSaleCreation`, derivar o instante da venda a partir de `soldOn` + `transactionNow`: hoje ⇒ `transactionNow` intacto; passado ⇒ `appLocalDateTimeToUtc(soldOn, "12:00")`. Aplicar a `soldAt`, `deliveredAt` e `completedAt`; manter `createdAt`/`updatedAt` no relógio. Validar data futura contra o dia local de `transactionNow`
  - Arquivos: `apps/api/src/modules/sales/sales.service.ts`
  - Dependências: Task 1.1, Task 3.1
  - Paralelizável: não
  - Verificação: testes unitários — hoje preserva `transactionNow` exatamente; passado dá 12:00 local; entrega/conclusão acompanham; futuro lança `InvalidSaleDateError`. O service continua sem ler o relógio. **Casos de integração 1–3, 6 e 14 rodam ao fechar este milestone** (não ficam para o M7)
  - Implementado por: —
- [x] **Task 3.3** — Fazer as cobranças seguirem a data da venda: `due_date` no dia local da venda e `paid_at` no instante da venda (cobrança sintética de venda à vista); `createdAt`/`updatedAt` das cobranças permanecem no relógio
  - Arquivos: `apps/api/src/modules/sales/sales.service.ts`
  - Dependências: Task 3.2
  - Paralelizável: não
  - Verificação: teste unitário cobrindo as três condições de pagamento (`received`, `on_delivery`, `installments`) em venda retroativa e em venda de hoje
  - Implementado por: —
- [x] **Task 3.4** — Persistir os instantes compostos no `create` do repository (sem recalcular nada no repository)
  - Arquivos: `apps/api/src/modules/sales/sales.repository.ts`
  - Dependências: Task 3.2, Task 3.3
  - Paralelizável: não
  - Verificação: `bun run test apps/api` verde; nenhum teste existente de venda precisou ser alterado
  - Implementado por: —

## Milestone 4: Exclusão de venda na API

- [x] **Task 4.1** — Implementar `remove(consultantId, saleId)` no repository: lock da venda (`FOR UPDATE`), 404 se não existir/for de outra consultora, devolução de estoque **somente** quando `delivered_at IS NOT NULL AND status <> 'canceled'`, ignorando itens com `product_id` nulo, com o `UPDATE products` **escopado por `consultant_id`** (como em `sales.repository.ts:519-524`) e itens ordenados por `product_id` (anti-deadlock), DELETE da venda na mesma transação
  - Arquivos: `apps/api/src/modules/sales/sales.repository.ts`
  - Dependências: nenhuma
  - Paralelizável: **não** — compartilha `sales.repository.ts` e `sales.service.ts` com o Milestone 3; executar depois dele (ver Ordem de Execução)
  - Verificação: comentário no código explicando por que os casos (b) e (c) não devolvem estoque
  - Implementado por: —
- [x] **Task 4.2** — Expor `remove` no service de vendas (sem regra extra: a decisão de estoque é invariante transacional e vive no repository, como no `cancel`)
  - Arquivos: `apps/api/src/modules/sales/sales.service.ts`
  - Dependências: Task 4.1
  - Paralelizável: não
  - Verificação: camadas respeitadas — rota não chama repository direto
  - Implementado por: —
- [x] **Task 4.3** — Adicionar `DELETE /sales/:id` retornando **204 com `new Response(null, { status: 204 })`** (lesson 2026-07-18), autenticada pelo guard default-deny
  - Arquivos: `apps/api/src/modules/sales/sales.routes.ts`
  - Dependências: Task 4.2
  - Paralelizável: não
  - Verificação: teste de integração da rota — 204 sem corpo não derruba o request; 404 para venda alheia. **Casos 7–13, 18–20, 22 e os de concorrência (19/19b) rodam ao fechar este milestone**
  - Implementado por: —

## Milestone 5: Web — data da venda

- [x] **Task 5.1** — Adicionar o campo "Data da venda" ao formulário: `type="date"`, default = dia local de hoje, `max` = hoje, label associada, erro em `aria-describedby` — seguindo exatamente o padrão do campo `firstDueDate` do mesmo arquivo
  - Arquivos: `apps/web/src/components/sales/sale-form.tsx`
  - Dependências: Task 1.1
  - Paralelizável: sim (com Task 5.2)
  - Inclui: ramo `soldOn` em `applyContractIssues` (`sale-form.tsx:544-554`) — sem ele as mensagens de piso e de data futura caem no `REVIEW_MESSAGE` genérico e nunca aparecem no campo
  - Verificação: o cálculo do valor default e o payload saem em helper puro `.ts` testável; o teste prova que `soldOn` **sobrevive a `buildPayload` + `createSaleSchema.safeParse` e chega em `parsed.data`** (o formulário NÃO usa `zodResolver` — `useForm` sem resolver em `sale-form.tsx:615-617`, validação manual em `:676`; a lesson 2026-07-17 sobre chave stripada vale igual pelo `safeParse`). Render e interação ficam como pendência de E2E
  - Implementado por: —
- [x] **Task 5.1b** — RF-16: criar `apps/web/src/lib/sale-form-defaults.ts` — helper **puro** que, dada a data escolhida e a data de hoje, devolve os padrões de entrega e de condição de pagamento (passado ⇒ `delivered` + `received`; hoje ⇒ padrões atuais) — e consumi-lo no formulário sem travar a escolha da usuária
  - Arquivos: `apps/web/src/lib/sale-form-defaults.ts`, `apps/web/src/lib/sale-form-defaults.test.ts`, `apps/web/src/components/sales/sale-form.tsx`
  - Dependências: Task 5.1
  - Paralelizável: não
  - Verificação: `sale-form-defaults.test.ts` cobre data passada, hoje e limite (ontem/hoje). A parte de interação (o campo re-renderizado ao trocar a data) **não é testável nesta infra** — vai como pendência de E2E no handoff, sem promessa de cobertura
  - Implementado por: —
- [x] **Task 5.2** — Extrair um helper exportado em `apps/web/src/lib/format.ts` que formata o instante da venda no **dia local** (`appLocalDateIso` + `formatDateBr`), com teste de regressão em `format.test.ts` que **falha antes do fix** (instante equivalente a 21:00 locais)
  - Arquivos: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim (com Task 5.1)
  - Verificação: o teste falha contra o comportamento antigo (slice UTC) e passa com o helper novo. Módulo `.ts` — coletado pelo Vitest em `environment: "node"`, sem precisar de jsdom
  - Implementado por: —
- [x] **Task 5.3** — Substituir o `toDatePart` local pelo helper compartilhado nos **quatro** pontos de exibição, eliminando a duplicação
  - Arquivos: `apps/web/src/app/(crm)/crm/sales/[id]/page.tsx`, `apps/web/src/components/sales/sale-card.tsx`, `apps/web/src/components/appointments/sale-link-form.tsx`, `apps/web/src/components/appointments/appointment-actions.tsx`
  - Dependências: Task 5.2
  - Paralelizável: não
  - Verificação: nenhuma definição de `toDatePart` remanescente **nos quatro arquivos do escopo de vendas** (`grep` limpo neles); build do web ok. Existem outras 3 definições idênticas fora do escopo (`components/orders/order-card.tsx`, `components/leads/lead-card.tsx`, `app/(crm)/crm/orders/[id]/page.tsx`) — **não** tocar aqui; registrar em `known-issues.md` + roadmap na Task 7.2
  - Implementado por: —

## Milestone 6: Web — exclusão de venda

- [x] **Task 6.1** — `deleteSale` no client tipado, tratando 204 (sucesso sem corpo), 404 e erro genérico, no padrão de `cancelSale`
  - Arquivos: `apps/web/src/lib/sales-api.ts`
  - Dependências: Task 4.3
  - Paralelizável: sim (com Task 6.2)
  - Verificação: teste unitário do client com `fetchImpl` fake para cada status
  - Implementado por: —
- [x] **Task 6.2** — `deleteSaleAction`: chama o client, revalida **lista de vendas, produtos, recebíveis, detalhe e dashboard** (excluir venda entregue mexe em estoque e remove cobranças). O `cancelSaleAction` (`actions.ts:123-126`) revalida lista/produtos/recebíveis/detalhe — **a constante de path do dashboard não existe em `apps/web` e precisa ser criada** e **redireciona** para `/crm/sales` (o detalhe deixa de existir)
  - Arquivos: `apps/web/src/app/(crm)/crm/sales/actions.ts`
  - Dependências: Task 6.1
  - Paralelizável: não
  - Verificação: nenhum reexport de server action (gatilho do INF-08 / bug de 2026-08-06)
  - Implementado por: —
- [x] **Task 6.3** — Criar `apps/web/src/lib/sale-delete-warning.ts` (helper puro que deriva o texto de consequência do estado da venda) e o componente `DeleteSaleButton` com confirmação em dois passos, no padrão de `CancelSaleButton`, consumindo o helper
  - Arquivos: `apps/web/src/lib/sale-delete-warning.ts`, `apps/web/src/lib/sale-delete-warning.test.ts`, `apps/web/src/components/sales/delete-sale-button.tsx`
  - Dependências: Task 6.2
  - Paralelizável: não
  - Verificação: o texto de consequência sai de `apps/web/src/lib/sale-delete-warning.ts` (helper puro, com `.test.ts` cobrindo entregue / não entregue / cancelada / com valor recebido). Interação (primeiro clique não exclui), acessibilidade e layout em ~375px **não são testáveis nesta infra** — verificados por inspeção e registrados como pendência de E2E no handoff
  - Implementado por: —
- [x] **Task 6.4** — Renderizar o botão no detalhe da venda, junto de cancelar/entregar, passando o estado necessário (entregue, cancelada, valor recebido)
  - Arquivos: `apps/web/src/app/(crm)/crm/sales/[id]/page.tsx`
  - Dependências: Task 6.3
  - Paralelizável: não
  - Verificação: disponível para qualquer venda (RF-13), inclusive cancelada
  - Implementado por: —

## Milestone 7: Integração e fechamento

- [x] **Task 7.1** — Fechar os 24 casos de integração do `plan.md` com Testcontainers (Postgres real, migrações reais), derivados do `spec.md`
  - Arquivos: `apps/api/src/modules/sales/sales.integration.test.ts` (e factories em `test/factories/` se necessário)
  - Dependências: Milestones 2, 3, 4
  - Paralelizável: não
  - Verificação: os 24 casos passam (os de M3/M4 já rodaram no fechamento do seu milestone; aqui é a execução agregada); o caso 9 (entregue → cancelada → excluída) falha se o predicado de estoque for relaxado
  - Implementado por: —
- [x] **Task 7.2** — **RF-15**: trocar o recorte de `monthSalesScope` de `completed_at` para `sold_at` (mantendo `status = 'completed'`), alinhar o comentário ao SQL e cobrir com caso de integração (venda retroativa a prazo quitada hoje conta no mês da venda). Registrar em `known-issues.md` o drift histórico do comentário **e** as 3 cópias remanescentes do slice UTC fora do escopo de vendas (com item de roadmap)
  - Arquivos: `apps/api/src/modules/dashboard/dashboard.repository.ts`, `apps/api/src/modules/dashboard/dashboard.integration.test.ts`, `project-memory/known-issues.md`
  - Dependências: Milestone 3
  - Paralelizável: não
  - Verificação: caso de integração verde; suíte existente do dashboard revisada — teste que dependia do recorte por `completed_at` muda por decisão explícita do RF-15, e a mudança é registrada no Decisions Log
  - Implementado por: —
- [x] **Task 7.2b** — Graduação da memória: escrever **dois ADRs** — um para a exclusão de venda (emenda a invariante 5 de `04-domain-model.md:27` e o item 3 do ADR-0013) e outro para as datas de negócio (emenda **dois** parágrafos do ADR-0023: "Tempo canônico do banco", que hoje afirma que todos os campos correlatos recebem exatamente o `transaction_timestamp()`, e "Faturamento por conclusão") — e atualizar os documentos vivos
  - Arquivos: `project-memory/decisions/0024-*.md`, `project-memory/decisions/0025-*.md`, `project-memory/decisions/README.md`, `project-memory/04-domain-model.md` (invariantes 5 e 10), `project-memory/03-features.md`
  - Dependências: Milestone 4, Task 7.2
  - Paralelizável: não
  - Verificação: os ADRs registram contexto, decisão, alternativas rejeitadas e consequências; a invariante 5 deixa de afirmar "venda não se apaga" sem ressalva; a invariante 10 passa a dizer que o mês é recortado por `sold_at` e **nomeia a borda conhecida** (`date_trunc('month', now())` usa o fuso da sessão Postgres — venda retroativa é imune porque meio-dia local nunca cruza o dia em UTC, mas venda de hoje às 21h BRT no último dia do mês ainda cai no mês seguinte; divergência já assumida no ADR-0018); índice de `decisions/README.md` atualizado
  - Implementado por: —
- [x] **Task 7.2c** — Atualizar o comentário de `sale-items.ts:18-19` ("não há delete de venda em rota"), que passa a ser falso com o `DELETE /sales/:id`
  - Arquivos: `apps/api/src/db/schema/sale-items.ts`
  - Dependências: Task 4.3
  - Paralelizável: sim
  - Verificação: comentário descreve a cascata como caminho real, não hipotético
  - Implementado por: —
- [x] **Task 7.3** — Validação agregada: `bun run lint`, `bun run typecheck`, `bun run test` e build dos workspaces afetados
  - Arquivos: —
  - Dependências: todas
  - Paralelizável: não
  - Verificação: os três verdes na raiz do monorepo
  - Implementado por: —

## Ordem de Execução

1. **M1** e **M2** em paralelo (contrato e schema são independentes).
2. **M3** depois de M1+M2 (precisa do campo no contrato e dos CHECKs relaxados).
3. **M4 depois de M3**, sempre: ambos tocam `sales.repository.ts` e `sales.service.ts`. Nenhuma task de M4 é paralelizável com M3.
4. **M5** depois de M1 (a Task 5.2/5.3 não depende de nada e pode correr a qualquer momento); **M6** depois de M4.
5. **M7** por último (integração precisa de tudo aplicado).

## Definition of Done (agregado)

- [x] Todos os critérios de aceite do `spec.md` atendidos e testados
- [x] `bun run lint` e `bun run typecheck` limpos
- [x] `bun run test` verde, com os 24 casos de integração
- [x] Build ok
- [x] Migração aplicada com sucesso sobre banco com dados do estado anterior
- [x] Conformidade com `.claude/rules/*` e ADRs; **dois ADRs novos** (exclusão de venda; faturamento por `sold_at`)
