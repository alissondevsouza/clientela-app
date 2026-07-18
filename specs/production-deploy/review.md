---
feature: production-deploy
module: infra
phase: review
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: production-deploy (rodada 2)

Revisor QA neutro e adversarial — revalidação completa do zero após o fix da rodada 1. Arquivos revisados na íntegra: `.dockerignore`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.env.production.example`, `scripts/deploy.sh`, `apps/api/package.json`, `.gitignore`, `README.md` + código da cadeia (drizzle.config, server action, schemas) para conferência de contrato. Evidências em `validate.md` (rodada 2).

## Resumo da rodada 1

REPROVADO com 1 CRÍTICO + 2 ALERTAs + 3 SUGESTÕES: (#1 CRÍTICO) pipeline de deploy reusava imagem `migrate` stale a partir do 2º deploy — migrações novas silenciosamente não aplicadas; (#2 ALERTA) `.dockerignore` não-recursivo deixava `apps/web/.env.local` entrar no contexto de build; (#3 ALERTA) imagem da API com 659MB carregando a árvore de produção do web inteira + `typescript`; (#4) mensagem do deploy apontava para `.env.production.example` que o rsync excluía; (#5) migrate rodava como root; (#6) imagem migrate 987MB. Todo o smoke RF-08 havia passado.

## Verificação das correções (rodada 2 — tudo re-executado)

| # r1 | Correção aplicada | Verificação |
|---|---|---|
| 1 CRÍTICO | `docker compose run --rm --build migrate` no passo 4 do deploy.sh (+ comentário explicando o porquê) | ✅ Experimento de staleness repetido com migração REAL nova (SQL + journal) após deploy inicial: fluxo exato dos passos 3+4 **aplicou** a migração (`qa_probe_stale` criada, journal do banco = 2). Dry-run imprime o `--build` no plano |
| 2 ALERTA | `**/.env` + `**/.env.*` no `.dockerignore` | ✅ Probe `COPY . /ctx && find` no repo real (com `.env` e `apps/web/.env.local` no disco): **zero** `.env*` no contexto |
| 3 ALERTA | Runtime da API: `bun install --frozen-lockfile --production --filter @clientela/api` + remoção cirúrgica do `typescript` (store glob + find por nome) | ✅ Imagem 659MB → **151MB**. Store contém só deps da API; sem next/react/sharp/drizzle-kit/vitest/biome/testcontainers e sem `typescript` (find). Sem dano colateral: symlinks das deps íntegros, API healthy, lead real atravessou a elysia fim-a-fim |
| 4 SUGESTÃO | `--include=.env.production.example` antes do `--exclude=.env.*` no rsync | ✅ Simulação com os args exatos do script: só `.env.production.example` transfere; `.env`/`.env.local` não. Mensagem do passo 2 agora é executável in loco |
| 5 SUGESTÃO | `USER bun` no stage `migrate` | ✅ `Config.User=bun`, `whoami`→bun; migração funcionou sem root (arquivos world-readable) |
| 6 SUGESTÃO | Aceita sem mudança (imagem migrate 987MB) | Registrada abaixo como SUGESTÃO remanescente |

## Análise adversarial da remoção cirúrgica do `typescript`

- `rm -rf node_modules/.bun/typescript@*`: glob por nome, agnóstico a versão — se a elysia mudar de versão/peer range, continua removendo (ou vira no-op inofensivo com `-f`).
- `find node_modules -name typescript -prune -exec rm -rf {} +`: roda de `/app`, cobre store isolado e layout hoisted. Risco residual: apagaria um diretório de runtime que se chamasse literalmente `typescript` dentro de outra dep — hoje não existe nenhum (verificado no store completo) e o comportamento fim-a-fim prova a integridade. Risco documentado no próprio Dockerfile.
- Resíduo encontrado: symlinks quebrados `.bin/tsc`/`.bin/tsserver` dentro do dir da elysia no store — inertes (nada os resolve em runtime); ver SUGESTÃO #2.
- Pacotes type-only remanescentes (`@types/bun`, `@types/node`, `bun-types`, `undici-types`): peers transitivos, não devDeps do projeto; pequenos e nunca carregados; ver SUGESTÃO #1.

## Checklist

### Correção e edge cases
- [x] RF-01..08 corretos contra os critérios de aceite (smoke completo re-executado do zero em projeto isolado)
- [x] RF-03/07: staleness CORRIGIDA e provada com migração real nova; 2ª execução no-op; migração só por DATABASE_URL
- [x] deploy.sh: `set -euo pipefail`, falha cedo sem `.env` remoto, flag desconhecida → exit 2, curl final não derruba o deploy (`|| warn`), dry-run sem exigir HOST/PATH
- [x] rsync `--delete` SEM `--delete-excluded` → `.env` remoto protegido; include/exclude na ordem certa

### Arquitetura / infra (rules + ADRs)
- [x] Só o Caddy publica portas; web/api/postgres apenas na rede interna (`docker compose ps` comprova) — security.md
- [x] Postgres 18-alpine (ADR-0007), volume em `/var/lib/postgresql`; persistência comprovada a `down`+`up`
- [x] Standalone web: `node apps/web/server.js`, `HOSTNAME=0.0.0.0`, CMD exec-form, static/public copiados (lesson LP-07)
- [x] `${VAR:?}` nas obrigatórias — compose falha explícito (POSTGRES_PASSWORD testado); `config` válido
- [x] Healthchecks reais em api/web/postgres; `depends_on` com `condition: service_healthy`; `restart: unless-stopped`
- [x] `.env.production.example` cobre TODAS as envs referenciadas pelo compose (cruzamento mecânico: 11/11)

### Segurança e LGPD (security.md)
- [x] Nenhum segredo real em arquivo versionável; `docker history` do web sem password/secret/token
- [x] Contexto de build limpo em qualquer nível (`**/.env*`) — corrigido e provado
- [x] Imagens: sem `.env*` no filesystem (find nas 3), sem env de runtime bakeada, **não-root nas três** (node/bun/bun)
- [x] Logs api/web sem PII (nome/telefone) e sem senha durante todo o smoke
- [x] `.gitignore`: `.env`/`.env.local` ignorados; os 3 templates versionáveis (check-ignore)

### Testes (testing.md / decisão de cobertura)
- [x] lint/typecheck/test raiz verdes (99/99, inclui integração)
- [x] Smoke RF-08 (gate do item) re-executado integralmente nesta rodada
- [x] E2E: pendência estrutural registrada — nunca fingida

## Problemas Encontrados (rodada 2)

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | Runtime da API ainda contém pacotes type-only trazidos como peers da elysia (`@types/bun`, `@types/node`, `bun-types`, `undici-types`) — inertes e pequenos, mas na mesma categoria "superfície morta" do `typescript` removido | `apps/api/Dockerfile:59-61` | Aceitável; se quiser zerar, estender o cleanup aos dirs `@types+*`/`bun-types@*`/`undici-types@*` do store |
| 2 | SUGESTÃO | Remoção do `typescript` deixa 2 symlinks quebrados (`node_modules/.bun/elysia@*/node_modules/.bin/tsc` e `tsserver`) na imagem da API — cosméticos, nada os invoca | `apps/api/Dockerfile:60-61` | `find node_modules -xtype l -delete` após o cleanup, se quiser imagem impecável |
| 3 | SUGESTÃO | (remanescente r1 #6, aceita) Imagem `migrate` com 987MB (instalação completa com devDeps) fica residente na VPS entre deploys | `apps/api/Dockerfile:13-23` | Aceitável para o porte do projeto |
| 4 | SUGESTÃO | Verificação final do deploy extrai `DOMAIN` com `cut -d= -f2-`: valor entre aspas ou com comentário inline no `.env` quebraria o curl — impacto zero no deploy (só `warn`) | `scripts/deploy.sh:125` | Se quiser robustez: strip de aspas/comentário, ou `docker compose exec caddy` + wget interno |

**Nenhum CRÍTICO. Nenhum ALERTA.**

## Cobertura dos Critérios de Aceite

| Critério | Status |
|---|---|
| RF-01/02 — builds concluem; sem devDeps/.env*; não-root | ✅ web 219MB/api 151MB; devDeps do projeto ausentes; `.env*` ausentes nas 3 imagens; não-root nas 3 (inclui migrate) |
| RF-03 — migração só por DATABASE_URL; 0000 em PG virgem; 2ª execução no-op | ✅ + staleness corrigida: migração NOVA aplicada pelo fluxo real do deploy (provado) |
| RF-04 — config válido; portas só no caddy; falha sem POSTGRES_PASSWORD | ✅ |
| RF-05/08 — smoke completo (landing SEO, lead real, honeypot, persistência, down -v) | ✅ re-executado integralmente na rodada 2 |
| RF-06 — example cobre todas as envs, sem valor real; não-ignorado pelo git | ✅ (11/11 envs; check-ignore ok; rsync agora entrega o template à VPS) |
| RF-07 — bash -n ok; dry-run imprime plano; idempotente | ✅ (plano inclui `--build`; idempotência de migração provada; shellcheck indisponível — "se disponível" por spec) |

## Veredito

**APROVADO** — o CRÍTICO e os 2 ALERTAs da rodada 1 foram corrigidos e re-provados empiricamente; smoke RF-08 completo verde; lint/typecheck/testes verdes; 4 SUGESTÕES em aberto (nenhuma bloqueante). Pendências de handoff: E2E Playwright (estrutural), shellcheck quando disponível, deploy real (LP-12, humano).
