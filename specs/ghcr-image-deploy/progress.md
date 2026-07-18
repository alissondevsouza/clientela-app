---
feature: ghcr-image-deploy
module: infra
phase: spec
status: in_progress
updated: 2026-07-17
---

# Progress: Deploy por imagens via GHCR

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|---|---|---|---|
| 2026-07-17 | intake | Pedido do humano: servidor só com arquivos de infra; imagens buildadas no pipeline | Redirecionado de "registry no servidor" para GHCR (registry próprio = operação extra sem benefício) |
| 2026-07-17 | spec | `research.md` dispensado (size M) — alvo 100% mapeado em LP-11/INF-04 | Desvio de formato consciente e registrado |
| 2026-07-17 | spec | Token efêmero do run para pull na VPS (login stdin + logout always); tag exata `sha-` persistida em `.image-tag` | Sem PAT novo, nada persistido além da tag; `.env` continua exclusivo do humano |
| 2026-07-17 | spec | Build args do web como GitHub Variables (não secrets) | Valores públicos por natureza (aparecem no HTML SSG) |
| 2026-07-17 | spec | Review rodada 1: REPROVADO (2 CRÍTICOS: job deploy sem packages:read → pull denied; transição do layout antigo da VPS não tratada — código-fonte ficaria lá) → corrigidos + alertas: `--profile tools` em pull/build, `prune -af`, `.image-tag` p/ up manual, ADR-0011 superseda também 0008-item-3 e o fallback do 0010; sugestões: fail-fast de vars, owner lowercase, `:latest` informativa | Achados do spec-verifier |

## Milestones

- [x] Milestone 1: Compose e script
- [x] Milestone 2: Workflow, doc e ADR
- [x] Milestone 3: Smoke local

| 2026-07-17 | 2 | implement | M1–M3; actionlint limpo; compose config ok; smoke pull-model local (build via --profile tools, migrate, up, landing 200, teardown); transição simulada (whitelist preserva .env/.image-tag, idempotente); gates raiz 99/99 | Decisões: whitelist via find ! -name (cobre dotfiles do layout antigo); predicado com aspas simples (printf %q escapava ! e quebrava find); login remoto usa GHCR_OWNER do .env como usuário |

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|---|---|---|---|---|
| 2026-07-17 | 2 | spec | Intake INF-05, spec/plan/tasks | Roadmap `[>]` |
| 2026-07-17 | 2 | qa | R1: REPROVADO (limpeza apagava arquivos do operador a cada deploy) → fixer (one-shot com marcador .layout-v2, blacklist explícita, guardas de rm, pg_dump → ~/backups, rollback Re-run, IMAGE_TAG obrigatória) → R2: APROVADO (transição re-simulada byte a byte em 5 cenários) | Sugestões menores anotadas no review; ADR-0011 rollback corrigido pelo orquestrador |
