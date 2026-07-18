---
feature: production-deploy
module: infra
phase: validate
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: production-deploy (rodada 2)

Executado pelo revisor QA neutro (rodada 2, pós-fix da rodada 1). Tudo abaixo foi DE FATO executado nesta sessão, do zero, sem reaproveitar evidência da rodada 1.

**Resumo da rodada 1** (histórico completo na versão anterior deste arquivo / review.md r1): REPROVADO por CRÍTICO — `docker compose build` (passo 3) não constrói o serviço `migrate` (profile `tools`) e `run --rm migrate` reusava imagem stale ⇒ migrações novas silenciosamente não aplicadas a partir do 2º deploy. ALERTAs: `.env`/`.env.*` do `.dockerignore` só casavam na raiz (apps/web/.env.local entrava no contexto); imagem da API com 659MB carregando árvore do web + typescript. SUGESTÕES: migrate como root; mensagem do passo 2 apontando para arquivo que o rsync excluía; imagem migrate 987MB.

## Comandos Executados (rodada 2)

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 88 arquivos, limpo |
| Typecheck | `bun run typecheck` | ✅ | shared/web/api exit 0 |
| Testes | `bun run test` | ✅ | 15 files, **99 passed, 0 failed** (inclui `leads.integration.test.ts`) |
| Sintaxe | `bash -n scripts/deploy.sh` | ✅ | shellcheck indisponível na máquina (spec: "se disponível") |
| Dry-run | `./scripts/deploy.sh --dry-run` | ✅ | Plano inclui `4. docker compose run --rm --build migrate`; flag desconhecida → exit 2; execução sem HOST → falha explícita |
| Probe de contexto | imagem-probe `COPY . /ctx && find /ctx -name ".env*"` no repo real | ✅ | **NENHUM `.env*` em nenhum nível** (com `.env` e `apps/web/.env.local` presentes no disco) — ALERTA #2 r1 corrigido |
| Compose config | `docker compose config --quiet` | ✅ | Válido |
| Compose sem POSTGRES_PASSWORD | `config` com env sem a variável | ✅ | exit 1: `required variable POSTGRES_PASSWORD is missing a value: defina POSTGRES_PASSWORD no .env (obrigatoria, sem default)` |
| Build (passo 3 do deploy) | `docker compose build` | ✅ | web + api; **api agora 151MB** (era 659MB — ALERTA #3 r1 corrigido) |
| Migração PG virgem (passo 4) | `docker compose run --rm --build migrate` | ✅ | `migrations applied successfully!` — só DATABASE_URL do environment |
| Migração 2ª execução | idem | ✅ | No-op: NOTICEs "already exists, skipping"; `__drizzle_migrations` = 1 linha |
| Runtime | `docker compose up -d --wait` | ✅ | api/web/caddy/postgres healthy |
| git check-ignore | 5 arquivos env | ✅ | `.env.production.example`, `.env.example`, `apps/web/.env.example` versionáveis; `.env`, `apps/web/.env.local` ignorados |
| Simulação rsync do deploy | `rsync -azn --itemize-changes` com os args exatos do script | ✅ | Transfere **apenas** `.env.production.example`; `.env`/`.env.local` não (SUGESTÃO #4 r1 corrigida) |

Ambiente do smoke: cópia isolada do repo em scratchpad, projeto `clientela-qa2`, env: `DOMAIN=http://localhost`, `CADDY_HTTP_PORT=8083`, `CADDY_HTTPS_PORT=8446`, `POSTGRES_PASSWORD=qa2_smoke_password`, `DATABASE_URL=postgres://clientela:qa2_smoke_password@postgres:5432/clientela`, `SITE_URL=http://localhost:8083`, `API_URL=http://api:3001`, `WHATSAPP_PHONE=5511999999999`.

## Saída Relevante (smoke RF-08, rodada 2)

```
$ docker compose -p clientela-qa2 ps
clientela-qa2-api-1        Up (healthy)   3001/tcp                                        ← sem porta publicada
clientela-qa2-caddy-1      Up             0.0.0.0:8083->80/tcp, 0.0.0.0:8446->443/tcp    ← ÚNICA exposição
clientela-qa2-postgres-1   Up (healthy)   5432/tcp                                        ← sem porta publicada
clientela-qa2-web-1        Up (healthy)   3000/tcp                                        ← sem porta publicada

$ curl http://localhost:8083/            → HTTP 200 (7ms)
  <title>Consultoria de Beleza Mary Kay</title>; canonical=http://localhost:8083;
  og:* (10 tags) + twitter:* (8 tags) no head.

Lead real (protocolo Next-Action, id 40078d3d… extraído do server-reference-manifest.json
do container web; POST / via Caddy):
  → HTTP 200, RSC: 1:{"ok":true}
  psql: 019f704c-d1f2-7400-b557-54b693490fcd | QA2 Smoke LP11 | 11987654322 | t | landing
        (uuid v7, consent_at preenchido, source landing)

Honeypot (website="http://spam.example") → HTTP 200 {"ok":true} (sucesso fake), count(leads)=1 (sem linha).

Logs api/web: 0 ocorrências de nome/telefone/senha (grep por payload e POSTGRES_PASSWORD).

Persistência: down + up -d --wait → count=1, "QA2 Smoke LP11" intacto (volume /var/lib/postgresql).
```

## Experimento de staleness (CRÍTICO #1 da r1 — re-executado com o fix)

```
Cópia isolada, APÓS deploy inicial completo (build + migrate + up):
  1. adicionada migração REAL nova: drizzle/9999_qa_probe.sql (CREATE TABLE qa_probe_stale)
     + entrada idx 1 no meta/_journal.json
  2. fluxo EXATO do deploy.sh: passo 3 `docker compose build` → passo 4
     `docker compose run --rm --build migrate`
  3. resultado: [✓] migrations applied successfully!
     psql: tabela public.qa_probe_stale EXISTE; drizzle.__drizzle_migrations = 2 linhas
  → o `--build` do passo 4 reconstrói a imagem migrate e a migração nova É aplicada.
    CRÍTICO #1 corrigido de fato (provado, não presumido). Dummy removido após o teste.
```

## Inspeção das imagens (rodada 2)

```
Users:  web User=node (whoami→node) · api User=bun (whoami→bun) · migrate User=bun (whoami→bun)
        ← SUGESTÃO #5 r1 (migrate root) corrigida
find / -name ".env*" → NENHUM arquivo nas 3 imagens (web, api, migrate)
Config.Env: web só PATH/NODE/NODE_ENV/HOSTNAME/PORT; api/migrate só PATH/BUN_*/NODE_ENV — sem env de runtime bakeada
docker history web: 0 ocorrências de password/secret/token

api (151MB, era 659MB): instalação isolada `--production --filter @clientela/api`.
  Store .bun contém SÓ deps da API: elysia, drizzle-orm, postgres, zod, @sinclair/typebox,
  file-type, memoirist, cookie, debug/ms, strtok3, token-types, exact-mirror, openapi-types,
  @types/bun, @types/node, bun-types, undici-types (type-only, peers da elysia).
  AUSENTES (verificado por find): typescript, next, react, react-dom, sharp, drizzle-kit,
  vitest, @biomejs, testcontainers. Remoção cirúrgica do typescript funcionou sem dano
  colateral: todos os symlinks de deps da API resolvem; API healthy; fluxo de lead completo
  atravessou a elysia. Resíduo: 2 symlinks quebrados (.bin/tsc, .bin/tsserver no dir da
  elysia no store) — inertes, nada os invoca (ver SUGESTÃO no review).
migrate: 987MB (instalação completa com devDeps — aceito na r1, inalterado)

Postgres: 18-alpine, volume nomeado em /var/lib/postgresql (ADR-0007 / lesson 18+).

Teardown: down -v (volumes clientela_pg_data/caddy_* removidos) + rmi das 3 imagens qa2
+ imagem-probe. Restos `qa2`: 0 containers, 0 volumes, 0 imagens.
```

## Pendências

- **E2E (Playwright)**: sem infra no projeto — pendência estrutural, segue no handoff (nunca fingida).
- **shellcheck**: indisponível na máquina de QA (spec exige "se disponível"). Rodar quando disponível.
- Deploy real na VPS (LP-12) é do humano — fora do escopo por spec.
