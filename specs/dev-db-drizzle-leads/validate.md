---
feature: dev-db-drizzle-leads
module: api, infra
phase: validate
status: done
round: 2
created: 2026-07-16
updated: 2026-07-16
depends_on: [tasks.md]
---

# Validate: dev-db-drizzle-leads (rodada 2)

> Rodada 1 **REPROVOU** (volume do compose montado em `/var/lib/postgresql/data`, incompatível com `postgres:18+` → container abortava no primeiro `up`). Esta rodada revalida tudo do zero após as correções do fixer. Nada foi presumido — todos os comandos abaixo foram executados nesta sessão.

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 32 arquivos, zero problemas |
| Typecheck | `bun run typecheck` | ✅ | shared, web e api: exit 0 |
| Testes | `bun run test` | ✅ (17 passed, 0 failed) | 4 arquivos: env (7), integração leads (5), app, shared |
| Integração | `bunx vitest run apps/api/src/db/leads-table.integration.test.ts --reporter=verbose` | ✅ (5/5) | Container `postgres:18-alpine` real confirmado via `docker ps` durante a execução (+ ryuk); migrações versionadas aplicadas pelo migrator |
| Build/boot | `bun run src/index.ts` (env válida, PORT=3199) | ✅ | Sobe e `GET /health` → `{"status":"ok"}` |
| Runtime — compose | `docker compose -f docker-compose.dev.yml up -d --wait` (volume limpo) | ✅ | `Healthy` em `127.0.0.1:5433->5432/tcp` |
| Runtime — persistência | `down` (sem -v) → `up -d --wait` → `SELECT` | ✅ | Linha `rodada2` sobreviveu ao ciclo (volume nomeado `clientela_pg_dev` em `/var/lib/postgresql`) |
| Runtime — uuidv7 | `SELECT uuidv7()` no container | ✅ | PostgreSQL 18.4; `019f6ddd-…-725f-…` (dígito de versão 7) |
| Runtime — db:migrate | `bun run db:migrate` (apps/api, contra o compose em 5433) | ✅ | "migrations applied successfully"; `\d leads` confere colunas, defaults e `leads_status_check` |
| Boot sem env | `env -u DATABASE_URL bun run src/index.ts` | ✅ (falha esperada) | exit 1, "Configuração de ambiente inválida. Verifique: DATABASE_URL" — só o NOME da variável |
| Boot com esquema errado | `DATABASE_URL="http://usuario:senhasupersecreta@…"` | ✅ (falha esperada) | exit 1, mesma mensagem; valor/senha NÃO aparecem na saída |
| Drift de migração | `bun run db:generate` (apps/api) | ✅ | "No schema changes, nothing to migrate"; `apps/api/drizzle/` segue com apenas `0000_new_gideon.sql` + `meta/{0000_snapshot.json,_journal.json}` |
| Limpeza | `docker compose -f docker-compose.dev.yml down -v` | ✅ | Volume, container e network removidos ao final |

## Saída Relevante

```
$ bun run test
 Test Files  4 passed (4)
      Tests  17 passed (17)

$ docker compose -f docker-compose.dev.yml up -d --wait   # volume limpo
 Container clientela_pg_dev Healthy
 Up … (healthy) 127.0.0.1:5433->5432/tcp

$ docker exec clientela_pg_dev psql -U clientela -d clientela -c "SELECT uuidv7();"
 019f6ddd-a2a3-725f-8438-0d81b0543ab8

# persistência: INSERT 'rodada2' → down (sem -v) → up → SELECT
 rodada2

$ env -u DATABASE_URL bun run src/index.ts
 error: Configuração de ambiente inválida. Verifique: DATABASE_URL   (exit 1)

$ DATABASE_URL="http://usuario:senhasupersecreta@localhost:5433/clientela" bun run src/index.ts
 error: Configuração de ambiente inválida. Verifique: DATABASE_URL   (exit 1 — senha ausente da saída)

$ bun run db:generate
 No schema changes, nothing to migrate 😴

pg_get_constraintdef(leads_status_check):
 CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'discarded'::text])))
```

## Pendências

- E2E (Playwright): n.a. neste item (sem superfície de UI) — infra E2E segue inexistente, registrado.
- Teste de integração exige Docker no host (documentado no plan.md como risco aceito).
- Ambiente desta máquina tem Postgres nativo em `127.0.0.1:5432` — o default 5433 do compose evita o conflito (achado #2 da rodada 1, resolvido).
