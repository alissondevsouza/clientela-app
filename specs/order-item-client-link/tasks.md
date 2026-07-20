---
feature: Encomendas de clientes no pedido
module: orders
phase: tasks
status: draft
created: 2026-07-20
updated: 2026-07-20
depends_on: [plan.md]
---

# Tasks: Encomendas de clientes no pedido

## Milestone 1: Contrato

- [x] **Task 1.1** — Shared: `clientId` uuid opcional/nullable no item de input (create/replace), `clientId`/`clientName` nullable no `orderItemSchema`; mensagem pt-BR para uuid inválido; testes (com/sem clientId, uuid inválido, resposta com/sem cliente)
  - Arquivos: `packages/shared/src/orders.ts`, `packages/shared/src/orders.test.ts`
  - Dependências: nenhuma
  - Verificação: `bunx vitest run packages/shared` verde; `bun run typecheck`
  - Implementado por: clientela-implementer #9 (2026-07-20) — 162 testes shared; typecheck api/web quebra esperada até 2.2/3.1

## Milestone 2: Banco + API

- [x] **Task 2.1** — Schema + migração: coluna `client_id` (uuid nullable, FK → clients SET NULL, índice) em `order_items` — **sem coluna de nome** (clientName é derivado por join; decisão LGPD do plan); migração aditiva gerada (`db:generate`) e aplicada (`db:migrate`); SQL revisado
  - Arquivos: `apps/api/src/db/schema/order-items.ts`, `apps/api/drizzle/*` (gerado)
  - Dependências: Task 1.1
  - Verificação: migrate limpo; SQL sem placeholders
  - Implementado por: clientela-implementer #10 (2026-07-20) — `0008_volatile_joseph.sql` aplicada; `0007` intocada; psql confere FK SET NULL + índice

- [x] **Task 2.2** — API: `InvalidOrderClientError` (+ mapa 422 `INVALID_ORDER_CLIENT` no error-handler); porta ganha `findClientsByIds(consultantId, ids)` (escopado); service valida clientIds na composição (simétrico a produtos: ids únicos → ausente ⇒ 422) e `OrderItemData` carrega **apenas `clientId`**; repository: insert de `client_id`, `findClientsByIds`, e `loadOrder` com **LEFT JOIN em clients** para derivar `clientName` (null se sem cliente/excluída); testes de unidade atualizados/ampliados
  - Arquivos: `apps/api/src/modules/orders/{orders.errors.ts,orders.service.ts,orders.repository.ts,orders.service.test.ts}`, `apps/api/src/plugins/error-handler.ts`
  - Dependências: Tasks 1.1, 2.1
  - Verificação: `bunx vitest run apps/api/src/modules/orders` (unidade) verde; typecheck limpo
  - Implementado por: clientela-implementer #11 (2026-07-20) — validação no service via porta (simetria com produtos); LEFT JOIN no loadOrder; 43 testes do módulo verdes

- [x] **Task 2.3** — Integração (derivada do spec.md): item com cliente persiste e retorna `clientId`/`clientName`; sem cliente ⇒ nulls; renomear cliente reflete no GET (nome derivado); 422 cliente inexistente e de outra consultora (criação e replace, nada persistido); excluir cliente ⇒ GET com `clientId` E `clientName` null (vínculo apagado — LGPD), pedido íntegro; suíte inteira da API sem regressão
  - Arquivos: `apps/api/src/modules/orders/orders.integration.test.ts`
  - Dependências: Task 2.2
  - Verificação: `bunx vitest run apps/api` verde
  - Implementado por: clientela-implementer #12 (2026-07-20) — 8 testes novos (rename reflete join; SET NULL apaga vínculo; 422 sem vazar existência); api 365/365

## Milestone 3: Web

- [x] **Task 3.1** — Form + cadastro rápido + detalhe: `client-select.tsx` (seletor por item, default "Reposição (sem cliente)", lista inicial do servidor + **busca digitada** com debounce via `searchClientsAction` — reusa `listClients(search)`), `quick-client-form.tsx` (nome + WhatsApp via `createClientSchema`, **sem `<form>` aninhado** — inputs controlados + `startTransition`), actions novas em `orders/actions.ts` (`quickCreateClientAction` — usa `createClient` de `clients-api`, revalida `/crm/clients`, retorna a cliente para seleção; `searchClientsAction`), RSCs `new`/`[id]` buscam `listClients` inicial em `Promise.all`, detalhe exibe "para {clientName}" por item em todos os status (nome derivado; cliente excluída ⇒ sem marcação); fixtures de `orders-api.test.ts` atualizadas; teste de comportamento das actions onde o padrão do projeto permitir
  - Arquivos: `apps/web/src/components/orders/{order-items-form.tsx,quick-client-form.tsx,client-select.tsx}`, `apps/web/src/app/(crm)/crm/orders/{actions.ts,new/page.tsx,[id]/page.tsx}`, `apps/web/src/lib/orders-api.test.ts`
  - Dependências: Tasks 1.1 (contrato); 2.2/2.3 para exercício real
  - Verificação: `bunx vitest run apps/web` verde; `bun run lint`/`typecheck` limpos; `cd apps/web && bun run build` ok
  - Implementado por: clientela-implementer #13 (2026-07-20) — 280/280 web; build ok; actions sem teste direto (padrão do projeto — libs cobertas); checkpoint raiz re-verificado limpo pelo orquestrador

## Ordem de Execução

M1 → M2 (2.1 → 2.2 → 2.3) · M3 (3.1) pode iniciar após 1.1, em paralelo ao M2 (arquivos disjuntos). Checkpoint por milestone.

## Definition of Done (agregado)

- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] lint/typecheck limpos; suíte completa verde; build web ok
- [ ] Conformidade com rules e ADRs (0012, 0013, 0015)
