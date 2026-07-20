---
feature: crm-sales
module: api, web, shared
phase: spec
status: in_progress
updated: 2026-07-18
---

# Progress: crm-sales (CRM-06)

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-18 | spec | Snapshot (client_name/product_name/unit_price) + FKs SET NULL — exclusões seguem permitidas | Fecha known-issue LGPD×histórico; venda imutável (inv. 5); precedente leads |
| 2026-07-18 | spec | Total sempre do servidor (contrato sem campo total) | Inv. 3 estrutural |
| 2026-07-18 | spec | Baixa por UPDATE condicional por item dentro da transação | Nunca-negativo sob concorrência (TOCTOU-safe) |
| 2026-07-18 | spec | Parcelas: floor + resto nas primeiras; vencimento mensal com clamp de fim de mês | Σ exata por construção; datas puras |
| 2026-07-18 | spec | Recebíveis no módulo sales (agregado da venda) | Evita dependência circular |
| 2026-07-18 | spec | Snapshot de client_name permanece após exclusão (registro financeiro) | Decisão consciente sinalizada p/ revisão do humano no handoff |
| 2026-07-18 | spec | Cancelamento devolve estoque só de produto ainda existente | Produto excluído não tem para onde devolver — comportamento declarado e testado |
| 2026-07-18 | spec-review | Rodada 1 REPROVADA (2 CRÍTICOs) → incorporados: serialização cancelar×pagar via `FOR UPDATE` na linha da venda + UPDATE-primeiro no cancel + teste de concorrência; `GET /receivables/summary` (total nunca de lista paginada); `credit` exige total ≥ parcelas; consultant_id em toda guarda + critérios cross-tenant; firstDueDate com tolerância de 1 dia; cascade da consultora em sales; desempate por id; clamp k=2 sem drift | Verifier neutro — rigor extra em invariantes financeiras |
| 2026-07-18 | spec-review | Rodada 2 (verifier novo): **APROVADA** — serialização validada sob READ COMMITTED (EvalPlanQual). Incorporados: UPDATEs de estoque ordenados por product_id (anti-deadlock); 422 único p/ item inexistente/alheio; anti duplo-submit no form + QA; firstDueDate alinhado nos artefatos; overdue em UTC registrado como aceito | **Decisão bloqueante p/ o humano no handoff**: manter o snapshot `client_name` após exclusão da cliente (registro financeiro, art. 16 LGPD) OU anonimizar o snapshot no DELETE — implementado o primeiro; trocar depois custa uma migração pequena |

## Milestones

- [x] Milestone 1: Contratos e banco (migração 0005; split/clamp exaustivos)
- [x] Milestone 2: API — vendas e recebíveis (292 testes; concorrências estáveis)
- [x] Milestone 3: Web — vendas (form com field array, quem-me-deve, detalhe)
- [x] Milestone 4: Checkpoint (622 testes verdes, 2026-07-18)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-18 | 3 | intake→spec | Spec set autorado | Size L (o maior da fase) |
| 2026-07-18 | 3 | spec-review | Rodada 1 REPROVADA (2 CRÍTICOs financeiros) → rodada 2 APROVADA (serialização validada) | 2 verifiers neutros |
| 2026-07-18 | 3 | implement | 8 tasks por implementers isolados; gap de contrato de recebíveis escalado e fechado; checkpoint 622 testes | Concorrências estáveis na integração |
| 2026-07-18 | 3 | qa | QA rodada 1: **APROVADO** (invariantes atacadas e resistiram; checklist 9/9 pela UI em build de produção) | 2 ALERTAs → BUG-004/005 |
| 2026-07-18 | 3 | graduate→handoff | ADR-0013; known-issue LGPD×vendas fechado; 04-domain atualizado; roadmap [R] | Decisão pendente do humano: manter × anonimizar snapshot de client_name |
