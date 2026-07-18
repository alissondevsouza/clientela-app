---
feature: landing-page-structure
module: web
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: Estrutura da landing page

## Milestone 1: shadcn/ui

- [x] **Task 1.1** — Instalar/configurar shadcn/ui no `apps/web` (init + `add button card`), verificando compat Tailwind v4; conferir `components.json`, `lib/utils.ts`, tema em `globals.css`
  - Arquivos: `apps/web/components.json`, `apps/web/src/lib/utils.ts`, `apps/web/src/components/ui/{button,card}.tsx`, `apps/web/src/app/globals.css`, `apps/web/package.json`
  - Dependências: nenhuma
  - Paralelizável: não
  - Verificação: `bun run lint` + `bun run typecheck` + `bun run build` (web) verdes
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Conteúdo e seções

- [x] **Task 2.1** — Criar `src/content/landing.ts` (hero, sobre, depoimentos rotulados como exemplo, tipado `as const`) e placeholders SVG locais em `public/placeholders/`
  - Arquivos: `apps/web/src/content/landing.ts`, `apps/web/public/placeholders/*.svg`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 2.2** — Componentes de seção `components/landing/{hero,about,testimonials}.tsx` (Server Components, named exports, consumindo `landing.ts`; mobile-first com breakpoints md/lg; a11y RF-08)
  - Arquivos: `apps/web/src/components/landing/hero.tsx`, `about.tsx`, `testimonials.tsx`
  - Dependências: Task 1.1, Task 2.1
  - Paralelizável: não
  - Verificação: typecheck + lint
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 2.3** — Mover home para `app/(landing)/page.tsx` montando hero → sobre → depoimentos + rodapé placeholder com `id="contato"` ("fale comigo" — âncora do CTA resolve; LP-06 o substitui pelo formulário); remover `app/page.tsx` antiga; confirmar rota `/` estática no build
  - Arquivos: `apps/web/src/app/(landing)/page.tsx`, `apps/web/src/app/page.tsx` (remoção)
  - Dependências: Task 2.2
  - Paralelizável: não
  - Verificação: `bun run build` (web) com `/` estática; `bun run lint`/`typecheck`/`test` verdes na raiz
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem de Execução

M1 (1.1) ∥ Task 2.1 → 2.2 → 2.3. Checkpoint ao fim de cada milestone.

## Definition of Done (agregado)
- [ ] Critérios de aceite do spec.md atendidos
- [ ] lint/typecheck/test da raiz verdes; build do web ok (rota `/` estática)
- [ ] Zero `"use client"` no escopo; conteúdo só em `landing.ts`
- [ ] Conformidade com `web.md`/`core.md`
