---
feature: crm-home-period-and-daily-hub
module: api, web, shared
phase: research
status: draft
created: 2026-09-23
updated: 2026-09-23
depends_on: [spec.md]
---

# Research: crm-home-period-and-daily-hub

Levantamento feito em 2026-09-23 sobre a `main` em `e41cc4c` (pós-CRM-13). Caminhos relativos à raiz do monorepo.

## Código Existente Relevante

| Arquivo | Linhas | Relevância |
|---------|--------|------------|
| `apps/api/src/modules/dashboard/dashboard.repository.ts` | 46-47 | `monthSalesScope`: `status = 'completed'` + `sold_at` em `date_trunc('month', now())` — recorte fixo no mês corrente, no fuso da sessão Postgres. Será substituído por bounds calculados em TS |
| `apps/api/src/modules/dashboard/dashboard.repository.ts` | 62-160 | `summary` numa transação `repeatable read` read-only; `openSalesCents` = Σ `total_cents` de TODA venda `open` (inclui parte já paga — origem do "Previsto para receber" enganoso) |
| `apps/api/src/modules/dashboard/dashboard.service.ts` | 1-60 | `clock` injetado só alimenta `monthLabel` (UTC); números não obedecem ao clock |
| `apps/api/src/modules/dashboard/dashboard.routes.ts` | todo | `GET /dashboard/summary`, `PUT /dashboard/goal` (`createConsultantResolver`) |
| `packages/shared/src/dashboard.ts` | todo | `dashboardSummarySchema`, `updateGoalSchema` (reusa `MONEY_MAX_CENTS`) |
| `apps/api/src/db/schema/consultants.ts` | 21, 35-36 | `monthly_goal_cents` escalar (meta sem histórico) |
| `apps/api/src/modules/sales/sales.repository.ts` | 93 | `overdueExpression` com `CURRENT_DATE` (UTC) — usado em `receivableColumns` (getById, createSale, setReceivablePaid, listReceivables) |
| `apps/api/src/modules/sales/sales.repository.ts` | 401-435 | `list`: filtros só `status`/`clientId`; ordem `sold_at desc, id desc`; `paidCentsExpression` |
| `apps/api/src/modules/sales/sales.repository.ts` | 715-792 | `listReceivables` (`pending`, ordem `due_date asc, due_kind asc, id asc`, `clientWhatsapp` por LEFT JOIN) e `receivablesSummary` (`CURRENT_DATE`) |
| `apps/api/src/modules/sales/sales.service.ts` | 151-169 | `derivePaymentSummary` (paid/outstanding/paymentStatus) |
| `apps/api/src/index.ts` | 36-105 | composition root; `createSalesService({ repository })` sem clock |
| `apps/api/src/app.ts` | 41-67 | `createApp(AppDeps)`; todo teste de integração monta o app inteiro via `buildApp` próprio |
| `apps/api/src/modules/products/products.repository.ts` | 34-44, 92-122, 266-284 | `reservedQtyExpression`/`availableQtyExpression` (reserva = itens de vendas `open` não entregues), `lowStock = available <= threshold`, `summary` (`stockCostCents`, `stockPriceCents`, `lowStockCount`) |
| `apps/api/src/modules/appointments/appointments.repository.ts` | 273-425 | recorte por bounds UTC vindos do service (padrão ADR-0018); list item SEM WhatsApp (minimização) |
| `apps/api/src/modules/leads/leads.repository.ts` | 92-124 | lista `status` opcional, ordem `created_at desc`; tabela sem `consultant_id` (drift aceito) |
| `packages/shared/src/time.ts` | todo | `APP_TIME_ZONE`, `appLocalDateIso`, `appLocalDateTimeToUtc`, `appLocalDayRangeUtc` |
| `packages/shared/src/sales.ts` | 231, 519-544 | `SOLD_ON_MIN_DATE = "2015-01-01"`; `salesListQuerySchema`; `receivablesListQuerySchema` (`pending` default true) |
| `packages/shared/src/pagination.ts` | todo | `perPage` default 20, máx. 100 (acima ⇒ 422); envelope `{ data, page, perPage, total }` |
| `apps/web/src/app/(crm)/crm/page.tsx` | todo | home atual: 1 request, `throw` em falha (derruba a tela inteira) |
| `apps/web/src/components/dashboard/summary-cards.tsx`, `goal-card.tsx` | todo | cards atuais; `GoalCard` recebe a referência direta da Server Action (lesson RSC×client) |
| `apps/web/src/app/(crm)/crm/loading.tsx`, `error.tsx` | todo | skeleton manual (`animate-pulse bg-muted`) e erro com `reset()` |
| `apps/web/src/app/(crm)/crm/sales/page.tsx` | todo | `searchParamsSchema` com `.catch`, abas de status, paginação preservando filtro |
| `apps/web/src/app/(crm)/crm/sales/receivables/page.tsx` | todo | só `page`; sempre `pending: true` |
| `apps/web/src/components/sales/receivable-row.tsx` | 42-44 | WhatsApp de cobrança SEM mensagem; só estado pendente ("Dar baixa") |
| `apps/web/src/lib/whatsapp.ts` | todo | `buildWhatsAppUrl({ phone, message? })` — **lança** se o número não tiver 10–15 dígitos; `toWaPhone` |
| `apps/web/src/lib/appointment-message.ts` | 56 | `buildConfirmationWhatsAppUrl(Pick<Appointment, clientId/clientName/clientWhatsapp/leadId/leadName/leadWhatsapp/startsAt>)` — retorna `null` sem telefone |
| `apps/web/src/lib/format.ts` | todo | `formatBRL`, `formatDateBr`, `formatLocalDateBr`, `parseBRLToCents`, `centsToReaisInput` |
| `apps/web/src/app/(crm)/crm/orders/new/page.tsx` | 52-77 | sugestão de reposição por estoque baixo já existe na criação de pedido (só web) |
| `apps/web/src/app/(crm)/crm/leads/page.tsx`, `products/page.tsx` | searchParams | `?status=new` e `?lowStock=true` já suportados (destinos de drill-down prontos) |

## Padrões do Codebase a Seguir

- **Recorte de tempo (ADR-0018)**: service converte dia/mês local em bounds UTC com os helpers de `packages/shared/src/time.ts` e passa ao repository; SQL compara a coluna crua (sargável) — nunca `CURRENT_DATE`/`date_trunc(now())`/`AT TIME ZONE`. Clock injetado no service (`() => new Date()` no composition root).
- **Agregado cross-tabela do painel (ADR-0014)**: o módulo `dashboard` lê as tabelas por SQL agregado próprio em transação `repeatable read` read-only; `toSafeInteger` em todo SUM/COUNT; `::bigint` antes de multiplicar.
- **Contratos**: Zod em `packages/shared`, mensagens pt-BR (incluindo campo ausente — lesson Zod v4), `z.infer` depois da fronteira.
- **Web**: RSC server-first; helpers de API com resultado discriminado que nunca lança; `searchParams` saneados com `.catch` (nunca caem no error boundary); Server Action passada por referência direta a Client Component.
- **Seeds de teste**: inserts diretos via `ctx.db.insert`, respeitando os CHECKs de matriz temporal (`created_at <= updated_at`, `sold_at <= updated_at`, `paid_at <= updated_at` …).
- **Migração custom de backfill**: padrão de `0012_sales_lifecycle_backfill.sql` (`drizzle-kit generate --custom`), testada por `sales-lifecycle-migration.integration.test.ts` (aplica migrações até N, semeia no formato antigo, aplica o resto).

## Schemas e Tipos Relevantes

- `sales`: `status open|completed|canceled`, `sold_at` (instante; retroativo = meio-dia local), `delivered_at`, `completed_at`, `canceled_at`; índices `sales_consultant_id_idx`, `sales_client_id_idx`.
- `receivables`: `amount_cents > 0`, `due_date date` (nulo em `on_delivery`/`unknown`), `due_kind`, `paid_at`, `voided_at` (nunca ambos); toda venda com valor tem cobrança (ADR-0023) — "recebido" é derivável por `paid_at`.
- `sale_items`: `qty`, `unit_price_cents`, `cost_cents` (snapshot — ADR-0014), `product_id` nullable (SET NULL) + `product_name` snapshot.
- `clients.birthday`: `date` (`yyyy-mm-dd`) nullable.
- `appointments`: `starts_at`, `status scheduled|done|no_show|canceled`, `client_id`/`lead_id` nullable.
- `leads.status new|contacted|converted|discarded`, `created_at`.

## Dependências Entre Packages

`packages/shared` (contratos + helpers puros de período/métricas) → `apps/api` (dashboard, sales) e `apps/web` (home, vendas, cobranças). Web e API são deployados juntos (imagens GHCR do mesmo commit — ADR-0011), então a troca de contrato do painel não exige versão dupla.

## Gaps Identificados

1. Nenhum modelo de período (só "mês corrente" implícito no SQL).
2. Meta sem histórico (escalar em `consultants`).
3. Listagem de vendas sem filtro de data/entrega; cobranças sem filtro de atrasadas/recebidas.
4. Nenhuma agregação por cliente ou produto (`GROUP BY` inexistente na API).
5. Nenhum filtro de clientes por aniversário.
6. "Atrasado" e "mês" dependem do `TimeZone` da sessão Postgres (known-issues "Dashboard: `date_trunc`…" e "Fuso: agenda … dashboard em UTC").
7. Home sem `Suspense`/isolamento por seção; nenhum componente shadcn de skeleton/badge/tabs (skeleton é manual).
8. `apps/api/test/factories/` não existe, embora `testing.md` exija.
9. Mensagens de WhatsApp prontas só existem para confirmação de compromisso.

## Referências Externas

- ADRs: 0014 (snapshot de custo, painel cross-tabela), 0018 (fuso), 0023 (ciclo de venda, faturamento por conclusão), 0025 (datas de negócio, recorte por `sold_at`).
- `project-memory/04-domain-model.md` invariante 10; `known-issues.md` (fuso do dashboard, `toSafeInteger` replicado).
- Lessons: RSC×client (Server Action por referência direta), "Sem jsdom, critério de UI vira helper puro", "Server Action só é exercitável por HTTP cru no build de produção".
- Referências de mercado (pesquisa de 2026-09-23): Revendedores Boticário (parcelas de hoje/vencidas, aniversariantes, cobrança por WhatsApp), Mary Kay myCustomers+ ("My 6 Things", alertas), Shopify (período + comparação + "em andamento", card → relatório), Pipedrive Focus/HubSpot (atrasados/hoje/amanhã), QuickBooks (faixa → lista acionável).
- Skills: `elysia`, `drizzle-postgres`, `drizzle-safe-migrations`, `zod`, `vitest`, `react`, `tailwindcss`, `dataviz` (gráfico de barras).
