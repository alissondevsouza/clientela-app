---
feature: crm-auth
module: api, web, shared
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: crm-auth

> Fonte: subagente read-only (2026-07-17). Caminhos verificados no working tree.

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/index.ts` | Composition root: `env → createDb → repository → service → rateLimiter → createApp` — auth entra aqui (repo/service/guard injetados) |
| `apps/api/src/app.ts` | `createApp({ leadsService, rateLimiter })` monta `errorHandler` → `GET /health` → rotas leads; ganhará deps de auth |
| `apps/api/src/modules/leads/*` | Padrão canônico de módulo: factories `create*` (routes/service/repository), portas mínimas no service, tipo `ReturnType<typeof create*>` |
| `apps/api/src/plugins/rate-limit.ts` | `createRateLimiter({ max, windowMs, clock })` — reutilizável para o login com limites próprios |
| `apps/api/src/modules/leads/leads.routes.ts` | Guard `onRequest` com match/normalização de path (`matchesLeadsPath`) e `resolveClientIp` — modelo do auth-guard |
| `apps/api/src/plugins/error-handler.ts` | `onError` global mapeando `VALIDATION`→422, `PARSE`→400, `NOT_FOUND`→404, catch-all→500; **sem 401** — precisa de branch para erros de domínio de auth |
| `apps/api/src/db/schema/leads.ts` | Convenções de tabela: uuid v7 default no banco, `timestamptz`, CHECK via `sql.raw`, `$onUpdate` no `updatedAt`, tipos `$inferSelect/$inferInsert` |
| `apps/api/src/db/client.ts` | `createDb(url)` → `{ db, sql }`; `type Database` |
| `apps/api/src/env.ts` | `loadEnv` com Zod; falha lista só NOMES de chaves |
| `apps/api/test/helpers/pg-container.ts` | `startPgContainer(): { db, sql, truncateAll, stop }` — sobe `postgres:18-alpine`, aplica migrações reais |
| `apps/api/src/modules/leads/leads.integration.test.ts` | Padrão de teste de integração: `app.handle(new Request(...))`, casos 201/422/429/500, asserts com `apiErrorSchema` |
| `packages/shared/src/api.ts` | `apiErrorSchema` — envelope de erro único web+api |
| `packages/shared/src/leads.ts`, `lead-form.ts` | Padrão de contrato: schema de request + variante RHF + tipos input/output, mensagens pt-BR |
| `apps/web/src/app/(landing)/actions.ts` + `lib/submit-lead.ts` | Padrão de Server Action fina + helper puro com deps injetadas (`fetchImpl`, `apiUrl`); repasse de `x-forwarded-for` |
| `apps/web/src/lib/env.ts` | `loadWebEnv` (Zod): `API_URL`, `SITE_URL`, `WHATSAPP_*` — sem `NEXT_PUBLIC_*` |
| `apps/web/src/components/ui/` | shadcn instalados: button, card, checkbox, input, label, textarea; RHF + `@hookform/resolvers` presentes |

## Padrões do Codebase a Seguir

- Factories com deps por objeto; sem singleton; `clock`/`generateId` injetados (determinismo em teste).
- Guard por `onRequest` (roda antes de parse/validação e do roteamento) com normalização de path — lessons Elysia 2026-07-17.
- Fronteira valida com schema de `packages/shared`; erros de domínio como classes nomeadas mapeadas no error-handler central.
- Testes: unidade com fakes em memória; integração com `startPgContainer()` + `app.handle(new Request(...))`; `afterEach` → `truncateAll()`.
- Web: Server Action wrapper fino + helper puro testável em `lib/`.

## Schemas e Tipos Relevantes

- Existentes: `leads` (única tabela; migração `0000_new_gideon`), `apiErrorSchema`, `leadCaptureRequestSchema`.
- A criar: `consultants`, `sessions` (Drizzle); `loginRequestSchema`, `loginResponseSchema`, `authConsultantSchema` (shared).

## Dependências Entre Packages

`packages/shared` (contratos) ← `apps/api` (validação de fronteira + persistência) e ← `apps/web` (RHF + Server Actions). Web fala com a API só server-side (`API_URL`), repassando o token de sessão via header.

## Gaps Identificados

- Sem tabelas `consultants`/`sessions`; sem mecanismo de sessão; sem cookie handling em lugar nenhum.
- Sem guard de autenticação (API) e sem grupo `(crm)`/página de login/middleware (web).
- Error-handler não mapeia 401; sem dependência de hashing (usar `Bun.password`, nativo).
- Sem env de auth (não será necessária: duração de sessão é constante; seed usa env próprias no momento da execução).
- shadcn: componentes suficientes para o form de login (input, label, button, card); sem dir `hooks/`.

## Referências Externas

- `project-memory/decisions/0008` (API interna; confiança no XFF), `0007` (postgres.js/uuidv7), `0006` (git humano).
- Rules: `security.md` (Bun.password argon2id, cookie flags, exceções públicas listadas), `api.md`, `web.md`, `database.md`, `testing.md`.
- Lessons 2026-07-17: lifecycle Elysia (`onRequest` vs `beforeHandle`), Zod v4 campo ausente, zodResolver strip de chaves.
- Skills: `elysia`, `drizzle-postgres`, `zod`, `react`, `shadcn-ui`, `vitest`.
