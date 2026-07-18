---
feature: dev-db-drizzle-leads
module: api, infra
phase: handoff
status: completed
updated: 2026-07-16
---

# Progress: Banco local de desenvolvimento + Drizzle + migração inicial `leads`

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-16 | intake | Branch única `feature/phase-1-landing-page` para todos os itens da Fase 1 desta sessão | Humano pediu a Fase 1 inteira; commits são exclusivos do humano (ADR-0006), então branches por item seriam vazias — o trabalho acumula no working tree e o handoff sugere commits atômicos por item |
| 2026-07-16 | spec | Driver `postgres` (postgres.js), não `bun:sql` nem `pg` | Precisa rodar em Bun (runtime) e Node (Vitest/Testcontainers) |
| 2026-07-16 | spec | Postgres 18 (dev e testes) | `uuidv7()` nativo exigido por `database.md` (id v7 com default no banco) |
| 2026-07-16 | spec | Tabela `leads` já inclui `source` e `status` | Modelo de domínio já define; evita migração extra no CRM-04 |
| 2026-07-16 | spec | `consent_at` NOT NULL | LGPD: lead sem consentimento não pode existir |
| 2026-07-16 | spec | Review neutra (rodada 1): APROVADO com 3 alertas incorporados — `source` definido como text NOT NULL default `'landing'`; `apps/api/tsconfig.json` passa a incluir `test/`; adiamento de `consultant_id` registrado em Fora de Escopo | Alertas do spec-verifier; sugestões acatadas: `check()` explícito no drizzle, estratégia de env dos scripts db (`bun --env-file`), assert de status inválido no teste de integração, nota PG≥18 para o LP-11 |
| 2026-07-16 | spec | Scripts `db:*` carregam env via `bun --env-file=../../.env` | `.env` vive na raiz do monorepo; drizzle-kit com cwd em apps/api não o carrega sozinho; evita dep nova de dotenv |
| 2026-07-16 | qa | QA rodada 1: REPROVADO — volume do compose montava `/var/lib/postgresql/data`, incompatível com postgres:18+ (entrypoint aborta); corrigido para `/var/lib/postgresql` e validado empiricamente (healthy + persistência + uuidv7) | Convenção nova das imagens 18+ (docker-library PR #1259); Testcontainers não monta volume, por isso a suíte verde mascarou |
| 2026-07-16 | qa | Porta do host do Postgres dev configurável: `${CLIENTELA_PG_PORT:-5433}` (default 5433) | Host desta máquina tem Postgres nativo em 5432; bind falharia e `DATABASE_URL` apontaria silenciosamente para o banco errado |
| 2026-07-16 | qa | CHECK de status derivado de `leadStatusValues` via `sql.raw` (não `sql.join`) | `sql.join` emite placeholders `$1..$n` no drizzle-kit generate → migração espúria; `sql.raw` mantém SQL idêntico à migração 0000 |
| 2026-07-16 | qa | `DATABASE_URL` restrita a esquema postgres(ql):// e `updated_at` com `$onUpdate` client-side | Sugestões da QA acatadas; utilitário de limpeza do pg-container adiado para o LP-02 |

## Milestones

- [x] Milestone 1: Infra local + dependências
- [x] Milestone 2: Setup Drizzle na API
- [x] Milestone 3: Teste de integração (Testcontainers)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-16 | 1 | spec | Intake LP-01, análise do codebase, spec/research/plan/tasks autorados | Roadmap marcado `[>]` |
| 2026-07-16 | 1 | spec | Review neutra rodada 1: APROVADO; alertas incorporados | clientela-spec-verifier |
| 2026-07-16 | 1 | implement | M1–M3 implementados por clientela-implementer; lint/typecheck verdes; 15/15 testes (5 de integração com Docker real) | Decisões do implementer: CHECK inline via sql template (enum não interpola seguro no check()); casos negativos de constraint via sql cru (tipos do Drizzle proíbem em TS); `.env` local criado (gitignored) para drizzle-kit |
| 2026-07-16 | 1 | qa | Rodada 1 REPROVADO (verifier A) → clientela-fixer corrigiu CRÍTICO+ALERTA+3 sugestões → rodada 2 APROVADO (verifier B, novo) — 17/17 testes, RF-01..07 verificados empiricamente | Sugestões remanescentes adiadas: truncateAll/robustez do helper → LP-02; trigger de updated_at → known-issues |
| 2026-07-16 | 1 | graduate | ADR-0007 (Postgres 18 + postgres.js); lessons (mount postgres:18+, sql.join placeholders); known-issues (helper pg-container, $onUpdate); `.env.example` documenta CLIENTELA_PG_PORT | Roadmap LP-01 → `[R]` |
