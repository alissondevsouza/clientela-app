---
feature: landing-page-structure
module: web
phase: validate
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: landing-page-structure (rodada 2)

> **Resumo da rodada 1:** gates mecânicos verdes (lint 54 arquivos limpo · typecheck 3 workspaces exit 0 · 52/52 testes · build com `/` estática · runtime HTTP 200 com 1 h1, 3 seções na ordem, 5 imgs com alt, 6×"(exemplo)", SVGs 200) — **mas REPROVADO** pelo CRÍTICO #1 da review: `globals.css` importava `shadcn/tailwind.css` sem o pacote `shadcn` declarado em `package.json`/`bun.lock`; o build só passava por resíduo em `node_modules`. Pendências registradas: E2E sem infra (known-issues) e inspeção visual real 375px/1024px para o humano.

## Foco da rodada 2

Fix aplicado entre rodadas: `shadcn@^4.13.0` declarado como **devDependency** de `apps/web`, `lucide-react` (não usada) removida, lockfile reconciliado. O cerne desta rodada é **reprodutibilidade limpa**: tudo revalidado a partir de `rm -rf node_modules` (raiz + 3 workspaces) + `rm -rf apps/web/.next`, preservando `bun.lock`.

## Comandos Executados

| # | Ferramenta | Comando | Status | Observação |
|---|------------|---------|--------|------------|
| 1 | Instalação limpa | `rm -rf node_modules apps/*/node_modules packages/shared/node_modules apps/web/.next && bun install` | ✅ | 1111 pacotes em 3.05s, sem erro |
| 2 | Estabilidade do lockfile | `sha256sum bun.lock` antes/depois do install | ✅ | Hash idêntico (`1b8f51d2…20a8b3`) — `bun install` não altera o lock; working tree estável |
| 3 | Rastreabilidade | `grep shadcn bun.lock` / `grep lucide bun.lock` / `ls node_modules` | ✅ | `shadcn@4.13.0` no lock (devDep do workspace web) e instalado em `apps/web/node_modules/shadcn`; `lucide-react` ausente do lock e não instalado |
| 4 | Resolução do import | inspeção de `node_modules/shadcn/package.json` | ✅ | export `"./tailwind.css": "./dist/tailwind.css"` existe — `@import "shadcn/tailwind.css"` de `globals.css:3` resolve |
| 5 | Lint | `bun run lint` | ✅ | Biome: `Checked 54 files in 16ms. No fixes applied.` |
| 6 | Typecheck | `bun run typecheck` | ✅ | `@clientela/{shared,web,api}` exit 0 |
| 7 | Testes | `bun run test` (Docker disponível) | ✅ | `Test Files 8 passed (8) · Tests 52 passed (52)` — suíte não regride |
| 8 | Build | `cd apps/web && bun run build` | ✅ | Next 16.2.10 (Turbopack), compila do zero pós-instalação limpa; `┌ ○ /` → **Static, prerendered** (RF-02) |
| 9 | Runtime | `bun run start -- -p 3791` + curl | ✅ | verificações abaixo; servidor derrubado ao final (porta 3791 livre) |

## Saída Relevante (runtime, `GET /` → 200)

- **1 `<h1>`** e **3 `<h2>`** (sobre, depoimentos, rodapé) — RF-08.
- **Ordem por offset de byte**: `hero-heading` (1382) → `about-heading` (3173) → `testimonials-heading` (4314) → `id="contato"` (8984) — RF-03..05.
- **5 `<img>`, 5 com `alt`**, zero sem alt.
- **CTA**: `<a href="#contato" …>Chamar no WhatsApp</a>` renderizado via `buttonVariants`; `<footer id="contato">` presente — âncora resolve.
- **"(exemplo)"**: 6 ocorrências (3 nomes ×2 [HTML+RSC] + nota + rodapé) — placeholders honestos.
- **SVGs**: `/placeholders/{consultant-portrait,testimonial-avatar-1..3}.svg` → todos **200 image/svg+xml**.
- **Zero `"use client"`** em `apps/web/src/` (grep) — RF-09.
- **RF-06**: grep das strings de seção ("Sobre a consultora", "O que as clientes dizem", "Chamar no WhatsApp") só encontra `src/content/landing.ts`.
- `components/ui/{button,card}.tsx` existem e são usados (`hero.tsx` importa `buttonVariants`; `testimonials.tsx` importa card) — RF-01.
- Referências residuais a `lucide-react` só em `components.json` (`iconLibrary`, config do CLI, não é import) — artefatos `.next/` velhos que a citavam foram apagados e o rebuild não a reintroduz.

## Pendências (inalteradas da rodada 1)

- E2E (Playwright): sem infra — registrado em `project-memory/known-issues.md`; fluxo crítico real chega no LP-06.
- Inspeção visual em viewport real (375px/1024px): sem browser nesta QA — fica para o humano no handoff (análise estática das classes na rodada 1 não encontrou risco de overflow).
