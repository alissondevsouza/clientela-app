---
feature: crm-auth
module: api, web, shared
phase: spec
status: in_progress
updated: 2026-07-17
---

# Progress: crm-auth (CRM-01)

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | intake | Trabalho continua na branch `feature/phase-1-landing-page` (sem criar `feature/crm-auth`) | Repo ainda sem nenhum commit — branch nova seria órfã e carregaria o mesmo working tree; handoff alertará o humano para commitar a Fase 1 antes/separadamente |
| 2026-07-17 | intake | Size L | Cross-app (api + web + shared), migração de banco (`consultants`, `sessions`), contrato novo de auth |
| 2026-07-17 | spec | Sessão própria DB-backed (token opaco + hash SHA-256) em vez de Better Auth/Lucia/JWT | Usuária única, zero deps novas, `Bun.password` nativo, revogação imediata; resolve decisão em aberto de `02-architecture.md` — gradua para ADR |
| 2026-07-17 | spec | Guard da API default-deny via `onRequest` com allowlist pública normalizada | `security.md` + lessons Elysia (beforeHandle pós-validação; trailing slash) |
| 2026-07-17 | spec | Cookie só no web (`clientela_session`, httpOnly/secure-prod/lax); web→API via Bearer | ADR-0008: browser nunca fala com a API |
| 2026-07-17 | spec | Guard web server-side no layout `(crm)` (GET /auth/me); sem middleware.ts | Middleware é otimista/bypassável; fora de escopo explícito |
| 2026-07-17 | spec | Seed via script idempotente com `SEED_CONSULTANT_*` no ambiente da execução | Boot sem side-effects (coerente com ADR-0008); senha fora de arquivo/log |
| 2026-07-17 | spec-review | Renovação deslizante **descartada** → expiração fixa de 30 dias + limpeza oportunista de sessões expiradas no login | ALERTA do spec-verifier (rodada 1): RSC não pode setar cookie — renovação no banco não se realizaria fim-a-fim; re-login mensal aceitável |
| 2026-07-17 | spec-review | Login repassa IP do cliente via XFF (helper + action + teste) | ALERTA do verifier: sem repasse, rate limit "por IP" vira bucket único (DoS da consultora) |
| 2026-07-17 | spec-review | Seed em produção via `COPY apps/api/scripts` no stage runtime + `docker compose run` | ALERTA do verifier: imagem runtime não continha scripts/ — login não funcionaria na VPS |
| 2026-07-17 | spec-review | Task 2.2 dividida (guard+error-handler / rotas+wiring); prefixo `__Host-` rejeitado | Sugestões do verifier; `__Host-` = complexidade condicional sem ganho real (domínio único) |
| 2026-07-17 | implement | `expiresAt` do contrato de login em ISO 8601 (`z.iso.datetime()`) | Task 1.1 — formato não estava fixado no plan; ISO é serializável e parseável nos dois lados |
| 2026-07-17 | implement | FK `sessions.consultant_id` com `ON DELETE CASCADE` | Task 1.2 — sessão órfã não faz sentido; coerente com exclusão de dado pessoal (LGPD) |
| 2026-07-17 | implement | Guard global via `.onRequest(fn).as("global")` (forma de 2 args quebra no Elysia 1.4.29) | Task 2.2 — comprovado por repro isolado; candidato a lesson na graduação |
| 2026-07-17 | implement | Guard só converte `UnauthorizedError` em 401; erros inesperados relançam para o error-handler (500) | Task 2.2 — não mascarar falha interna como 401 |
| 2026-07-17 | implement | Teste de integração injeta KDF real do Node (scrypt) na porta `hasher` — `Bun.password` inexiste sob Vitest/Node | Task 2.4 — round-trip real de hash/verify preservado; argon2id coberto pelo seed sob Bun (validar na QA de runtime); candidato a lesson |

## Milestones

- [x] Milestone 1: Contratos e schema de banco (checkpoint: lint + typecheck + testes verdes, 2026-07-17)
- [x] Milestone 2: API — módulo auth, guard e seed (checkpoint: 90 testes verdes, 2026-07-17)
- [x] Milestone 3: Web — login, cookie e guard do grupo (crm) (checkpoint: typecheck + testes + build verdes, 2026-07-17)
- [x] Milestone 4: Checkpoint geral (177 testes verdes, lint/typecheck limpos, 2026-07-17)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | intake→spec | Intake, leitura da memória, pesquisa do codebase (subagente read-only) | Pedido: "Implemente a Fase 2" — CRM-01 é o primeiro item elegível |
| 2026-07-17 | 1 | spec-review | Spec APROVADA na rodada 1 (spec-verifier neutro); 3 ALERTAs incorporados aos artefatos | Renovação deslizante descartada; XFF no login; seed em produção via COPY |
| 2026-07-17 | 1 | implement | 10 tasks implementadas por 10 clientela-implementer isolados (M1→M4); checkpoint geral verde | 177 testes / 21 arquivos; lint + typecheck 3 workspaces limpos; builds ok |
| 2026-07-17 | 1 | qa | QA rodada 1 (implement-verifier neutro): **APROVADO** — runtime provado (seed argon2id, login/guard/logout via curl, redirects web, logs sem PII) | validate.md + review.md; 2 ALERTAs graduados para known-issues |
| 2026-07-17 | 1 | graduate→handoff | ADR-0012 + security.md + known-issues + lessons + 02/04 atualizados; roadmap CRM-01 → [R] | Handoff entregue ao humano |
