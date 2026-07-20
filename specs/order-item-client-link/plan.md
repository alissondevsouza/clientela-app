---
feature: Encomendas de clientes no pedido
module: orders
phase: plan
status: approved
created: 2026-07-20
updated: 2026-07-20
depends_on: [spec.md, research.md]
---

# Plan: Encomendas de clientes no pedido

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Vínculo de cliente **por item**, não por pedido | Um pedido mistura reposição e encomendas de várias clientes |
| **Sem snapshot de nome** — só `client_id` FK SET NULL + índice; `clientName` derivado por LEFT JOIN na leitura | LGPD: pedido não é registro financeiro; a justificativa do ADR-0013 não se transfere (achado do spec-verifier). Exclusão da cliente apaga o vínculo por completo; rename reflete automaticamente. Bônus: nenhuma escrita cross-módulo nem anonimização |
| Validação de `clientId` no **service** via porta (`findClientsByIds` escopado) — simétrica à de produtos | Sem snapshot não há necessidade de resolver nada na transação; `OrderItemData` carrega **apenas `clientId`** (elimina a ambiguidade apontada na revisão) |
| Erro novo `InvalidOrderClientError` ⇒ 422 `INVALID_ORDER_CLIENT` | Par de `InvalidSaleClientError`; mensagem única (não vaza existência) |
| Seletor com **busca digitada** via server action reusando `listClients(search)` | Base de clientes cresce sem limite (achado da revisão: teto de 100 seria estrutural e induziria duplicatas) |
| Cadastro rápido **sem `<form>` aninhado** (inputs controlados + `startTransition` chamando a action) | HTML inválido dentro do form de itens (achado da revisão); sem componente Dialog no projeto — seção inline colapsável |
| Item de rascunho com cliente excluída volta a "sem cliente" na edição | Consequência natural do SET NULL; registrado como comportamento esperado (revisão, sugestão 5) |
| Sem mudança nas transições/estoque | Vínculo é informativo; ADR-0015 intocado |
| Migração aditiva nova (não editar `0007`) | `database.md` |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `apps/api/drizzle/0008_*.sql` | Migração: ALTER TABLE order_items (client_id + FK SET NULL + índice) |
| `apps/web/src/components/orders/quick-client-form.tsx` | Cadastro rápido inline (nome + WhatsApp), sem form aninhado |
| `apps/web/src/components/orders/client-select.tsx` | Seletor de cliente com busca digitada (debounce + server action) |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/orders.ts` (+ `.test.ts`) | `clientId` opcional/nullable no item de input; `clientId`/`clientName` nullable no `orderItemSchema` |
| `apps/api/src/db/schema/order-items.ts` | Coluna `client_id` (FK SET NULL + índice) |
| `apps/api/src/modules/orders/orders.errors.ts` | `InvalidOrderClientError` |
| `apps/api/src/modules/orders/orders.service.ts` | Porta ganha `findClientsByIds`; composição valida clientIds escopados; `OrderItemData.clientId` |
| `apps/api/src/modules/orders/orders.repository.ts` | `findClientsByIds`; insert de `client_id`; `loadOrder` com LEFT JOIN em clients para `clientName` |
| `apps/api/src/plugins/error-handler.ts` | 422 `INVALID_ORDER_CLIENT` |
| `apps/api/src/modules/orders/orders.service.test.ts` | Casos com cliente (válido, inexistente, sem cliente) |
| `apps/api/src/modules/orders/orders.integration.test.ts` | Persistência do vínculo, rename reflete, 422, SET NULL apaga vínculo, escopo |
| `apps/web/src/lib/orders-api.test.ts` | Fixtures com `clientId`/`clientName` |
| `apps/web/src/components/orders/order-items-form.tsx` | Seletor de cliente por linha + integração cadastro rápido |
| `apps/web/src/app/(crm)/crm/orders/actions.ts` | `quickCreateClientAction` + `searchClientsAction` (ambas via `clients-api`; revalidação) |
| `apps/web/src/app/(crm)/crm/orders/new/page.tsx` e `[id]/page.tsx` | `listClients` inicial em `Promise.all`; detalhe exibe "para {clientName}" por item |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | sim | Validação de cliente no service; schemas |
| Integração (Testcontainers) | sim | Schema + contrato + validação escopada + SET NULL + join derivado |
| E2E | pendência (sem infra) | Seletor/cadastro rápido manuais até REL-01 |
| Regressão | n.a. | Feature |

Suíte do CRM-09 permanece verde sem mudança de asserts de comportamento (RF-04).

## Migração de Banco

Aditiva: `ALTER TABLE order_items ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL` + índice. Sem backfill. Rollback: drop coluna/índice.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Fixtures antigas quebrarem com campos novos obrigatórios no schema de resposta | média | Atualizar fixtures (campos nullable, mas presentes) |
| Busca digitada introduzir complexidade client-side (debounce/transition) | média | Componente isolado `client-select.tsx`; fallback = lista inicial |
| Duplicata de cliente no cadastro rápido | baixa | Busca no seletor mitiga; deduplicação fora de escopo (registrada) |

## Definition of Done

- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] lint/typecheck limpos; suíte completa verde; `next build` ok
- [ ] Conformidade com rules e ADRs (0012, 0013 — não-extensão deliberada, 0015)
