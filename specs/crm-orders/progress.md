---
feature: Pedidos de reposição (orders)
module: orders
phase: spec
status: in_progress
updated: 2026-07-20
---

# Progress: Pedidos de reposição (orders)

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-20 | intake | Branch de trabalho permanece `feature/phase-2-crm` (sem branch nova) | Todos os ciclos da Fase 2 (CRM-04..07) vivem nessa branch com trabalho ainda não commitado pelo humano; branch nova misturaria o working tree não commitado (ADR-0006: commit é do humano) |
| 2026-07-20 | intake | Item registrado no roadmap como **CRM-09** (Fase 2, dep: CRM-05) | Pedido do humano não estava no roadmap — regra de `dev-flow-routing.md` exige registrar antes de começar |
| 2026-07-20 | intake | Size **L** | Cross-app (shared + api + web), migração com 2 tabelas novas, contrato público novo |
| 2026-07-20 | spec | Spec APROVADA na rodada 1 pelo spec-verifier neutro; achados incorporados | ALERTA: teste de corrida place×cancel adicionado (spec + Task 3.4). SUGESTÕES: `PUT items` com `[]` é válido (esvaziar rascunho); timestamps assertados por não-nulo/ordem relativa; RF-07/08 com validação manual até REL-01 (pendência E2E) |
| 2026-07-20 | spec | Transições por endpoints explícitos (`/place`, `/deliver`, `/cancel`) | Cada transição tem guarda e efeito próprios; espelha `POST /sales/:id/cancel` |
| 2026-07-20 | spec | Entrega credita estoque na mesma transação da transição; `delivered` é terminal (sem estorno) | Atomicidade (invariante 1 por analogia); erro operacional se resolve por ajuste manual no CRUD de produtos |
| 2026-07-20 | implement | Corrida `place`×`cancel`: critério emendado de "exatamente uma vence" para "história serial legal" | Achado da Task 3.4 (teste red reproduzível): sob READ COMMITTED, o guard de `cancel` (`IN (draft, placed)`) reavalia após o commit do `place` e também casa — ambas vencem, mas o resultado é a sequência VÁLIDA `draft→placed→canceled`, sem efeito de estoque e sem transição ilegal. Exigir exclusividade ali não protege invariante nenhuma e custaria contrato de versão otimista; exclusividade estrita mantida (e provada) onde há efeito colateral: `deliver`. Alternativa (b) do report — lock/versão no cancel — rejeitada por complexidade sem ganho de domínio. Sinalizar no handoff |
| 2026-07-20 | implement | `products-api.ts` do web ganhou `perPage?` opcional (extensão aditiva) | O form de itens precisa do catálogo completo (teto 100 do contrato) para o seletor; retrocompatível, testes existentes intactos |
| 2026-07-20 | implement | Seletor de produto no form = `<select>` nativo; item com produto excluído filtrado da edição, preservado na leitura via snapshot | Sem componente shadcn `select` no projeto; escopo não pede busca assíncrona. Snapshot mantém histórico legível (ADR-0013 por analogia) |
| 2026-07-20 | implement | `deliverOrderAction` revalida também `/crm/products` | Entrega credita estoque — a listagem de produtos ficaria stale sem o revalidate |

## Milestones
<!-- Espelho do tasks.md — checkbox lá é a fonte de verdade -->

- [x] Milestone 1: Contrato compartilhado
- [x] Milestone 2: Banco (schema + migração `0007_rare_solo.sql`)
- [x] Milestone 3: API (módulo orders — 37 testes do módulo; suíte api 351/351)
- [x] Milestone 4: Web (tela Pedidos — 280/280; build de produção ok)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-20 | 1 | intake/spec | Intake, CRM-09 no roadmap, spec set escrito e APROVADO pelo spec-verifier (rodada 1) | Achados incorporados |
| 2026-07-20 | 1 | implement | 8 tasks por 8 implementers isolados (2 retomados após queda de API); achado place×cancel → critério emendado | Ver Decisions Log |
| 2026-07-20 | 1 | qa | Implement-verifier neutro: **APROVADO rodada 1** — 784 testes, lint/typecheck/build ok, runtime provado (401/health); 3 SUGESTÕES registradas em review.md, nenhum CRÍTICO/ALERTA | validate.md e review.md gravados |
| 2026-07-20 | 1 | graduate/handoff | ADR-0015; domínio (Order/OrderItem + invariante 6); lesson EvalPlanQual; known-issue E2E atualizado; roadmap `[R]` | Handoff entregue |
