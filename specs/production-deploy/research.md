---
feature: production-deploy
module: infra
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: Deploy de produção

## Código/Config Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `docker-compose.dev.yml` | Padrões a herdar: postgres:18-alpine, mount `/var/lib/postgresql`, healthcheck pg_isready |
| `apps/web/next.config.ts` | `output: "standalone"` já configurado; server em `.next/standalone/apps/web/server.js` (monorepo → subpasta), exige cópia de `.next/static` e `public` (procedimento validado na QA do LP-07) |
| `apps/web/src/lib/env.ts` | `WHATSAPP_PHONE`, `API_URL`, `SITE_URL` obrigatórias — avaliadas no **build** (SSG) e `API_URL` também no runtime da server action |
| `apps/api/src/env.ts` | `DATABASE_URL` obrigatória, `PORT` default 3001; API sobe com `bun run src/index.ts` |
| `apps/api/package.json` | `db:migrate` usa `bun --env-file=../../.env` — **não serve em container** (RF-03: parametrizar só por environment); `drizzle-kit` é devDep |
| `apps/api/drizzle.config.ts` | Lê `process.env.DATABASE_URL` direto — `bunx drizzle-kit migrate` funciona em container com env setada |
| `apps/api/drizzle/` | Migração 0000 versionada — a mesma SQL vai para produção |
| `bun.lock` / workspaces | Install do monorepo: copiar package.json raiz + workspaces + bun.lock para camada de deps |
| `.gitignore` | `.env.*` ignora TUDO exceto `.env.example` — `.env.production.example` **precisa de negação própria** (`!.env.production.example`), senão some silenciosamente no commit |

## Decisões anteriores que amarram este item

- ADR-0003 (VPS + Compose + Caddy; só 80/443 públicos), ADR-0007 (PG≥18; nota explícita "compose de produção DEVE fixar postgres:18").
- Lessons: mount `/var/lib/postgresql` em 18+; `next start` ≠ standalone; Next lê env do diretório do app (em Docker, env entra por environment/build args, não por `.env`).
- LP-06: XFF confiável entre web→API pela rede interna (reafirmar: API sem porta publicada).
- security.md/infra: Postgres nunca exposto; HTTPS obrigatório.

## Gaps Identificados

- Não existem Dockerfiles, Caddyfile, compose de prod, script de deploy — tudo novo.
- `db:migrate` de produção precisa de caminho sem `--env-file` (target/stage `migrate` com devDeps na imagem builder, ou script `db:migrate:prod` sem env-file).
- Runtime do standalone: imagem Node (o server.js do Next é Node-first; Bun não é o runtime testado pelo Next) — decidir no plan.
- Smoke local: Caddy com `DOMAIN=http://localhost` serve HTTP sem tentar ACME (comportamento padrão do Caddy para site address http://).

## Referências Externas

- `project-memory/02-architecture.md` (desenho; será atualizado: API sem subdomínio público nesta fase).
- Docs Next standalone/monorepo; docs Caddy (env em Caddyfile, XFF default; `http://` site = sem TLS).
