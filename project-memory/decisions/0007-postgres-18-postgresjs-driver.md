# ADR-0007 — Postgres 18 (uuidv7 nativo) + driver postgres.js

- **Status**: Aceito
- **Data**: 2026-07-16

## Contexto

O LP-01 (banco de dev + setup Drizzle) exigiu duas escolhas duráveis: a versão do Postgres e o driver de conexão. A rule `database.md` determina `id` uuid **v7 com default no banco**, e o runtime da API é Bun enquanto os testes (Vitest + Testcontainers) rodam em Node — o driver precisa funcionar idêntico nos dois.

## Decisão

1. **Postgres 18** em todos os ambientes (dev via `docker-compose.dev.yml`, testes via Testcontainers, produção no LP-11): é a primeira versão com `uuidv7()` nativo, permitindo default de id no banco sem extensão nem geração na aplicação.
2. **Driver `postgres` (postgres.js)** com `drizzle-orm/postgres-js`, conexão criada apenas pela factory `createDb(databaseUrl)` (`apps/api/src/db/client.ts`) e injetada a partir do composition root.
3. Migrações somente via `drizzle-kit generate` + `db:migrate` (SQL versionado em `apps/api/drizzle/`); scripts carregam env com `bun --env-file=../../.env` porque o `.env` vive na raiz do monorepo.

## Alternativas consideradas

- **`bun:sql`** — nativo do Bun, mas não roda sob Node/Vitest: quebraria os testes de integração.
- **`pg` (node-postgres)** — funciona nos dois runtimes, porém mais pesado e sem vantagem sobre postgres.js para este projeto.
- **Postgres 17 + uuid v4 (`gen_random_uuid`) ou v7 gerado na aplicação** — violaria `database.md` (v7 no banco) ou espalharia geração de id pela aplicação.

## Consequências

- Ganhamos ids v7 ordenáveis por tempo com default no banco e um único driver para runtime e testes.
- **Acoplamento a Postgres ≥ 18**: o compose de produção (LP-11) e qualquer ambiente novo DEVEM fixar `postgres:18` ou superior — a migração 0000 falha em versões menores.
- Atenção operacional: imagens `postgres:18+` mudaram o ponto de mount do volume para `/var/lib/postgresql` (sem `/data`) — ver `project-memory/lessons.md`.
