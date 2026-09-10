---
feature: product-purchase-discount
module: shared, api, web
phase: research
status: completed
created: 2026-09-08
updated: 2026-09-09
depends_on: [spec.md]
---

# Research: product-purchase-discount

## Código Existente Relevante

| Arquivo | Linhas/símbolos | Relevância |
|---------|----------------|------------|
| `packages/shared/src/products.ts` | `createProductSchema`, `updateProductSchema`, `productSchema` | Contrato atual exige custo e preço inteiros; receberá taxa, regras condicionais e helper financeiro |
| `packages/shared/src/products.test.ts` | suites create/update | Base de testes de fronteiras e mensagens pt-BR |
| `apps/api/src/db/schema/products.ts` | `products` + CHECKs | Adição da coluna nullable e invariantes de faixa/consistência |
| `apps/api/drizzle/` | journal e migrações 0000..0009 | Migração 0010 deve ser gerada pelo script, sem editar migração aplicada |
| `apps/api/src/modules/products/products.service.ts` | `create`, `update` | Hoje repassa entrada diretamente; passará a resolver custo/taxa no servidor |
| `apps/api/src/modules/products/products.repository.ts` | `toProduct`, CRUD, summary | Mapper incluirá taxa; update precisará de transação/lock; summary segue baseado em custo persistido |
| `apps/api/src/modules/products/products.integration.test.ts` | CRUD/validação/summary | Exercita rota autenticada e Postgres real |
| `apps/api/src/db/products-table.integration.test.ts` | introspecção/CHECKs | Provar DDL e linha legada |
| `apps/web/src/components/products/product-form.tsx` | schema UI, `buildPayload`, JSX de custo/preço | Form único create/edit; receberá modos, presets, custom e preview derivada |
| `apps/web/src/app/(crm)/crm/products/[id]/page.tsx` | detalhe + defaults | Exibir taxa/margem e inicializar produto legado no modo manual |
| `apps/web/src/components/products/product-card.tsx` | resumo do item | Acrescentar custo e taxa de forma compacta |
| `apps/web/src/lib/products-api.ts` | POST/PATCH/parse de resposta | Contrato compartilhado continua como fronteira |
| `apps/api/src/modules/sales/sales.service.ts` | snapshot `product.costCents` | Lucro histórico continua usando custo persistido no momento da venda |
| `apps/api/src/modules/orders/orders.service.ts` | default `unitCostCents` | Pedido continua herdando custo atual com override permitido |
| `apps/api/src/modules/orders/orders.repository.ts` | `deliver` | Entrega aumenta estoque, mas não altera custo; fora do escopo desta feature |

## Padrões do Codebase a Seguir

- Dinheiro em centavos inteiros; parse/format somente na borda web.
- Schemas e tipos públicos em `packages/shared`; Zod na rota, API client e formulário.
- Routes → service → repository; regra financeira no service/helper compartilhado, nunca na route.
- CHECKs Drizzle com literais determinísticos e cast `bigint` antes de multiplicação.
- Migração via `bun run db:generate`; coluna nullable torna a mudança aditiva e preserva legado sem backfill.
- RSC por padrão; interatividade restrita ao `ProductForm`; helpers puros usados pelo RSC ficam em `lib/` ou `packages/shared`, nunca no módulo `"use client"`.
- UI em pt-BR, mobile-first, tokens de tema, fieldset/legend/radios nativos ou componente acessível equivalente.

## Schemas e Tipos Relevantes

- `MONEY_MAX_CENTS = 100_000_000` mantém a multiplicação por 10000 abaixo de `Number.MAX_SAFE_INTEGER`.
- Nova constante `BASIS_POINTS_PER_PERCENT = 100` e limite `PERCENT_BASIS_POINTS = 10_000`.
- `Product.purchaseDiscountBps: number | null` é o discriminador persistido: não nulo = custo derivado; nulo = custo manual/legado.
- Create e update precisam distinguir ausência (`undefined`, preservar/default) de `null` explícito (mudar para manual).

## Dependências Entre Packages

```text
packages/shared (schemas + cálculo inteiro)
        ↓
apps/api (persistência + autoridade do cálculo)
        ↓ JSON autenticado
apps/web (form/preview/detalhe/card)

products.costCents → sales snapshot / orders default / products summary / dashboard
```

## Gaps Identificados

- Não existe campo para registrar a origem percentual do custo.
- O service atual não resolve estado atual + PATCH. Fazer `findById` e depois `update` fora de transação criaria janela de corrida; o repository deve bloquear a linha e executar ali um resolvedor puro fornecido pelo service, atualizando somente as chaves do patch resolvido.
- Não existe parser pt-BR de percentual nem apresentação de margem no formulário.
- A suíte web não executa componentes React em DOM; lógica testável deve ficar em helper puro e a fiação precisa de prova de runtime.
- O custo efetivo de `OrderItem` não alimenta custo médio do produto na entrega; manter explicitamente fora do escopo evita prometer contabilidade por lote.
- A web não precisa revalidar o dashboard ao editar produto: lucro histórico lê `sale_items.cost_cents`; apenas lista/detalhe/resumo de produtos dependem do custo vivo.
- Rollback apenas do código, mantendo o novo CHECK, faria a API antiga falhar ao mudar o preço de um produto com taxa. O rollback operacional deve reverter app e schema de forma coordenada ou impedir edição de preço até um forward-fix.

## Referências Externas

- `.claude/rules/typescript/{core,api,web,database,testing}.md`
- `.claude/rules/security.md`
- Skills `drizzle-orm`, `drizzle-postgres`, `drizzle-safe-migrations`, `elysia`, `react`, `shadcn-ui`, `tailwindcss`, `zod`, `vitest`.
- ADR-0013 (snapshots), ADR-0014 (lucro estimado), ADR-0015 (pedidos) e ADR-0019 (snapshot pré-migração).
