---
feature: Pedidos de reposição (orders)
module: orders
phase: research
status: done
created: 2026-07-20
updated: 2026-07-20
depends_on: [spec.md]
---

# Research: Pedidos de reposição (orders)

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/modules/sales/sales.service.ts` / `sales.repository.ts` | Par mais próximo (multi-tabela, transação, snapshot, guardas de estado por UPDATE condicional, crédito/débito de estoque ordenado por `product_id`) — espelhar |
| `apps/api/src/db/schema/products.ts`, `sales.ts`, `sale-items.ts` | Convenções de schema: uuidv7 default, CHECKs via `sql.raw`, índice de FK, `$onUpdate` |
| `apps/api/src/plugins/auth-guard.ts` + `lib/route-auth.ts` | Guard default-deny (ADR-0012) + `createConsultantResolver` por rota |
| `apps/api/src/plugins/error-handler.ts` | Mapeamento central `instanceof` → status + `{ error: { code, message } }` |
| `apps/api/src/app.ts` / `index.ts` | Composition root: instanciar repo → service e `.use(createXRoutes(...))` |
| `packages/shared/src/sales.ts`, `products.ts`, `pagination.ts` | Padrão de contrato: `*Values as const` + labels pt-BR + schemas + `Paginated` |
| `apps/web/src/lib/products-api.ts` | api-client injetado (`fetchImpl`/`apiUrl`/`token`), nunca lança, `safeParse` de tudo |
| `apps/web/src/app/(crm)/crm/products/` e `sales/` | Estrutura de rota RSC: `page/actions/loading/error/new/[id]`, paginação, estados |
| `apps/web/src/components/products/product-form.tsx` | RHF + zodResolver com schema de UI local que reusa o contrato; reais→centavos no submit |
| `apps/web/src/components/crm/nav-items.ts` (+ `.test.ts`) | Config única da navegação — adicionar "Pedidos" |
| `apps/web/src/lib/format.ts` | `formatBRL`, `parseBRLToCents`, `centsToReaisInput` |

## Padrões do Codebase a Seguir

- **Rotas**: factory `createOrdersRoutes({ service, authService })`; `consultantId` sempre do token (`resolveConsultantId`), nunca do body; `{ body/query: schema }` do shared; `:id` não-UUID ⇒ `OrderNotFoundError` (404); POST cria com `set.status = 201`; rotas literais antes de `/:id`.
- **Service**: factory com porta (`OrdersRepositoryPort`); regra de negócio pura (total no servidor, validação de itens contra catálogo escopado ⇒ 422); traduz ausência em `NotFoundError`.
- **Repository**: única camada com Drizzle; transações com guarda de estado na **primeira escrita** (UPDATE condicional de status — padrão do `cancel` de sales); crédito de estoque ordenado por `product_id` (anti-deadlock — padrão do restock do cancel); `loadOrder` reusável via `Executor` (db|tx).
- **Erros de domínio**: classes nomeadas com mensagem pt-BR; registrar código novo no `ERROR_CODE` do error-handler (404/409/422).
- **Testes**: unidade do service com fake do repository (deps injetadas); integração com Testcontainers + migrações reais (helper `pg-container` com `truncateAll()`); teste de concorrência (padrão do `deliver` duplo — sales tem equivalente para estoque).
- **Web**: RSC server-first; `Promise.all` sem waterfall; actions `"use server"` com `revalidatePath` fora de try/catch; formulário client com schema de UI local; estados loading/vazio/erro; mobile-first.

## Schemas e Tipos Relevantes

- Novo agregado: `orders` (id, consultant_id FK cascade, status text+CHECK, total_cents, placed_at/delivered_at/canceled_at nullable, timestamps) e `order_items` (id, order_id FK cascade, product_id FK **SET NULL**, product_name snapshot, qty, unit_cost_cents, timestamps).
- Contrato shared: `orderStatusValues = ["draft","placed","delivered","canceled"]` + `ORDER_STATUS_LABELS`; `createOrderSchema`, `replaceOrderItemsSchema`, `orderSchema`/`orderListItemSchema`, `ordersListQuerySchema` (paginação + `status?`).
- Reuso: `paginationQuerySchema`, `Paginated`, `apiErrorSchema`; limites de item espelham sales (`QTY_MIN/MAX`, custo máx, `ITEMS_MAX`).

## Dependências Entre Packages

`packages/shared` (contrato) ← `apps/api` (schema db + módulo) e ← `apps/web` (api-client + form). Ordem de implementação: shared → api (schema/migração → módulo → app wiring) → web.

## Gaps Identificados

- Não existe módulo `orders` em nenhuma camada — tudo novo, sem refactor de existentes.
- Sugestão de estoque baixo: a API de produtos já expõe filtro `lowStock` (CRM-05) — o web busca e oferece; **sem endpoint novo** (RF-08).
- `updated_at` via `$onUpdate` (runtime Drizzle) — known-issue já aceito, mesma abordagem.

## Referências Externas

- ADR-0012 (auth default-deny), ADR-0013 (snapshot + SET NULL), ADR-0006 (git humano).
- `lessons.md`: Elysia 204/`undefined` (usar `Response(null)`), hooks `.as("global")`, `Bun.password`×Vitest (não toca auth aqui), RSC×client (helpers puros em `lib/`), `sql.raw` para CHECK determinístico.
- Skills: `elysia`, `drizzle-postgres`, `zod`, `vitest`, `react`, `shadcn-ui`.
