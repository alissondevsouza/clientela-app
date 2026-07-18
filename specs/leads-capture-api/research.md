---
feature: leads-capture-api
module: api, shared
phase: research
status: draft
created: 2026-07-16
updated: 2026-07-16
depends_on: [spec.md]
---

# Research: Módulo `leads` da API

## Código Existente Relevante

| Arquivo | Linhas | Relevância |
|---------|--------|------------|
| `packages/shared/src/leads.ts` | 1–24 | `createLeadSchema` (name, whatsapp com transform p/ dígitos, interest opcional, consent literal `true`) — base do contrato; honeypot entra como extensão |
| `apps/api/src/db/schema/leads.ts` | — | Tabela `leads` (LP-01): defaults `status='new'`, `source='landing'`, `consent_at` NOT NULL; tipos `Lead`/`NewLead` inferidos |
| `apps/api/src/db/client.ts` | — | `createDb(databaseUrl)` → `{ db, sql }`; tipo `Database` exportado — repository recebe `Database` |
| `apps/api/src/env.ts` | — | `loadEnv()` Zod; PORT/DATABASE_URL — composition root já valida env |
| `apps/api/src/app.ts` | 1–4 | `createApp()` só com `/health` — vira o ponto de montagem das rotas + plugins (recebendo deps) |
| `apps/api/src/index.ts` | — | Boot: `loadEnv()` + listen — vira composition root completo |
| `apps/api/test/helpers/pg-container.ts` | — | Sobe PG18 + migra; **sem truncate nem tratamento de Docker ausente** (known-issue a resolver aqui) |
| `apps/api/src/app.test.ts` | — | Padrão de teste de rota via `app.handle(new Request(...))` — replicar na integração |

## Padrões do Codebase a Seguir

- Factories com deps explícitas (`createApp`, `createDb`) — módulo leads segue: `createLeadsRepository(db)`, `createLeadsService({ repository, clock, idGenerator })`, `createLeadsRoutes(service)`.
- Constantes nomeadas UPPER_SNAKE no topo do arquivo.
- Testes ao lado do código; `app.handle(Request)` para exercitar rotas sem porta real.
- Mensagens para usuária em pt-BR; erros de domínio como classes nomeadas mapeadas na fronteira (`core.md`).

## Schemas e Tipos Relevantes

- Request de captura = `createLeadSchema` + `website?: string` (honeypot). Decisão: manter `createLeadSchema` puro para o formulário (LP-06 não renderiza honeypot via RHF — campo escondido é detalhe da página) e criar `leadCaptureRequestSchema` estendido para a fronteira HTTP.
- Resposta: `{ id: string }` (uuid). Envelope de erro: `{ error: { code: string, message: string } }` — tipo compartilhado em `packages/shared` (o front do LP-06 o consome).
- Elysia ≥1.4 aceita Standard Schema no `body:` → Zod v4 direto, sem TypeBox.

## Dependências Entre Packages

- `packages/shared`: novos exports (schema request, tipos response/erro). Sem dep nova.
- `apps/api`: sem dependência nova (rate limiter em memória, próprio). Elysia já presente.
- `apps/web`: não muda neste item (consome no LP-06).

## Gaps Identificados

- Não existe plugin de error handler nem convenção de envelope — nasce aqui (RF-06).
- Não existe extração de IP: `x-forwarded-for` (Caddy na frente em prod) com fallback `server.requestIP` (Elysia/Bun). Em `app.handle()` (testes) não há socket → IP virá do header; documentar no helper de teste.
- Rate limiter: nada pronto — implementação própria com `Map` (janela fixa por IP) + limpeza de entradas expiradas; clock injetável para teste determinístico (`testing.md`).
- `pg-container.ts` precisa de `truncateAll()` e erro amigável sem Docker (known-issue registrado no LP-01).

## Referências Externas

- Skills: `.claude/skills/elysia/SKILL.md` (rotas, plugins, error handling, Standard Schema), `zod`, `vitest`, `drizzle-postgres`.
- Rules: `api.md` (camadas, envelope, paginação n.a. aqui), `security.md` (endpoint público único, LGPD/logs), `testing.md` (integração real, determinismo), `core.md`.
- ADR-0003 (instância única → rate limit em memória aceitável), ADR-0007 (PG18/driver).
