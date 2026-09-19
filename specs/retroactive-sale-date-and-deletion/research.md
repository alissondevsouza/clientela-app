---
feature: Data retroativa da venda e exclusão de venda
module: sales (packages/shared + apps/api + apps/web)
phase: research
status: draft
created: 2026-09-19
updated: 2026-09-19
depends_on: [spec.md]
---

# Research: Data retroativa da venda e exclusão de venda

## Código Existente Relevante

| Arquivo | Linhas | Relevância |
|---|---|---|
| `packages/shared/src/sales.ts` | 265–370 | `createSaleSchema` — contrato de criação. **Não tem campo de data**; é onde o campo novo entra |
| `packages/shared/src/sales.ts` | 335–349 | `firstDueDate` rejeitado se anterior a **hoje** (`appLocalDateIso(new Date().toISOString())`) — quebra venda parcelada retroativa (RF-06) |
| `packages/shared/src/sales.ts` | 456–484 | `saleSchema` (resposta) — `soldAt: z.iso.datetime()` já existe na saída |
| `packages/shared/src/time.ts` | 101–108 | `appLocalDateIso` — instante → dia local |
| `packages/shared/src/time.ts` | 132+ | `appLocalDateTimeToUtc(dateIso, timeHm)` — dia local + hora → instante UTC, com DST resolvido por duas passadas. **É a função do RF-03** |
| `packages/shared/src/time.ts` | 3 | `APP_TIME_ZONE = "America/Sao_Paulo"` (ADR-0018) |
| `apps/api/src/modules/sales/sales.service.ts` | 208–325 | `composeSaleCreation` — usa `transactionNow` para `soldAt`, `createdAt`, `updatedAt`, `deliveredAt`, `completedAt` e para as cobranças. Ponto central da Parte 1 |
| `apps/api/src/modules/sales/sales.service.ts` | 299–301 | `deliveredAt`/`completedAt` = `transactionNow` — precisam seguir a data da venda (RF-04) |
| `apps/api/src/modules/sales/sales.service.ts` | 243–285 | Geração de cobranças; `localTransactionDate` alimenta `due_date`/`paid_at` (RF-05) |
| `apps/api/src/modules/sales/sales.repository.ts` | 252–399 | `create` — lock de produtos (`FOR UPDATE`, ordenado por id), baixa de estoque só quando `deliveryStatus === "delivered"`, insert de venda/itens/cobranças |
| `apps/api/src/modules/sales/sales.repository.ts` | 454–546 | `cancel` — **referência canônica da reversão de estoque**: devolve só quando `deliveredAt` não é nulo; anula cobranças pendentes; bloqueia com parcela paga |
| `apps/api/src/modules/sales/sales.repository.ts` | 420 | Listagem ordena por `sold_at DESC, id DESC` — venda retroativa já cai na posição cronológica certa, **sem mudança** |
| `apps/api/src/modules/sales/sales.routes.ts` | 83–102 | `GET /sales/:id`, `POST /sales/:id/cancel`, `POST /sales/:id/deliver` — padrão para o `DELETE /sales/:id` |
| `apps/api/src/modules/sales/sales.errors.ts` | todo | Erros de domínio e mapeamento HTTP (404/409/422) |
| `apps/api/src/db/schema/sales.ts` | 162–174 | `sales_temporal_matrix_check` — **`created_at <= sold_at` é o bloqueio principal** |
| `apps/api/src/db/schema/receivables.ts` | 62–68 | `receivables_temporal_matrix_check` — `created_at <= paid_at` bloqueia o RF-05 |
| `apps/api/drizzle/0013_optimal_midnight.sql` | todo | SQL literal atual dos dois CHECKs — base do diff da migração |
| `apps/api/src/modules/products/products.repository.ts` | 32–45 | `reservedQtyExpression` — reserva derivada de vendas `open` não entregues; some sozinha ao excluir |
| `apps/api/src/modules/dashboard/dashboard.repository.ts` | 32–37 | `monthSalesScope` usa `completed_at` (comentário diz `sold_at` — drift) |
| `apps/api/src/modules/dashboard/dashboard.repository.ts` | 88–89 | `overdue` = cobrança pendente com `due_date < CURRENT_DATE` |
| `apps/web/src/components/sales/sale-form.tsx` | 122, 142, 587, 900–920 | Formulário; campo `firstDueDate` com `type="date"` + `register` — **padrão a replicar para a data da venda** |
| `apps/web/src/components/sales/cancel-sale-button.tsx` | todo | **Padrão canônico da confirmação em dois passos** (RF-08) |
| `apps/web/src/lib/sales-api.ts` | 307–355 | `cancelSale` — padrão do client tipado (404/409/erro genérico) |
| `apps/web/src/app/(crm)/crm/sales/actions.ts` | 103–129 | `cancelSaleAction` — padrão da server action |
| `apps/web/src/app/(crm)/crm/sales/[id]/page.tsx` | 74–80, 173, 194, 269–275 | `toDatePart` (slice UTC — bug do RF-07), usado para `soldAt` e `deliveredAt`; posicionamento dos botões |
| `apps/web/src/components/appointments/sale-link-form.tsx` | 33 | 3º ponto do `toDatePart` duplicado — rotula a venda no seletor "essa sessão virou venda?" |
| `apps/web/src/components/appointments/appointment-actions.tsx` | 65 | 4º ponto do `toDatePart` duplicado |
| `vitest.config.ts` | todo | Coleta só `*.test.ts` em `environment: "node"` — define onde o teste de regressão do RF-07 pode existir |

## Padrões do Codebase a Seguir

- **Camadas unidirecionais** (`api.md`): rota valida e mapeia; service tem a regra e não conhece HTTP; repository é a única camada que toca o banco. `composeSaleCreation` já segue isso de forma rigorosa — o service **não lê o relógio nem o catálogo**: recebe `transactionNow` e os produtos travados do repository. A data da venda deve entrar pelo mesmo caminho (input validado → service compõe), nunca lida do relógio dentro do service.
- **Reversão de estoque**: `cancel` (`sales.repository.ts:503-527`) é a referência — itens ordenados por `product_id` (anti-deadlock, mesma ordem da baixa) e devolução condicionada a `deliveredAt`.
- **CHECKs derivados de constantes TS** com `sql.raw` para DDL determinístico (lesson 2026-07-16: `sql.join` vira placeholders `$1..$n` no `drizzle-kit generate`).
- **Confirmação em dois passos** sem `window.confirm`: estado local + `useTransition`, mensagem de erro em `role="alert"` (`cancel-sale-button.tsx`).
- **Server action → API** com revalidação; o browser nunca fala com a API direto (`web.md`).
- **Fuso**: nunca `new Date("yyyy-mm-dd")` nem offset fixo; sempre os helpers de `time.ts` (ADR-0018).

## Schemas e Tipos Relevantes

- `createSaleSchema` (shared) — ganha o campo de data; `CreateSale` = `z.output`.
- `saleSchema` (shared) — resposta; `soldAt` já presente, sem mudança de forma.
- `sales` / `sale_items` / `receivables` (Drizzle) — sem coluna nova. **A mudança de schema é só de CHECK constraint.**
- FKs que governam a exclusão: `sale_items.sale_id` CASCADE, `receivables.sale_id` CASCADE, `appointments.sale_id` SET NULL. Verificado: nenhuma outra tabela referencia `sales`.

## Dependências Entre Packages

`packages/shared` (contrato + helpers de fuso) → consumido por `apps/api` (validação na fronteira, service) **e** por `apps/web` (schema do formulário via `zodResolver`). Mudança no `createSaleSchema` atinge os dois lados na mesma entrega — é o que torna a feature size L.

## Gaps Identificados

1. **Nenhum caminho aceita data de venda** — campo, contrato, service e formulário precisam ser criados.
2. **Nenhuma operação de exclusão de venda existe** — rota, service, repository, client tipado, server action e botão precisam ser criados.
3. **Os dois CHECKs temporais proíbem retroatividade** — migração de constraint necessária (sem coluna nova, sem backfill de dados).
4. **`toDatePart` exibe o dia UTC** — venda das 21:00 locais aparece com a data do dia seguinte (bug pré-existente, dentro do raio da feature).
5. **Não há erro de domínio para exclusão** — reaproveitar `SaleNotFoundError` (404); avaliar se algum estado precisa de 409 (a princípio não: RF-10 e RF-13 removem as travas).

## Referências Externas

- `project-memory/decisions/0013-sales-snapshot-set-null.md` — item 3 ("Sem edição de venda: apenas cancelamento") é emendado por esta feature.
- `project-memory/decisions/0023-sale-lifecycle-and-payment-plans.md` — ciclo de venda, reserva derivada, "cancelar anula, não apaga", cobrança sintética paga da venda à vista.
- `project-memory/decisions/0018-app-time-zone.md` — fuso da aplicação.
- `project-memory/04-domain-model.md` — invariante 5 ("venda não se apaga"), emendada por esta feature.
- `project-memory/lessons.md` — 2026-07-18 (Elysia 1.4: handler que retorna `undefined` em 204 lança TypeError — **direto no caminho do DELETE**); 2026-07-16 (`sql.raw` em DDL).
- Skills: `drizzle-postgres`, `drizzle-safe-migrations` (migração de constraint em produção com dados reais), `elysia`, `zod`, `react`, `vitest`.
