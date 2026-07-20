---
feature: crm-products
module: api, web, shared
phase: spec
status: in_progress
updated: 2026-07-18
---

# Progress: crm-products (CRM-05)

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-18 | spec | `lowStock = stockQty <= lowStockThreshold` (derivado; limiar 0 alerta só com estoque 0) | Semântica única em SQL e mapper |
| 2026-07-18 | spec | Extração do helper `route-auth` neste ciclo (4ª duplicação) | Sugestão da QA do CRM-04; agora se paga |
| 2026-07-18 | spec | `parseBRLToCents` por aritmética de string (sem parseFloat) | Dinheiro nunca em float (database.md/core.md) |
| 2026-07-18 | spec | Escape de LIKE nasce certo em products; BUG-001 de clients permanece item separado | Não replicar bug conhecido; fix de clients tem regressão própria |
| 2026-07-18 | spec | Ajuste de estoque no MVP = editar stockQty (sem histórico de movimentação) | Escopo do roadmap; baixa automática vem no CRM-06 |
| 2026-07-18 | spec-review | Rodada 1 APROVADA; incorporados: teto (100M centavos / 1M unidades) com 422, cast `::bigint` no summary, tabela fixa do parseBRLToCents, auth-guard entra no refactor route-auth, Promise.all na listagem, BUG-002/003 ganharão menção a products no backlog | Verifier neutro |

## Milestones

- [x] Milestone 1: Contratos, banco e helper de rota (2026-07-18; route-auth com equivalência provada por 184 testes)
- [x] Milestone 2: API — módulo products (230 testes; escape/teto/bigint provados)
- [x] Milestone 3: Web — telas de produtos (summary, filtro lowStock, form reais→centavos)
- [x] Milestone 4: Checkpoint (474 testes verdes, 2026-07-18)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-18 | 2 | intake→spec | Spec set autorado (template: crm-clients) | Size L |
| 2026-07-18 | 2 | spec-review | Rodada 1 APROVADA (tetos/bigint/tabela do parse/auth-guard no refactor incorporados) | Verifier neutro |
| 2026-07-18 | 2 | implement | 8 tasks por implementers isolados; checkpoint 474 testes | route-auth extraído com equivalência provada |
| 2026-07-18 | 2–3 | qa | Rodada 1 **REPROVADO** (CRÍTICO: RSC chamando função de módulo "use client" — crash de runtime no detalhe) → fixer → rodada 2 (verifier novo, retomada pós-limite) **APROVADO** (484 testes; detalhe provado em produção) | Lesson graduada; sugestão cosmética (ordem de constante) aceita como aberta |
| 2026-07-18 | 3 | graduate→handoff | known-issue LGPD estendido a products; BUG-002/003 anotados; lesson RSC×client; 04-domain atualizado; roadmap [R] | — |
