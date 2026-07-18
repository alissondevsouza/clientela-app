---
feature: landing-seo-polish
module: web
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: SEO e polimento da landing

## Milestone 1: Env e conteúdo do site

- [x] **Task 1.1** — `SITE_URL` em `loadWebEnv` (+3 casos em `env.test.ts`); `.env.example`/`.env.local` com `SITE_URL=http://localhost:3000` (nota LP-10/12); criar `content/site.ts` (nome, tagline, description, textos OG placeholder pt-BR)
  - Arquivos: `apps/web/src/lib/env.ts`, `env.test.ts`, `apps/web/.env.example`, `.env.local`, `apps/web/src/content/site.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: unidade env verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Metadata e arquivos SEO

- [x] **Task 2.1** — Metadata completa no `layout.tsx` (template de title, metadataBase de SITE_URL, description, canonical, OG pt_BR, twitter card) a partir de `site.ts`
  - Arquivos: `apps/web/src/app/layout.tsx`
  - Dependências: Task 1.1
  - Paralelizável: sim
  - Verificação: typecheck; build; head no HTML gerado
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 2.2** — `opengraph-image.tsx` (ImageResponse 1200×630, exports alt/size/contentType, cores do tema, sem fetch externo), `sitemap.ts`, `robots.ts`
  - Arquivos: `apps/web/src/app/opengraph-image.tsx`, `sitemap.ts`, `robots.ts`
  - Dependências: Task 1.1
  - Paralelizável: sim
  - Verificação: build com as rotas estáticas; 200 no servidor local
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 3: Header, âncoras e a11y

- [x] **Task 3.1** — `site-header.tsx` (header + nav aria-label, âncoras Produtos/Sobre/Depoimentos/Contato, uma linha a 375px); ids+`scroll-mt-8` nas seções; skip link `sr-only focus:not-sr-only` → `#conteudo` no main; labels da nav em `landing.ts`; confirmar `priority` só no hero
  - Arquivos: `apps/web/src/components/landing/site-header.tsx`, `apps/web/src/app/(landing)/page.tsx`, `featured-catalog.tsx`, `about.tsx`, `testimonials.tsx`, `apps/web/src/content/landing.ts`
  - Dependências: Task 2.1
  - Paralelizável: não
  - Verificação: `bun run lint`/`typecheck`/`test` raiz verdes; `cd apps/web && bun run build` → `/` estática; HTML: header/nav/4 âncoras/ids/skip link; build sem SITE_URL falha citando a variável
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem de Execução

M1 → M2 (2.1 ∥ 2.2) → M3.

## Definition of Done (agregado)
- [ ] Critérios do spec.md atendidos
- [ ] lint/typecheck/test verdes; build `/` estática
- [ ] Pendências Lighthouse + fonte/Docker registradas p/ handoff
