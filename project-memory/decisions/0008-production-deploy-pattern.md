# ADR-0008 — Padrão de deploy da Fase 1: Compose de produção com Caddy e API sem exposição pública

- **Status**: Aceito
- **Data**: 2026-07-17

> **Nota (superseção parcial):** o mecanismo de entrega descrito no item 3 (build/migração na VPS) e no item 4 (deploy por rsync do working tree) foi **substituído pelo [ADR-0011](./0011-ghcr-image-deploy.md)** (modelo pull via GHCR — a VPS só recebe infra). O restante deste ADR (API sem exposição pública, imagens, transação de migração) segue vigente.

## Contexto

O LP-11 empacotou a Fase 1 para produção (VPS única — ADR-0003). Duas decisões estruturais surgiram: como a API é exposta e como o deploy/migração acontecem. O desenho original de `02-architecture.md` previa `api.dominio.com` público atrás do Caddy, mas a Fase 1 (e o CRM da Fase 2, por `web.md`) consome a API exclusivamente via Server Actions — o browser nunca fala com ela.

## Decisão

1. **API sem exposição pública**: nenhuma porta publicada e nenhum subdomínio. O Caddy publica apenas 80/443 e faz proxy só para o `web`; API e Postgres vivem exclusivamente na rede interna do Compose. Consequência de segurança positiva: a API pode confiar no `x-forwarded-for` afirmado pelo web (seu único cliente possível), preservando o rate limit por visitante (decisão do LP-06).
2. **Imagens**: web = builder Bun → runtime `node:22-alpine` rodando o standalone do Next (`node .next/standalone/apps/web/server.js`, `HOSTNAME=0.0.0.0`); API = `oven/bun` com stages `deps` → `migrate` → `runtime` (só deps de produção da API, usuário não-root, sem `.env` em imagem). Envs de build do web (SSG) via build args — **nunca** segredo por esse caminho (`docker history` os preserva); envs de runtime via `environment:` do compose.
3. **Migrações no deploy**: serviço `migrate` (profile `tools`, `target: migrate`, `USER bun`), parametrizado apenas por `DATABASE_URL`, executado pelo `scripts/deploy.sh` como `docker compose run --rm --build migrate` — o `--build` é obrigatório (o profile fica fora do `build` padrão; sem ele, migrações novas não seriam aplicadas a partir do 2º deploy — defeito provado e corrigido na QA).
4. **Deploy por rsync + SSH** (`scripts/deploy.sh`): sincroniza o working tree (excluindo `.env*` em qualquer nível, com include explícito do `.env.production.example`), build, migrate, `up -d`, prune e verificação via curl. Sem git na VPS (repo ainda sem remote — INF-01).

## Alternativas consideradas

- **API pública em `api.dominio.com`** (desenho original) — descartada nesta fase: sem consumidor público, só aumentaria superfície de ataque (`security.md`). Se surgir consumidor externo, novo item + revisão deste ADR.
- **Migração automática no boot da API** — descartada: acopla boot a DDL e esconde falhas de migração; job explícito no deploy é observável e idempotente.
- **Deploy via git pull na VPS** — inviável hoje (sem remote) e desnecessário.

## Consequências

- Superfície pública mínima (80/443 no Caddy); Postgres e API inalcançáveis de fora — em conformidade com `security.md`.
- Trocar env de **build** do web (`SITE_URL`, `WHATSAPP_PHONE`, `API_URL`) exige rebuild da imagem (página SSG).
- O build do web exige rede (Google Fonts via `next/font`) — builds offline falham.
- Postgres fixado em `postgres:18-alpine` com volume em `/var/lib/postgresql` (ADR-0007 + lesson das imagens 18+).
- A imagem `migrate` (com devDeps, ~987MB) fica residente na VPS entre deploys — aceito pelo porte do projeto; otimizável se necessário.
