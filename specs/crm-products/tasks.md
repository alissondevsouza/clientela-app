---
feature: crm-products
module: api, web, shared
phase: tasks
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [plan.md]
---

# Tasks: crm-products

## Milestone 1: Contratos, banco e helper de rota

- [x] **Task 1.1** — Shared: `products.ts` (create com inteiros ≥ 0 e mensagens pt-BR de centavos; update parcial com `null` só em brandCode; response com `lowStock`; query com search ≤ 100 + `lowStock`; summary) + testes + reexports
  - Arquivos: `packages/shared/src/products.ts` (+ teste), `packages/shared/src/index.ts`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run packages/shared` verde ✓ (75 testes)
  - Implementado por: clientela-implementer #35 (2026-07-18). Update sem defaults (PATCH omitido não zera estoque); lowStock por union (coerce boolean vira true p/ "false")
- [x] **Task 1.2** — Tabela `products` (FK+índice, CHECKs ≥ 0 via sql.raw, defaults 0/1) + migração + integração (CHECKs violados falham, FK, defaults)
  - Arquivos: `apps/api/src/db/schema/products.ts`, `schema/index.ts`, `apps/api/drizzle/0004_*.sql`, `apps/api/src/db/products-table.integration.test.ts`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run apps/api/src/db` verde ✓ (41 testes; migração `0004_sturdy_thundra.sql`)
  - Implementado por: clientela-implementer #36 (2026-07-18)
- [x] **Task 1.3** — Helper `apps/api/src/lib/route-auth.ts` (extractBearerToken, createConsultantResolver(authService), isUuid) + teste de unidade + **migração de auth.routes, clients.routes e leads-crm.routes para o helper** (comportamento idêntico; suítes existentes intactas e verdes)
  - Arquivos: `apps/api/src/lib/route-auth.ts` (+ teste), `apps/api/src/modules/{auth/auth.routes,clients/clients.routes,leads/leads-crm.routes}.ts`, `apps/api/src/plugins/auth-guard.ts` (também tem cópia do extractBearerToken — migrar junto)
  - Dependências: nenhuma · Paralelizável: sim (não toca arquivos de 1.1/1.2)
  - Verificação: `bunx vitest run apps/api` verde completo ✓ (184 testes; nenhum teste existente editado)
  - Implementado por: clientela-implementer #37 (2026-07-18). Porta mínima estrutural `ConsultantResolverAuthService`

## Milestone 2: API — módulo products

- [x] **Task 2.1** — Erro + repository (CRUD escopado; list com busca **escapando `%`/`_`/`\`** + filtro lowStock; summary SQL com COALESCE; mapper com lowStock derivado) + service + unidade
  - Arquivos: `apps/api/src/modules/products/{products.errors,products.repository,products.service,products.service.test}.ts`
  - Dependências: 1.1, 1.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/modules/products` verde ✓ (20 testes)
  - Implementado por: clientela-implementer #38 (2026-07-18)
- [x] **Task 2.2** — Rotas (CRUD + `GET /products/summary` antes do `:id`), error-handler 404, wiring app/index (usando route-auth da 1.3)
  - Arquivos: `apps/api/src/modules/products/products.routes.ts`, `apps/api/src/plugins/error-handler.ts`, `apps/api/src/{app,index}.ts` (+ ajustes de fakes se AppDeps mudar)
  - Dependências: 2.1, 1.3 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (204 testes / 18 arquivos)
  - Implementado por: clientela-implementer #40 (2026-07-18)
- [x] **Task 2.3** — Integração (sessão real): CRUD, CHECKs via API (422 antes; payload direto malicioso ⇒ CHECK), busca com escape provado (`%` não retorna tudo), lowStock filter, summary (fixtures conhecidas, escopo, sem produtos ⇒ zeros), `/products/summary` não cai no `:id`, escopo 2 consultoras, 401/404, paginação
  - Arquivos: `apps/api/src/modules/products/products.integration.test.ts`
  - Dependências: 2.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (230 testes / 19 arquivos; 26 novos; zero discrepâncias)
  - Implementado por: clientela-implementer #41 (2026-07-18). Helper pgErrorCode percorre cadeia de .cause p/ SQLSTATE

## Milestone 3: Web — telas de produtos

- [x] **Task 3.1** — Helpers: `products-api.ts` (CRUD + summary) + `parseBRLToCents` em `format.ts` (aritmética de string, sem parseFloat; tabela exaustiva de casos) + testes
  - Arquivos: `apps/web/src/lib/products-api.ts` (+ teste), `apps/web/src/lib/format.ts` (+ teste)
  - Dependências: 1.1 · Paralelizável: sim (com M2)
  - Verificação: `bunx vitest run apps/web` verde ✓ (169 testes)
  - Implementado por: clientela-implementer #39 (2026-07-18). Casos extras do parse documentados no código (múltiplos milhares ok; ",50"/sinais ⇒ null)
- [x] **Task 3.2** — Listagem + summary: page RSC (searchParams saneados: page/search/lowStock; **list e summary buscados em `Promise.all`** — sem waterfall), `products-summary` (capital parado/valor de venda/contagem com link de filtro), `product-card` (badge estoque baixo textual), busca e filtro preservados na paginação, loading/error
  - Arquivos: `apps/web/src/app/(crm)/crm/products/{page,loading,error}.tsx`, `apps/web/src/components/products/{product-card,products-summary}.tsx`
  - Dependências: 3.1, 2.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes ✓ (169 testes; `/crm/products` rota ƒ)
  - Implementado por: clientela-implementer #42 (2026-07-18)
- [x] **Task 3.3** — Form e detalhe: `product-form.tsx` (RHF; reais na UI → centavos no payload via parseBRLToCents; erros de campo pt-BR), `new/page.tsx`, `[id]/{page,loading,error,not-found}.tsx` (detalhe + edição + exclusão 2 passos), `delete-product-button.tsx`, `actions.ts` (create/update/delete + revalidatePath)
  - Arquivos: `apps/web/src/app/(crm)/crm/products/{actions.ts,new/page.tsx,[id]/page.tsx,[id]/loading.tsx,[id]/error.tsx,[id]/not-found.tsx}`, `apps/web/src/components/products/{product-form,delete-product-button}.tsx`
  - Dependências: 3.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes ✓
  - Implementado por: clientela-implementer #43 (2026-07-18). Form reusa shapes do contrato via transform+pipe (teto/mensagens da fonte única); `.unwrap()` nos campos com default

## Milestone 4: Checkpoint

- [x] **Task 4.1** — lint + typecheck + test (raiz) + build web
  - Verificação: tudo verde ✓ (2026-07-18: Biome 186 arquivos; typecheck 3 workspaces; 474 testes; build web ok na 3.3)
  - Implementado por: orchestrator (checkpoint)

## Ordem de Execução

(1.1 ∥ 1.2 ∥ 1.3) → 2.1 → 2.2 → 2.3; 3.1 após 1.1 (∥ M2); 3.2 após 3.1+2.2 → 3.3 → 4.1.

## Definition of Done (agregado)

- [ ] Critérios do spec.md testados · lint/typecheck/test verdes · build ok · rules/ADRs
