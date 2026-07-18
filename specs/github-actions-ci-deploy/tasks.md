---
feature: github-actions-ci-deploy
module: infra
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: CI + deploy via GitHub Actions

## Milestone 1: Workflows

- [x] **Task 1.1** — `ci.yml` (push branches-ignore main, pull_request, workflow_call; setup-bun, install frozen, lint, typecheck, test; timeout 20min; permissions contents:read; comentário sobre o acoplamento com deploy.yml)
  - Arquivos: `.github/workflows/ci.yml`
  - Verificação: actionlint (Docker) limpo; YAML válido
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 1.2** — `deploy.yml` (push main + workflow_dispatch; job `ci` reusando ci.yml; job `deploy` needs ci: checkout, SSH de secrets com known_hosts fixado, `scripts/deploy.sh` com DEPLOY_HOST/PATH; concurrency deploy-production sem cancel; permissions contents:read; sem echo de secret)
  - Arquivos: `.github/workflows/deploy.yml`
  - Dependências: Task 1.1
  - Verificação: actionlint limpo; grep sem StrictHostKeyChecking no
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Guia e memória

- [x] **Task 2.1** — Atualizar `docs/deploy-vps.md` (nova seção GitHub: repo privado, push pelo humano, chave dedicada `ssh-keygen -t ed25519 -f deploy_key -N ""`, instalar pública no `deploy` da VPS, `ssh-keyscan` p/ DEPLOY_KNOWN_HOSTS, cadastrar 4 secrets com caminho na UI; seção de deploy vira "automático no push + botão Run workflow"; script local rebaixado a fallback; fluxo resumido do topo atualizado) + nota no `README.md`
  - Arquivos: `docs/deploy-vps.md`, `README.md`
  - Dependências: Task 1.2
  - Verificação: coerência doc ↔ workflows (nomes de secrets idênticos)
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 2.2** — ADR-0010 (+ índice): Actions substitui deploy manual (parcial do ADR-0008); GHCR como evolução registrada
  - Arquivos: `project-memory/decisions/0010-github-actions-deploy.md`, `project-memory/decisions/README.md`
  - Dependências: Task 1.2
  - Verificação: consistência com o implementado
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem de Execução

M1 (1.1 → 1.2) → M2 (2.1 ∥ 2.2). DoD: actionlint limpo, gates raiz verdes, secrets coerentes entre YAML e doc.
