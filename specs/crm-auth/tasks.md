---
feature: crm-auth
module: api, web, shared
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: crm-auth

## Milestone 1: Contratos e schema de banco

- [x] **Task 1.1** — Contratos de auth em `packages/shared` (`loginRequestSchema`, `authConsultantSchema`, `loginResponseSchema`, tipos) + testes de unidade (válido/inválido/`{}` ausente → pt-BR)
  - Arquivos: `packages/shared/src/auth.ts`, `packages/shared/src/auth.test.ts`, `packages/shared/src/index.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `bunx vitest run packages/shared` verde ✓ (28 testes)
  - Implementado por: clientela-implementer #1 (2026-07-17)
- [x] **Task 1.2** — Tabelas `consultants` e `sessions` (schema Drizzle, convenções `database.md`), migração gerada com `drizzle-kit generate` e teste de integração das tabelas
  - Arquivos: `apps/api/src/db/schema/consultants.ts`, `apps/api/src/db/schema/sessions.ts`, `apps/api/src/db/schema/index.ts`, `apps/api/drizzle/0001_*.sql`, `apps/api/src/db/auth-tables.integration.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim (disjunto da 1.1)
  - Verificação: `bunx vitest run apps/api/src/db` verde (Testcontainers) ✓ (17 testes; migração `0001_third_trauma.sql`)
  - Implementado por: clientela-implementer #2 (2026-07-17)

## Milestone 2: API — módulo auth, guard e seed

- [x] **Task 2.1** — Erros de domínio + repository + service de auth com testes de unidade (login ok, senha errada, e-mail inexistente com hash dummy, validateSession com expiração fixa, limpeza oportunista de sessões expiradas no login, logout; clock/hasher/tokenGenerator injetados)
  - Arquivos: `apps/api/src/modules/auth/auth.errors.ts`, `auth.repository.ts`, `auth.service.ts`, `auth.service.test.ts`
  - Dependências: Task 1.1, 1.2
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/modules/auth` verde ✓ (11 testes)
  - Implementado por: clientela-implementer #4 (2026-07-17). Exports de produção no service: `generateSecureToken`, `bunPasswordHasher`, `DUMMY_PASSWORD_HASH` (consumir no composition root na 2.3)
- [x] **Task 2.2** — Plugin `auth-guard` (onRequest fail-closed + allowlist normalizada + teste de unidade do matching: trailing slash, query, método) e mapeamento de `InvalidCredentialsError`/`UnauthorizedError` → 401 no error-handler
  - Arquivos: `apps/api/src/plugins/auth-guard.ts`, `apps/api/src/plugins/auth-guard.test.ts`, `apps/api/src/plugins/error-handler.ts`
  - Dependências: Task 2.1
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/plugins` verde ✓ (24 testes)
  - Implementado por: clientela-implementer #5 (2026-07-17). Gotcha: `onRequest({as:"global"}, fn)` quebra composição no Elysia 1.4.29 — usar `.onRequest(fn).as("global")` (candidato a lesson)
- [x] **Task 2.3** — Rotas de auth (`POST /auth/login` com rate limit próprio, `GET /auth/me`, `POST /auth/logout`), wiring em `app.ts`/`index.ts` e ajuste dos testes existentes que montam `createApp`
  - Arquivos: `apps/api/src/modules/auth/auth.routes.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/app.test.ts`, `apps/api/src/modules/leads/leads.integration.test.ts`
  - Dependências: Task 2.2
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (74 testes / 10 arquivos)
  - Implementado por: clientela-implementer #7 (2026-07-17). `LOGIN_RATE_LIMIT_*` exportadas de auth.routes.ts (reuso na 2.4); mensagem 429 própria `LOGIN_RATE_LIMITED_MESSAGE`
- [x] **Task 2.4** — Testes de integração de auth (Testcontainers): login 200/401 idêntico/422 pt-BR/429; guard default-deny (sem token, token forjado, sessão expirada, trailing slash/query; públicos seguem abertos); me/logout; token não armazenado em claro; limpeza de sessões expiradas no login
  - Arquivos: `apps/api/src/modules/auth/auth.integration.test.ts`
  - Dependências: Task 2.3
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde ✓ (90 testes / 11 arquivos; 16 novos)
  - Implementado por: clientela-implementer #10 (2026-07-17). Limitação: Vitest roda sob Node → `Bun.password` indisponível; teste injeta KDF real (scrypt) na porta; argon2id provado pelo seed sob Bun
- [x] **Task 2.5** — Seed idempotente da usuária única (`scripts/seed-consultant.ts`, upsert por e-mail, `Bun.password` argon2id, sem senha em log) + script `seed:consultant` no package.json + doc comentada das `SEED_CONSULTANT_*` no `.env.example` + `COPY apps/api/scripts` no stage runtime do Dockerfile
  - Arquivos: `apps/api/scripts/seed-consultant.ts`, `apps/api/package.json`, `.env.example`, `apps/api/Dockerfile`
  - Dependências: Task 1.2
  - Paralelizável: sim (com 2.2–2.4)
  - Verificação: rodar seed 2× contra o Postgres dev → 1 linha em `consultants` ✓ (mesmo id, hash `$argon2id$`; falha sem senha lista só o nome da var)
  - Implementado por: clientela-implementer #6 (2026-07-17). Decisões: sem variante `:prod` (bun ignora env-file ausente); `scripts/` fora do tsconfig — validado com tsc isolado

## Milestone 3: Web — login, cookie e guard do grupo (crm)

- [x] **Task 3.1** — Helpers puros de auth no web (`lib/auth.ts`: `login` com repasse de `clientIp` via header `x-forwarded-for`, `fetchSession`, `logout`, constantes/atributos do cookie) + testes de unidade (incluindo: header XFF repassado no login)
  - Arquivos: `apps/web/src/lib/auth.ts`, `apps/web/src/lib/auth.test.ts`
  - Dependências: Task 1.1
  - Paralelizável: sim (não depende do M2 para unidade — API falada via `fetchImpl` injetado)
  - Verificação: `bunx vitest run apps/web` verde ✓ (59 testes, 17 novos)
  - Implementado por: clientela-implementer #3 (2026-07-17). Nota de contrato: helper espera `GET /auth/me` → objeto consultora SEM envelope (fixar na Task 2.3)
- [x] **Task 3.2** — Página `/login` (grupo `(auth)`) com form RHF + `loginRequestSchema`, estados loading/erro pt-BR, Server Action que extrai o IP do cliente (último valor do XFF, padrão LP-06), chama a API, seta cookie (`httpOnly`, `secure` em prod, `lax`, `path=/`, `maxAge` da sessão) e redireciona para `/crm`; `/login` autenticado redireciona para `/crm`
  - Arquivos: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/login/actions.ts`, `apps/web/src/components/auth/login-form.tsx`
  - Dependências: Task 3.1, 2.2
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/web` + `bun run typecheck` verdes ✓ (59 testes; Next build ok, `/login` rota dinâmica)
  - Implementado por: clientela-implementer #8 (2026-07-17). Sem teste de componente (sem infra RTL/jsdom — coberto por lib/auth.test.ts + QA de runtime); marca "Lais Barbosa" confirmada pelo LP-14
- [x] **Task 3.3** — Grupo `(crm)`: layout com guard server-side (`fetchSession` → redirect `/login`), página placeholder `/crm` com logout (Server Action limpa cookie + invalida sessão)
  - Arquivos: `apps/web/src/app/(crm)/layout.tsx`, `apps/web/src/app/(crm)/crm/page.tsx`, `apps/web/src/app/(crm)/actions.ts`
  - Dependências: Task 3.2
  - Paralelizável: não
  - Verificação: `bun run typecheck` + `bunx vitest run apps/web` verdes ✓ (59 testes; build ok, `/crm` rota dinâmica ƒ)
  - Implementado por: clientela-implementer #9 (2026-07-17)

## Milestone 4: Checkpoint geral

- [x] **Task 4.1** — Suíte completa na raiz: `bun run lint`, `bun run typecheck`, `bun run test` (inclui integração) + build dos dois apps
  - Arquivos: —
  - Dependências: M1–M3
  - Paralelizável: não
  - Verificação: tudo verde ✓ (2026-07-17: Biome 110 arquivos limpo; typecheck 3 workspaces exit 0; 177 testes / 21 arquivos; build web ok nas tasks 3.2/3.3)
  - Implementado por: orchestrator (checkpoint)

## Ordem de Execução

M1 (1.1 ∥ 1.2) → M2 (2.1 → 2.2 → 2.3 → 2.4; 2.5 ∥ após 1.2) → M3 (3.1 pode iniciar após 1.1; 3.2 → 3.3) → M4. Checkpoint de validação ao fim de cada milestone (lint + typecheck + testes do escopo).

## Definition of Done (agregado)

- [ ] Todos os critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos módulos afetados
- [ ] `bun run test` (incl. integração Testcontainers) verde
- [ ] Build dos módulos afetados ok
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
