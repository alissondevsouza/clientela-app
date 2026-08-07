---
feature: Agenda de compromissos
module: appointments
phase: research
status: draft
created: 2026-08-05
updated: 2026-08-05
depends_on: [spec.md]
---

# Research: Agenda de compromissos

> Levantamento feito por duas varreduras read-only do codebase (API e Web) em 2026-08-05.

## Código Existente Relevante

| Arquivo | Linhas | Relevância |
|---------|--------|------------|
| `apps/api/src/db/schema/orders.ts` | 14–73 | Modelo de tabela mais recente: `uuidv7()` default, enum via `text({enum})` + CHECK com `sql.raw`, timestamptz nullable por transição, índice de FK |
| `apps/api/src/db/schema/order-items.ts` | 28–45 | FK `ON DELETE SET NULL` + índices; `client_id` sem snapshot (ADR-0016) |
| `apps/api/src/db/schema/index.ts` | 1–22 | Barrel — tabela só entra na migração se exportada aqui (`drizzle.config.ts` aponta para ele) |
| `apps/api/src/modules/orders/orders.routes.ts` | 16–103 | Factory de rotas, `createConsultantResolver`, `requireValidOrderId` (id malformado ⇒ 404), Zod na fronteira |
| `apps/api/src/modules/orders/orders.service.ts` | 64–221 | Porta do repositório declarada no service, paginação, `undefined` → erro de domínio |
| `apps/api/src/modules/orders/orders.repository.ts` | 29–355 | `Executor = Database \| Transaction`, mappers `toISOString()`, LEFT JOIN para nome derivado, UPDATE condicional distinguindo 404 de 409 |
| `apps/api/src/modules/sales/sales.routes.ts` | 95–103 | Rota literal registrada **antes** da paramétrica (`/receivables/summary` antes de `/receivables/:id`) — mesmo cuidado para `/appointments/conflicts` |
| `apps/api/src/modules/sales/sales.repository.ts` | 86–88, 506–507 | `overdue` via `CURRENT_DATE` (TZ da sessão Postgres) — precedente de fuso a não repetir |
| `apps/api/src/modules/dashboard/dashboard.repository.ts` | 31–37 | `date_trunc('month', now())` — o "mês UTC" do ADR-0014 |
| `apps/api/src/modules/dashboard/dashboard.service.ts` | 32–40 | Único `timeZone` explícito do código hoje: `"UTC"` no `Intl.DateTimeFormat` |
| `apps/api/src/modules/leads/leads.repository.ts` / `.service.ts` | conversão | Ponto de enxerto do RF-12 (propagar compromissos na conversão lead→cliente) |
| `apps/api/src/plugins/auth-guard.ts` | 32–104 | `DEFAULT_PUBLIC_ROUTES` (allowlist) + `onRequest` fail-closed `.as("global")` |
| `apps/api/src/plugins/error-handler.ts` | 36–227 | `ERROR_CODE` + cadeia de `instanceof` → status; envelope `{ error: { code, message } }` |
| `apps/api/src/app.ts` / `index.ts` | 21–96 | Composition root: `AppDeps`, `.use(createXRoutes(...))`, `clock` injetado onde há "agora" |
| `apps/api/test/helpers/pg-container.ts` | 34–86 | Testcontainers `postgres:18-alpine`, `truncateAll()`, migrações reais |
| `packages/shared/src/orders.ts` | 9–146 | Convenção de contrato: `xStatusValues` + `X_STATUS_LABELS` + `createXSchema`/`xSchema`/`xListItemSchema`/`xsListQuerySchema` |
| `packages/shared/src/pagination.ts` | 13–47 | `paginationQuerySchema` (default 20, máx 100) e `paginated(itemSchema)` |
| `packages/shared/src/sales.ts` | 95–245 | `addMonthsClamped`/`yesterdayIso`: aritmética de data por string, deliberadamente sem `Date` |
| `apps/web/src/app/(crm)/crm/orders/page.tsx` | 37–195 | Listagem RSC completa: `searchParamsSchema` com `.catch`, filtros por querystring, 3 estados, paginação |
| `apps/web/src/app/(crm)/crm/orders/actions.ts` | 75–265 | Server Actions: `requireToken`, revalidate cruzado, actions auxiliares de busca |
| `apps/web/src/lib/orders-api.ts` | 16–211 | Client tipado: deps injetadas, resultados discriminados, nunca lança, resposta validada pelo schema do shared |
| `apps/web/src/components/products/product-form.tsx` | 53–343 | RHF + zodResolver reusando o contrato campo a campo; `z.input`/`z.output` |
| `apps/web/src/components/sales/sale-form.tsx` | 163–274, 791 | `useAsyncSearch` (debounce 300ms), combobox de cliente, `<input type="date">` |
| `apps/web/src/components/orders/client-select.tsx` | 18–94 | `<select>` nativo + busca debounced via Server Action passada como referência direta |
| `apps/web/src/lib/whatsapp.ts` | 20–52 | `buildWhatsAppUrl` (**lança** se o número for inválido) e `toWaPhone` |
| `apps/web/src/lib/format.ts` | 12–72 | `formatBRL`, `formatDateBr` (regex, sem `Date`), `parseBRLToCents` |
| `apps/web/src/components/crm/nav-items.ts` | 9–33 | `CRM_NAV_ITEMS` (6 itens hoje) + `isNavItemActive`, com teste unitário |
| `apps/web/src/components/orders/order-status-badge.tsx` | 12 | Padrão de badge: pílula + `Record<Status, string>` de classes, rótulo textual sempre visível |

## Padrões do Codebase a Seguir

1. **Camadas** `routes → service → repository`, factories com dependências no construtor, montadas no composition root. Rota nunca toca repository; service não importa Elysia.
2. **Cross-módulo é por porta + query escopada no próprio repository**, não por injeção do service alheio: `orders.repository` lê `products`/`clients` direto, sempre filtrando por `consultantId` (o dashboard faz igual). É o precedente para `appointments` ler `clients`/`leads`/`sales` e para `leads` escrever em `appointments` (RF-12).
3. **`consultantId` sempre do token** (`createConsultantResolver`), nunca do corpo; id malformado é traduzido para 404 antes de chegar ao banco.
4. **Transições de status** por endpoints explícitos, aplicadas como **UPDATE condicional na primeira escrita da transação**, com fallback de leitura para distinguir 404 de 409 (ADR-0015). A lesson de 2026-07-20 exige checar se algum guard é superconjunto do alvo de outra transição. Entre as três transições **não** é (todas exigem `scheduled` e todas o consomem ⇒ exclusividade real), **mas** o `PUT /:id/sale` guarda `scheduled`+`done` sem alterar `status` — esse par não é exclusivo em nenhuma direção, e a garantia vem do desenho do estado (RF-08/RF-08.1), não do lock.
5. **Escrita de "agora" sempre com `sql\`now()\`** no banco; leitura serializada com `.toISOString()` no mapper. Onde o service precisa de "hoje", o **clock é injetado** (`clock: () => new Date()`), como em leads/auth/dashboard.
6. **Contratos Zod em `packages/shared`**, um arquivo por domínio + teste ao lado + export no barrel; mensagens pt-BR em constantes; `error` no nível do tipo (lesson Zod v4).
7. **Web server-first**: RSC busca via client tipado de `lib/`; mutação por Server Action; helper puro compartilhado vive em `lib/` (nunca exportado de módulo `"use client"` — lesson 2026-07-18); Server Action passada a client component é **referência direta** ou `.bind` (lesson 2026-07-19).
8. **Mobile-first**: lista de cards (`grid grid-cols-1 sm:grid-cols-2`), alvos `h-11 md:h-9`, três estados obrigatórios, badge com rótulo textual (cor é reforço).

## Schemas e Tipos Relevantes

- **Novo**: `packages/shared/src/appointments.ts` — `appointmentKindValues`, `appointmentStatusValues`, `APPOINTMENT_KIND_LABELS`, `APPOINTMENT_STATUS_LABELS`, `createAppointmentSchema`, `updateAppointmentSchema`, `linkAppointmentSaleSchema`, `completeAppointmentSchema`, `appointmentSchema`, `appointmentListItemSchema`, `appointmentsListQuerySchema`, `conflictsQuerySchema`.
- **Novo**: `packages/shared/src/time.ts` — `APP_TIME_ZONE`, `appLocalDateIso`, `appLocalTimeHm`, `appLocalDateTimeToUtc`, `appLocalDayRangeUtc`, `appointmentDayBucket` (funções puras, testáveis).
- **Modificado**: `packages/shared/src/leads.ts` — `search` em `leadsListQuerySchema` (RF-14), espelhando `clientsListQuerySchema` (`clients.ts:86-88`) e o `ilike` + fallback de dígitos de `clients.repository.ts:32-41`.
- **Novo**: `apps/api/src/db/schema/appointments.ts` (+ export no barrel).
- **Reusados**: `paginationQuerySchema`/`paginated` (`pagination.ts`), `apiErrorSchema` (`api.ts`), `whatsappSchema` (`whatsapp-validation.ts`), `saleSchema`/`SALE_STATUS_LABELS` (`sales.ts`), `clients`/`leads`/`sales` (schema Drizzle).

## Dependências Entre Packages

```
packages/shared  ──(contratos + fuso)──▶  apps/api  ──▶  Postgres
       │                                     ▲
       └──────────(mesmos schemas)───────────┴──  apps/web (RSC + Server Actions)
```

- `apps/web` **nunca** fala com o banco; o browser **nunca** fala com a API (ADR-0008) — token só no servidor.
- `apps/api/src/modules/leads` passa a depender do schema `appointments` (RF-12) — dependência de tabela, não de módulo.
- Nenhuma dependência externa nova: `wa.me` e `calendar.google.com/render` são URLs montadas por função pura.

## Gaps Identificados

| Gap | Consequência |
|---|---|
| **Não existe nenhuma configuração de fuso na aplicação** — `env.ts` só valida `DATABASE_URL`/`PORT`; o `docker-compose.yml` não define `TZ`/`PGTZ`; zero ocorrências de `America/Sao_Paulo` no repo | O recorte de dia da agenda herdaria o TZ indefinido da sessão Postgres. Exige a decisão do RF-15/RF-16 (ADR novo) |
| Não há formatação de **hora** (`HH:mm`) em nenhum lugar do web, nem `Intl` com `timeZone` | Helpers de hora nascem nesta feature |
| Não existem componentes shadcn de Select/Dialog/Calendar | Data/hora por inputs nativos; seletor de pessoa pelo padrão `<select>` + busca já existente |
| `apps/api/test/factories/` **não existe** (a rule `testing.md` prevê) — cada suíte redefine `seedX` inline | Seguir a convenção real (helpers locais na suíte) e registrar o drift |
| Todas as suítes de integração montam o app completo em `buildApp()` | Adicionar `appointmentsService` a **todos** os `buildApp()` existentes, senão a suíte quebra |
| `toSafeInteger` já replicado em 3 repositories (known-issue) | Se `appointments` precisar de agregado, será a 4ª cópia — gatilho declarado para promover a `lib/` |
| Barra de navegação mobile já tem 6 itens | O 7º item precisa de verificação visual a ~375px |

## Referências Externas

- ADRs: **0012** (auth default-deny), **0013** (snapshot × SET NULL em venda), **0014** (mês UTC do dashboard — o precedente de fuso que esta spec diverge), **0015** (transições por endpoint + concorrência), **0016** (dado pessoal sem snapshot ⇒ join).
- `project-memory/known-issues.md`: "Dashboard: `date_trunc` usa TZ da sessão Postgres" (insumo direto do RF-15); "Infra de E2E ainda não existe".
- `project-memory/lessons.md`: 2026-07-20 (EvalPlanQual em UPDATE condicional), 2026-07-19 (Server Action como prop), 2026-07-18 (RSC × módulo `"use client"`; Elysia 204 com corpo `undefined`), 2026-07-17 (`Bun.password` sob Vitest; zodResolver stripa chaves fora do schema; Zod v4 e campo ausente), 2026-07-16 (`sql.join` no `drizzle-kit generate`).
- Skills de biblioteca: `elysia`, `drizzle-postgres`, `zod`, `vitest`, `react`, `tailwindcss`.
- MDN/Google: URL de template do Google Calendar (`action=TEMPLATE`, `dates=<início>/<fim>` em UTC básico ISO 8601).
