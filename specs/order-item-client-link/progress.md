---
feature: Encomendas de clientes no pedido
module: orders
phase: spec
status: in_progress
updated: 2026-07-20
---

# Progress: Encomendas de clientes no pedido

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-20 | intake | Item **CRM-10** no roadmap (dep: CRM-03, CRM-09); branch segue `feature/phase-2-crm` | Pedido do humano ("faça a implementação, depois commito tudo junto"); mesma justificativa de branch do CRM-09 |
| 2026-07-20 | intake | Size **L** | Cross-app + migração + mudança de contrato público |
| 2026-07-20 | spec | Vínculo por item; cadastro rápido reusa módulo de clientes (sem endpoint novo); entrega NÃO gera venda | Discussão com o humano nesta sessão — atalho de venda e notificações ficam para itens futuros |
| 2026-07-20 | spec | Spec APROVADA rodada 1; 2 ALERTAs incorporados mudando o design | (1) LGPD: **sem snapshot de nome** — ADR-0013 é fundamentado em registro financeiro e não se transfere a pedidos; `clientName` derivado por LEFT JOIN, exclusão da cliente apaga o vínculo. (2) Seletor com **busca digitada** (server action + `listClients(search)`) — teto fixo de 100 seria estrutural numa base que cresce a cada encomenda |
| 2026-07-20 | spec | Sugestões incorporadas: `OrderItemData` só com `clientId`; cadastro rápido sem `<form>` aninhado; draft com cliente excluída volta a "sem cliente" | Achados do spec-verifier (rodada 1) |

## Milestones

- [x] Milestone 1: Contrato (162 testes shared)
- [x] Milestone 2: Banco + API (migração `0008_volatile_joseph.sql`; api 365/365)
- [x] Milestone 3: Web (280/280; build ok)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-20 | 1 | intake/spec | Intake, CRM-10 no roadmap, spec set escrito e APROVADO (rodada 1); 2 ALERTAs mudaram o design (LGPD sem snapshot; busca no seletor) | — |
| 2026-07-20 | 1 | implement | 5 tasks por 5 implementers isolados (1.1, 2.1, 2.2, 2.3, 3.1); checkpoint raiz limpo | — |
| 2026-07-20 | 1 | qa | Implement-verifier neutro: **APROVADO rodada 1** — 807 testes, build ok, runtime provado fim-a-fim (vínculo, rename por join, 422, apagamento LGPD); 2 SUGESTÕES em review.md | 1 retomada após limite de sessão |
| 2026-07-20 | 1 | graduate/handoff | ADR-0016; domínio atualizado; known-issue do seletor; roadmap `[R]` | Handoff entregue |
