---
feature: dev-db-drizzle-leads
module: api, infra
phase: research
status: draft
created: 2026-07-16
updated: 2026-07-16
depends_on: [spec.md]
---

# Research: Banco local de desenvolvimento + Drizzle + migração inicial `leads`

## Código Existente Relevante

| Arquivo | Linhas | Relevância |
|---------|--------|------------|
| `apps/api/src/app.ts` | 1–4 | Factory `createApp()` — o composition root futuro injetará o db aqui; hoje só `/health` |
| `apps/api/src/index.ts` | 1–8 | Boot da API: lê `PORT` direto de `process.env` **sem validação Zod** — RF-02 substitui isso |
| `apps/api/package.json` | — | Deps atuais: só `elysia` + `@clientela/shared`. Sem drizzle, sem zod direto |
| `packages/shared/src/leads.ts` | 1–24 | `createLeadSchema` (Zod v4) — vocabulário do lead: name, whatsapp (10–13 dígitos), interest opcional, consent literal `true` |
| `vitest.config.ts` | 1–9 | Vitest roda em **Node**, include `apps/**/*.test.ts` — testes de integração entram nesse glob |
| `.env.example` | 1–5 | `DATABASE_URL` comentada como "Fase 2 — ainda não usado" → desatualizado, LP-01 ativa |
| `.gitignore` | — | Já ignora `.env`/`.env.*` exceto `.env.example` — ok para compose com env de dev inline |

## Padrões do Codebase a Seguir

- Factories puras exportadas por named export (`createApp`) — replicar como `createDb`.
- Testes ao lado do código (`app.test.ts` junto de `app.ts`).
- Constantes nomeadas no topo (`DEFAULT_PORT`, `WHATSAPP_MIN_DIGITS`).
- Zod v4 (`zod@^4.4.3` via shared) — env schema usa a mesma major.

## Schemas e Tipos Relevantes

- `createLeadSchema` (shared): validação da fronteira HTTP — **não** é o schema do banco; o banco guarda `consent_at: timestamptz` (o `consent: true` da fronteira vira timestamp no service, LP-02).
- Modelo de domínio (`project-memory/04-domain-model.md`): Lead = name, whatsapp, interest, source, status (`new → contacted → converted / discarded`), consent_at. Incluir `source` e `status` já na migração inicial evita migração extra no CRM-04 e segue o modelo documentado.

## Dependências Entre Packages

- `apps/api` ganha: `drizzle-orm`, driver `postgres` (postgres.js — funciona em Bun e Node), `zod` (dep direta para env), e dev-deps `drizzle-kit`, `@testcontainers/postgresql`.
- `packages/shared` e `apps/web` não mudam (web nunca importa `db/` — `database.md`).
- Raiz: `docker-compose.dev.yml` novo; `vitest.config.ts` inalterado (glob já cobre).

## Gaps Identificados

- Não existe `src/db/` nem validação de env — tudo criado do zero.
- Não existe infra Testcontainers — este item a inaugura (LP-02 reutiliza).
- Postgres 17 não tem `uuidv7()` nativo; Postgres 18 tem → usar `postgres:18-alpine` no compose e no Testcontainers (consistência dev ↔ teste).
- Timeout default do Vitest (5s) é curto para subir container — teste de integração precisa de timeout maior no próprio teste/hook.

## Referências Externas

- Skills: `.claude/skills/drizzle-postgres`, `drizzle-orm`, `zod`, `vitest`, `elysia`.
- Rules: `database.md` (convenções de schema/migração), `api.md` (camadas), `security.md` (env com Zod no boot), `testing.md` (Testcontainers sem mock).
- ADR-0004 (toolchain: Drizzle + drizzle-kit decididos).
