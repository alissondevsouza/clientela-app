---
feature: landing-page-structure
module: web
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: Estrutura da landing page

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | Testes de unidade dispensados (componentes estáticos de apresentação, sem regra de negócio) | Critério de `spec-format.md`; gates = lint + typecheck + build + QA de runtime real (HTML/responsividade/a11y) |
| 2026-07-17 | spec | Conteúdo placeholder centralizado em `src/content/landing.ts`; depoimentos rotulados como exemplo | LP-08 troca conteúdo sem tocar componentes; prova social falsa sem rótulo seria desonesta |
| 2026-07-17 | spec | CTA do hero = âncora `#contato` até o LP-04 | Evita link morto; LP-04 substitui pelo componente wa.me parametrizado |
| 2026-07-17 | spec | SVGs placeholder locais (sem serviço externo de imagem) | SSG determinístico, sem dependência de rede |
| 2026-07-17 | spec | Review neutra (rodada 1): APROVADO; alertas incorporados — SVG via next/image exige `unoptimized` (otimizador não serve SVG); fallback do shadcn redefinido para docs oficiais v4 (seção manual da skill local é v3); justificativa de dispensa reescrita citando `testing.md` real; âncora `#contato` ganha alvo na página; fotos reais de UI-resources vetadas como placeholder | Correções de precisão do spec-verifier |

## Milestones

- [x] Milestone 1: shadcn/ui
- [x] Milestone 2: Conteúdo e seções

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | spec | Intake LP-03, research, spec/plan/tasks | Roadmap `[>]`; branch compartilhada `feature/phase-1-landing-page` |
| 2026-07-17 | 1 | qa | Rodada 1 (verifier A): REPROVADO — dependência fantasma `shadcn` (globals.css importa `shadcn/tailwind.css`; pacote fora do manifest/lockfile; instalação limpa quebraria o build) → fixer: `shadcn` como devDependency + `lucide-react` (não usada) removida + lockfile reconciliado → rodada 2 (verifier B): APROVADO com instalação limpa provada (sha do bun.lock estável; 52/52; `/` estática; runtime verificado) | Sugestão herdada: landmark `<header>` quando houver nav/logo (LP-07/08). Inspeção visual real 375px/1024px fica como pendência de handoff (QA sem browser) |
| 2026-07-17 | 1 | graduate | Lesson registrada (shadcn CLI = fonte de estilos em build time; phantom dep #1 → gatilho INF-02 no 2º) | Roadmap LP-03 → `[R]` |
| 2026-07-17 | 1 | implement | M1–M2 por clientela-implementer; lint/typecheck/test verdes; build web com `/` estática | Decisões do implementer: shadcn CLI 4.x style base-nova (base-ui) com `init -d --no-monorepo -y`; CTA como `<a>` + `buttonVariants` (mantém RSC puro); `biome.json` ganhou `css.parser.tailwindDirectives` (globals.css v4 usa @theme/@custom-variant); dep runtime espúria `shadcn` removida do package.json |
