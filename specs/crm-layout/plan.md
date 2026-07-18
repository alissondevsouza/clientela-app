---
feature: crm-layout
module: web
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: crm-layout

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Rotas com segmentos em inglês (`/crm/clients`, `/crm/leads`, `/crm/products`, `/crm/sales`) | Pastas de rota são nomes de arquivo — regra "código e arquivos em inglês"; URL do CRM é interna (usuária única) |
| Navegação declarada em config única (`components/crm/nav-items.ts`): `{ href, label, icon }[]` + função pura `isNavItemActive(pathname, href)` | Fonte única para mobile e desktop; lógica de ativação testável sem DOM (limitação sem RTL) |
| Ativação: `/crm` só em match exato; demais por `pathname === href \|\| pathname.startsWith(href + "/")` | Evita "Início" sempre ativo e evita colisão entre seções irmãs |
| Barra inferior mobile: `fixed bottom-0` + `pb-[env(safe-area-inset-bottom)]`; conteúdo com `pb-` compensatório; ≥ md: `hidden` e navegação inline no header | Mobile-first (`web.md`); safe area de iPhone; sem duplicar itens (mesma config) |
| Header do shell é RSC renderizado pelo layout com `session.consultant.name`; só `CrmNav` (usePathname) é client | RF-07; guard já tem a consultora — zero fetch novo |
| `robots: { index: false }` movido para `metadata` do layout `(crm)`; pages mantêm apenas `title` | RF-05; herança de metadata do App Router |
| Ícones lucide-react (Home, Users, UserPlus, Package, ShoppingBag) | Já é a iconLibrary do projeto — sem dependência nova |
| Placeholders das 4 seções como RSC estáticos mínimos com constante compartilhada de texto "em breve" | Conteúdo real vem nos CRM-03..06; evita retrabalho |
| Known-issue da duração duplicada resolvido derivando `maxAge` do `expiresAt` da API: função pura `sessionCookieMaxAgeSeconds(expiresAt: string, now: Date): number` (floor, mínimo 0) + `buildSessionCookieOptions({ isProduction, maxAgeSeconds })` (objeto nomeado); `SESSION_DURATION_SECONDS` removida do web; `loginAction` vira wrapper fino passando `now` real | Revisão de spec (rodadas 1–2): plano do known-issue apontava "resolver no CRM-02"; `now` injetado mantém os testes determinísticos (testing.md); objeto nomeado evita inversão de posicionais |
| Safe-area: aceitar fallback `env() = 0` sem `viewport-fit=cover` nesta fase | Fail-safe (barra apenas um pouco mais baixa em iPhone com notch); adicionar `viewport-fit` exigiria mexer no layout raiz compartilhado com a landing — fora de escopo |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `apps/web/src/components/crm/nav-items.ts` | Config dos 5 destinos + `isNavItemActive` (puro) |
| `apps/web/src/components/crm/nav-items.test.ts` | Unidade da ativação (exato, sub-rota, irmãs, raiz) |
| `apps/web/src/components/crm/crm-nav.tsx` | Client Component: nav mobile (barra fixa) + desktop (inline), `aria-current`, `cn()` |
| `apps/web/src/components/crm/crm-header.tsx` | RSC: marca, nome da consultora, "Sair" (`logoutAction`), slot da nav desktop |
| `apps/web/src/app/(crm)/crm/clients/page.tsx` | Placeholder Clientes |
| `apps/web/src/app/(crm)/crm/leads/page.tsx` | Placeholder Leads |
| `apps/web/src/app/(crm)/crm/products/page.tsx` | Placeholder Produtos |
| `apps/web/src/app/(crm)/crm/sales/page.tsx` | Placeholder Vendas |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/app/(crm)/layout.tsx` | Renderizar shell (header + nav + main com padding p/ barra inferior); passar `consultant.name`; adicionar `metadata` com `robots noindex` |
| `apps/web/src/app/(crm)/crm/page.tsx` | Virar home "Início" (remover robots duplicado e o form de logout — que migra pro header); manter placeholder do dashboard |
| `apps/web/src/lib/auth.ts` | RF-08: `buildSessionCookieOptions(isProduction, maxAgeSeconds)`; remover `SESSION_DURATION_SECONDS` |
| `apps/web/src/lib/auth.test.ts` | RF-08: testes do maxAge derivado (futuro → segundos corretos; passado/inválido → 0) |
| `apps/web/src/app/(auth)/login/actions.ts` | RF-08: calcular maxAge a partir do `expiresAt` da resposta do login |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | Lógica de ativação de rota (única lógica não-trivial do ciclo) |
| Integração (Testcontainers) | **Não** | Nenhuma mudança de schema, contrato de API ou invariante de domínio (spec-format.md) |
| E2E | **Pendência (sem infra)** | Navegação de UI; registrada no known-issue existente (REL-01) |
| Regressão (BUG-NNN) | n.a. | Não é bug |

Markup/comportamento visual: sem RTL/jsdom no projeto — coberto por QA de runtime (curl + inspeção), mesma limitação registrada no CRM-01. Justificativa de dispensa no Decisions Log.

## Checklist de QA de runtime (procedimento mínimo do validate.md)

1. `curl` autenticado nas 5 rotas do grupo → 200 + placeholder correto; `curl` sem cookie → 307 `/login`.
2. Resposta HTML das rotas do grupo contém meta robots noindex (herdado do layout); nenhuma page o redefine (grep no código).
3. Inspeção do HTML renderizado: `<nav aria-label>`, `aria-current="page"` no item da rota corrente, texto visível em todos os links.
4. Classes responsivas: barra inferior `md:hidden` (display none ⇒ fora do tab order em ≥ md) e nav do header `hidden md:flex`; alvos de toque com altura ≥ 44px (`min-h-11`/`h-11`+ equivalente) — conferência por inspeção de classes no DOM de ~375px.
5. Botão "Sair" presente no header em todas as rotas do grupo; logout via header redireciona a `/login`.
6. RF-08 fim-a-fim: login real → inspecionar o `Set-Cookie` da resposta e conferir `Max-Age` ≈ segundos até o `expiresAt` retornado pela API (~30 dias).

## Migração de Banco

n.a.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Barra fixa cobrir conteúdo no mobile | média | padding-bottom compensatório no `<main>` + safe-area; QA de runtime confere |
| Logout sair da page e quebrar o critério RF-09 do crm-auth (botão some) | baixa | "Sair" migra para o header do shell — continua presente em todas as páginas do grupo |
| Metadata herdada não aplicar robots | baixa | QA confere o meta tag na resposta das rotas do grupo |

## Definition of Done

- [ ] Critérios de aceite do spec.md atendidos
- [ ] `bun run lint` e `bun run typecheck` limpos
- [ ] `bun run test` verde
- [ ] `bun run --filter '@clientela/web' build` ok
- [ ] Conformidade com `.claude/rules/*` e ADRs
