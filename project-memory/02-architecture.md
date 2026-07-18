# 02 — Arquitetura

> Decisões que originaram esta arquitetura: [ADR-0002 (stack)](./decisions/0002-stack-nextjs-bun-postgres.md) e [ADR-0003 (hospedagem)](./decisions/0003-vps-docker-hosting.md).

## Visão de alto nível

```
                         Internet
                            │ 80/443 (única exposição pública)
                    ┌───────▼────────┐
                    │ Caddy (VPS)    │  TLS/HTTPS automático
                    └───────┬────────┘
             landing + CRM  │ dominio.com.br
                    ┌───────▼───┐   rede interna    ┌───────────┐
                    │ Next.js   │──────────────────▶│ API (Bun) │
                    │ (web)     │  Server Actions   │ REST/JSON │
                    └───────────┘                   └──┬────────┘
                                                       │ rede interna
                                                 ┌─────▼──────┐
                                                 │ PostgreSQL │
                                                 └────────────┘
```

> **API e Postgres não têm exposição pública** (sem porta publicada, sem subdomínio): o browser nunca fala com a API — todo consumo é via Server Actions do web na rede interna do Compose ([ADR-0008](./decisions/0008-production-deploy-pattern.md); substitui o desenho anterior com `api.dominio.com`).

Tudo roda em **uma única VPS** (ex.: Hostinger), orquestrado com **Docker Compose**.

## Componentes

### 1. Web — Next.js (App Router, TypeScript)

Um único projeto Next.js servindo as duas frentes:

- **Landing page** (`/`) — páginas públicas, renderização estática/SSR para SEO e performance.
- **CRM** (`/app` ou subdomínio) — área autenticada da consultora.

Justificativa de manter junto: mesma stack, mesmo deploy, compartilha componentes de UI; a landing é pequena demais para justificar projeto separado.

### 2. API — Bun + framework HTTP

- Runtime **Bun** com um framework HTTP nativo do ecossistema (**Hono** ou **Elysia** — decidir no início da implementação e registrar em ADR).
- Responsabilidades: regras de negócio, persistência, autenticação, endpoint público de captura de leads (usado pela landing).
- API REST/JSON. O Next.js consome a API; não acessa o banco diretamente.
- Microserviços adicionais (ex.: worker de lembretes/notificações) só quando houver necessidade concreta — começar com **um único serviço de API** (monólito modular).

### 3. Banco — PostgreSQL

- Uma instância Postgres em container, com volume persistente.
- Migrações versionadas no repositório (ferramenta a definir junto com o ORM — ex.: Drizzle).
- **Backup diário automatizado** (`pg_dump` + envio para storage externo). Backup que fica só dentro da VPS não é backup.

### 4. Infraestrutura — VPS + Docker Compose

- VPS Linux (Hostinger ou similar), acesso por SSH com chave.
- `docker-compose.yml` na raiz orquestrando: caddy, web, api, postgres (+ job `migrate`, profile `tools`).
- Proxy reverso (**Caddy**, HTTPS automático via Let's Encrypt) roteando `dominio.com.br` → Next.js. A API não recebe rota pública (ADR-0008).
- Deploy: `scripts/deploy.sh` (rsync + SSH: build → `docker compose run --rm --build migrate` → `up -d`). CI/CD (GitHub Actions) pode vir depois (INF-01).

## Repositório

**Monorepo** com workspaces:

```
clientela-app/
├── project-memory/            # esta documentação
├── apps/
│   ├── web/         # Next.js (landing + CRM)
│   └── api/         # Bun (API)
├── packages/
│   └── shared/      # tipos e validações compartilhados (ex.: schemas Zod)
├── docker-compose.yml
└── ...
```

## Toolchain (decidida no [ADR-0004](./decisions/0004-typescript-toolchain.md))

Elysia (API) · Drizzle + drizzle-kit (ORM/migrações) · Zod v4 em `packages/shared` (contratos front+API) · Vitest + Testcontainers (testes) · Biome (lint/format) · shadcn/ui + Tailwind (UI). Regras operacionais em `.claude/rules/typescript/*`.

## Decisões em aberto

Registrar cada uma como ADR quando decidida:

- [x] Estratégia de autenticação do CRM — decidida no [ADR-0012](./decisions/0012-session-auth-strategy.md) (sessão própria DB-backed, token opaco, cookie no web + Bearer interno)
- [ ] Domínio e subdomínios definitivos
- [ ] Destino do backup externo (S3/R2/Backblaze/Google Drive)
- [ ] Infra de E2E (Playwright) — ver `known-issues.md`
