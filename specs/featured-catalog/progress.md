---
feature: featured-catalog
module: web
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: Catálogo de destaque

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | `products.ts` separado de `landing.ts`; mensagem por produto via `buildProductMessage` no módulo de conteúdo | CRM-08 trocará a fonte; texto é conteúdo, mas parametrizado — função pura testável |
| 2026-07-17 | spec | Catálogo entre hero e sobre | Prioridade de venda: produto antes da biografia |
| 2026-07-17 | spec | Preços placeholder em centavos inteiros; formatação só na borda (`formatBRL`) | Invariante do projeto (dinheiro em centavos) |
| 2026-07-17 | spec | Review rodada 1: REPROVADO (Task 2.1 usava `aria-label` que o WhatsAppCta não aceita; plan omitia products.test.ts) → corrigido: prop `ariaLabel` explícita no componente (sem spread), 6 produtos (grid fecha em 2 e 3 colunas), verificação da task exige nome do produto no `?text=` | CRÍTICO+ALERTA+sugestões do spec-verifier incorporados |

## Milestones

- [x] Milestone 1: Dados e formatação
- [x] Milestone 2: Componente e integração

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | spec | Intake LP-05, research, spec/plan/tasks; review rodada 1 REPROVADO → corrigido → rodada 2 APROVADO (alerta de contagem de SVGs padronizado; aria-label formato WCAG 2.5.3) | Roadmap `[>]`; branch compartilhada `feature/phase-1-landing-page` |
| 2026-07-17 | 1 | implement | M1–M2 por clientela-implementer; lint/typecheck verdes; 74/74 testes; build `/` estática; HTML com 6 cards, ?text= com nome do produto, aria-labels WCAG | Decisões: nomes de produto com sufixo "(exemplo)"; h3 direto em vez de CardTitle (que é div, não heading); paleta rosa/mauve dos placeholders mantida |
| 2026-07-17 | 1 | qa | QA (verifier A): APROVADO na 1ª rodada — RF-01..05 verificados no HTML servido (NBSP do Intl confirmado byte a byte; ?text= por card; WCAG 2.5.3) | Sugestões não-bloqueantes anotadas para o CRM-08: guarda em formatBRL quando a fonte virar dinâmica; role="list" no ul; CardTitle asChild |
| 2026-07-17 | 1 | graduate | Nada durável a graduar (sem decisão nova de arquitetura; padrões já estabelecidos em LP-03/04) | Roadmap LP-05 → `[R]` |
