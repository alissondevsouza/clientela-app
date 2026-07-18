---
feature: landing-seo-polish
module: web
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: SEO e polimento da landing

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | `SITE_URL` obrigatória sem default (como API_URL) | Canonical/OG errados em prod são piores que build falhando claro |
| 2026-07-17 | spec | OG image via ImageResponse (build), sem binário versionado | Estática, consistente com o tema, sem manutenção de PNG |
| 2026-07-17 | spec | Nav por âncoras sem JS/hambúrguer; marca não é h1 nem link | Zero client JS novo; h1 único no hero |
| 2026-07-17 | spec | Metadata estática (`export const metadata`) em vez de generateMetadata | Página única SSG; menos superfície |
| 2026-07-17 | spec | Review rodada 1: APROVADO; alertas incorporados — offset único `scroll-mt-8`; og:image exclusivamente pela convenção de arquivo (precedência; sem duplicar no objeto); twitter via fallback | Sugestões: env.test.ts atualiza validSource existente; verificação visual 375px vai junto da pendência Lighthouse no handoff |

## Milestones

- [x] Milestone 1: Env e conteúdo do site
- [x] Milestone 2: Metadata e arquivos SEO
- [x] Milestone 3: Header, âncoras e a11y

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | spec | Intake LP-07, research, spec/plan/tasks; review APROVADO na 1ª (alertas incorporados) | Roadmap `[>]`; branch compartilhada `feature/phase-1-landing-page` |
| 2026-07-17 | 1 | implement | M1–M3 por clientela-implementer; 99/99 testes; build com /, /opengraph-image, /sitemap.xml, /robots.txt estáticos; runtime standalone verificado (head completo, OG png 1200×630, skip link 1º focável, priority só no hero) | Decisões: marca oculta <400px p/ nav em 1 linha a 375px; nome do site placeholder genérico honesto; standalone roda via node .next/standalone/.../server.js (next start incompatível) — nota p/ LP-11 |
| 2026-07-17 | 1 | qa | QA (verifier A): APROVADO na 1ª rodada — RF-01..07 verificados em runtime standalone real; og:image única via convenção; skip link 1º focável; 1 preload | Alerta não-bloqueante: marca oculta a 375px — testar visualmente no handoff (talvez min-[360px]); sugestão: caso de URL malformada p/ SITE_URL |
| 2026-07-17 | 1 | graduate | Nada durável novo (notas de standalone/fonte já registradas p/ LP-11 nos artefatos) | Roadmap LP-07 → `[R]` |
