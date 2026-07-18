---
feature: crm-clients
module: api, web, shared
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: crm-clients

## Milestone 1: Contratos e banco

- [x] **Task 1.1** — Shared: `pagination.ts` (query schema page/perPage default 20 máx 100 — acima ⇒ inválido/422 + `paginated(itemSchema)`), extração da regra única de whatsapp (leads passa a reusá-la sem mudança de comportamento), `clients.ts` (create/update/response, pt-BR incl. campo ausente; birthday ISO date opcional que **rejeita data futura**; update parcial com "ao menos um campo") + testes de unidade + reexports
  - Arquivos: `packages/shared/src/{pagination,clients,whatsapp-validation}.ts` (+ testes), `packages/shared/src/{index,leads}.ts`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run packages/shared` verde ✓ (47 testes; leads intactos)
  - Implementado por: clientela-implementer #16 (2026-07-17). Birthday sem-futuro por comparação lexicográfica ISO (sem Date/fuso)
- [x] **Task 1.2** — Tabela `clients` (schema Drizzle com consultant_id FK + índice, birthday `date` string mode) + migração `drizzle-kit generate` + teste de integração (colunas, FK/índice, ida-e-volta do birthday)
  - Arquivos: `apps/api/src/db/schema/clients.ts`, `apps/api/src/db/schema/index.ts`, `apps/api/drizzle/0002_*.sql`, `apps/api/src/db/clients-table.integration.test.ts`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run apps/api/src/db` verde ✓ (26 testes; migração `0002_clear_yellowjacket.sql`)
  - Implementado por: clientela-implementer #17 (2026-07-17). FK cascade (LGPD) justificada no schema

## Milestone 2: API — módulo clients

- [x] **Task 2.1** — Erro + repository + service com testes de unidade (fakes; not-found; escopo por consultantId; paginação com total; busca repassada — termo com dígitos também casa contra a forma só-dígitos do whatsapp)
  - Arquivos: `apps/api/src/modules/clients/{clients.errors,clients.repository,clients.service,clients.service.test}.ts`
  - Dependências: 1.1, 1.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/modules/clients` verde ✓ (12 testes)
  - Implementado por: clientela-implementer #20 (2026-07-17). Repository devolve `Client` do shared (ISO, sem consultantId); ordenação estável name+id
- [x] **Task 2.2** — Rotas (5, validação shared, identidade via `authService.validateSession` padrão /auth/me), branch 404 no error-handler, wiring app.ts/index.ts
  - Arquivos: `apps/api/src/modules/clients/clients.routes.ts`, `apps/api/src/plugins/error-handler.ts`, `apps/api/src/{app,index}.ts`
  - Dependências: 2.1 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (111 testes / 13 arquivos)
  - Implementado por: clientela-implementer #21 (2026-07-17)
- [x] **Task 2.3** — Integração (Testcontainers, sessão real): fluxo completo CRUD, paginação (defaults, máximo → 422, total), busca case-insensitive (nome e whatsapp), escopo entre 2 consultoras (404), 401 sem token, 404 pt-BR, 422 pt-BR
  - Arquivos: `apps/api/src/modules/clients/clients.integration.test.ts`
  - Dependências: 2.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (18 testes novos; suíte total 279)
  - Implementado por: clientela-implementer #22 (interrompido por limite de sessão em 2026-07-17; orquestrador finalizou tipagem/format e validou em 2026-07-18). **Achou bug real**: DELETE 500 (TypeError do Elysia com `undefined`) — corrigido pelo implementer #24 (`new Response(null, { status: 204 })`)

## Milestone 3: Web — telas de clientes

- [x] **Task 3.1** — Helpers: `lib/clients-api.ts` (5 funções puras com `{ fetchImpl, apiUrl, token }`, Bearer, erros pt-BR) + `formatDateBr` ADICIONADA ao `lib/format.ts` existente (preservar `formatBRL` e testes) + `toWaPhone` ADICIONADA ao `lib/whatsapp.ts` (10–11 dígitos ⇒ "55" prefixado; 12–13 iniciando "55" ⇒ direto) + testes de unidade
  - Arquivos: `apps/web/src/lib/clients-api.ts` (+ teste, criar), `apps/web/src/lib/{format,whatsapp}.ts` (+ testes, modificar)
  - Dependências: 1.1 · Paralelizável: sim (com M2)
  - Verificação: `bunx vitest run apps/web` verde ✓ (103 testes)
  - Implementado por: clientela-implementer #19 (2026-07-17)
- [x] **Task 3.2** — Listagem: `clients/page.tsx` RSC substituindo o placeholder (searchParams SANEADOS com Zod e fallback p/ defaults; estados conteúdo/vazio/vazio-de-busca), `loading.tsx` (skeleton), `error.tsx` (retry), `client-card.tsx` (nome, whatsapp formatado, link `wa.me` via `toWaPhone`), form GET de busca, paginação anterior/próxima
  - Arquivos: `apps/web/src/app/(crm)/crm/clients/{page,loading,error}.tsx`, `apps/web/src/components/clients/client-card.tsx`
  - Dependências: 3.1, 2.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes ✓ (validado pelo orquestrador em 2026-07-18)
  - Implementado por: clientela-implementer #23 (interrompido por limite de sessão após escrever os arquivos; verificação concluída pelo orquestrador)
- [x] **Task 3.3** — Cadastro e edição: `client-form.tsx` (RHF + schema shared, reusado em new/edit), `new/page.tsx`, `[id]/page.tsx` (detalhe + edição + WhatsApp E.164 + exclusão) com `[id]/loading.tsx` (skeleton), `delete-client-button.tsx` (confirmação em 2 passos), `actions.ts` (create/update/delete com revalidatePath)
  - Arquivos: `apps/web/src/app/(crm)/crm/clients/{actions.ts,new/page.tsx,[id]/page.tsx,[id]/loading.tsx}`, `apps/web/src/components/clients/{client-form,delete-client-button}.tsx`
  - Dependências: 3.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes ✓ (103 testes web)
  - Implementado por: clientela-implementer #25 (2026-07-18). Prop `mode` no form (create/edit); schema do form via transform+pipe reusando shapes do contrato; `[id]/error.tsx` e `not-found.tsx` adicionados
- [x] **Task 3.4** — RF-11: `role="list"` nas ULs da nav + alvo ≥ 44px do "Sair" mobile
  - Arquivos: `apps/web/src/components/crm/{crm-nav,crm-header}.tsx`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: typecheck verde ✓; inspeção na QA
  - Implementado por: clientela-implementer #18 (2026-07-17). `biome-ignore` justificado no role list; "Sair" `h-11 md:h-7`

## Milestone 4: Checkpoint

- [x] **Task 4.1** — lint + typecheck + test (raiz) + build web
  - Verificação: tudo verde ✓ (2026-07-18: Biome 146 arquivos; typecheck 3 workspaces; 279 testes / 28 arquivos; build web ok na 3.3)
  - Implementado por: orchestrator (checkpoint)

## Ordem de Execução

(1.1 ∥ 1.2 ∥ 3.4) → 2.1 → 2.2 → 2.3; 3.1 após 1.1 (∥ M2); 3.2 após 3.1+2.2 → 3.3 → 4.1.

## Definition of Done (agregado)

- [ ] Critérios do spec.md testados · lint/typecheck/test verdes · build ok · conformidade com rules/ADRs
