# Clientela App

Sistema de apoio para consultora de beleza Mary Kay (venda direta), em duas frentes integradas:

- **Landing page** — página profissional pública com foco em vendas e captura de leads (contato via WhatsApp).
- **CRM** — aplicação web para organizar clientes, vendas, estoque e ações de relacionamento.

## Documentação

Toda a documentação e o registro de decisões do projeto estão em [`project-memory/`](./project-memory/README.md) — comece por lá.

## Stack

Next.js (web) · Bun (API) · PostgreSQL · Docker Compose em VPS. Detalhes em [`project-memory/02-architecture.md`](./project-memory/02-architecture.md).

## Deploy

> **Guia completo do zero** (segurança da VPS, DNS, `.env`, primeiro deploy): [`docs/deploy-vps.md`](./docs/deploy-vps.md).

Produção roda via `docker-compose.yml` (raiz): `caddy` (único a publicar portas — 80/443, HTTPS automático), `web`, `api` e `postgres`, todos na rede interna. A API e o banco **não** têm porta pública.

**Deploy automático via GitHub Actions** (ADR-0010): `push` na `main` dispara o CI (lint + typecheck + testes com Postgres real) e, com os gates verdes, publica na VPS por SSH — o runner roda o mesmo [`scripts/deploy.sh`](./scripts/deploy.sh) (build → migração → `up -d` → prune → verificação). Workflows em [`.github/workflows/`](./.github/workflows/); re-deploy manual pelo botão **Run workflow** na aba Actions. O guia completo (provisionamento da VPS, `.env`, chave de deploy, secrets) é o mesmo: [`docs/deploy-vps.md`](./docs/deploy-vps.md).

O `scripts/deploy.sh` executado da sua máquina continua funcionando como **fallback manual**:

```sh
DEPLOY_HOST=usuario@ip DEPLOY_PATH=/opt/clientela ./scripts/deploy.sh
./scripts/deploy.sh --dry-run   # imprime o plano sem executar
```

Migrações são aplicadas por um job efêmero (`docker compose run --rm migrate`), parametrizado só por `DATABASE_URL`. O provisionamento da VPS é manual (LP-12); o primeiro run do Actions deve ser observado após o push do humano.
