---
feature: Data retroativa da venda e exclusão de venda
phase: qa
round: 5
date: 2026-09-19
verdict: approved
reviewer: QA adversarial neutra (não participou da spec nem da implementação)
---

# Validação QA — rodada 5 (revisão neutra)

Base do diff: `git diff feature/sales-lifecycle-payment-plans...` (a branch **não** sai da `main`).
`git status` limpo — não há arquivo não rastreado pendente na entrega.

## Comandos executados (saída real)

### `bun run lint`

```
$ biome check .
Checked 424 files in 694ms. No fixes applied.
LINT_EXIT=0
```

**Status: OK.**

### `bun run typecheck`

```
$ bun run --filter='*' typecheck
@clientela/shared typecheck: Exited with code 0
@clientela/web typecheck: Exited with code 0
@clientela/api typecheck: Exited with code 0
TC_EXIT=0
```

**Status: OK** (três workspaces).

### `bun run test` (suíte completa, Testcontainers + Postgres 18 real)

```
$ vitest run
 RUN  v4.1.10 /home/alisson/workspace/current-projects/clientela-app

 Test Files  72 passed (72)
      Tests  1317 passed (1317)
   Start at  20:42:15
   Duration  39.26s (transform 3.81s, setup 0ms, import 39.89s, tests 162.46s, environment 12ms)
```

**Status: OK.** Confere com o número declarado (1317). Verificado que **não há teste desligado**:
`grep -rn "skipIf|describe.skip|it.skip|test.skip|\.todo" --include=*.test.ts apps/ packages/` não retorna nada.
Verificado que a integração usa Postgres real com as migrações reais
(`apps/api/test/helpers/pg-container.ts`: `PostgreSqlContainer("postgres:18-alpine")` + `migrate(db, { migrationsFolder: apps/api/drizzle })`), não mock de Drizzle.

### `bun run --filter=@clientela/web build`

```
@clientela/web build: ✓ Compiled successfully in 9.2s
@clientela/web build:   Running TypeScript ...
@clientela/web build:   Finished TypeScript in 4.0s ...
@clientela/web build: ✓ Generating static pages using 7 workers (20/20) in 370ms
@clientela/web build: Exited with code 0
BUILD_EXIT=0
```

**Status: OK** (20 rotas geradas; `/crm/sales/[id]` e `/crm/sales/new` presentes).

## Ensaio de migração (item do DoD que estava pendente) — EXECUTADO

O `plan.md` exige ensaiar `0010` → `0014` sobre banco com dados do **estado de produção (0009)**.
O teste `apps/api/src/db/sales-lifecycle-migration.integration.test.ts` cobre `0010`→`0014`, mas
semeia os dados **depois** de aplicar `0010` (`PRE_EXPANSION_MIGRATIONS` inclui `0010_green_leo.sql`),
então não é literalmente o ensaio pedido.

Ensaio estrito executado manualmente nesta QA (Postgres 18 em Docker, fora do projeto):

1. aplicadas `0000` → `0009` (estado da `main`/produção);
2. semeados dados no formato que o **código antigo** grava: consultora, cliente, produto,
   venda à vista com `sold_at = created_at = updated_at`, venda a prazo com recebível pago
   (`paid_at` posterior a `created_at`), venda cancelada, item de venda e compromisso com `sale_id`;
3. aplicadas `0010` → `0011` → `0012` → `0013` → `0014` em sequência.

Resultado: **todas as migrações aplicaram sem erro**. Estado pós-migração conferido:

- backfill do CRM-12 preencheu `payment_condition`/`installments`/`payment_plan_known`/`delivered_at`
  em todas as linhas legadas; a venda a prazo com parcela pendente virou `open`, a à vista virou
  `completed`, a cancelada manteve `canceled_at`;
- recebíveis preservados (4 linhas), `stock_qty` do produto **inalterado** (10), compromisso com
  `sale_id` preservado (1);
- constraints finais materializadas exatamente como o schema Drizzle declara:
  `sales_temporal_matrix_check` com `created_at <= updated_at AND sold_at <= updated_at ...`
  e `receivables_temporal_matrix_check` com `paid_at <= updated_at` (sem `created_at <= paid_at`);
- INSERT de venda retroativa (`sold_at` em 2025, `created_at = now()`): **aceito**;
- INSERT com `sold_at = now() + 2 days` e `updated_at = now()`: **rejeitado** pelo CHECK
  (`ERROR: new row for relation "sales" violates check constraint "sales_temporal_matrix_check"`).

**Conclusão: nenhuma linha pré-existente do estado de produção viola as constraints novas.** O DoD
de migração está cumprido. `0014_brief_lifeguard.sql` foi conferido linha a linha: apenas
`DROP CONSTRAINT` + `ADD CONSTRAINT` nos dois CHECKs temporais, literais inline, **sem placeholders
`$1..$n`** e sem tocar dados.

## Verificações adicionais

| Verificação | Resultado |
|---|---|
| RF-07 — sem `toDatePart` residual no escopo de vendas | OK: as 4 ocorrências restantes são `orders/order-card.tsx`, `leads/lead-card.tsx` e `crm/orders/[id]/page.tsx`, explicitamente fora de escopo e registradas em `known-issues.md` |
| `DELETE /sales/:id` é default-deny | OK, verificado executando `isPublicRoute` contra `DEFAULT_PUBLIC_ROUTES`: `DELETE /sales/<uuid>` ⇒ `false`, inclusive com trailing slash. **Mas sem teste automatizado** — ver ALERTA 1 do `review.md` |
| `create` persiste os instantes compostos | OK: `sales.repository.ts:361-367` faz `...composed.sale` no insert — `soldAt`/`deliveredAt`/`completedAt`/`createdAt`/`updatedAt` vêm do service |
| Predicado de estoque da exclusão | OK: `sales.repository.ts:583` — `deliveredAt !== null && status !== CANCELED_STATUS`. Os 4 quadrantes têm teste: entregue+completed (caso 7), entregue+open (7b), não entregue+open (8), entregue+canceled (9), não entregue+canceled (19b) |
| Caso 9 realmente chega a "cancelada" | OK: usa `on_delivery` + `delivered` (cobrança não paga, cancel não é bloqueado) e **asserta** `cancelSale ⇒ 200` e `stock == 10` antes de excluir |
| Meio-dia no fuso da aplicação (não UTC) | OK e **não tautológico**: `sales.service.test.ts` fixa o literal `2026-08-15T15:00:00.000Z` para `soldOn = 2026-08-15` (12:00 BRT), e `packages/shared/src/time.test.ts` pinta `appLocalDateTimeToUtc` com valores literais independentes, inclusive DST de jan/2018 |
| `created_at`/`updated_at` não acompanham a venda | OK, provado em unidade (`createdAt`/`updatedAt` === `TRANSACTION_NOW`) e em integração (`sale.createdAt !== sale.soldAt`) |
| RF-15 não afetou outros agregados | OK: `monthSalesScope` só alimenta `monthSalesCents/Count` e `monthProfitCents`; `openSales*` e os recebíveis usam escopos próprios, intocados |
| Regressão do caminho quente | OK: `soldOn` ausente **ou** igual ao dia local ⇒ `transactionNow` por identidade de referência (`toBe`), em unidade e integração |

## Pendências declaradas

- **E2E (Playwright)**: inexistente no projeto (REL-01). O comportamento puramente interativo —
  campo de data renderizado, o 1º clique que não exclui, o padrão que muda ao trocar a data,
  conferência visual dos 4 pontos de exibição — continua **sem cobertura executável**, por decisão
  registrada na spec. Não há infra de teste de componente React (sem jsdom/`@testing-library`,
  zero `.test.tsx`).
- **Lacunas de cobertura encontradas nesta rodada** (não declaradas antes): ver ALERTAS 1, 2 e 3 do
  `review.md`. Nenhuma bloqueia a entrega.
