---
feature: dev-db-drizzle-leads
module: api, infra
phase: tasks
status: draft
created: 2026-07-16
updated: 2026-07-16
depends_on: [plan.md]
---

# Tasks: Banco local de desenvolvimento + Drizzle + migração inicial `leads`

## Milestone 1: Infra local + dependências

- [x] **Task 1.1** — Criar `docker-compose.dev.yml` (Postgres 18-alpine, volume nomeado `clientela_pg_dev`, healthcheck `pg_isready`, porta `127.0.0.1:5432`, credenciais de dev) e ativar `DATABASE_URL` no `.env.example` com valor compatível
  - Arquivos: `docker-compose.dev.yml`, `.env.example`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `docker compose -f docker-compose.dev.yml config` válido; subir e `pg_isready` ok
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 1.2** — Adicionar deps na API: `drizzle-orm`, `postgres`, `zod` (deps) e `drizzle-kit`, `@testcontainers/postgresql` (devDeps); scripts `db:generate` e `db:migrate`
  - Arquivos: `apps/api/package.json` (+ `bun.lock` via `bun install`)
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `bun install` ok; `bunx drizzle-kit --version` responde
  - Implementado por: clientela-implementer (sessão 2026-07-16)

## Milestone 2: Setup Drizzle na API

- [x] **Task 2.1** — Criar `apps/api/src/env.ts` (Zod: `DATABASE_URL` url obrigatória, `PORT` coerce default 3001; erro agregado claro sem vazar valores) + teste unitário `env.test.ts`; usar `loadEnv()` no `src/index.ts`
  - Arquivos: `apps/api/src/env.ts`, `apps/api/src/env.test.ts`, `apps/api/src/index.ts`
  - Dependências: Task 1.2
  - Paralelizável: sim (disjunto de 2.2)
  - Verificação: `bun run typecheck` no workspace; testes de `env.test.ts` verdes
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 2.2** — Criar schema `leads` (`src/db/schema/leads.ts` + `index.ts`): colunas conforme spec RF-04 (`source` default `'landing'`), status com union type TS **e constraint `check()` explícita do drizzle-orm/pg-core** (`text({ enum })` sozinho não emite CHECK no SQL), `id` uuid default `uuidv7()` no banco; criar `src/db/client.ts` com `createDb(databaseUrl)`
  - Arquivos: `apps/api/src/db/schema/leads.ts`, `apps/api/src/db/schema/index.ts`, `apps/api/src/db/client.ts`
  - Dependências: Task 1.2
  - Paralelizável: sim (disjunto de 2.1)
  - Verificação: `bun run typecheck` limpo
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 2.3** — Criar `apps/api/drizzle.config.ts` e gerar a migração inicial com `bun run db:generate`; conferir SQL gerado (uuidv7, CHECK de status, NOT NULLs, timestamptz)
  - Arquivos: `apps/api/drizzle.config.ts`, `apps/api/drizzle/0000_*.sql` + `apps/api/drizzle/meta/*`
  - Dependências: Task 2.2
  - Paralelizável: não
  - Verificação: rodar `db:generate` de novo → "No schema changes"
  - Implementado por: clientela-implementer (sessão 2026-07-16)

## Milestone 3: Teste de integração (Testcontainers)

- [x] **Task 3.1** — Criar helper `apps/api/test/helpers/pg-container.ts` (sobe `postgres:18-alpine`, aplica migrações de `apps/api/drizzle/` via drizzle migrator, devolve `{ db, sql, stop }`)
  - Arquivos: `apps/api/test/helpers/pg-container.ts`
  - Dependências: Task 2.3
  - Paralelizável: não
  - Verificação: `bun run typecheck` limpo
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 3.2** — Teste `apps/api/src/db/leads-table.integration.test.ts`: insert válido aplica defaults (id uuid, status `new`, `source` `'landing'`, timestamps), `consent_at` obrigatório, insert sem `name` rejeitado, **insert com `status` inválido rejeitado pelo CHECK**; timeout estendido no setup
  - Arquivos: `apps/api/src/db/leads-table.integration.test.ts`
  - Dependências: Task 3.1
  - Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/db/leads-table.integration.test.ts` verde (Docker disponível)
  - Implementado por: clientela-implementer (sessão 2026-07-16)
- [x] **Task 3.3** — Ajustar `apps/api/tsconfig.json` para incluir `test/` no typecheck (helpers de teste cobertos pelo `tsc --noEmit`)
  - Arquivos: `apps/api/tsconfig.json`
  - Dependências: Task 3.1
  - Paralelizável: não
  - Verificação: `bun run typecheck` limpo cobrindo `test/helpers/*`
  - Implementado por: clientela-implementer (sessão 2026-07-16)

## Ordem de Execução

M1 (1.1 ∥ 1.2) → M2 (2.1 ∥ 2.2 → 2.3) → M3 (3.1 → 3.2 → 3.3). Checkpoint de validação (lint+typecheck+testes) ao fim de cada milestone.

## Definition of Done (agregado)
- [ ] Todos os critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos módulos afetados
- [ ] `bun run test` (inclui integração quando Docker disponível) verde
- [ ] API sobe com env válida e falha claro sem ela
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
