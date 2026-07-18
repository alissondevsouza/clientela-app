---
feature: crm-layout
module: web
phase: review
status: done
verdict: aprovado
created: 2026-07-17
updated: 2026-07-17
---

# Review: crm-layout (QA rodada 1 — implement-verifier)

## Resumo

Shell autenticado do grupo `(crm)` com header (marca, saudação, "Sair"), navegação mobile-first em duas variantes a partir de config única, 4 placeholders, robots noindex centralizado no layout e RF-08 (maxAge do cookie derivado do `expiresAt` da API). Implementação correta, enxuta e conforme as rules; ferramentas verdes e checklist de runtime 6/6. Nenhum CRÍTICO. **Veredito: APROVADO** (2 ALERTAs não-bloqueantes + sugestões).

## Arquivos revisados

- `apps/web/src/components/crm/nav-items.ts` + `nav-items.test.ts`
- `apps/web/src/components/crm/crm-nav.tsx` · `crm-header.tsx`
- `apps/web/src/app/(crm)/layout.tsx` · `(crm)/crm/page.tsx` · `(crm)/crm/coming-soon.ts`
- `apps/web/src/app/(crm)/crm/{clients,leads,products,sales}/page.tsx`
- `apps/web/src/lib/auth.ts` + `auth.test.ts` · `apps/web/src/app/(auth)/login/actions.ts`
- Regressão conferida (sem mudança indevida): `apps/web/src/app/(crm)/actions.ts` (logout)

## Achados

### CRÍTICO

Nenhum.

### ALERTA

1. **`apps/web/src/components/crm/crm-header.tsx:30` — nome da consultora invisível no mobile.** O `<span>` da saudação usa `hidden sm:inline`: em ~375px (o dispositivo primário, `web.md` mobile-first) o nome fica `display:none`. RF-01 pede o nome no header; ele está no DOM mas não é visível justamente no viewport principal, e o tradeoff não está no Decisions Log. Como corrigir: registrar a decisão (espaço no header de 375px com marca + Sair) ou exibir versão curta (primeiro nome truncado) no mobile. Não bloqueia: identidade única da usuária, funcionalidade intacta.
2. **`project-memory/known-issues.md:39` — entrada "Duração da sessão duplicada" ainda aberta.** O código resolve o known-issue (RF-08 verificado fim-a-fim), mas a entrada não foi atualizada. O spec (RF-08) prevê a atualização "na graduação" — deixar de fazê-la perde o rastro. Como corrigir: na fase graduate, marcar a entrada como resolvida referenciando `specs/crm-layout`.

### SUGESTÃO

1. **`apps/web/src/components/crm/crm-nav.tsx:22,55` — `list-none` sem `role="list"`.** VoiceOver/Safari remove a semântica de lista quando `list-style: none`; adicionar `role="list"` nos `<ul>` preserva o anúncio de "lista, 5 itens".
2. **`apps/web/src/components/crm/crm-header.tsx:34` — "Sair" com `size="sm"` (h-7 ≈ 28px) no header mobile.** Passa o mínimo AA (24px, WCAG 2.5.8), mas fica bem abaixo dos 44px adotados na barra de navegação; considerar `size` maior ou padding extra no mobile.

## Cobertura de testes

- `nav-items.test.ts` (8 testes) deriva do spec (RF-03): match exato `/crm`, sub-rota `/crm/clients/123`, irmãs não colidem, trailing slash (ambos), prefixo parcial `/crm/clientsfoo` — edge cases adequados.
- `auth.test.ts` cobre RF-08: 30 dias futuros → segundos exatos, floor de fração, passado → 0, não-parseável → 0 (fail-safe, `now` injetado — determinístico, `testing.md`); `buildSessionCookieOptions` com/sem produção; suíte de login/fetchSession/logout do CRM-01 preservada (fakes explícitos, sem `vi.mock`).
- Integração/E2E: dispensa justificada no plan (sem mudança de schema/contrato/invariante; E2E sem infra — pendência registrada). Markup coberto por QA de runtime (validate.md).

## Conformidade (critério a critério)

| Critério | Status | Evidência |
|---|---|---|
| RF-01 header (marca, nome, Sair sem JS; sem fetch extra) | ✅ (c/ ALERTA 1) | `crm-header.tsx` via prop do guard; logout no-JS validado (303 → /login); nenhum `/auth/me` além do guard |
| RF-02 nav 5 destinos, barra fixa mobile ≥44px, inline ≥ md | ✅ | `min-h-11` nos 5 links; `md:hidden` / `hidden md:flex` no HTML renderizado |
| RF-03 ativação (exato /crm, prefixo, irmãs) como função pura | ✅ | `isNavItemActive` + 8 testes; `aria-current` correto nas 5 rotas em runtime |
| RF-04 placeholders 200 com conteúdo certo | ✅ | 5×200 com h1/título/texto corretos (validate.md item 1) |
| RF-05 robots noindex uma vez no layout | ✅ | meta presente nas 5 rotas; grep: nenhuma page do grupo redefine |
| RF-06 a11y (nav aria-label, aria-current, texto visível) | ✅ | Inspeção do HTML (validate.md item 3); teclado: links/botão nativos, barra fora do tab order em ≥ md |
| RF-07 "use client" só na nav | ✅ | grep: única ocorrência em `crm-nav.tsx`; layout/header/pages RSC |
| RF-08 maxAge derivado, sem constante no web, fail-safe | ✅ | Unidade + fim-a-fim (`Max-Age=2591999` ≈ expiresAt); grep `SESSION_DURATION` vazio; known-issue → graduação (ALERTA 2) |

Rules: `core.md` (named exports, sem any/as/`!`, constantes nomeadas, early return) ✅ · `web.md` (server-first, mobile-first, pt-BR, shadcn) ✅ · `security.md` (cookie httpOnly/secure/sameSite, guard por padrão, sem PII/token em log) ✅ · `testing.md` (fakes, comportamento, determinismo) ✅ · ADR-0006 (nenhum git de escrita) ✅ · ADR-0008/0012 (browser não fala com a API; sessão opaca server-side) ✅ · dependências: nenhuma nova (lucide-react já presente) ✅.

## Veredito

**APROVADO** — lint/typecheck/test/build verdes, checklist de runtime 6/6, critérios RF-01..RF-08 atendidos, nenhum CRÍTICO. ALERTAs 1–2 ficam a critério do humano/graduação (não bloqueiam).
