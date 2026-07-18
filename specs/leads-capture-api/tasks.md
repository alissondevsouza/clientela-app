---
feature: leads-capture-api
module: api, shared
phase: tasks
status: draft
created: 2026-07-16
updated: 2026-07-16
depends_on: [plan.md]
---

# Tasks: Módulo `leads` da API

## Milestone 1: Contrato compartilhado

- [x] **Task 1.1** — Estender `packages/shared`: `leadCaptureRequestSchema` (extend de `createLeadSchema` com `website?: string`), `type LeadCaptureResponse = { id: string }`, `apiErrorSchema`/`ApiError` em `src/api.ts`; re-exports no index; testes do schema estendido
  - Arquivos: `packages/shared/src/leads.ts`, `packages/shared/src/api.ts`, `packages/shared/src/index.ts`, `packages/shared/src/leads.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `bun run typecheck` + testes do workspace shared verdes
  - Implementado por: clientela-implementer (sessão 2026-07-16)

## Milestone 2: Plugins e módulo leads

- [x] **Task 2.1** — Plugin `error-handler` (`as("global")`): validação → 422 com primeira mensagem Zod em pt-BR, NOT_FOUND → 404, resto → 500 `INTERNAL_ERROR` genérico + log servidor sem dado pessoal; envelope `{ error: { code, message } }` sempre; **teste unitário do plugin** via `app.handle` com rotas fake (body inválido → 422 envelope; rota que lança → 500 sem internals; 404)
  - Arquivos: `apps/api/src/plugins/error-handler.ts`, `apps/api/src/plugins/error-handler.test.ts`
  - Dependências: Task 1.1
  - Paralelizável: sim (disjunto de 2.2)
  - Verificação: unidade do plugin verde; `bun run typecheck`
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 2.2** — Rate limiter: `createRateLimiter({ max, windowMs, clock })` (janela fixa por chave/IP, GC de expirados) + helper de extração de IP (`x-forwarded-for` → `server.requestIP` → `"unknown"`); teste unitário determinístico (clock fake)
  - Arquivos: `apps/api/src/plugins/rate-limit.ts`, `apps/api/src/plugins/rate-limit.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: unidade verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 2.3** — Módulo leads em camadas: repository (`insert … returning({ id })`), service (`{ repository, clock, generateId }`: honeypot → id sintético sem persistir; consent_at = clock(); nunca loga dado pessoal), routes (POST /leads com `leadCaptureRequestSchema`, 201, rate limit aplicado); teste unitário do service com fakes
  - Arquivos: `apps/api/src/modules/leads/leads.repository.ts`, `leads.service.ts`, `leads.service.test.ts`, `leads.routes.ts`
  - Dependências: Task 1.1, Task 2.2
  - Paralelizável: não
  - Verificação: unidade do service verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 2.4** — Recablar app: `createApp(deps)` com error-handler + rotas leads; composition root em `index.ts` (env → db → repo → service → limiter → app); ajustar `app.test.ts` (health continua verde com fakes)
  - Arquivos: `apps/api/src/app.ts`, `apps/api/src/app.test.ts`, `apps/api/src/index.ts`
  - Dependências: Task 2.1, Task 2.3
  - Paralelizável: não
  - Verificação: unidade apenas — `bunx vitest run apps/api --exclude '**/*.integration.test.ts'` (integração fica para a Task 3.2) + typecheck + lint
  - Implementado por: clientela-implementer (sessão 2026-07-16)

## Milestone 3: Helper endurecido + integração

- [x] **Task 3.1** — Endurecer `pg-container.ts`: `truncateAll()` (TRUNCATE de tabelas do schema public, exceto tabela de migrações do drizzle) e erro amigável quando Docker indisponível (try/catch com teardown; mensagem menciona Docker/Testcontainers)
  - Arquivos: `apps/api/test/helpers/pg-container.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: typecheck; teste de integração existente (`leads-table.integration.test.ts`) continua verde; **caminho sem Docker provado de verdade**: rodar 1 teste de integração com `DOCKER_HOST` apontando para socket inexistente e colar a saída (mensagem amigável) no validate.md da QA
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 3.2** — Integração `leads.integration.test.ts` (app real + PG real, `truncateAll` entre casos, `x-forwarded-for` para simular IPs): 201 persiste com defaults e whatsapp normalizado; 422 envelope pt-BR; honeypot 201 sem persistir; 429 na N+1ª do mesmo IP e 201 para IP distinto; 500 envelope sem internals (rota com erro injetado ou service quebrado)
  - Arquivos: `apps/api/src/modules/leads/leads.integration.test.ts`
  - Dependências: Task 2.4, Task 3.1
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/modules/leads` verde (Docker disponível)
  - Implementado por: clientela-implementer (sessão 2026-07-16)

## Ordem de Execução

M1 (1.1) → M2 (2.1 ∥ 2.2 → 2.3 → 2.4), M3 (3.1 pode rodar em paralelo a M2; 3.2 por último). Checkpoint lint+typecheck+testes ao fim de cada milestone.

## Definition of Done (agregado)
- [ ] Todos os critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos
- [ ] `bun run test` verde (unidade + integração com Docker)
- [ ] API sobe de verdade e `POST /leads` responde (verificação de runtime na QA)
- [ ] Conformidade com `.claude/rules/*` e ADRs
