---
feature: production-deploy
module: infra
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: Deploy de produção

## Milestone 1: Imagens

- [x] **Task 1.1** — `.dockerignore` raiz + `apps/api/Dockerfile` (stages `deps`/`migrate`/`runtime`; healthcheck /health; USER bun; script `db:migrate:prod` no package.json da API)
  - Arquivos: `.dockerignore`, `apps/api/Dockerfile`, `apps/api/package.json`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `docker build --target runtime` e `--target migrate` concluem; imagem runtime sem devDeps/.env (inspeção)
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 1.2** — `apps/web/Dockerfile` (builder bun com build args SITE_URL/WHATSAPP_PHONE/WHATSAPP_DEFAULT_MESSAGE/API_URL → runtime node:22-alpine standalone com static+public copiados; USER node; envs de runtime vêm do compose — não fazer bake de ENV no Dockerfile)
  - Arquivos: `apps/web/Dockerfile`
  - Dependências: Task 1.1 (.dockerignore)
  - Paralelizável: sim
  - Verificação: `docker build` conclui com args de exemplo; container responde `/` localmente; imagem sem devDeps/.env
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Orquestração

- [x] **Task 2.1** — `docker-compose.yml` prod (caddy/web/api/postgres/migrate-profile; envs `${VAR:?}`; healthchecks; depends_on condicionais; volumes nomeados; rede única interna; só caddy publica portas parametrizáveis `${CADDY_HTTP_PORT:-80}`/`${CADDY_HTTPS_PORT:-443}`) + `Caddyfile` + `.env.production.example` (cruzado com todas as refs)
  - Arquivos: `docker-compose.yml`, `Caddyfile`, `.env.production.example`, `.gitignore` (+`!.env.production.example`)
  - Dependências: Task 1.1, Task 1.2
  - Paralelizável: não
  - Verificação: `docker compose config` válido com env de exemplo; sem `POSTGRES_PASSWORD` → erro citando a variável; `git check-ignore .env.production.example` NÃO ignora; serviço web com `environment:` das 3 envs obrigatórias de runtime
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 3: Script e smoke

- [x] **Task 3.1** — `scripts/deploy.sh` (rsync + build + migrate + up -d + prune + curl de verificação; `--dry-run`; `set -euo pipefail`; aviso de working tree sujo; DEPLOY_HOST/DEPLOY_PATH parametrizados) + seção "Deploy" no README
  - Arquivos: `scripts/deploy.sh`, `README.md`
  - Dependências: Task 2.1
  - Paralelizável: não
  - Verificação: `bash -n` ok; shellcheck limpo se disponível; `--dry-run` imprime plano
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 3.2** — Smoke local completo (RF-08): compose prod com `DOMAIN=http://localhost` e envs de exemplo → migração em PG virgem (2ª execução no-op) → landing 200 via Caddy com head SEO → lead real via server action até o Postgres → honeypot sem linha → persistência `down`+`up` → teardown `down -v`
  - Arquivos: — (execução)
  - Dependências: Task 3.1
  - Paralelizável: não
  - Verificação: evidências coladas (curls, psql, docker ps mostrando portas só no caddy)
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 4: Graduação (orquestrador)

- [x] **Task 4.1** — ADR-0008 (padrão de deploy: compose prod + API sem exposição pública) + atualizar `project-memory/02-architecture.md` (diagrama sem `api.dominio.com` público nesta fase) + índice de ADRs
  - Arquivos: `project-memory/decisions/0008-production-deploy-pattern.md`, `project-memory/decisions/README.md`, `project-memory/02-architecture.md`
  - Dependências: Task 3.2 (QA aprovada)
  - Paralelizável: não
  - Verificação: ADR consistente com o implementado; diagrama atualizado
  - Implementado por: orquestrador (sessão 2026-07-17, pós-QA rodada 2)

## Ordem de Execução

M1 (1.1 → 1.2; o .dockerignore da 1.1 precede) → M2 → M3 → M4 (pós-QA).

## Definition of Done (agregado)
- [ ] RF-01..08 atendidos com smoke executado
- [ ] lint/typecheck/test raiz continuam verdes
- [ ] Sem segredo real em nenhum arquivo versionável
- [ ] ADR-0008 + `02-architecture.md` atualizados (Task 4.1)
