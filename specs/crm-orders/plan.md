---
feature: Pedidos de reposição (orders)
module: orders
phase: plan
status: draft
created: 2026-07-20
updated: 2026-07-20
depends_on: [spec.md, research.md]
---

# Plan: Pedidos de reposição (orders)

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Duas tabelas novas: `orders` + `order_items`; **sem** tocar em tabelas existentes | Agregado próprio; a integração com estoque é por UPDATE em `products.stock_qty` na entrega (mesmo padrão do restock do cancel de vendas) |
| Status como `text` + CHECK (union type no TS), valores `draft/placed/delivered/canceled` | Padrão do projeto (`database.md`: evita `ALTER TYPE`); labels pt-BR no shared |
| Transições por endpoints explícitos (`/place`, `/deliver`, `/cancel`), não `PATCH status` | Cada transição tem guarda e efeito próprios (deliver = estoque); espelha `POST /sales/:id/cancel`; erros 409 específicos |
| Guarda de transição = UPDATE condicional (`status = <esperado>`) como **primeira escrita** da transação | Serializa transições concorrentes sem lock explícito — padrão provado no `cancel`/`setReceivablePaid` de sales; 0 linhas ⇒ distinguir 404 de 409 por select posterior |
| Crédito de estoque no `deliver` ordenado por `product_id`, dentro da mesma transação | Anti-deadlock + atomicidade (RF-04) — mesmo padrão da baixa/restock de sales |
| Item: snapshot `product_name` + `unit_cost_cents`, FK `product_id ON DELETE SET NULL` | Consistente com ADR-0013 (exclusão de produto não quebra histórico); item sem produto vivo não credita estoque na entrega |
| `unit_cost_cents` default = `costCents` atual do produto, override permitido; `totalCents` sempre do servidor | Espelha o preço em sales (RF-01); cliente nunca dita total |
| Edição de itens = `PUT /orders/:id/items` (substituição completa), só em `draft` | Substituição é mais simples e atômica que diff item-a-item; rascunho é lista de compras, sem valor de histórico parcial |
| `place` exige ≥ 1 item; criação permite rascunho vazio | Rascunho é lista em montagem (RF-01); pedido feito sem itens não tem semântica (RF-03) |
| Total recalculado apenas em create/replace items (custo é snapshot) | Histórico do que se decidiu pedir; consistente com invariante de snapshot |
| Sugestão de estoque baixo é só do web (filtro `lowStock` existente da API de produtos) | RF-08 sem endpoint novo; menos superfície |
| Sem exclusão física de pedido | Analogia à invariante 5 (histórico); cancelamento cobre a necessidade |
| Branch de trabalho: `feature/phase-2-crm` (existente) | Working tree da Fase 2 ainda não commitado (ver Decisions Log do progress.md) |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/orders.ts` | Contrato: status values + labels, schemas create/replace-items/list-query, `Order`/`OrderItem`/`OrderListItem` |
| `packages/shared/src/orders.test.ts` | Unidade dos schemas (mensagens pt-BR, limites, campo ausente) |
| `apps/api/src/db/schema/orders.ts` | Tabela `orders` (CHECKs de status/total ≥ 0, índices de FK/status) |
| `apps/api/src/db/schema/order-items.ts` | Tabela `order_items` (CHECKs qty ≥ 1 / custo ≥ 0, índices, SET NULL) |
| `apps/api/drizzle/00NN_*.sql` | Migração gerada (`drizzle-kit generate`) |
| `apps/api/src/modules/orders/orders.errors.ts` | `OrderNotFoundError`, `OrderStateError`, `InvalidOrderItemError` |
| `apps/api/src/modules/orders/orders.service.ts` | Regra de negócio: validação de itens contra catálogo, total, portas |
| `apps/api/src/modules/orders/orders.repository.ts` | Drizzle: CRUD + transações de transição (deliver credita estoque) |
| `apps/api/src/modules/orders/orders.routes.ts` | Rotas Elysia autenticadas |
| `apps/api/src/modules/orders/orders.service.test.ts` | Unidade do service (fakes) |
| `apps/api/src/modules/orders/orders.integration.test.ts` | Integração Testcontainers (contrato + invariantes + concorrência) |
| `apps/web/src/lib/orders-api.ts` (+ `.test.ts`) | api-client tipado de orders |
| `apps/web/src/app/(crm)/crm/orders/{page,actions,loading,error}.tsx` | Listagem com filtro de status + paginação + estados |
| `apps/web/src/app/(crm)/crm/orders/new/page.tsx` | Criação de rascunho |
| `apps/web/src/app/(crm)/crm/orders/[id]/{page,loading,error,not-found}.tsx` | Detalhe: itens, edição em draft, ações de transição |
| `apps/web/src/components/orders/order-status-badge.tsx` | Badge de status com label pt-BR |
| `apps/web/src/components/orders/order-items-form.tsx` | Form client (RHF+zod): itens do pedido + sugestão de estoque baixo |
| `apps/web/src/components/orders/order-transition-buttons.tsx` | Botões place/deliver/cancel conforme status |
| `apps/web/src/components/orders/order-card.tsx` | Card da listagem |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Re-exportar `orders.ts` |
| `apps/api/src/db/schema/index.ts` | Exportar novas tabelas |
| `apps/api/src/plugins/error-handler.ts` | Mapear erros de orders (404/409/422) |
| `apps/api/src/app.ts` | `AppDeps` + `.use(createOrdersRoutes(...))` |
| `apps/api/src/index.ts` | Instanciar repo/service de orders |
| `apps/api/src/app.test.ts` | Guard cobre `/orders` (se o teste enumerar rotas) |
| `apps/web/src/components/crm/nav-items.ts` (+ `.test.ts`) | Entrada "Pedidos" |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | sim | Regra de negócio nova (validação de itens, total, matriz de transições) — service com fakes; schemas do shared |
| Integração (Testcontainers) | sim | Muda schema (2 tabelas) + contrato novo (`/orders/*`) + invariante de estoque (entrada atômica). Cobre: happy paths, 401/404/409/422, escopo por consultora, SET NULL, **concorrência de `deliver`** (crédito único) |
| E2E | pendência (sem infra) | Fluxo de UI novo; infra Playwright só no REL-01 — registrar no handoff. **RF-07/RF-08 (comportamento de UI) ficam com validação manual + runtime QA até o REL-01** |
| Regressão (BUG-NNN) | n.a. | Feature, não bug |

Testes derivam do `spec.md` (critérios de aceite), nunca do diff.

## Migração de Banco

Aditiva, não destrutiva: `CREATE TABLE orders` + `CREATE TABLE order_items` com CHECKs e índices, via `drizzle-kit generate` (DDL determinístico — `sql.raw` nos CHECKs, lesson 2026-07-16). Sem backfill; rollback = drop das tabelas novas (sem dados de produção afetados).

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Corrida deliver×deliver creditando estoque 2× | baixa | UPDATE condicional de status como 1ª escrita + teste de integração de concorrência |
| Deadlock deliver × venda concorrente nos mesmos produtos | baixa | Crédito ordenado por `product_id` (mesma ordem da baixa em sales) |
| Working tree grande da Fase 2 (diff de QA poluído) | média | Verifier revisa só os paths do plan (diff filtrado por arquivos do módulo) |
| Form de itens (array dinâmico) mais complexo que os forms existentes | média | Espelhar `sale-form.tsx` (já lida com itens múltiplos + RHF) |

## Definition of Done

- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos workspaces afetados
- [ ] `bun run test` (inclui integração Testcontainers) verde
- [ ] `next build` do web ok (lesson RSC×client: exercitar as pages novas)
- [ ] Conformidade com `.claude/rules/*` e ADRs (0006, 0012, 0013)
