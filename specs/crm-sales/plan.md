---
feature: crm-sales
module: api, web, shared
phase: plan
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md, research.md]
---

# Plan: crm-sales

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Snapshot (`client_name`, `product_name`, `unit_price_cents`) + FKs `SET NULL` em sales/sale_items | Fecha o known-issue LGPD×histórico sem bloquear exclusões; venda é registro imutável (domínio inv. 5); precedente do leads.client_id |
| Baixa de estoque com `UPDATE products SET stock_qty = stock_qty - $qty WHERE id = $ AND consultant_id = $ AND stock_qty >= $qty` por item, DENTRO da transação; qualquer item com 0 linhas ⇒ rollback + `InsufficientStockError` com nome e estoque atual | Invariante nunca-negativo sob concorrência (mesma técnica TOCTOU-safe do convert); CHECK ≥ 0 como última defesa |
| Total SEMPRE calculado no servidor (contrato de criação nem tem campo total) | Cliente não dita valor; inv. 3 do domínio estrutural |
| Parcelas: `splitInstallmentAmounts(totalCents, n)` pura em shared — base = floor(total/n), resto (total − base×n) distribuído +1 centavo nas primeiras parcelas; `addMonthsClamped(isoDate, k)` pura (aritmética de string/UTC-free, clamp p/ último dia do mês) | Σ exata garantida por construção + testável por unidade exaustiva; datas puras sem fuso |
| Enums: `paymentMethodValues = ["cash","pix","card","credit"]`, `saleStatusValues = ["completed","canceled"]` em shared; CHECK via sql.raw; labels pt-BR no shared (Dinheiro/PIX/Cartão/A prazo; Concluída/Cancelada) | Padrão leadStatus (fonte única shared ← db) |
| Módulo `sales` contém vendas E recebíveis (rotas `/sales*` e `/receivables*` no mesmo módulo) | Recebível é agregado da venda (domínio); módulo separado criaria dependência circular |
| Cancelamento em transação com **PRIMEIRA escrita** = `UPDATE sales SET status='canceled' WHERE id AND consultant_id AND status='completed'` (0 linhas ⇒ 409); depois `EXISTS` de recebível pago (⇒ rollback 409); devolução de estoque só para itens com product_id não-nulo; `DELETE receivables WHERE sale_id AND paid_at IS NULL` | Ordem importa: o UPDATE inicial serializa com o `FOR UPDATE` do setPaid |
| `setPaid` em transação: `SELECT id, status FROM sales WHERE id AND consultant_id FOR UPDATE` → status ≠ completed ⇒ 409 → update do paid_at (com guarda do estado atual: pagar pago/estornar pendente ⇒ 409) | Fecha a corrida cancelar×pagar (CRÍTICO da revisão): as duas transações disputam a linha da venda |
| `GET /receivables/summary`: SUM SQL escopado (pendingCents, overdueCents, overdueCount) — padrão products.summary | Total financeiro nunca derivado de lista paginada (CRÍTICO da revisão) |
| `credit` exige `total_cents ≥ installments` (422 pt-BR) — validado no service (total é do servidor) | Evita parcela 0 violando CHECK (ALERTA da revisão) |
| `consultant_id` em TODA guarda de escrita (sales UPDATE, setPaid SELECT FOR UPDATE, baixa de estoque já tinha) | ALERTA da revisão; domain-model proíbe atalho |
| `firstDueDate` aceita a partir de ontem (tolerância de 1 dia, data do servidor) | Fuso da consultora sem lógica de timezone |
| UPDATEs de estoque (baixa E devolução) sempre **ordenados por product_id** antes de executar | Duas transações com os mesmos produtos em ordens diferentes deadlockariam (500 em vez de 409) — rodada 2 da revisão |
| Erro de item: produto inexistente OU de outra consultora ⇒ **422 único** com o item apontado (mensagem idêntica nos dois casos) | Não vaza existência; teste não-ambíguo |
| Botão de submit da venda desabilitado durante a action (pending) | Duplo-submit criaria venda duplicada — item do checklist de QA |
| `overdue` usa CURRENT_DATE do Postgres (UTC): parcela vencendo hoje fica "atrasada" ~21h BRT | Aceito pelo porte (datas puras); registrado para não virar bug report |
| `overdue` calculado no SQL (`due_date < CURRENT_DATE AND paid_at IS NULL`) e no mapper com a MESMA regra | Fonte no banco (data do servidor pg — determinístico no Testcontainers via fixtures relativas) |
| Busca de cliente/produto no form de venda via **Server Actions finas** (`searchClientsAction`, `searchProductsAction`) reusando os api-helpers com o token do cookie | Browser nunca fala com a API (ADR-0008); RHF client chama action — padrão já provado (login/status) |
| Form de venda: RHF `useFieldArray` para itens; subtotais/total ao vivo somando centavos inteiros no client (exibição formatBRL) | Primeiro uso de field array; total exibido é preview — o servidor recalcula |
| Recebíveis pagáveis por parcela inteira (`PATCH { paid }` idempotente por estado atual: pagar pago ⇒ 409? **decisão: 200 no-op não; 409 explícito**) | Explícito > silencioso (padrão do projeto) |
| `receivables.consultant_id` NÃO existe — escopo via join com sales.consultant_id | Normalização; join indexado por sale_id |
| Rota `GET /sales/:id` retorna venda + itens + recebíveis em 1 payload (relational query `with`) | Proibido N+1 (database.md) |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/sales.ts` (+ teste) | Enums/labels, createSaleSchema, saleSchema (com itens/recebíveis), salesListQuerySchema, receivableSchema, receivablesListQuerySchema, `splitInstallmentAmounts`, `addMonthsClamped` |
| `apps/api/src/db/schema/{sales,sale-items,receivables}.ts` | Tabelas |
| `apps/api/drizzle/0005_*.sql` | Migração gerada |
| `apps/api/src/db/sales-tables.integration.test.ts` | Integração das tabelas/FKs/CHECKs |
| `apps/api/src/modules/sales/{sales.errors,sales.repository,sales.service,sales.service.test,sales.routes,sales.integration.test}.ts` | Módulo (vendas + recebíveis) |
| `apps/web/src/lib/sales-api.ts` (+ teste) | Helpers (createSale, listSales, getSale, cancelSale, listReceivables, setReceivablePaid) |
| `apps/web/src/components/sales/{sale-form,sale-card,sale-status-badge,payment-method-label? (const),receivable-row,cancel-sale-button,receivables-summary}.tsx` | UI |
| `apps/web/src/app/(crm)/crm/sales/{page,loading,error}.tsx`, `new/page.tsx`, `[id]/{page,loading,error,not-found}.tsx`, `receivables/{page,loading,error}.tsx`, `actions.ts` | Páginas/actions (incl. search actions) |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Reexports |
| `apps/api/src/db/schema/index.ts` | Reexports |
| `apps/api/src/plugins/error-handler.ts` | `SaleNotFoundError`/`ReceivableNotFoundError` → 404; `InsufficientStockError`/`SaleStateError` → 409 |
| `apps/api/src/{app,index}.ts` | Compor módulo sales |
| Fakes das suítes que montam createApp | Dep nova (padrão) |
| `apps/web/src/app/(crm)/crm/sales/page.tsx` | Substituir placeholder |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | `splitInstallmentAmounts` (exaustiva: restos 0..n−1), `addMonthsClamped` (31/jan→28/29-fev, dez→jan), service (validações, composição), schemas, helpers web |
| Integração (Testcontainers) | **Sim** | 3 tabelas + contrato + AS invariantes centrais do domínio (atomicidade, concorrência do último item, Σ parcelas, cancelamento) |
| E2E | **Pendência (REL-01 — já lista venda)** | Fluxo crítico de UI |
| Regressão | n.a. (não é BUG-NNN; known-issue fechado com testes próprios RF-07) | — |

## Checklist de QA de runtime (validate.md)

1. Venda à vista pela UI real (2 itens, cliente buscada): estoque baixa no banco; total correto; sem recebíveis; detalhe renderiza (lesson RSC×client: exercitar TODAS as pages novas em build de produção).
2. Venda a prazo 3× pela UI: recebíveis 3334/3333/3333 com vencimentos mensais; "A receber" soma; "Quem me deve" lista com atrasado destacado (semear parcela vencida via banco).
3. Baixa de parcela pela UI → some dos pendentes; estorno reaparece.
4. Cancelamento: com parcela paga ⇒ bloqueado com mensagem; sem paga ⇒ estoque devolvido (conferir no banco) e pendentes removidos.
5. Estoque insuficiente pela UI ⇒ erro pt-BR com nome do produto; nada persistido.
6. Excluir cliente com venda ⇒ venda segue com nome snapshot e "—"/aviso no vínculo; excluir produto vendido ⇒ item segue legível.
7. Payload com total/valores forjados via curl ⇒ ignorado (total do servidor).
8. Duplo-clique no submit da venda não cria duplicata (botão pending).
9. Logs sem PII; 401 nas rotas novas sem token.

## Migração de Banco

Aditiva (3 tabelas). Rollback = drop das 3.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Transação multi-item com N updates condicionais — corrida no último item | alta (é o risco do domínio) | Teste de concorrência dedicado (2 vendas paralelas, 1 unidade) + guarda no UPDATE |
| Drizzle relational `with` aninhado (sale→items+receivables) — 1º uso | média | Se `with` complicar, joins explícitos (permitido por database.md); teste de integração cobre shape |
| Form com useFieldArray + busca async — complexidade de UI | alta | Componentes pequenos; validação no submit pelo contrato; QA de runtime obrigatória em build de produção |
| addMonthsClamped com bordas (29/fev ano bissexto) | média | Tabela exaustiva na unidade |

## Definition of Done

- [ ] Critérios do spec.md testados · lint/typecheck/test verdes · build web ok · rules/ADRs · known-issue LGPD×vendas fechado na graduação
