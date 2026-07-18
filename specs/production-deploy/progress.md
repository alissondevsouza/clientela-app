---
feature: production-deploy
module: infra
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: Deploy de produção

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | API sem subdomínio/porta pública (desvio do desenho original de 02-architecture) | Nenhum consumidor público (browser → server actions); menos superfície; graduar em ADR-0008 + atualizar 02-architecture |
| 2026-07-17 | spec | Runtime do web em node:22-alpine (builder bun) | server.js do standalone é Node-first; Bun builda o monorepo |
| 2026-07-17 | spec | Migração containerizada via stage `migrate` (profile tools), parametrizada só por DATABASE_URL | Scripts de dev usam --env-file que não existe em container |
| 2026-07-17 | spec | Deploy por rsync+SSH (sem git na VPS) | Repo sem remote (INF-01); simples e reproduzível |
| 2026-07-17 | spec | Envs obrigatórias no compose via `${VAR:?}` | Falha explícita em prod > default silencioso |
| 2026-07-17 | spec | Review rodada 1: REPROVADO — `.env.production.example` seria ignorado pelo `.gitignore` atual (falha silenciosa no commit); runtime do web precisa das 3 envs (loadWebEnv valida schema completo), não só API_URL → corrigidos + task de graduação explícita (ADR-0008) + detalhes antecipados (HOSTNAME=0.0.0.0, healthchecks sem curl, rsync sem --delete-excluded) | Achados do spec-verifier |

## Milestones

- [x] Milestone 1: Imagens
- [x] Milestone 2: Orquestração
- [x] Milestone 3: Script e smoke
- [x] Milestone 4: Graduação (orquestrador, pós-QA)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | spec | Intake LP-11, research, spec/plan/tasks; review r1 REPROVADO → corrigido → r2 APROVADO | Roadmap `[>]`; branch compartilhada `feature/phase-1-landing-page` |
| 2026-07-17 | 1 | implement | Tasks 1.1–3.2 por clientela-implementer; smoke RF-08 completo (build, migração+no-op, lead real via Caddy até o Postgres, honeypot, persistência de volume, teardown); raiz verde (99/99) | Desvios necessários: COPY tsconfig.base.json no builder web; healthcheck web em 127.0.0.1 (busybox wget resolve ::1 mas server binda IPv4); aspas nos ${VAR:?} com URLs. shellcheck indisponível (bash -n + dry-run ok) |
| 2026-07-17 | 1 | qa | Rodada 1 (verifier A): REPROVADO — CRÍTICO migração stale (migrate fora do build por profile; provado com migração dummy), ALERTAs .dockerignore não-recursivo e devDeps/árvore web na imagem da API → fixer: `run --rm --build migrate`, `**/.env*`, install filtrado + remoção cirúrgica do typescript (peer da elysia), USER bun no migrate, include do example no rsync → rodada 2 (verifier B): APROVADO — staleness re-provado corrigido, contexto sem .env, API 659→151MB, smoke completo | Sugestões abertas (não bloqueantes): limpar @types/* e symlinks quebrados no runtime da API; otimizar imagem migrate (987MB); parsing do DOMAIN no deploy.sh |
| 2026-07-17 | 1 | graduate | ADR-0008 (deploy + API sem exposição pública) + 02-architecture.md atualizado (diagrama/roteamento/deploy) + índice de ADRs | Roadmap LP-11 → `[R]` |
| 2026-07-17 | 2 | handoff | Suporte ao LP-12: `docs/deploy-vps.md` (guia completo — segurança VPS, DNS, .env, deploy); ADR-0009 (domínio consultoralaisbarbosa.com.br, raiz+www no mesmo bloco Caddy — validado com `caddy validate`); deploy.sh: curl final usa o 1º endereço quando DOMAIN é lista; complemento Traefik no ADR-0003 (decisão reafirmada pelo humano) | LP-10 → `[x]`; LP-12 → `[>]` aguardando execução pelo humano |
