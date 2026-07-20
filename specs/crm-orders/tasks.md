---
feature: Pedidos de reposição (orders)
module: orders
phase: tasks
status: draft
created: 2026-07-20
updated: 2026-07-20
depends_on: [plan.md]
---

# Tasks: Pedidos de reposição (orders)

## Milestone 1: Contrato compartilhado

- [x] **Task 1.1** — Contrato de orders no shared: status values + `ORDER_STATUS_LABELS`, `createOrderSchema` (itens opcionais; item = productId uuid, qty int ≥ 1 ≤ 1000, unitCostCents int ≥ 0 opcional, máx 50 itens), `replaceOrderItemsSchema` (aceita lista vazia — esvaziar rascunho é válido, RF-02), `orderItemSchema`/`orderSchema`/`orderListItemSchema` (com `placedAt`/`deliveredAt`/`canceledAt` nullable), `ordersListQuerySchema` (paginação + `status?`), mensagens pt-BR cobrindo campo ausente (lesson Zod v4)
  - Arquivos: `packages/shared/src/orders.ts`, `packages/shared/src/orders.test.ts`, `packages/shared/src/index.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `bun run test` (shared) verde; `bun run typecheck` limpo
  - Implementado por: clientela-implementer #1 (2026-07-20) — 28 testes novos; lint/typecheck/153 testes shared verdes

## Milestone 2: Banco (schema + migração)

- [x] **Task 2.1** — Tabelas `orders` (consultant_id FK cascade + índice, status text+CHECK, total_cents ≥ 0, placed_at/delivered_at/canceled_at timestamptz nullable) e `order_items` (order_id FK cascade + índice, product_id FK **SET NULL** + índice, product_name snapshot NOT NULL, qty ≥ 1, unit_cost_cents ≥ 0), convenções de `database.md` (uuidv7, timestamps, CHECKs com `sql.raw`); exportar no barrel; gerar migração com `drizzle-kit generate` e aplicar no banco de dev
  - Arquivos: `apps/api/src/db/schema/orders.ts`, `apps/api/src/db/schema/order-items.ts`, `apps/api/src/db/schema/index.ts`, `apps/api/drizzle/*` (gerado)
  - Dependências: Task 1.1 (importa `orderStatusValues` do shared)
  - Paralelizável: não
  - Verificação: `bun run db:migrate` aplica limpo; migração SQL revisada (CREATE TABLE + CHECKs + índices, sem placeholders)
  - Implementado por: clientela-implementer #2 (2026-07-20) — migração `0007_rare_solo.sql` aplicada; schema conferido via psql; sem índice em `status` (sem query que justifique)

## Milestone 3: API (módulo orders)

- [x] **Task 3.1** — Erros + service: `orders.errors.ts` (`OrderNotFoundError`, `OrderStateError` com mensagens pt-BR por transição, `InvalidOrderItemError`); `orders.service.ts` com porta `OrdersRepositoryPort` — create (valida itens contra catálogo escopado ⇒ 422, resolve snapshot nome/custo, total no servidor), replaceItems (mesma composição), list/getById, place/deliver/cancel (delegam guarda transacional ao repo); unidade com fakes cobrindo happy paths, item inexistente/alheio, override de custo, pedido vazio
  - Arquivos: `apps/api/src/modules/orders/orders.errors.ts`, `orders.service.ts`, `orders.service.test.ts`
  - Dependências: Task 1.1
  - Paralelizável: sim (com 2.1)
  - Verificação: `bun run test` (service) verde
  - Implementado por: clientela-implementer #3 (2026-07-20) — 14 testes de unidade verdes; composição compartilhada create/replaceItems

- [x] **Task 3.2** — Repository: `orders.repository.ts` — `findProductsByIds` escopado; `createOrder`/`replaceItems` transacionais (replace: guarda `status='draft'` como primeira escrita; delete+insert de itens + update do total); `place` (guarda `draft`→`placed`, exige ≥ 1 item, grava `placed_at`); `deliver` (guarda `placed`→`delivered` como 1ª escrita, credita `stock_qty += qty` dos itens com produto vivo ORDENADO por product_id, grava `delivered_at`); `cancel` (guarda `draft|placed`→`canceled`, grava `canceled_at`, sem efeito de estoque); 0 linhas ⇒ distinguir 404 de 409; `list` paginado com filtro de status + `loadOrder` (padrão Executor)
  - Arquivos: `apps/api/src/modules/orders/orders.repository.ts`
  - Dependências: Tasks 2.1, 3.1
  - Paralelizável: não
  - Verificação: `bun run typecheck` limpo (comportamento provado na 3.4)
  - Implementado por: clientela-implementer #5 (2026-07-20) — padrão sales (UPDATE condicional como 1ª escrita; crédito ordenado por product_id)

- [x] **Task 3.3** — Rotas + wiring: `orders.routes.ts` (factory com `service`+`authService`; `resolveConsultantId` por handler; schemas do shared em body/query; `:id` não-UUID ⇒ 404; POST /orders 201; POST place/deliver/cancel; PUT /orders/:id/items; GET list/detail); mapear erros novos no `error-handler.ts` (`ORDER_NOT_FOUND` 404, `ORDER_STATE` 409, `INVALID_ORDER_ITEM` 422); montar em `app.ts` (AppDeps) e `index.ts` (composition root)
  - Arquivos: `apps/api/src/modules/orders/orders.routes.ts`, `apps/api/src/plugins/error-handler.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`
  - Dependências: Task 3.2
  - Paralelizável: não
  - Verificação: `bun run typecheck` limpo; API sobe local com rota autenticada (401 anônimo)
  - Implementado por: clientela-implementer #5 (2026-07-20) — 401 provado via curl; 7 suítes de integração existentes atualizadas para o novo AppDeps (só wiring); 328 testes api verdes

- [x] **Task 3.4** — Integração (Testcontainers, derivada do spec.md): criação (vazio ⇒ total 0; com itens ⇒ total do servidor; 422 produto alheio/inexistente; override de custo), replace de itens (draft ok + recálculo; 409 nos demais status), matriz de transições completa (válidas com timestamps; inválidas 409 sem efeito; place vazio 409), entrega credita estoque atômico (produto excluído: SET NULL não credita e não falha), **concorrência deliver×deliver (crédito único)** e **place×cancel (exatamente um vence, outro 409)**, cancel sem efeito de estoque; timestamps de transição assertados por não-nulo/ordem relativa (nunca valor exato — determinismo, `testing.md`), list/paginação/filtro/escopo por consultora, 401 sem sessão, 404 pedido alheio
  - Arquivos: `apps/api/src/modules/orders/orders.integration.test.ts`
  - Dependências: Task 3.3
  - Paralelizável: não
  - Verificação: `bun run test` (api) verde com Docker
  - Implementado por: clientela-implementer #7 (2026-07-20) — 23 testes de integração; achou a lacuna place×cancel (critério emendado no spec, ver Decisions Log); suíte api 351/351

## Milestone 4: Web (tela Pedidos)

- [x] **Task 4.1** — api-client: `lib/orders-api.ts` no padrão `products-api.ts` (deps injetadas, nunca lança, `safeParse` das respostas, 404 ⇒ `notFound`): list/get/create/replaceItems/place/deliver/cancel; testes de unidade
  - Arquivos: `apps/web/src/lib/orders-api.ts`, `apps/web/src/lib/orders-api.test.ts`
  - Dependências: Task 1.1 (contrato); executável em paralelo ao Milestone 3
  - Paralelizável: sim
  - Verificação: `bun run test` (web) verde
  - Implementado por: clientela-implementer #4 (2026-07-20) — 28 testes novos; suíte web 263/263; transições retornam Order parseado (alinhado à porta do service)

- [x] **Task 4.2** — Listagem: rota `/crm/orders` (page RSC com paginação + filtro de status via searchParams saneados, `order-card.tsx`, `order-status-badge.tsx`, estados loading/vazio(CTA)/erro) + entrada "Pedidos" em `nav-items.ts` (+ teste)
  - Arquivos: `apps/web/src/app/(crm)/crm/orders/{page,loading,error}.tsx`, `apps/web/src/components/orders/order-card.tsx`, `order-status-badge.tsx`, `apps/web/src/components/crm/nav-items.ts`, `nav-items.test.ts`
  - Dependências: Task 4.1
  - Paralelizável: não
  - Verificação: `bun run typecheck` + `bun run lint` limpos
  - Implementado por: clientela-implementer #6 (2026-07-20) — 266/266 web; badge com tokens semânticos do tema (sem cor crua — coerente com sale-status-badge)

- [x] **Task 4.3** — Criação/edição de rascunho: `new/page.tsx` + `[id]/page.tsx` (detalhe com itens; edição só em draft), `order-items-form.tsx` (RHF+zod, schema de UI local sobre o contrato, itens dinâmicos no padrão `sale-form.tsx`, custo em reais→centavos, **sugestão de estoque baixo** via API de produtos `lowStock` com inclusão em um toque), `order-transition-buttons.tsx` (ações conforme status, com `useTransition` e erro em `role="alert"`), `actions.ts` (`"use server"`: create/replaceItems/place/deliver/cancel + `revalidatePath`; Server Action passada por referência direta — lesson 2026-07-19)
  - Arquivos: `apps/web/src/app/(crm)/crm/orders/{actions.ts,new/page.tsx,[id]/page.tsx,[id]/loading.tsx,[id]/error.tsx,[id]/not-found.tsx}`, `apps/web/src/components/orders/order-items-form.tsx`, `order-transition-buttons.tsx`
  - Dependências: Task 4.2
  - Paralelizável: não
  - Verificação: `bun run typecheck` + `bun run lint` limpos; `next build` ok (lesson RSC×client)
  - Implementado por: clientela-implementer #8 (2026-07-20) — 280/280 web; build de produção limpo; extensão aditiva de `perPage` em products-api (registrada)

## Ordem de Execução

M1 → M2 → M3 (3.1 pode paralelizar com 2.1; 3.2→3.3→3.4 sequenciais). M4: 4.1 pode rodar em paralelo ao M3 (depende só do contrato); 4.2→4.3 sequenciais após 4.1. Checkpoint de validação ao fechar cada milestone (lint + typecheck + testes do escopo).

## Definition of Done (agregado)

- [ ] Todos os critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos módulos afetados
- [ ] `bun run test` verde (unidade + integração Testcontainers)
- [ ] `next build` do web ok
- [ ] Conformidade com `.claude/rules/*` e ADRs (0006, 0012, 0013)
