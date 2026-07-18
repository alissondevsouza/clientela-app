---
feature: production-deploy
module: infra
phase: spec
status: draft
size: L
created: 2026-07-17
updated: 2026-07-17
---

# Spec: Deploy de produção (Dockerfiles + Compose + Caddy + script SSH)

## O Que

Empacotamento e orquestração de produção da Fase 1: `Dockerfile` do web (Next standalone) e da API (Bun), `docker-compose.yml` de produção com Caddy (HTTPS automático), Postgres 18 com volume persistente e rede interna, execução de migrações no deploy, e script de deploy via SSH. Inclui o exemplo de env de produção. O provisionamento real da VPS e o primeiro deploy são do humano (LP-12).

## Por Que

Item **LP-11** (dep: LP-01..LP-07, todos entregues). A landing só cumpre o objetivo da fase "no ar". ADR-0003 fixa VPS única + Docker Compose + Caddy.

## Requisitos

- **RF-01** — `apps/web/Dockerfile` multi-stage: build com Bun (workspaces do monorepo; precisa de rede para `next/font/google`), runtime Node slim/alpine rodando `node .next/standalone/apps/web/server.js` com `.next/static` e `public` copiados (o `next start` é incompatível com standalone — validado no LP-07). Env de build (`SITE_URL`, `WHATSAPP_PHONE`, `WHATSAPP_DEFAULT_MESSAGE` opcional, `API_URL`) via build args (nenhuma é segredo — e build args persistem em `docker history`: comentário no Dockerfile proibindo segredo por esse caminho); em **runtime** a server action chama `loadWebEnv()` que valida o schema COMPLETO → as três obrigatórias (`SITE_URL`, `WHATSAPP_PHONE`, `API_URL`) devem estar no environment de runtime do serviço web (via `environment:` do compose). `ENV HOSTNAME=0.0.0.0` e CMD exec-form no standalone. Imagem final sem devDeps, sem `.env*`, usuário não-root.
- **RF-02** — `apps/api/Dockerfile`: runtime Bun rodando `src/index.ts` com deps de produção do workspace; imagem final sem devDeps nem segredos; usuário não-root; healthcheck HTTP no `/health`.
- **RF-03** — Migrações no deploy: mecanismo containerizado que roda `drizzle-kit migrate` contra o Postgres do compose **parametrizado só por `DATABASE_URL` do environment** (sem depender do `--env-file=../../.env` dos scripts de dev) — ex.: stage/target `migrate` da imagem da API invocado pelo script de deploy antes de subir a API. Migração é a mesma SQL versionada de `apps/api/drizzle/`.
- **RF-04** — `docker-compose.yml` de produção na raiz: serviços `caddy` (única exposição pública: 80/443), `web`, `api`, `postgres` (18, volume nomeado em `/var/lib/postgresql` — convenção 18+, e `POSTGRES_PASSWORD` obrigatória via env, sem default), rede interna: **Postgres e API sem nenhuma porta publicada** (`security.md`; a API é consumida apenas pelo web via rede interna — o browser nunca fala com ela). Healthchecks e `depends_on` com condição; `restart: unless-stopped`.
- **RF-05** — `Caddyfile`: site `{$DOMAIN}` → `reverse_proxy web:3000` (HTTPS automático Let's Encrypt em produção; com `DOMAIN=http://localhost` serve HTTP puro para smoke local). Caddy preserva/anexa `X-Forwarded-For` (comportamento default — o rate limit por visitante do LP-06 depende disso).
- **RF-06** — `.env.production.example` versionado (**exige `!.env.production.example` no `.gitignore`** — a regra atual `.env.*` o ignoraria silenciosamente; verificação: `git check-ignore` NÃO retorna o arquivo) e sem valores reais: `DOMAIN`, `POSTGRES_PASSWORD`, `DATABASE_URL` (host `postgres` interno), `SITE_URL`, `API_URL` (`http://api:3001`), `WHATSAPP_PHONE` (+DDI), `WHATSAPP_DEFAULT_MESSAGE` opcional, `PORT`s se aplicável — com comentários de onde cada uma é usada (build vs runtime) e lembrete de rebuild do web ao trocar env de build.
- **RF-07** — `scripts/deploy.sh`: sincroniza o repositório para a VPS via SSH/rsync (excluindo `node_modules`, `.next`, `.env*` locais, artefatos), e na VPS executa: `docker compose build` → migração (RF-03) → `docker compose up -d` → prune de imagens antigas. Parametrizado por env/flags (`DEPLOY_HOST`, `DEPLOY_PATH`), com `set -euo pipefail`, mensagens claras e passo de verificação final (curl no domínio). Idempotente.
- **RF-08** — Smoke de produção executável localmente (sem VPS): subir o compose de produção com `DOMAIN=http://localhost` e envs de exemplo → landing servida pelo Caddy (200, head SEO), fluxo de lead completo via server action atravessando caddy → web → api → postgres (linha no banco), honeypot sem linha, e persistência do volume do Postgres a `down`+`up`. É o critério de aceite executável deste item.

## Critérios de Aceite

- [ ] (RF-01/02) `docker build` das duas imagens conclui; imagens finais não contêm devDeps nem arquivos `.env*`; processos rodam como não-root (`docker inspect`/`whoami`).
- [ ] (RF-03) Com o compose de prod local: serviço/target de migração aplica a migração 0000 num Postgres virgem usando apenas `DATABASE_URL` do environment; segunda execução é no-op.
- [ ] (RF-04) `docker compose config` válido; `docker ps` mostra portas publicadas APENAS no caddy (80/443); compose sem `POSTGRES_PASSWORD` falha explicitamente (variável obrigatória).
- [ ] (RF-05/08) Smoke local completo: `curl http://localhost` → landing com head SEO; submissão de lead real (protocolo da server action, como na QA do LP-06) → linha no Postgres do compose; honeypot → sem linha; `down` + `up` → dados persistem; teardown com `down -v` ao final.
- [ ] (RF-06) `.env.production.example` cobre todas as envs referenciadas pelo compose/Dockerfiles (verificação cruzada) e não contém nenhum valor real/segredo.
- [ ] (RF-07) `bash -n scripts/deploy.sh` ok; shellcheck limpo (se disponível); dry-run documentado no próprio script (`--dry-run` imprime o plano sem executar).

## Fora de Escopo

- Provisionamento da VPS, DNS, primeiro deploy real — **LP-12 (humano, com agente assistindo)**.
- Backup externo do Postgres — **LP-13** (gera ADR de destino).
- CI/CD (INF-01 — gatilho: repositório com remote).
- Subdomínio público para a API (`api.dominio.com` do desenho original): **não exposto nesta fase** — decisão registrada (a API não tem consumidor público; CRM Fase 2 também usa server actions). Se surgir consumidor externo, novo item.
- Monitoramento/observabilidade além de healthchecks.

## Restrições Conhecidas

- Build do web exige rede (Google Fonts via `next/font`); build acontece na VPS (rede disponível). Trocar `SITE_URL`/`WHATSAPP_PHONE`/`API_URL` de build ⇒ rebuild do web.
- Postgres **≥ 18** obrigatório (uuidv7 — ADR-0007) e mount em `/var/lib/postgresql` (lesson 18+).
- Confiança no XFF: API aceita o header do web (rede interna, único cliente — decisão do LP-06 reafirmada aqui: API sem porta publicada).
- Dados pessoais: logs dos containers não podem ganhar novos logs de payload (nada muda no código de app neste item).
- ADR-0006: sem git de escrita.
