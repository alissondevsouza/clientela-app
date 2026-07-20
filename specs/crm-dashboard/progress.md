---
feature: crm-dashboard
module: api, web, shared
phase: handoff
status: completed
updated: 2026-07-19
---

# Progress: crm-dashboard (CRM-07)

**Status:** completed
**Current Phase:** handoff
**Current Task:** — (aguardando commit do humano)

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-18 | spec | `sale_items.cost_cents` snapshot adicionado AGORA (default 0 p/ pré-existentes; sem produção) | Lucro imune a mudança de custo (racional ADR-0013); adiar exigiria backfill real |
| 2026-07-18 | spec | Meta em consultants (nullable, > 0 quando presente; 0 ⇒ 422) | Divisão por zero impossível; 0 não é meta |
| 2026-07-18 | spec | Summary único do dashboard (inclui recebíveis) — 1 request na home | Sem waterfall |
| 2026-07-18 | spec | Mês corrente em UTC (date_trunc) | Consistente com overdue (decisão aceita no CRM-06) |
| 2026-07-19 | spec-review | `crm/actions.ts` é CRIAR (não estender); logout fica em `(crm)/actions.ts` | Correção de premissa falsa (spec-verifier ALERTA): arquivo não existia |
| 2026-07-19 | spec-review | `findProductsByIds` precisa ampliar projeção p/ `costCents` (+ tipos) | Custo NÃO estava disponível na composição como a research assumia |
| 2026-07-19 | spec-review | `monthProfitCents` inteiro com sinal (aceita negativo) | Override de preço abaixo do custo ⇒ margem negativa; schema ≥0 daria 500 |
| 2026-07-19 | spec-review | Reusar `MONEY_MAX_CENTS` (exportar de products.ts) | Não duplicar contrato (core.md) |
| 2026-07-19 | spec-review | Sizing M → L | Cross-app + migração + contrato público + regra central (spec-format.md) |
| 2026-07-19 | spec-review | default 0 de `cost_cents` = rede de migração, não comportamento | Insert sempre grava snapshot explícito; graduar p/ known-issues |

## Milestones

- [x] Milestone 1: Contratos, colunas e snapshot de custo
- [x] Milestone 2: API — módulo dashboard
- [x] Milestone 3: Web — painel
- [x] Milestone 4: Checkpoint (QA APROVADO — 674 testes, build ok)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-18 | 3 | intake→spec | Spec set autorado | Size M |
| 2026-07-19 | 4 | spec-review | spec-verifier APROVOU com ressalvas; 4 ALERTAs + 2 SUGESTÕES aplicados aos artefatos | Size reclassificado L |
| 2026-07-19 | 4 | implement | M1 (1.1 shared ∥ 1.2 cost snapshot) → M2 (2.1 dashboard API) ∥ M3.1 (helpers web) → M3.2 (home painel) | Implementers paralelos; contrato PUT goal alinhado; RSC×client corrigido no 3.2 |
| 2026-07-19 | 4 | QA | implement-verifier neutro: VEREDITO APROVADO. 674 testes verdes (Testcontainers real), lint/typecheck/build ok. 0 CRÍTICO/ALERTA; 2 SUGESTÕES → known-issues | Sem rodada de fix |
| 2026-07-19 | 4 | graduate | ADR-0014 (snapshot de custo/lucro/meta/summary); known-issues (default 0, toSafeInteger 3×, TZ do date_trunc); lesson (Server Action como prop); domain-model atualizado | — |
