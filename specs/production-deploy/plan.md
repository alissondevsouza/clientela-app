---
feature: production-deploy
module: infra
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: Deploy de produção

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Web: builder `oven/bun` (install + `next build`) → runtime `node:22-alpine` com standalone | Bun builda mais rápido no monorepo; o `server.js` do standalone é Node-first (runtime testado pelo Next). Cópia: `.next/standalone` + `.next/static` em `apps/web/.next/static` + `public` em `apps/web/public` (paths do monorepo, validados no LP-07) |
| API: imagem `oven/bun` única com **stages** `deps` (com devDeps) → `migrate` (deps + drizzle/ + config; `CMD bun run db:migrate:prod`) → `runtime` (só prod deps + src) | Um Dockerfile, três alvos; o serviço de migração do compose usa `target: migrate` com `CMD ["bun", "run", "db:migrate:prod"]` e roda como job (`docker compose run --rm migrate`) parametrizado só por `DATABASE_URL` (RF-03) |
| Compose de prod: `caddy` (80/443 + volumes `caddy_data`/`caddy_config`), `web`, `api`, `postgres:18-alpine` (volume `/var/lib/postgresql`), serviço `migrate` (profile `tools`, não sobe com `up`) | Só o Caddy publica portas; `migrate` com profile não entra no `up -d`; `depends_on` com `condition: service_healthy` |
| `POSTGRES_PASSWORD` e demais envs obrigatórias via `${VAR:?err}` no compose | Falha explícita e imediata se env ausente (critério RF-04); sem defaults silenciosos em prod |
| Caddyfile mínimo: `{$DOMAIN} { reverse_proxy web:3000 }` | HTTPS automático quando DOMAIN é domínio real; `http://localhost` para smoke local sem ACME; XFF: comportamento default do Caddy anexa o IP real |
| Deploy por rsync (não git) + comandos remotos via SSH | Repo ainda sem remote (INF-01 pendente); rsync com `--delete` e excludes é reproduzível e simples; script único `scripts/deploy.sh` com `--dry-run` |
| Usuário não-root: `USER node` (web) / `bun` (api) | Superfície mínima; imagens oficiais já trazem o usuário |
| API sem subdomínio/porta pública (desvio do desenho de `02-architecture.md`) | Nenhum consumidor público existe (browser → server actions); menos superfície (`security.md`). Graduação: atualizar 02-architecture + registrar em ADR-0008 junto com o padrão de deploy |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `apps/web/Dockerfile` | Multi-stage build web (args de build documentados) |
| `apps/api/Dockerfile` | Stages deps/migrate/runtime |
| `docker-compose.yml` | Orquestração de produção (raiz) |
| `Caddyfile` | Proxy + TLS |
| `.env.production.example` | Todas as envs, comentadas, sem valores reais |
| `scripts/deploy.sh` | rsync + build + migrate + up + prune + verificação |
| `.dockerignore` (raiz) | node_modules, .next, .env*, specs, project-memory etc. — contexto de build enxuto |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `.gitignore` | + `!.env.production.example` (a regra `.env.*` o ignoraria — falha silenciosa no commit do humano) |
| `apps/api/package.json` | + script `db:migrate:prod` (`drizzle-kit migrate` sem `--env-file`) — o stage `migrate` usa `CMD ["bun", "run", "db:migrate:prod"]` (uma única fonte; sem `bunx` direto no CMD) |
| `README.md` | Seção curta "Deploy" apontando para o script e o `.env.production.example` |

### Detalhes antecipados (evitar retrabalho no smoke)
- Web standalone: `ENV HOSTNAME=0.0.0.0`, CMD exec-form; healthcheck do web via `wget` (busybox presente no alpine).
- Healthcheck da API na imagem bun: `bun -e "const r = await fetch('http://localhost:3001/health'); if (!r.ok) process.exit(1)"` (sem curl garantido).
- `deploy.sh`: rsync SEM `--delete-excluded` (preserva `.env` remoto); falha cedo se `.env` remoto não existir.

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade/Integração | dispensadas | Item de infra/empacotamento sem regra de negócio nova (pirâmide de `testing.md`); nenhuma linha de código de app muda além de um script npm |
| Smoke executável (RF-08) | **sim — é o gate deste item** | Compose de prod local completo: build real, migração real, lead real via Caddy até o Postgres, persistência de volume |
| E2E | pendência (sem infra) | Inalterada |
| Regressão | n.a. | Não é bug |

## Migração de Banco

Nenhuma nova; a 0000 existente passa a ser aplicada por `migrate` containerizado (RF-03).

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Paths do standalone no monorepo divergirem (server.js em subpasta) | média | Procedimento já validado na QA do LP-07; smoke RF-08 pega |
| Build do web sem rede (fonts) na VPS | baixa | VPS tem rede; documentado como restrição |
| Conflito de porta 80/443 no smoke local | média | Portas do Caddy parametrizáveis no smoke (`CADDY_HTTP_PORT:-80`); QA usa porta alta se ocupada |
| `drizzle-kit` no stage migrate resolver versão errada | baixa | Stage migrate herda `node_modules` do stage deps (drizzle-kit pinado pelo lockfile) |
| rsync divergir do estado commitado (working tree sujo) | média | Deploy é sempre do working tree do humano; documentar no script (aviso se `git status` sujo) — sem git de escrita |

## Definition of Done
- [ ] Critérios de aceite RF-01..08 atendidos (smoke local completo)
- [ ] lint/typecheck/test da raiz continuam verdes (nada de app regrediu)
- [ ] `.env.production.example` cruzado com compose/Dockerfiles
- [ ] Conformidade com ADR-0003/0007, lessons e `security.md`
- [ ] Graduação: ADR-0008 (padrão de deploy + API interna) e atualização de `02-architecture.md`
