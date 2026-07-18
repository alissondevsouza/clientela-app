---
feature: landing-visual-refinement
module: web
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: Refinamento visual da landing

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|---|---|---|---|
| 2026-07-17 | intake | **Uso das fotos reais de `project-memory/UI-resources/` autorizado pelo humano** (pedido explícito nesta sessão) — revoga o veto placeholder do LP-03 | Imagem de pessoa é dado pessoal; a autorização veio do dono do projeto |
| 2026-07-17 | spec | Fotos reais NÃO entram nos depoimentos fictícios | Associar pessoa real a falas inventadas seria desonesto |
| 2026-07-17 | spec | Marca sempre visível a 375px via redução tipográfica da nav (revoga `hidden min-[400px]:` do LP-07) | Resolve o alerta da QA LP-07; esconder a marca era o trade-off errado |
| 2026-07-17 | spec | Animações CSS-only com `animation-timeline: view()` sob `@supports` + `prefers-reduced-motion` | Zero JS/deps novas; progressive enhancement (default visível) |
| 2026-07-17 | spec | `next/image` otimizado (sem `unoptimized`) para as fotos PNG | 2MB por foto exige variantes; sharp presente na árvore (QA LP-11) |
| 2026-07-17 | spec | Metadata/OG continuam "Consultoria de Beleza Mary Kay" até o LP-08 | Branding definitivo junto do conteúdo real, sem retrabalho |
| 2026-07-17 | spec | Review (rodada 1): APROVADO; alerta incorporado — skip link sobe para `focus:z-[60]` (empate de z-index com header sticky pintaria o header por cima) | Sugestões p/ handoff: checagem visual 375px pelo humano; duplicação dos PNGs (UI-resources + public) para o humano decidir |

## Milestones

- [x] Milestone 1: Assets e conteúdo
- [x] Milestone 2: Header fixo e animações base
- [x] Milestone 3: Seções

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|---|---|---|---|---|
| 2026-07-17 | 2 | spec | Intake LP-14 (novo item no roadmap), inspeção visual das 4 fotos, spec/research/plan/tasks; review APROVADO 1ª rodada (alerta z-index incorporado) | Branch `feature/phase-1-landing-page` |
| 2026-07-17 | 2 | implement | M1–M3 por clientela-implementer; 99/99; build `/` estática; otimizador provado em standalone (portrait 1.9MB → 43KB webp) | Decisões: biome-ignore-start/end p/ noRedundantRoles (role="list" exigido pelo RF-04; supressão de linha não sobrevive a reformat); context dos depoimentos com "(exemplo)"; hero com animate-on-scroll (elemento em viewport renderiza no frame final — sem prejuízo de LCP) |
| 2026-07-17 | 2 | qa | Rodada 1 (verifier A): APROVADO com 1 ALERTA (contraste do header sob foto clara ~4.1:1) + sugestões → fixer aplicou bg/90 + text-foreground/70 + motion-reduce nos links, sizes preciso hero/about, órfão consultant-portrait.svg removido → rodada 2 (verifier B): APROVADO — contraste pior caso 7.63:1 (AA com folga); fluxo de lead re-provado fim-a-fim na rodada 1 (linha no Postgres; honeypot sem linha); CSS compilado sem opacity:0 fora do @supports | Sugestões abertas menores: sizes 536px exato (superestimar é seguro); sizes da lead-section p/ desktop largo |
| 2026-07-17 | 2 | graduate | Nada durável a graduar (padrões de animação/imagem documentados na spec; autorização das fotos já no Decisions Log) | Roadmap LP-14 → `[R]` |
