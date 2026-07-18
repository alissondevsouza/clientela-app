---
feature: crm-auth
phase: review
status: done
reviewer: QA adversarial neutro
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, validate.md]
---

# Review: crm-auth

## Resumo

Implementação de autenticação de usuária única (login e-mail+senha, sessão DB-backed com token opaco hasheado, guard default-deny na API, guard server-side no web, seed idempotente). Revisão adversarial de todos os arquivos do escopo + execução real da suíte + verificação de runtime (API e web reais, seed sob Bun). **Nenhum achado CRÍTICO.** Veredito: **APROVADO**, com 2 ALERTAs de manutenção/cobertura e sugestões menores.

## Arquivos revisados

Todos os do escopo: `packages/shared/src/auth.ts(+test)`, `apps/api/src/db/schema/{consultants,sessions,index}.ts`, `drizzle/0001_third_trauma.sql`, `db/auth-tables.integration.test.ts`, `modules/auth/*` (errors, repository, service+test, routes, integration test), `plugins/auth-guard.ts(+test)`, `plugins/error-handler.ts`, `app.ts`, `index.ts`, `app.test.ts`, `leads.integration.test.ts`, `scripts/seed-consultant.ts`, `package.json`, `Dockerfile`, `.env.example`, `apps/web/src/lib/auth.ts(+test)`, `app/(auth)/login/{page,actions}.tsx|ts`, `components/auth/login-form.tsx`, `app/(crm)/{layout,crm/page,actions}` e `packages/shared/src/index.ts`. Suporte: `rate-limit.ts`, `client-ip.ts`, `env.ts` (web/api), `pg-container.ts`.

## Ataques tentados (e por que não colaram)

- **Bypass do guard por variação de path**: `/auth/me/`, `/auth/me?x=1`, `//auth/me`, rota inexistente — todos 401 (unidade + integração + curl real). `//auth/me` não normaliza barra inicial ⇒ não vira público (fail-closed correto). Dot-segments (`/auth/login/../me`) são resolvidos por `new URL()` antes do matching — guard e router veem o mesmo pathname.
- **Enumeração de e-mail**: 401 com body byte a byte idêntico para senha errada vs. e-mail inexistente (curl real); e-mail inexistente verifica contra hash dummy argon2id com os mesmos parâmetros (m=65536,t=2,p=1) dos hashes reais — custo de timing equivalente.
- **Sequestro por dump do banco**: `sessions` guarda só SHA-256 hex; provado por teste de integração e por SELECT direto no Postgres dev após login real.
- **Reuse pós-logout**: 401 imediato (sessão removida; guard barra o re-logout com 401, nunca 500).
- **Brute-force**: 6ª tentativa do mesmo IP em 60s ⇒ 429; bucket é por IP (outro IP não afetado); XFF usa o ÚLTIMO valor (só o do proxy confiável); sem IP resolvível a chave cai em `"unknown"` (fail-closed, não desliga o limite).
- **Vazamento em logs**: nenhum `console.*` com token/senha/PII no escopo; error-handler loga apenas requestId+code+path+nome da classe; seed loga só o id; grep nos stdout reais da sessão de QA: zero ocorrências.
- **404 como oráculo de rotas**: guard roda antes do roteamento — anônimo recebe 401 até para rota inexistente.
- **Cookie**: `httpOnly` + `sameSite=lax` + `path=/` + `maxAge` 30d; `secure` condicionado a produção (justificado: dev http). Server Actions do Next têm proteção de origin própria; API inacessível ao browser (ADR-0008).

## Achados

### CRÍTICO

Nenhum.

### ALERTA

1. **Duração da sessão duplicada entre api e web** — `apps/api/src/modules/auth/auth.service.ts:74` (`SESSION_DURATION_MS`) e `apps/web/src/lib/auth.ts:34` (`SESSION_DURATION_SECONDS`) definem "30 dias" de forma independente em dois workspaces. — Porquê: é um acordo de contrato cross-app fora de `packages/shared` (core.md: nunca duplicar contrato); se a API mudar a duração, o `maxAge` do cookie diverge silenciosamente da sessão real (falha é segura — 401/redirect — mas a UX degrada e nenhum teste pega a divergência cruzada). — Como corrigir: a `loginAction` já recebe `expiresAt` da API e o ignora; derivar `maxAge` de `expiresAt - now` (fonte única = API), ou mover a constante para `packages/shared`.
2. **Fluxo de login via browser sem cobertura executável** — o submit real do form (Server Action → `Set-Cookie` com flags → redirect) e o clique em "Sair" não têm teste nem foram exercitados em runtime (Server Action exige browser). — Porquê: login é fluxo crítico de UI (testing.md exige E2E); hoje a fé está em unidade dos helpers + curls de guard/redirect. — Como corrigir: já previsto como pendência explícita no spec (Restrições/REL-01, infra Playwright inexistente); deve constar no handoff e em known-issues — **não fingir cobertura**.

### SUGESTÃO

1. `apps/web/src/lib/auth.ts:114` — quando a validação de fronteira do helper `login` falha (caminho defensivo; RHF valida antes), a mensagem devolvida é "Verifique sua conexão…", enganosa para um erro de dado. Usar uma mensagem de dados inválidos neste branch.
2. `apps/web/src/app/(auth)/login/page.tsx:30-39` — cookie de sessão inválido/expirado permanece no browser ao renderizar o form (RSC não pode limpar cookie). Inofensivo (guards revalidam sempre), mas a `loginAction` poderia sobrescrevê-lo sempre — já o faz no sucesso; considerar `cookies().delete` no caminho de falha.
3. `apps/api/src/modules/auth/auth.routes.ts:103-121` — `/auth/me` e `/auth/logout` revalidam a sessão já validada pelo guard (2 lookups por request). Decisão consciente do plan (lookup indexado, evita estado compartilhado) — registrar como candidato a `derive`/contexto tipado quando o CRM crescer.
4. `apps/api/scripts/seed-consultant.ts:62-69` — o upsert não toca `updated_at` explicitamente (funciona hoje porque o Drizzle injeta `$onUpdate` no `onConflictDoUpdate`; comportamento verificado em runtime, mas implícito — vale um `set: { updatedAt: … }` explícito ou um comentário).

## Conformidade com rules

- **api.md**: camadas routes→service→repository respeitadas; service não importa Elysia; repository sem regra de negócio; DI por factory no composition root; envelope `{error:{code,message}}` central; Zod (schema compartilhado) na fronteira; rotas autenticadas por padrão com allowlist explícita. ✅ (paginação: n.a., sem listagem nova)
- **database.md**: migração versionada aditiva; uuid v7 default no banco; timestamptz; NOT NULL; FK com índice explícito (`sessions_consultant_id_idx` — provado por query em `pg_indexes`); join único sem N+1; e-mail/token_hash únicos. ✅ (transação: n.a., operações de auth são single-statement)
- **core.md**: sem `any`/`as` de silenciamento/`!`; named exports; constantes nomeadas; erros de domínio como classes mapeadas na fronteira; early returns. ✅
- **web.md**: `/login` e `/crm` são RSC com client component só na folha (form); Server Actions para mutação; browser nunca fala com a API; mobile-first (`max-w-sm`, `min-h-dvh`, botão h-11 full-width); labels + `aria-invalid`/`aria-describedby`/`role="alert"`; estados loading ("Entrando...") e erro pt-BR; schema de `packages/shared` no RHF. ✅
- **security.md**: senha argon2id (`Bun.password`); token ≥256 bits CSPRNG, só hash no banco; cookie httpOnly/secure(prod)/lax; anti-enumeração; rate limit por IP; sem segredo em código; env validada no boot com nomes-somente em erro; sem PII em log. ✅
- **testing.md**: fakes explícitos (sem mock de Drizzle), clock injetado, integração com Postgres real + migrações reais, testes derivados do spec, edge cases (expiração exata `<=`, idempotência de logout, limpeza que preserva sessão válida e de outra consultora, body `{}`). ✅ — ressalva honesta e documentada: hasher de produção não roda sob Vitest/Node; coberto pelo seed+login reais sob Bun nesta QA.
- **ADR-0006**: nenhum git de escrita executado. **ADR-0008**: API atrás do web; XFF repassado pela action. ✅

## Critérios de aceite (spec.md) — um a um

| Critério | Status | Evidência |
|---|---|---|
| RF-01 migração + integração de tabelas | ✅ | `0001_third_trauma.sql`; `auth-tables.integration.test.ts` (17 casos: defaults, NOT NULL, UNIQUE email/token_hash, FK, cascade, índice da FK) |
| RF-02 seed idempotente, argon2id, Dockerfile | ✅ | Runtime: 2 execuções ⇒ 1 linha/mesmo id; hash `$argon2id$`; login com a senha do seed 200; `COPY apps/api/scripts` presente no stage runtime |
| RF-03 login 200/401 idêntico/422 pt-BR/429 | ✅ | Integração (`auth.integration.test.ts`) + curls reais (validate.md) |
| RF-04 guard default-deny + variantes de path + públicos | ✅ | Unidade (matching) + integração + curls; rota inexistente ⇒ 401 (não vaza existência) |
| RF-05 me sem password_hash; logout invalida | ✅ | Integração (shape exato `{email,id,name}`) + curls (reuse ⇒ 401) |
| RF-06 expiração fixa com clock injetado + limpeza oportunista | ✅ | `auth.service.test.ts` (dentro do prazo, expirada, instante exato, limpeza só da própria consultora) + integração |
| RF-07 token não armazenado em claro | ✅ | Integração (armazenado = SHA-256 do token) + SELECT real no Postgres dev |
| RF-08 XFF repassado + atributos do cookie + erro pt-BR no form | ✅* | Unidade de `login` (XFF presente/omitido) e `buildSessionCookieOptions`; *wiring do submit real = pendência E2E (ALERTA 2, prevista no spec) |
| RF-09 guard do layout + logout + /login autenticado redireciona | ✅* | Unidade de `fetchSession`/`logout` + runtime: /crm sem cookie ⇒ 307 /login; cookie forjado ⇒ 307 /login; válido ⇒ 200; /login com sessão ⇒ 307 /crm; *clique de logout = pendência E2E |
| RF-10 schemas pt-BR incl. campo ausente | ✅ | `packages/shared/src/auth.test.ts` (`{}`, campo ausente, sem mensagens em inglês) |
| RF-11 sem senha/token/PII em logs | ✅ | Revisão do escopo (nenhum `console.*` com dado sensível) + grep nos logs reais da QA: zero ocorrências |

## Veredito

**APROVADO.** Lint/typecheck limpos, 177/177 testes verdes (incl. integração com Postgres real), build web ok, todos os critérios de aceite atendidos (RF-08/RF-09 com a pendência E2E já prevista e declarada no spec), nenhum achado CRÍTICO. Os 2 ALERTAs não bloqueiam: (1) é risco de manutenção com falha segura; (2) é pendência explícita de infra a registrar no handoff/known-issues (REL-01).
