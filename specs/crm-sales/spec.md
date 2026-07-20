---
feature: crm-sales
module: api, web, shared
phase: spec
status: draft
size: L
created: 2026-07-18
updated: 2026-07-18
---

# Spec: crm-sales (CRM-06 — Vendas, estoque e recebíveis)

## O Que

Registro de vendas no CRM: venda com itens (snapshot de nome/preço), **baixa atômica de estoque** (nunca negativo), formas de pagamento à vista (dinheiro/PIX/cartão) e **a prazo (fiado/parcelado)** gerando **recebíveis** com vencimento e baixa de pagamento ("quem me deve"). Cancelamento de venda (venda não se apaga) com devolução de estoque. Resolve a tensão LGPD × histórico registrada em known-issues: exclusão de cliente/produto passa a **desvincular** a venda (snapshot preserva o histórico financeiro).

## Por Que

CRM-06 do roadmap — o coração do "substituir o caderno". Invariantes de `04-domain-model.md`: (1) baixa atômica, estoque nunca negativo; (2) dinheiro inteiro em centavos; (3) Σ itens = total da venda e Σ recebíveis pagos nunca excede o total; (5) venda não se apaga — cancela-se.

## Requisitos

- **RF-01** — Migração com 3 tabelas (convenções `database.md`):
  - `sales`: `consultant_id` NOT NULL FK+índice `ON DELETE CASCADE` (exclusão da CONSULTORA leva os dados dela — consistente com clients/products; a inv. 5 "venda não se apaga" é regra de operação do negócio, não de exclusão da conta); `client_id` uuid **nullable** FK → clients `ON DELETE SET NULL` + índice (LGPD: excluir a cliente preserva a venda sem vínculo pessoal); `client_name` text NOT NULL (**snapshot** do nome no momento da venda — para histórico legível sem dado vivo... ver Restrições sobre LGPD do snapshot); `total_cents` integer NOT NULL CHECK ≥ 0; `payment_method` text CHECK ∈ `cash | pix | card | credit` (`credit` = a prazo/fiado); `status` text CHECK ∈ `completed | canceled` default completed; `sold_at` timestamptz NOT NULL default now.
  - `sale_items`: `sale_id` FK NOT NULL `ON DELETE CASCADE` + índice; `product_id` uuid **nullable** FK → products `ON DELETE SET NULL` + índice; `product_name` text NOT NULL (snapshot); `qty` integer NOT NULL CHECK > 0; `unit_price_cents` integer NOT NULL CHECK ≥ 0.
  - `receivables`: `sale_id` FK NOT NULL `ON DELETE CASCADE` + índice; `amount_cents` integer NOT NULL CHECK > 0; `due_date` date NOT NULL; `paid_at` timestamptz nullable (null = pendente).
- **RF-02** — Contratos em `packages/shared`: criação de venda (`clientId` uuid opcional/nullable — venda sem cliente identificada é permitida; `items` array 1..50 de `{ productId, qty 1..1000, unitPriceCents opcional ≥ 0 ≤ teto — default preço atual do produto }`; `paymentMethod` do enum; para `credit`: `installments` 1..24 default 1, `firstDueDate` ISO date obrigatória aceita a partir de **ontem** (tolerância de 1 dia sobre a data do servidor — cobre o fuso da consultora sem lógica de timezone), e **`total_cents ≥ installments`** (senão 422 pt-BR "valor menor que o número de parcelas" — evita parcela de 0 centavos que violaria o CHECK)), resposta de venda (com itens e recebíveis), query de listagem (paginação + filtro `status` + `clientId`), resposta de recebível (com dados da venda/cliente p/ a lista "quem me deve" + `overdue` derivado), labels/enums exportados. Mensagens pt-BR incl. campo ausente.
- **RF-03** — Criação da venda (`POST /sales`, autenticada, escopo da sessão) em **transação única**: valida itens contra produtos da consultora (produto inexistente ou de outra consultora ⇒ **422 idêntico** com o item apontado — não vaza existência); UPDATEs de estoque **ordenados por product_id** (anti-deadlock — vale também para a devolução no cancel); baixa estoque com `UPDATE ... SET stock_qty = stock_qty - qty WHERE id = $ AND stock_qty >= qty` — 0 linhas ⇒ rollback + `InsufficientStockError` (409) com mensagem pt-BR "Estoque insuficiente: restam N unidades de {produto}"; snapshot de nome/preço nos itens; `total_cents` = Σ qty×unit_price (**calculado no servidor**, nunca do cliente); `credit` ⇒ gera `installments` recebíveis com Σ exato = total (divisão em centavos: parcelas base = floor(total/n), resto de centavos distribuído nas primeiras parcelas; vencimentos mensais a partir de `firstDueDate` — mesmo dia, ajustando p/ último dia do mês quando não existir); métodos à vista não geram recebíveis.
- **RF-04** — Listagem e detalhe: `GET /sales` (paginada, `sold_at desc, id desc`, filtros status/clientId), `GET /sales/:id` (com itens e recebíveis). Venda de cliente excluída aparece com `clientId` null e `client_name` do snapshot.
- **RF-05** — Cancelamento (`POST /sales/:id/cancel`): só de venda `completed`; **bloqueado se houver recebível pago** (409, mensagem orientando estornar antes); em transação cuja **PRIMEIRA escrita é** `UPDATE sales SET status='canceled' WHERE id AND consultant_id AND status='completed'` (0 linhas ⇒ 409 — e serializa contra o PATCH de recebível, que trava a mesma linha), então checa `EXISTS` de recebível pago (⇒ rollback 409), **devolve o estoque** dos itens cujo `product_id` ainda exista (produto excluído não recebe estoque de volta — comportamento declarado) e remove recebíveis pendentes. Cancelar cancelada ⇒ 409. **Corrida cancelar × pagar: exatamente um dos dois vence** (nunca venda cancelada com parcela paga).
- **RF-06** — Recebíveis: `GET /receivables` (paginada, filtro `pending=true` default listando só pendentes, ordenada por `due_date asc, id asc`; cada item com venda/cliente e `overdue = due_date < hoje && !paid_at`); **`GET /receivables/summary`** (agregado SQL escopado: `pendingCents` — SUM dos pendentes, `overdueCents` e `overdueCount` dos vencidos — nunca derivar total financeiro de lista paginada); `PATCH /receivables/:id` body `{ paid: boolean }` — baixa (`paid_at = now`) e estorno (`paid_at = null`); recebível de venda cancelada não é pagável (409); pagar pago / estornar pendente ⇒ 409 explícito. **Serialização contra o cancelamento**: a transação do PATCH primeiro trava a linha da venda (`SELECT ... FROM sales WHERE id AND consultant_id FOR UPDATE`), re-checa `status = 'completed'` e só então grava — garantindo conflito com o `UPDATE sales` do cancel. Invariante: pagamento por parcela inteira ⇒ Σ pagos ≤ total estrutural (protegido por teste).
- **RF-07** — Exclusões (fecha o known-issue): `DELETE /clients/:id` e `DELETE /products/:id` **continuam permitidos** (LGPD/gestão) — as FKs `SET NULL` + snapshots preservam o histórico; nenhuma mudança de contrato nas rotas existentes (comportamento já era SET NULL na criação das FKs novas; testes provam venda intacta após exclusões).
- **RF-08** — Web `/crm/sales`: listagem (status badge, cliente ou "—", total `formatBRL`, data, forma de pagamento pt-BR) + bloco "A receber" alimentado pelo **`GET /receivables/summary`** (nunca da lista paginada): total pendente, atrasado em destaque, link para `/crm/sales/receivables`; estados obrigatórios; paginação/filtros preservados.
- **RF-09** — Web `/crm/sales/new`: form mobile-first — seleção de cliente (busca por nome, opcional), itens dinâmicos (produto por busca + qty + preço unitário editável pré-preenchido com o do produto, subtotal por linha e total geral ao vivo — exibição via formatBRL; centavos por parseBRLToCents), forma de pagamento; se a prazo: parcelas + primeiro vencimento; validações pt-BR; sucesso → detalhe da venda.
- **RF-10** — Web `/crm/sales/[id]`: detalhe com itens (snapshot), recebíveis (status pago/pendente/atrasado, botão "Dar baixa"/"Estornar" com confirmação leve), cancelamento com confirmação em 2 passos (avisos: devolve estoque; bloqueado com parcela paga), estados loading/error/not-found.
- **RF-11** — Web `/crm/sales/receivables` ("Quem me deve"): pendentes ordenados por vencimento, atrasados destacados (texto, não só cor), baixa direto da lista, WhatsApp da cliente (quando vinculada) via `toWaPhone`.
- **RF-12** — LGPD/logs: IDs apenas em logs; pt-BR; a11y; nenhum float em nenhuma camada.

## Critérios de Aceite

- [ ] (RF-01) Integração: tabelas/CHECKs/FKs/índices; `ON DELETE SET NULL` de client_id e product_id provados; CASCADE de sale_items/receivables com a venda (não haverá delete de venda em rota, mas a FK é declarada).
- [ ] (RF-03) Integração: venda à vista de 2 itens baixa estoque exato e não gera recebíveis; total = Σ servidor (payload com total forjado é ignorado/rejeitado); estoque insuficiente ⇒ 409 pt-BR com nome do produto E nada persiste (venda, itens, estoque intactos — atomicidade); duas vendas concorrentes do último item ⇒ exatamente uma sucede (guarda no UPDATE); produto de outra consultora ⇒ 422/404 sem vazar; unitPriceCents override respeitado; default = preço atual.
- [ ] (RF-03) Integração parcelamento: total 10000 em 3× ⇒ 3334+3333+3333 (Σ exata) com vencimentos mensais corretos (incl. 31/jan → 28/fev); 1× (fiado) ⇒ 1 recebível no vencimento.
- [ ] (RF-05) Integração: cancelar devolve estoque; com parcela paga ⇒ 409; recebíveis pendentes somem; cancelar cancelada ⇒ 409; venda cancelada mantém itens/total (histórico).
- [ ] (RF-06) Integração: lista pendentes ordenada por vencimento com overdue correto (clock não-real: comparar com data do banco/fixture); baixa seta paid_at; estorno limpa; pagar pago / estornar pendente ⇒ 409; pagar recebível de venda cancelada ⇒ 409; **summary** com fixtures conhecidas (pendingCents/overdueCents/overdueCount exatos, escopado por consultora, zeros sem dados).
- [ ] (RF-05/RF-06) Integração de **concorrência cancelar × pagar**: disparados em paralelo sobre a mesma venda `credit`, exatamente um sucede — estado final é (cancelada sem parcela paga) OU (completed com parcela paga); nunca cancelada com parcela paga.
- [ ] (RF-04/05/06) Integração cross-tenant: `GET /sales/:id`, `POST /sales/:id/cancel` e `PATCH /receivables/:id` de outra consultora ⇒ 404 idêntico ao inexistente; `GET /receivables` não vaza recebíveis de outra (join por sales.consultant_id provado).
- [ ] (RF-02) Unidade: venda `credit` com `total_cents < installments` ⇒ 422 pt-BR (e integração do caminho).
- [ ] (RF-03) Unidade `addMonthsClamped` ancorada no dia original: 31/jan → 28/fev (k=1) → **31/mar (k=2, sem drift)**; 29/fev bissexto; dez→jan.
- [ ] (RF-07) Integração: excluir cliente com vendas ⇒ 204 e a venda segue com snapshot; excluir produto vendido ⇒ 204 e item segue com snapshot; cancelamento pós-exclusão de produto não devolve estoque daquele item (comportamento declarado).
- [ ] (RF-02) Unidade (shared): enums, arrays 1..50, installments 1..24, firstDueDate no passado rejeitada, `{}` pt-BR.
- [ ] (RF-08..RF-11) Unidade dos helpers web + QA de runtime com checklist (venda à vista e parcelada pela UI real, baixa de parcela, cancelamento, "quem me deve" com atrasado destacado).
- [ ] (RF-12) QA: logs sem PII.

## Fora de Escopo

- Pagamento parcial de parcela; juros/multa; edição de venda (cancelar e refazer); devoluções parciais; relatórios (CRM-07/MKT-02); recibo/impressão; múltiplas formas de pagamento numa venda.

## Restrições Conhecidas

- **Snapshot de `client_name` × LGPD**: o nome vive na venda após exclusão da cliente. Decisão consciente: registro financeiro é obrigação legítima e a exclusão remove o CADASTRO (dados de contato/pessoais); se o humano preferir anonimizar o snapshot na exclusão, é ajuste pequeno — decisão registrada para revisão no handoff.
- Sem E2E (REL-01 — que já prevê "registro de venda" como fluxo a cobrir); QA de runtime obrigatória.
- Vitest sob Node (hasher scrypt na porta); clock: `overdue` derivado com data injetável/fixtures para determinismo.
- Vencimentos mensais: regra "mesmo dia, senão último dia do mês" (sem timezone — datas puras).
