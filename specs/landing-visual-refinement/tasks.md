---
feature: landing-visual-refinement
module: web
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: Refinamento visual da landing

## Milestone 1: Assets e conteúdo

- [x] **Task 1.1** — Copiar as 4 fotos de `project-memory/UI-resources/` para `apps/web/public/images/` (2→`lais-barbosa-portrait.png`, 4→`lais-barbosa-standing.png`, 3→`lais-barbosa-wide.png`, 1→`lais-barbosa-square.png`) e atualizar `content/landing.ts`: `nav.brand` = "Lais Barbosa", `hero.image`/`about.image` apontando para as fotos reais (dimensões intrínsecas corretas, alts pt-BR factuais), `leadSection` + `highlights` (3 bullets da isca) + `image` (wide), contexto curto nos depoimentos
  - Arquivos: `apps/web/public/images/*.png`, `apps/web/src/content/landing.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: typecheck; arquivos presentes
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Header fixo e animações base

- [x] **Task 2.1** — `site-header.tsx`: sticky (top-0 z-50 bg-background/80 backdrop-blur border-b), marca sempre visível, nav em linha única a 375px (text-xs→sm); atualizar comentário do arquivo (decisão antiga revertida); **skip link em `page.tsx` sobe para `focus:z-[60]`** (visível sobre o header sticky)
  - Arquivos: `apps/web/src/components/landing/site-header.tsx`, `apps/web/src/app/(landing)/page.tsx`
  - Dependências: Task 1.1
  - Paralelizável: sim
  - Verificação: typecheck/lint; análise de classes
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 2.2** — `globals.css`: bloco de animações — keyframes fade-up, utilitária `.animate-on-scroll` com `animation-timeline: view()` dentro de `@supports` e neutralizada em `prefers-reduced-motion`; conferir que o default (sem suporte) é conteúdo visível
  - Arquivos: `apps/web/src/app/globals.css`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: lint (biome css); build
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 3: Seções

- [x] **Task 3.1** — `hero.tsx` + `about.tsx`: fotos reais otimizadas (sem `unoptimized`, `sizes` por layout, priority só no hero), `scroll-mt-20`, entrada animada; `featured-catalog.tsx`: `scroll-mt-20`, hover de card (elevação/translate com motion-reduce), entrada animada
  - Arquivos: `apps/web/src/components/landing/{hero,about,featured-catalog}.tsx`
  - Dependências: Task 1.1, Task 2.2
  - Paralelizável: não
  - Verificação: typecheck/lint; build
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 3.2** — `testimonials.tsx`: redesign (aspas decorativas, avatar, nome + contexto, rótulos "(exemplo)" e nota preservados), `role="list"`, `scroll-mt-20`, animação; `lead-section.tsx`: grid 2 colunas ≥lg (form + coluna com foto wide alt real e bullets), 1 coluna mobile, `scroll-mt-20`, animação — `lead-form.tsx` sem mudança de lógica
  - Arquivos: `apps/web/src/components/landing/{testimonials,lead-section}.tsx`
  - Dependências: Task 3.1
  - Paralelizável: não
  - Verificação: `bun run lint`/`typecheck`/`test` verdes; `cd apps/web && bun run build` → `/` estática; grep: zero `"use client"` novo, nenhum `unoptimized` nas fotos reais, nenhuma referência aos SVGs de retrato da consultora
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem de Execução

M1 → M2 (2.1 ∥ 2.2) → M3 (3.1 → 3.2).

## Definition of Done (agregado)
- [ ] RF-01..07 atendidos
- [ ] lint/typecheck/test verdes; build `/` estática
- [ ] QA runtime: lead fim-a-fim ok; `/_next/image` servindo variantes otimizadas; âncoras sem esconder headings sob o header
