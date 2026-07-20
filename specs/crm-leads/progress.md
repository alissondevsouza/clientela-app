---
feature: crm-leads
module: api, web, shared
phase: spec
status: in_progress
updated: 2026-07-18
---

# Progress: crm-leads (CRM-04)

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-18 | spec | `client_id` no lead (não `lead_id` no client), FK `ON DELETE SET NULL` | Lead é histórico de captação; sobrevive à exclusão LGPD da cliente perdendo só o vínculo |
| 2026-07-18 | spec | `converted` terminal e só via convert; transições livres entre new/contacted/discarded | Protege o vínculo; re-engajar descartado é legítimo para usuária única |
| 2026-07-18 | spec | Conversão em transação única no repository de leads (insert clients + update lead) | Primeira `db.transaction` do projeto; atomicidade > pureza de fronteira de módulo (trade-off registrado; revisitar no 2º caso) |
| 2026-07-18 | spec | Leads sem dono nesta fase (drift vs `Lead N—1 Consultant`) | Captura pública não conhece consultora; usuária única; resolver com multi-tenant |
| 2026-07-18 | spec | Rate limit de leads restrito a `POST /leads` exato | Fecha known-issue agendado para o CRM-04 |
| 2026-07-18 | spec-review | Rodada 1 APROVADA com ALERTAs incorporados: enum de status move para shared (db importa de lá); guarda de corrida dentro da transação (update condicional); service compõe payload (repository só transaciona); fallback de UI p/ convertido sem cliente; erro de transição redundante eliminado; graduação anota drift no 04-domain-model | Verifier neutro |

## Milestones

- [x] Milestone 1: Contratos, migração e guard (2026-07-18; guard red→green; migração 0003)
- [x] Milestone 2: API — funil e conversão (162 testes API; conversão transacional; zero discrepâncias)
- [x] Milestone 3: Web — telas do funil (filtro tabs, ações, conversão 2 passos)
- [x] Milestone 4: Checkpoint (340 testes verdes, 2026-07-18)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-18 | 2 | intake→spec | Commit `34994a9` confirmado (CRM-01..03 → [x]); branch `feature/phase-2-crm`; spec set autorado | Size L |
| 2026-07-18 | 2 | spec-review | Rodada 1 APROVADA com 4 ALERTAs incorporados | Verifier neutro |
| 2026-07-18 | 2 | implement | 9 tasks por implementers isolados; guard red→green; conversão transacional; checkpoint 340 testes | — |
| 2026-07-18 | 2 | qa | QA rodada 1: **APROVADO** (TOCTOU provado com converts paralelos; checklist 8/8; Server Actions no build de produção) | ALERTA 401→boundary virou BUG-003; sugestões no review.md |
| 2026-07-18 | 2 | graduate→handoff | Known-issue do rate limit fechado; drift do Lead anotado no 04; lesson next-action; BUG-003; roadmap [R] | — |
