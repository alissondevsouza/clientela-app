---
feature: crm-layout
module: web
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: crm-layout

## Milestone 1: Navegação e shell

- [x] **Task 1.1** — Config de navegação (`nav-items.ts`: 5 destinos com href/label/ícone) + `isNavItemActive` pura + testes de unidade (match exato de `/crm`, sub-rota `/crm/clients/123`, irmãs não colidem, `/crm` não ativa em `/crm/clients`, trailing slash `/crm/clients/` documentado)
  - Arquivos: `apps/web/src/components/crm/nav-items.ts`, `nav-items.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `bunx vitest run apps/web` verde ✓ (8 testes)
  - Implementado por: clientela-implementer #11 (2026-07-17)
- [x] **Task 1.2** — Componentes do shell: `crm-nav.tsx` (client, barra inferior fixa mobile com safe-area + variante inline desktop, `aria-current`, `aria-label`, alvos ≥ 44px) e `crm-header.tsx` (RSC: marca, nome da consultora via prop, botão "Sair" com `logoutAction`, nav desktop)
  - Arquivos: `apps/web/src/components/crm/crm-nav.tsx`, `crm-header.tsx`
  - Dependências: Task 1.1
  - Paralelizável: não
  - Verificação: `bun run --filter '@clientela/web' typecheck` verde ✓
  - Implementado por: clientela-implementer #13 (2026-07-17). `CrmMobileNav`/`CrmDesktopNav` exportados separados; header sticky com saudação e Sair
- [x] **Task 1.3** — Integração no shell: `layout.tsx` (header + nav + main com padding compensatório; `metadata.robots` noindex do grupo) + home `crm/page.tsx` (vira "Início", remove robots e form de logout locais — o "Sair" migra pro header)
  - Arquivos: `apps/web/src/app/(crm)/layout.tsx`, `apps/web/src/app/(crm)/crm/page.tsx`
  - Dependências: Task 1.2
  - Paralelizável: não
  - Verificação: `bun run --filter '@clientela/web' typecheck` + `bunx vitest run apps/web` + build verdes ✓
  - Implementado por: clientela-implementer #14 (2026-07-17). `<main>` migrou pro layout (evita landmark duplicado)
- [x] **Task 1.4** — Páginas placeholder das 4 seções (Clientes, Leads, Produtos, Vendas): título pt-BR + texto "em breve" com referência de que o conteúdo chega nas próximas entregas da Fase 2 (constante compartilhada), só `title` na metadata (robots herdado)
  - Arquivos: `apps/web/src/app/(crm)/crm/{clients,leads,products,sales}/page.tsx`
  - Dependências: Task 1.3
  - Paralelizável: não (usa o shell pronto)
  - Verificação: `bun run --filter '@clientela/web' build` ok (5 rotas dinâmicas do grupo) ✓
  - Implementado por: clientela-implementer #15 (2026-07-17). Texto comum em `coming-soon.ts`
- [x] **Task 1.5** — RF-08 (known-issue): função pura `sessionCookieMaxAgeSeconds(expiresAt, now)` (floor, mín. 0) + `buildSessionCookieOptions({ isProduction, maxAgeSeconds })` + remoção de `SESSION_DURATION_SECONDS` do web + `loginAction` como wrapper fino (passa `new Date()`) + testes de unidade com `now` fixo (futuro → segundos corretos com floor; passado/inválido → 0)
  - Arquivos: `apps/web/src/lib/auth.ts`, `apps/web/src/lib/auth.test.ts`, `apps/web/src/app/(auth)/login/actions.ts`
  - Dependências: nenhuma (arquivos disjuntos de 1.1–1.4)
  - Paralelizável: sim
  - Verificação: `bunx vitest run apps/web` verde ✓ (71 testes); grep de `SESSION_DURATION` em apps/web vazio ✓
  - Implementado por: clientela-implementer #12 (2026-07-17)

## Milestone 2: Checkpoint

- [x] **Task 2.1** — `bun run lint` + `bun run typecheck` + `bun run test` + build do web na raiz
  - Arquivos: —
  - Dependências: M1
  - Paralelizável: não
  - Verificação: tudo verde ✓ (2026-07-17: Biome 119 arquivos; typecheck 3 workspaces; 189 testes / 22 arquivos; build web ok na 1.4)
  - Implementado por: orchestrator (checkpoint)

## Ordem de Execução

(1.1 → 1.2 → 1.3 → 1.4) ∥ 1.5 → 2.1.

## Definition of Done (agregado)

- [ ] Critérios de aceite do spec.md atendidos
- [ ] `bun run lint`/`typecheck`/`test` verdes; build web ok
- [ ] Conformidade com rules e ADRs
