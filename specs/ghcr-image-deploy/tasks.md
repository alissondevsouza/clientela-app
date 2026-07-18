---
feature: ghcr-image-deploy
module: infra
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: Deploy por imagens via GHCR

## Milestone 1: Compose e script

- [x] **Task 1.1** — `docker-compose.yml` (+`image:` ghcr nos 3 serviços, `${GHCR_OWNER:?}`, `${IMAGE_TAG:-latest}`) + `.env.production.example` (+`GHCR_OWNER`, nota Variables×runtime)
  - Verificação: `docker compose config` com envs de exemplo; falha clara sem GHCR_OWNER
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 1.2** — `scripts/deploy.sh` reescrito (sync SÓ infra sem --delete; **passo idempotente de transição** removendo código-fonte do layout antigo preservando `.env`/`.image-tag`; login GHCR via stdin com token por env; `--profile tools pull` tag exata; grava `.image-tag`; migrate sem --build; up; `image prune -af`; curl; logout via trap em qualquer saída; `--dry-run`)
  - Verificação: `bash -n`; dry-run imprime o novo plano; greps: sem rsync de apps/, com `--profile tools`, com `prune -af`, logout em trap
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Workflow, doc e ADR

- [x] **Task 2.1** — `deploy.yml`: job `build-push` (`permissions: {contents: read, packages: write}`; fail-fast de vars; owner lowercase; login; build 3 alvos com args de `vars.*`; push 2 tags) e job `deploy` (`permissions: {contents: read, packages: read}`; needs build-push; passa IMAGE_TAG e token ao script)
  - Verificação: actionlint limpo; YAML parse; greps (sem echo de token; permissions por job corretas — packages:read no deploy!)
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 2.2** — `docs/deploy-vps.md` (seções 3 = só infra + nota de transição automática, 5.6 Variables, 6 pipeline novo + rollback por redeploy de commit, 8 operação manual com `IMAGE_TAG=$(cat .image-tag)`, 9 + pull denied) + ADR-0011 (superseções 0010-mecanismo E 0008-item-3; trade-off GitHub-fora-do-ar) + índice
  - Verificação: nomes de vars/secrets idênticos YAML↔doc; coerência
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 3: Smoke local

- [x] **Task 3.1** — Smoke: `docker compose --profile tools build` (tags ghcr locais — SEM a flag o migrate fica de fora) → migrate → `up -d` → landing 200 via caddy (porta alta) → teardown `down -v` + limpeza de imagens; gates raiz verdes; simulação local do passo de transição (dir fake com layout antigo → só infra sobra, `.env` fake preservado)
  - Verificação: evidências coladas
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem: M1 → M2 → M3.
