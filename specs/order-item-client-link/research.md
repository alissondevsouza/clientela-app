---
feature: Encomendas de clientes no pedido
module: orders
phase: research
status: done
created: 2026-07-20
updated: 2026-07-20
depends_on: [spec.md]
---

# Research: Encomendas de clientes no pedido

> Complementa `specs/crm-orders/research.md` (CRM-09, mesma sessão) — os padrões de lá valem todos aqui. Este documento cobre só o delta.

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/modules/orders/*` (recém-entregue, CRM-09) | Base da mudança: `composeItems` no service (validação de produto + snapshot), transações de `createOrder`/`replaceItems` no repository |
| `apps/api/src/modules/sales/sales.repository.ts` (createSale, passo (a)) | Precedente de resolver snapshot de cliente ESCOPADO lendo a tabela `clients` no repository de outro módulo (`InvalidSaleClientError` ⇒ 422) |
| `packages/shared/src/clients.ts` | `createClientSchema` (nome + WhatsApp mínimos — WhatsApp NOT NULL no banco); reusar no cadastro rápido |
| `apps/web/src/lib/clients-api.ts` | `createClient`/`listClients` prontos — o cadastro rápido NÃO precisa de endpoint novo |
| `apps/web/src/components/orders/order-items-form.tsx` | Form a estender: linha de item ganha seletor de cliente; padrão de `<select>` nativo já decidido no CRM-09 |
| `apps/web/src/app/(crm)/crm/orders/{new,[id]}/page.tsx` | RSCs que passarão a buscar também `listClients` em `Promise.all` |
| `apps/api/src/db/schema/order-items.ts` + `clients.ts` | Colunas novas + FK SET NULL + índice (Postgres não indexa FK) |

## Padrões a Seguir (delta)

- Snapshot de cliente resolvido **dentro do repository de orders** (transação de create/replace), como sales faz — não injetar clients service (o acesso é a dado, não a regra de negócio; precedente estabelecido).
- Erro novo `InvalidOrderClientError` ⇒ 422 no error-handler (par de `InvalidSaleClientError`).
- Migração aditiva nova (`drizzle-kit generate`); proibido editar a `0007` aplicada.
- Cadastro rápido no web: server action nova em `orders/actions.ts` que chama `createClient` do `clients-api` e retorna a cliente criada (`{ ok, client }`) para o form atualizar o seletor — `revalidatePath("/crm/clients")`.

## Gaps

- `orderItemSchema`/`OrderItemData`/mappers do repository precisam dos campos novos; testes de integração do CRM-09 ganham casos novos (422 de cliente, SET NULL) sem alterar asserts existentes.
- `orders-api.test.ts` do web: fixtures de resposta ganham `clientId`/`clientName`.
