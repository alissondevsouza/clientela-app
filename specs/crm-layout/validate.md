---
feature: crm-layout
module: web
phase: validate
status: done
created: 2026-07-17
updated: 2026-07-17
---

# Validate: crm-layout (QA rodada 1 — implement-verifier)

Revisor neutro (não implementou o código). Ambiente: working tree da branch `feature/phase-1-landing-page`, Postgres dev `clientela_pg_dev` (porta 5433, já migrado), consultora de QA semeada via seed real e **removida ao final**.

## Ferramentas (raiz do monorepo)

| Comando | Status | Saída relevante |
|---|---|---|
| `bun run lint` | ✅ ok | Biome: `Checked 119 files. No fixes applied.` |
| `bun run typecheck` | ✅ ok | shared/web/api: `Exited with code 0` |
| `bun run test` | ✅ ok | `Test Files 22 passed (22) · Tests 189 passed (189)` |
| `bun run --filter '@clientela/web' build` | ✅ ok | 12 páginas; `/crm`, `/crm/{clients,leads,products,sales}` dinâmicas (ƒ) |

## QA de runtime (checklist do plan.md, item a item)

Setup: seed `bun scripts/seed-consultant.ts` (e-mail de QA descartável) → API `bun run src/index.ts` (:3001) → web `next start` (:3000, build de produção).

**1. 200 autenticado / 307 sem cookie — ✅**

```
/crm            auth=200  nocookie=307 → /login
/crm/clients    auth=200  nocookie=307 → /login
/crm/leads      auth=200  nocookie=307 → /login
/crm/products   auth=200  nocookie=307 → /login
/crm/sales      auth=200  nocookie=307 → /login
```

`<h1>` por rota: Início / Clientes / Leads / Produtos / Vendas; texto "Esta seção chega nas próximas entregas da Fase 2." presente nas 4 seções placeholder (ausente na home, como esperado).

**2. Robots noindex herdado — ✅** `<meta name="robots" content="noindex"/>` nas 5 respostas; grep no código: `robots` só em `(crm)/layout.tsx` (nenhuma page do grupo redefine; `(auth)/login/page.tsx` está fora do grupo e fora do escopo).

**3. A11y no HTML renderizado — ✅** `<nav aria-label="Navegação do CRM">` (2 por página: mobile + desktop); `aria-current="page"` exatamente no item da rota corrente em cada uma das 5 rotas (ambas as variantes); todos os 5 links com `<span>` de texto visível nas duas navs; ícones `aria-hidden="true"`.

**4. Classes responsivas e alvos — ✅** Barra inferior: `fixed inset-x-0 bottom-0 z-50 … pb-[env(safe-area-inset-bottom)] md:hidden`; nav do header: `hidden md:flex`; 5 links mobile com `min-h-11` (44px). `display:none` em ≥ md tira a barra do tab order.

**5. "Sair" em todas as rotas + logout — ✅** Botão "Sair" (form com Server Action + `$ACTION_ID` hidden — funciona sem JS) presente nas 5 rotas. POST no-JS do form de logout a partir de `/crm/sales` → `303 See Other`, `Location: /login`, `Set-Cookie: clientela_session=; Expires=…1970` (cookie limpo). Token reutilizado após logout → `307 /login` (sessão invalidada na API, não só o cookie).

**6. RF-08 fim-a-fim — ✅** Login real via Server Action (`Next-Action` + credenciais de QA):

```
HTTP/1.1 303 See Other
Set-Cookie: clientela_session=…; Path=/; Expires=Sun, 16 Aug 2026 23:29:25 GMT;
            Max-Age=2591999; Secure; HttpOnly; SameSite=lax
x-action-redirect: /crm;push
```

`Max-Age=2591999` = floor dos segundos até o `expiresAt` da API (~30 dias − ms decorridos) ✓. `Secure` presente porque `next start` roda com `NODE_ENV=production` (comportamento esperado de `buildSessionCookieOptions`). Grep `SESSION_DURATION` em `apps/web/src`: vazio ✓ (única fonte da duração é a API).

## Teardown

Servidores web e API derrubados (SIGTERM, confirmado); consultora de QA e suas sessões deletadas do banco (`remaining = 0`). Container Postgres dev mantido (já estava rodando antes da QA).

## Pendências

- E2E (Playwright) inexistente no projeto — navegação coberta por esta QA de runtime manual (pendência já registrada, REL-01).
- Atualizar `project-memory/known-issues.md` (entrada "Duração da sessão duplicada") na fase de graduação — a causa está resolvida no código.
