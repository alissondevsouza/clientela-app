# ADR-0012 — Autenticação do CRM: sessão própria DB-backed com token opaco

- **Status**: Aceito
- **Data**: 2026-07-17

## Contexto

O CRM (Fase 2) exige área autenticada para usuária única (CRM-01). A estratégia estava em aberto em `02-architecture.md` ("sessão própria, Better Auth, etc."). Restrições relevantes: `security.md` (rotas autenticadas por padrão, `Bun.password` argon2id, cookie httpOnly/secure/sameSite), `core.md` (nenhuma dependência nova sem justificativa) e ADR-0008 (API sem exposição pública — o browser nunca fala com ela; todo consumo é via Server Actions do web na rede interna).

## Decisão

1. **Sessão própria persistida em banco** (tabela `sessions`), sem biblioteca de auth (Better Auth/Lucia) e sem JWT. Token **opaco** de 32 bytes (`crypto.getRandomValues`, base64url); o banco armazena **apenas o SHA-256** do token (`token_hash` único) — dump do banco não permite sequestro de sessão. Senha da consultora com `Bun.password` (argon2id) em `consultants.password_hash`.
2. **Expiração fixa de 30 dias** (`SESSION_DURATION_MS`), sem renovação deslizante: RSC do Next não pode setar cookie, então renovação no banco nunca chegaria ao browser — expiração fixa mantém cookie e sessão coerentes; re-login mensal é aceitável. Login faz limpeza oportunista das sessões expiradas da consultora.
3. **Transporte em duas pernas** (ADR-0008): o cookie `clientela_session` (httpOnly, `secure` em produção, `sameSite=lax`, `path=/`, maxAge = duração da sessão) existe **só no web**; as Server Actions/RSC repassam o token à API via `Authorization: Bearer`. A API é agnóstica de cookie.
4. **Guard default-deny na API**: plugin `onRequest` fail-closed (`createAuthGuard`) com allowlist pública explícita — `GET /health`, `POST /leads`, `POST /auth/login` — e normalização de path (anti trailing-slash). Rota inexistente sem token responde 401 (não vaza existência). `POST /auth/login` tem rate limit próprio (5/min por IP, XFF repassado pelo web) e resposta 401 **idêntica** para e-mail inexistente e senha errada (verify contra hash dummy — anti-enumeração/timing).
5. **Guard do web server-side** no layout do grupo `(crm)`: valida a sessão real na API (`GET /auth/me`) e redireciona para `/login`; sem `middleware.ts` (otimista/bypassável — não é guard de verdade).
6. **Seed da usuária única** via script idempotente (`apps/api/scripts/seed-consultant.ts`, upsert por e-mail, env `SEED_CONSULTANT_*` só no momento da execução); o stage runtime da imagem da API copia `scripts/` para o seed rodar na VPS via `docker compose run`.

## Alternativas consideradas

- **Better Auth / Lucia** — descartadas: dependência nova relevante para um requisito pequeno (1 usuária, login+sessão); a superfície própria é auditável e testável com as portas já padrão do projeto.
- **JWT stateless** — descartado: sem revogação imediata (logout real exige denylist ≈ voltar ao estado em banco); expiração embutida complica o modelo simples de sessão única.
- **Renovação deslizante** — descartada nesta fase (ver item 2). Se a UX exigir, renovar cookie em Server Action é o caminho.

## Consequências

- Logout é revogação imediata (delete da sessão). Trocar/invalidar tudo = truncar `sessions`.
- `security.md` atualizado: exceções públicas agora incluem `POST /auth/login`.
- A duração da sessão está expressa em constantes em `apps/api` (fonte da verdade) e `apps/web` (maxAge do cookie) — divergência é fail-safe mas silenciosa; registrado em `known-issues.md`.
- Fluxo de login sem E2E até o REL-01 (known-issue existente, agora incluindo login).
- `Bun.password` não roda sob Vitest (workers Node): testes usam a porta `hasher` com KDF real do Node; argon2id é provado por seed/runtime (lesson registrada).
