---
feature: crm-leads
module: api, web, shared
phase: tasks
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [plan.md]
---

# Tasks: crm-leads

## Milestone 1: Contratos, migração e guard

- [x] **Task 1.1** — Shared: **mover `leadStatusValues`/`LeadStatus` de `apps/api/src/db/schema/leads.ts` para `packages/shared/src/leads.ts`** (schema Drizzle passa a importar de shared — literal único; migração NÃO muda pois valores são idênticos), `crmLeadSchema`, `leadsListQuerySchema` (paginação + `?status=` do enum), `updateLeadStatusSchema` (sem `converted`) + testes; reexports. Contrato público de captura INTACTO
  - Arquivos: `packages/shared/src/leads.ts` (+ teste), `packages/shared/src/index.ts`, `apps/api/src/db/schema/leads.ts` (import do enum)
  - Dependências: nenhuma · Paralelizável: sim (coordenar com 1.2 que também toca schema/leads.ts — executar 1.1 ANTES de 1.2)
  - Verificação: `bunx vitest run packages/shared apps/api/src/db` verde ✓ (83 testes); db:generate "No schema changes" ✓
  - Implementado por: clientela-implementer #26 (2026-07-18). Barrel do db deixou de reexportar o enum (fonte única em shared)
- [x] **Task 1.2** — Schema: `leads.client_id` FK nullable `ON DELETE SET NULL` + índice; migração gerada; integração da coluna (FK, set-null no delete da cliente)
  - Arquivos: `apps/api/src/db/schema/leads.ts`, `apps/api/drizzle/0003_*.sql`, `apps/api/src/db/leads-table.integration.test.ts` (estender)
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run apps/api/src/db` verde ✓ (31 testes; migração `0003_married_blue_shield.sql`)
  - Implementado por: clientela-implementer #28 (2026-07-18)
- [x] **Task 1.3** — Guard do rate limit de leads restrito a `POST /leads` exato (normalizado) + caso de regressão na integração de leads (GET autenticado sem 429 — deve falhar antes do fix) mantendo os casos públicos existentes
  - Arquivos: `apps/api/src/modules/leads/leads.routes.ts`, `apps/api/src/modules/leads/leads.integration.test.ts`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run apps/api/src/modules/leads` verde ✓ (15 testes; red→green provado no plugin isolado)
  - Implementado por: clientela-implementer #27 (2026-07-18). Nota: no app composto o auth-guard 401-a o GET anônimo antes do limiter — regressão provada no plugin; cobertura app-level com sessão fica na 2.3

## Milestone 2: API — funil e conversão

- [x] **Task 2.1** — Erros de domínio (`LeadNotFoundError`, `LeadAlreadyConvertedError` — sem erro de transição redundante) + service (compõe payload da cliente na conversão; already-converted no PATCH) + repository (list paginada/filtro/ordem desc, findById, updateStatus, `convert(leadId, insertClient)` **transacional com update condicional** `status <> 'converted'` ⇒ rowCount 0 = rollback+409) + unidade do service
  - Arquivos: `apps/api/src/modules/leads/{leads.errors.ts,leads.service.ts,leads.repository.ts,leads.service.test.ts}`
  - Dependências: 1.1, 1.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/modules/leads` verde ✓ (27 testes)
  - Implementado por: clientela-implementer #30 (2026-07-18). Guarda de corrida lança dentro da transação (rollback); stubs mínimos adicionados aos fakes existentes p/ typecheck
- [x] **Task 2.2** — Rotas autenticadas (`leads-crm.routes.ts`: GET lista, PATCH `/leads/:id/status`, POST `/leads/:id/convert` — padrão clients: Bearer+validateSession, uuid⇒404), error-handler (404/409 de leads), wiring app/index + ajuste das suítes que montam createApp
  - Arquivos: `apps/api/src/modules/leads/leads-crm.routes.ts`, `apps/api/src/plugins/error-handler.ts`, `apps/api/src/{app,index}.ts`, `apps/api/src/app.test.ts`, `apps/api/src/modules/{clients/clients.integration.test,auth/auth.integration.test}.ts`
  - Dependências: 2.1 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (147 testes / 14 arquivos)
  - Implementado por: clientela-implementer #31 (2026-07-18). AppDeps inalterado (reusa leadsService)
- [x] **Task 2.3** — Integração das rotas CRM de leads (sessão real): lista/ordem/filtro/paginação; PATCH válido e 409 em convertido; convert cria cliente vinculada (consultant da sessão, notes com interesse) atomicamente; convert repetido 409 sem 2ª cliente; delete da cliente → set null; 401/404; rajada GET sem 429
  - Arquivos: `apps/api/src/modules/leads/leads-crm.integration.test.ts`
  - Dependências: 2.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (162 testes / 15 arquivos; 15 novos; zero discrepâncias spec×código)
  - Implementado por: clientela-implementer #33 (2026-07-18)

## Milestone 3: Web — telas do funil

- [x] **Task 3.1** — Helpers: `lib/leads-api.ts` (listLeads/updateLeadStatus/convertLead com `{ fetchImpl, apiUrl, token }`) + `LEAD_STATUS_LABELS` pt-BR (módulo puro) + testes
  - Arquivos: `apps/web/src/lib/leads-api.ts` (+ teste)
  - Dependências: 1.1 · Paralelizável: sim (com M2)
  - Verificação: `bunx vitest run apps/web` verde ✓ (121 testes; 18 novos)
  - Implementado por: clientela-implementer #29 (2026-07-18)
- [x] **Task 3.2** — Listagem `/crm/leads`: page RSC (searchParams saneados: page/status; filtro em tabs por link preservado na paginação), loading/error, `lead-card` (badge com texto, WhatsApp E.164, interesse, data; convertido → link da cliente; convertido com clientId null → "cliente excluída" sem link), estados vazio/vazio-de-filtro
  - Arquivos: `apps/web/src/app/(crm)/crm/leads/{page,loading,error}.tsx`, `apps/web/src/components/leads/{lead-card,lead-status-badge}.tsx`
  - Dependências: 3.1, 2.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes ✓ (121 testes; `/crm/leads` rota ƒ)
  - Implementado por: clientela-implementer #32 (2026-07-18). Ações client chegam via `children` do LeadCard (3.3)
- [x] **Task 3.3** — Ações: `actions.ts` (updateLeadStatusAction, convertLeadAction → redirect ao detalhe da cliente), `lead-actions.tsx` (contatado/descartar conforme status), `convert-lead-button.tsx` (confirmação 2 passos); convertido mostra link da cliente
  - Arquivos: `apps/web/src/app/(crm)/crm/leads/actions.ts`, `apps/web/src/components/leads/{lead-actions,convert-lead-button}.tsx` (+ integração no lead-card)
  - Dependências: 3.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes ✓
  - Implementado por: clientela-implementer #34 (2026-07-18). Converter permitido também em discarded; validação Zod na entrada das actions

## Milestone 4: Checkpoint

- [x] **Task 4.1** — lint + typecheck + test (raiz) + build web
  - Verificação: tudo verde ✓ (2026-07-18: Biome 159 arquivos; typecheck 3 workspaces; 340 testes; build web ok na 3.3)
  - Implementado por: orchestrator (checkpoint)

## Ordem de Execução

(1.1 ∥ 1.2 ∥ 1.3) → 2.1 → 2.2 → 2.3; 3.1 após 1.1 (∥ M2); 3.2 após 3.1+2.2 → 3.3 → 4.1.

## Definition of Done (agregado)

- [ ] Critérios do spec.md testados · lint/typecheck/test verdes · build ok · rules/ADRs · known-issue do guard fechado
