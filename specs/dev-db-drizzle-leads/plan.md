---
feature: dev-db-drizzle-leads
module: api, infra
phase: plan
status: draft
created: 2026-07-16
updated: 2026-07-16
depends_on: [spec.md, research.md]
---

# Plan: Banco local de desenvolvimento + Drizzle + migração inicial `leads`

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Driver `postgres` (postgres.js) + `drizzle-orm/postgres-js` | Único driver maduro que roda idêntico em Bun (runtime da API) e Node (Vitest/Testcontainers). `bun:sql` travaria os testes; `pg` é mais pesado e callback-based |
| Imagem `postgres:18-alpine` (dev e Testcontainers) | `database.md` exige id uuid v7 com default **no banco**; `uuidv7()` é nativo só no Postgres 18. Mesma versão em dev e teste elimina drift |
| `leads` já nasce com `source` e `status` (default `'new'`) | Modelo de domínio já os define; evita segunda migração no CRM-04. Status como text + CHECK (drizzle enum) + union type TS, conforme `database.md` |
| `interest` nullable | Campo opcional do formulário da landing (schema shared) — ausência significa "não informou interesse específico" |
| Env validado em `apps/api/src/env.ts` com Zod, chamado no boot (`index.ts`) | `security.md`: app não sobe com config inválida. Zod entra como dep direta da API (mesma major v4 do shared) |
| `createDb(databaseUrl)` factory em `src/db/client.ts`; conexão só no composition root | `api.md`: dependências explícitas por injeção — services/repositories recebem o db, nunca importam singleton |
| Migrações via `drizzle-kit generate` + script `db:migrate` (drizzle-kit migrate) | `database.md` proíbe `push` fora de ambiente descartável; SQL versionado em `apps/api/drizzle/` |
| Teste de integração roda migrações reais de `apps/api/drizzle/` no container | `testing.md`: sem mock de banco; migração real é o que vai para produção |
| `consent_at` NOT NULL | Todo lead nasce de formulário com consentimento obrigatório (LGPD, `security.md`); lead sem consentimento não pode existir no banco |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `docker-compose.dev.yml` | Postgres 18 local: volume nomeado, healthcheck `pg_isready`, porta `127.0.0.1:5432` |
| `apps/api/src/env.ts` | Schema Zod de env (`DATABASE_URL` url obrigatória, `PORT` coerce com default 3001) + `loadEnv()` |
| `apps/api/src/db/client.ts` | `createDb(databaseUrl)` → drizzle(postgres-js) tipado com o schema |
| `apps/api/src/db/schema/leads.ts` | Tabela `leads` + `leadStatusValues`/`LeadStatus` (union type) |
| `apps/api/src/db/schema/index.ts` | Re-export dos agregados do schema |
| `apps/api/drizzle.config.ts` | Config drizzle-kit: dialect postgresql, schema path, out `./drizzle` |
| `apps/api/drizzle/0000_*.sql` (+ meta) | Migração inicial gerada — **gerada por `drizzle-kit generate`, nunca à mão** |
| `apps/api/src/db/leads-table.integration.test.ts` | Testcontainers: migra + insere + valida defaults e NOT NULL |
| `apps/api/test/helpers/pg-container.ts` | Helper que sobe `postgres:18-alpine`, aplica migrações e devolve db + teardown (LP-02 reutiliza) |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `apps/api/package.json` | Deps novas + scripts `db:generate`, `db:migrate` |
| `apps/api/src/index.ts` | Boot passa a usar `loadEnv()` (PORT validado; DATABASE_URL exigida) |
| `apps/api/tsconfig.json` | `include` passa a cobrir `test/` (typecheck deve enxergar os helpers de teste) |
| `.env.example` | Ativar `DATABASE_URL` com valor de dev compatível com o compose |

### Estratégia de env para `db:generate`/`db:migrate`

O `.env` de dev vive na **raiz** do monorepo e os scripts rodam com cwd em `apps/api` → drizzle-kit não o carrega sozinho. Os scripts usam `bun --env-file=../../.env drizzle-kit …` (Bun injeta o env; sem dep nova de dotenv). O `drizzle.config.ts` lê `process.env.DATABASE_URL` e falha com mensagem clara se ausente.

### Nota para o LP-11 (produção)

A decisão `uuidv7()` nativo acopla o projeto a **Postgres ≥ 18**: o compose de produção do LP-11 DEVE fixar `postgres:18` — registrar lá.

## Cobertura de Testes (decisão obrigatória — critérios em .claude/rules/workflow/spec-format.md)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | sim | `env.ts`: schema Zod de env (válido, ausente, malformado) — regra de boot nova |
| Integração (Testcontainers) | **sim** | Muda schema do banco (critério mandatório): migração real + tabela `leads` validada em Postgres real |
| E2E | não | Sem superfície de UI neste item |
| Regressão (se BUG-NNN) | n.a. | Não é bug |

Testes derivam do `spec.md` (RF-02, RF-06), não do diff.

## Migração de Banco

Migração **inicial** (não destrutiva, banco vazio): cria tabela `leads`. Sem backfill/rollback — rollback = dropar o banco de dev. Gerada por `drizzle-kit generate` a partir do schema TS.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Docker indisponível no ambiente → integração não roda | média | Teste falha com mensagem clara; handoff registra que exige Docker local |
| `uuidv7()` indisponível se alguém apontar para Postgres < 18 | baixa | Compose e Testcontainers fixam `postgres:18-alpine`; documentado no compose |
| Timeout do Vitest ao puxar imagem na primeira execução | média | `beforeAll` com timeout estendido (120s) no teste de integração |
| Drift entre schema TS e SQL versionado | baixa | Critério de aceite RF-05: `db:generate` sem diff novo |

## Definition of Done
- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos workspaces afetados
- [ ] `bun run test` (inclui integração com Docker disponível) verde
- [ ] Build ok (API sobe com env válida)
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
