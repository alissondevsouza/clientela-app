---
feature: crm-sales
module: api, web, shared
phase: tasks
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [plan.md]
---

# Tasks: crm-sales

## Milestone 1: Contratos e banco

- [x] **Task 1.1** — Shared: enums/labels (paymentMethod, saleStatus), `splitInstallmentAmounts` + `addMonthsClamped` (puras, tabelas exaustivas), createSaleSchema (items 1..50, installments 1..24, firstDueDate **≥ ontem** p/ credit — tolerância de 1 dia; anterior a ontem rejeitada pt-BR), saleSchema (com itens/recebíveis), listagens, receivableSchema (+ overdue), testes, reexports
  - Arquivos: `packages/shared/src/sales.ts` (+ teste), `index.ts`
  - Dependências: nenhuma · Paralelizável: sim
  - Verificação: `bunx vitest run packages/shared` verde ✓ (112 testes; 37 novos)
  - Implementado por: clientela-implementer #44 (2026-07-18). total≥installments fica no service (payload sem total); funções puras lançam em input inválido
- [x] **Task 1.2** — Tabelas `sales`/`sale_items`/`receivables` (FKs SET NULL/CASCADE + índices, CHECKs, enums via sql.raw importando valores de shared) + migração + integração das tabelas (SET NULL de client/product provados, CASCADE, CHECKs)
  - Arquivos: `apps/api/src/db/schema/{sales,sale-items,receivables}.ts`, `schema/index.ts`, `apps/api/drizzle/0005_*.sql`, `apps/api/src/db/sales-tables.integration.test.ts`
  - Dependências: 1.1 (enums de shared) · Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/db` verde ✓ (58 testes; migração `0005_motionless_doctor_octopus.sql`)
  - Implementado por: clientela-implementer #45 (2026-07-18)

## Milestone 2: API — vendas e recebíveis

- [x] **Task 2.1** — Erros (+3 de 422: InvalidSaleItem/Credit/Client) + repository transacional completo + service + unidade
  - Verificação: 15 testes verdes ✓
  - Implementado por: clientela-implementer #47 (2026-07-18). Decisões: produtos batch via porta do próprio repository (service só depende de repository); snapshot de clientName resolvido na transação (sentinel "Cliente não identificada" p/ venda anônima); 404×409 no cancel via SELECT posterior; toSafeInteger replicado
  - Arquivos: `apps/api/src/modules/sales/{sales.errors,sales.repository,sales.service,sales.service.test}.ts`
  - Dependências: 1.1, 1.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api/src/modules/sales` verde
  - Implementado por: —
- [x] **Task 2.2** — Rotas completas via route-auth, error-handler (2×404, 2×409, 3×422), wiring, fakes + **contrato `receivableListItemSchema`** fechado (shared + join com clients.whatsapp + parse do web)
  - Verificação: 584 testes / 3 workspaces verdes ✓
  - Implementado por: clientela-implementer #48 (2026-07-18)
  - Arquivos: `apps/api/src/modules/sales/sales.routes.ts`, `plugins/error-handler.ts`, `apps/api/src/{app,index}.ts` (+ fakes)
  - Dependências: 2.1 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde
  - Implementado por: —
- [x] **Task 2.3** — Integração completa (26 testes; concorrência estoque + cancelar×pagar estáveis em re-execuções; zero discrepâncias)
  - Verificação: `bunx vitest run apps/api` verde ✓ (292 testes / 22 arquivos)
  - Implementado por: clientela-implementer #50 (2026-07-18). Nota: firstDueDate fixo `2026-08-31` no teste do clamp — vira passado após ago/2026 (avaliar na QA/handoff)
  - Arquivos: `apps/api/src/modules/sales/sales.integration.test.ts`
  - Dependências: 2.2 · Paralelizável: não
  - Verificação: `bunx vitest run apps/api` verde
  - Implementado por: —

## Milestone 3: Web — vendas

- [x] **Task 3.1** — Helpers `sales-api.ts` (createSale/listSales/getSale/cancelSale/listReceivables/**getReceivablesSummary**/setReceivablePaid; 409 ⇒ conflict com mensagem da API) + testes
  - Arquivos: `apps/web/src/lib/sales-api.ts` (+ teste)
  - Dependências: 1.1 · Paralelizável: sim (com M2)
  - Verificação: `bunx vitest run apps/web` verde ✓ (206 testes; 30 novos)
  - Implementado por: clientela-implementer #46 (2026-07-18). **Gap escalado**: falta `receivableListItemSchema` (dados venda/cliente) em shared — resolver na 2.2 (shared + repository + helper)
- [x] **Task 3.2** — Listagem `/crm/sales` + `/crm/sales/receivables` ("Quem me deve") + componentes + setReceivablePaidAction + estados
  - Verificação: 206 testes web + build verdes ✓
  - Implementado por: clientela-implementer #49 (2026-07-18). receivable-row client c/ useTransition (feedback de erro); action revalida também o detalhe via saleId opcional
  - Arquivos: `apps/web/src/app/(crm)/crm/sales/{page,loading,error}.tsx`, `receivables/{page,loading,error}.tsx`, `components/sales/{sale-card,sale-status-badge,receivable-row,receivables-summary}.tsx`, parte de `actions.ts` (setReceivablePaidAction)
  - Dependências: 3.1, 2.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes
  - Implementado por: —
- [x] **Task 3.3** — Nova venda `/crm/sales/new`: sale-form (useFieldArray, buscas via actions, preview de total/parcelas via `lib/sale-total.ts` puro testado, anti duplo-clique) + actions + página
  - Verificação: 218 testes web + build verdes ✓
  - Implementado por: clientela-implementer #51 (2026-07-18). Validação por safeParse do contrato (ZodEffects sem .shape); radios p/ pagamento
  - Arquivos: `apps/web/src/components/sales/sale-form.tsx`, `apps/web/src/app/(crm)/crm/sales/new/page.tsx`, `actions.ts` (create + searches)
  - Dependências: 3.2 · Paralelizável: não
  - Verificação: typecheck + vitest + build web verdes
  - Implementado por: —
- [x] **Task 3.4** — Detalhe `/crm/sales/[id]`: itens snapshot, `sale-receivable-row` (baixa/estorno 2 passos), cancel-sale-button, estados
  - Verificação: 218 testes web + build (`/crm/sales/[id]` ƒ) verdes ✓
  - Implementado por: clientela-implementer #52 (2026-07-18)
  - Arquivos: `apps/web/src/app/(crm)/crm/sales/[id]/{page,loading,error,not-found}.tsx`, `components/sales/cancel-sale-button.tsx`, `actions.ts` (cancelSaleAction)
  - Dependências: 3.2 · Paralelizável: com 3.3 (arquivos disjuntos exceto actions.ts — 3.3 cria, 3.4 estende; executar 3.3 → 3.4 OU combinar edições com cuidado; ordem definida: 3.3 antes)
  - Verificação: typecheck + vitest + build web verdes
  - Implementado por: —

## Milestone 4: Checkpoint

- [x] **Task 4.1** — lint + typecheck + test (raiz) + build web
  - Verificação: tudo verde ✓ (2026-07-18: Biome 221 arquivos; typecheck 3 workspaces; 622 testes; build web ok na 3.4)
  - Implementado por: orchestrator (checkpoint)

## Ordem de Execução

1.1 → 1.2 → 2.1 → 2.2 → 2.3; 3.1 após 1.1 (∥ M2); 3.2 após 3.1+2.2 → 3.3 → 3.4 → 4.1.

## Definition of Done (agregado)

- [ ] Critérios do spec.md testados · lint/typecheck/test verdes · build ok · rules/ADRs · known-issue fechado
