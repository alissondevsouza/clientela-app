---
feature: crm-auth
module: api, web, shared
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: crm-auth

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| **Sessão própria DB-backed com token opaco** (sem Better Auth/Lucia/JWT) — vira ADR na graduação | Usuária única; zero dependências novas (`core.md`); `Bun.password` (argon2id) é nativo; sessão em banco permite revogação imediata (logout real) — JWT stateless não permite; resolve a "decisão em aberto" de `02-architecture.md` |
| Token: 32 bytes de `crypto.getRandomValues` em base64url; banco guarda **SHA-256 hex** do token | RF-07; dump do banco não permite sequestrar sessão; SHA-256 basta para token de alta entropia (argon2 é para senha de baixa entropia) |
| Transporte web→API: `Authorization: Bearer <token>`; cookie existe **só no web** | ADR-0008 — browser nunca fala com a API; API fica agnóstica de cookie |
| Guard da API: plugin `onRequest` **fail-closed** com allowlist pública explícita (`GET /health`, `POST /leads`, `POST /auth/login`) e normalização de path | Default-deny (`security.md`); lessons Elysia: `beforeHandle` roda após validação (vazaria 422 a anônimos) e path cru precisa de normalização (trailing slash) |
| Handlers que precisam da identidade (`/auth/me`, `/auth/logout`) revalidam a sessão via service no handler | `onRequest` roda antes do roteamento e não popula contexto tipado; segunda lookup é indexada e barata; evita estado mutável compartilhado |
| Sessão: `SESSION_DURATION_MS` = 30 dias **fixos**, sem renovação deslizante; login remove sessões expiradas da consultora (limpeza oportunista) | Revisão de spec (rodada 1): RSC do Next não pode setar cookie — a renovação no banco nunca chegaria ao browser; expiração fixa mantém cookie e sessão coerentes; re-login mensal é aceitável para usuária única |
| Server Action de login repassa o IP do cliente via `x-forwarded-for` (último valor do XFF, reutilizando o padrão de `extractClientIp` do LP-06) | Sem o repasse, todos os logins compartilham o IP do container web — o rate limit "por IP" viraria bucket único (DoS da própria consultora) |
| Seed em produção: stage runtime do `apps/api/Dockerfile` ganha `COPY apps/api/scripts ./apps/api/scripts`; execução via `docker compose run --rm api bun scripts/seed-consultant.ts` | Deps do seed (drizzle, postgres, Bun.password) já são deps de produção da API; sem isso o login não funciona na VPS (revisão de spec, rodada 1) |
| Prefixo `__Host-` no cookie: **rejeitado** | Exigiria nome condicional por ambiente; ganho marginal com domínio único e sem subdomínios servindo app |
| Login com rate limit próprio: `createRateLimiter` reutilizado com `LOGIN_RATE_LIMIT_MAX = 5`/min por IP | Anti brute-force; instância separada da de leads (janelas independentes) |
| Resposta 401 idêntica para e-mail inexistente e senha errada; quando e-mail não existe, verificar contra hash dummy | Anti-enumeração + reduz oráculo de timing; custo trivial |
| Erros de domínio: `InvalidCredentialsError` e `UnauthorizedError` em `modules/auth/auth.errors.ts`, mapeados no error-handler central → 401 | Padrão `core.md`/`api.md` (classe nomeada na camada de negócio, HTTP na fronteira) |
| Seed: script `apps/api/scripts/seed-consultant.ts` (upsert por e-mail) lendo `SEED_CONSULTANT_{NAME,EMAIL,PASSWORD,WHATSAPP}` do ambiente da execução | Fora do boot (ADR-0008: boot não faz DDL/side-effects); idempotente; senha não fica em arquivo nem em log |
| Cookie `clientela_session`: `httpOnly`, `secure` só em produção, `sameSite=lax`, `path=/`, `maxAge` = duração da sessão | `security.md`; `secure` em dev quebraria http://localhost; `lax` protege CSRF cross-site e mantém navegação normal |
| Guard do web: server-side no layout `(crm)` chamando `GET /auth/me` (sessão real), `redirect('/login')` se inválida; sem `middleware.ts` | Middleware Next é bypassável e otimista — o guard de verdade valida a sessão no servidor; middleware fica fora de escopo (spec) |
| Rotas web: `/login` no grupo `(auth)`; placeholder protegido em `/crm` no grupo `(crm)` | Grupo `(crm)` é o contrato do roadmap; `/login` fora do grupo protegido |
| Sem variável de env nova em `env.ts`/`lib/env.ts` | Duração de sessão é constante nomeada; `API_URL` já existe no web; seed usa env próprias no momento da execução |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/auth.ts` | `loginRequestSchema` (email+senha, pt-BR incl. campo ausente), `authConsultantSchema`, `loginResponseSchema`, tipos |
| `packages/shared/src/auth.test.ts` | Unidade dos schemas (válido, inválido, `{}` ausente → pt-BR) |
| `apps/api/src/db/schema/consultants.ts` | Tabela `consultants` (name, email unique, password_hash, whatsapp) |
| `apps/api/src/db/schema/sessions.ts` | Tabela `sessions` (consultant_id FK + índice, token_hash unique, expires_at) |
| `apps/api/drizzle/0001_*.sql` | Migração gerada via `drizzle-kit generate` |
| `apps/api/src/db/auth-tables.integration.test.ts` | Integração: colunas, unicidades, FK/índice, defaults |
| `apps/api/src/modules/auth/auth.errors.ts` | `InvalidCredentialsError`, `UnauthorizedError` |
| `apps/api/src/modules/auth/auth.repository.ts` | `createAuthRepository(db)`: consultora por e-mail, CRUD de sessão por token_hash |
| `apps/api/src/modules/auth/auth.service.ts` | `createAuthService({ repository, clock, hasher, tokenGenerator })`: `login`, `validateSession` (com renovação deslizante), `logout` |
| `apps/api/src/modules/auth/auth.service.test.ts` | Unidade com fakes + clock injetado (happy, credenciais erradas, expiração, renovação, logout) |
| `apps/api/src/modules/auth/auth.routes.ts` | `POST /auth/login` (rate limit próprio), `GET /auth/me`, `POST /auth/logout` |
| `apps/api/src/plugins/auth-guard.ts` | `createAuthGuard({ authService, publicRoutes })` — `onRequest` fail-closed com normalização |
| `apps/api/src/plugins/auth-guard.test.ts` | Unidade do matching de allowlist (trailing slash, query, método) |
| `apps/api/src/modules/auth/auth.integration.test.ts` | Integração: login 200/401/422/429, guard 401, me, logout, token não-claro no banco |
| `apps/api/scripts/seed-consultant.ts` | Seed idempotente da usuária única |
| `apps/web/src/lib/auth.ts` | Helpers puros com deps injetadas: `login` (com repasse de `clientIp` via XFF), `fetchSession`, `logout` + constantes do cookie |
| `apps/web/src/lib/auth.test.ts` | Unidade dos helpers (chamadas, mapeamento de erro, atributos de cookie) |
| `apps/web/src/app/(auth)/login/page.tsx` | Página de login (RSC + form client) |
| `apps/web/src/components/auth/login-form.tsx` | Form RHF + `loginRequestSchema`, estados loading/erro pt-BR |
| `apps/web/src/app/(auth)/login/actions.ts` | Server Action de login: chama API, seta cookie, redirect `/crm` |
| `apps/web/src/app/(crm)/layout.tsx` | Guard server-side (`GET /auth/me` via helper) + redirect |
| `apps/web/src/app/(crm)/crm/page.tsx` | Placeholder protegido ("CRM em construção") + botão logout |
| `apps/web/src/app/(crm)/actions.ts` | Server Action de logout |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Reexportar `./auth` |
| `apps/api/src/db/schema/index.ts` | Reexportar consultants + sessions |
| `apps/api/src/plugins/error-handler.ts` | Mapear `InvalidCredentialsError`/`UnauthorizedError` → 401 (envelope padrão) |
| `apps/api/src/app.ts` | Compor `authGuard` (antes das rotas) + rotas de auth; `AppDeps` ganha `authService` + `loginRateLimiter` |
| `apps/api/src/index.ts` | Instanciar auth repository/service/rate limiter e injetar |
| `apps/api/package.json` | Script `seed:consultant` |
| `apps/api/src/modules/leads/leads.integration.test.ts` | Ajustar montagem do app (novas deps obrigatórias em `createApp`) |
| `apps/api/src/app.test.ts` | Idem |
| `.env.example` (raiz) | Documentar (comentado) as `SEED_CONSULTANT_*` usadas pelo seed |
| `apps/api/Dockerfile` | Stage runtime: `COPY apps/api/scripts` (seed executável em produção) |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | Regra de negócio nova: login, validação/expiração/renovação de sessão, matching do guard, schemas shared, helpers do web |
| Integração (Testcontainers) | **Sim** | Muda schema (2 tabelas), contrato da API (rotas novas + guard global) e invariante de segurança (default-deny) |
| E2E | **Pendência (sem infra)** | Login é fluxo crítico de UI; registrar no handoff e em known-issues (REL-01 cobre) |
| Regressão (BUG-NNN) | n.a. | Não é bug |

Testes derivam do `spec.md` (critérios de aceite), nunca do diff.

## Migração de Banco

Aditiva (2 tabelas novas via `drizzle-kit generate`) — sem dados pré-existentes, sem backfill, rollback = drop das tabelas. Convenções `database.md` (uuid v7 default no banco, timestamptz, FK com índice explícito, NOT NULL).

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Guard global quebrar rotas públicas existentes (leads/health) | média | Allowlist testada por integração (critério RF-04) + testes existentes de leads continuam verdes |
| `createApp` com deps novas quebrar testes existentes que o montam | alta | Tasks incluem ajuste dos testes existentes; checkpoint por milestone |
| Expiração com clock real → teste flaky | média | `clock` injetado em service e repository (padrão do projeto); `vi.useFakeTimers` onde preciso |
| Cookie `secure` em dev http quebrar login local | média | `secure` condicionado a produção; verificação de runtime na QA |
| Bypass do guard por variação de path | baixa | Normalização + testes adversariais (trailing slash/query/método) — lesson Elysia |

## Definition of Done

- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos workspaces afetados
- [ ] `bun run test` (unidade + integração Testcontainers) verde
- [ ] Build dos apps afetados ok
- [ ] Conformidade com `.claude/rules/*` e ADRs (0006, 0007, 0008)
