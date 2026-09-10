---
feature: sales-lifecycle-payment-plans
phase: qa
status: aprovado-com-pendencias
updated: 2026-09-10
---

# Review: sales-lifecycle-payment-plans (CRM-12)

> **Natureza desta revisão**: auditoria pedida pelo humano ("está tudo ok para
> deploy?") e executada pelo mesmo agente que aplicou as correções — **não** é a
> revisão neutra e isolada que a Task 4.1 exige. Os achados abaixo foram
> encontrados por leitura do diff `main...HEAD` + execução real; as correções
> estão cobertas por teste. Uma revisão neutra continua sendo o padrão do
> projeto para uma feature deste tamanho.

## Achados

### CRÍTICO-01 — `overdue` nulo quebra o contrato de toda venda "receber na entrega"

`overdueExpression` comparava `due_date < CURRENT_DATE` sem `COALESCE`. Com
`due_kind = on_delivery` a data é NULL, a comparação devolve NULL e `overdue`
(boolean no contrato) saía nulo — a resposta de `POST /sales`, do detalhe e de
`GET /receivables` falhava a validação Zod no cliente. Atingia o fluxo central
da feature.
**Corrigido**: `COALESCE(due_date < CURRENT_DATE, false)`.
**Teste**: `sales.integration.test.ts` — "cobrança na entrega entra na lista sem
data e sem atraso".

### CRÍTICO-02 — dashboard somava cobrança anulada em "a receber"

`dashboard.repository` filtrava só `paid_at IS NULL`, sem `voided_at IS NULL`
(o `receivablesSummary` de sales já tinha sido atualizado, o do dashboard não).
Toda venda cancelada continuaria cobrando no painel — e o backfill cria uma
cobrança anulada com o valor cheio para cada crédito legado cancelado.
**Corrigido**: `voided_at IS NULL` nos três agregados.
**Teste**: `dashboard.integration.test.ts` — "parcela ANULADA de venda cancelada
fica fora de pendente e de atrasado".

### CRÍTICO-03 — listagem de vendas com estado financeiro de fachada

`toSaleListItem` devolvia `paidCents: 0`, `outstandingCents: totalCents` e
`paymentStatus: "pending"` fixos: venda quitada aparecia como pendente com o
valor inteiro em aberto (RF-09 exige o cálculo real em uma instrução).
**Corrigido**: subquery escalar `paidCents` na própria listagem e uma regra
única (`derivePaymentSummary`) compartilhada por lista, detalhe e composer.
**Teste**: "listagem devolve o estado financeiro REAL de cada venda" + "venda
cancelada não exibe dívida nem crédito cobrável".

### ALERTA-04 — criação lia o catálogo fora da transação e usava o relógio da app

`createSale` compunha a venda com produtos lidos antes da transação e
`new Date()` da aplicação — contra o RF-04, que exige lock das linhas e
`transaction_timestamp()` único. Abria janela entre ler o produto e inserir o
item (corrida com DELETE) e fazia os CHECKs temporais cross-table dependerem do
relógio da API. O comentário no código afirmava o lock que não existia.
**Corrigido**: a port passou a receber `{ productIds, compose }`; o repository
trava `products` com `FOR UPDATE` ordenado por id, obtém um único
`transaction_timestamp()` e só então compõe. `findProductsByIds` saiu da port de
sales (não há mais leitura de catálogo fora da transação).
**Teste**: "criação recebida e entregue grava UM instante canônico em todos os
campos correlatos".

### ALERTA-05 — agenda rejeitava venda em aberto (RF-13 não implementado)

`appointments.repository` exigia `status = 'completed'` para vincular. Depois da
migração, vendas legadas de crédito que voltam a `open` e toda venda nova em
aberto ficariam sem vínculo — justamente a encomenda combinada no compromisso.
**Corrigido**: aceita `open | completed`, rejeita `canceled`; a action do web
busca os dois status em paralelo e o seletor mostra o status no rótulo.
**Testes**: "vincular venda ABERTA ⇒ 200" e "vincular venda CANCELADA ⇒ 422".

### ALERTA-06 — mensagem de estoque insuficiente na entrega sempre dizia "restam 0"

`InsufficientStockError(item.productName, 0)` era literal. `core.md` exige
mensagem acionável e correta.
**Corrigido**: lê o estoque atual na mesma transação, como a criação já fazia.
**Teste**: "entrega sem estoque suficiente informa a quantidade REAL restante".

### ALERTA-07 — leituras compostas sem snapshot coerente (RF-09/RF-10)

Detalhe da venda (3 queries) e resumo do dashboard (5 queries) podiam misturar
commits durante uma transição concorrente.
**Corrigido**: ambos em transação `REPEATABLE READ` / `read only`.

### ALERTA-08 — cobrança anulada aparecia em "quem me deve" no modo histórico

Com `?pending=false` as cobranças anuladas entravam na lista de cobrança.
**Corrigido**: `voided_at IS NULL` incondicional na listagem (elas continuam
visíveis no detalhe da venda) + ordenação determinística por `due_kind`.

### SUGESTÃO-09 — UI não mostrava os novos estados

O detalhe exibia só `status` ("Em aberto" sem dizer o que falta); produto exibia
só o estoque físico, contradizendo o selo de estoque baixo (que já usa a
disponibilidade); o aviso de cancelamento ainda dizia que as parcelas são
"removidas".
**Corrigido**: detalhe passou a mostrar forma+condição+parcelas, entrega (com
data) e pagamento (com saldo), além do aviso de plano histórico desconhecido;
produto e card mostram reservado/disponível quando há reserva; textos de
cancelamento reescritos (anulação + devolução física quando entregue).

## Conformidade

- **Camadas** (`api.md`): regra de negócio segue no service — o repository
  recebe uma função de composição, não a implementa. Nenhum módulo importa
  internals de outro.
- **Dinheiro**: inteiro em centavos em todo o caminho novo; agregados em
  `bigint` com `toSafeInteger`.
- **Segurança** (`security.md`): rotas seguem default-deny; nenhuma mensagem nova
  vaza internals; nenhum dado pessoal em log.
- **Migrações** (`database.md`): expansão → backfill → contração, versionadas, com
  auditoria fail-closed; nenhuma migração aplicada foi editada.
- **Git** (ADR-0006): nada commitado, empurrado ou mesclado — trabalho no working
  tree.

## Veredito

**Aprovado para deploy com pendências declaradas.** Os quatro defeitos que
atingiam dados ou o contrato (CRÍTICO-01..03, ALERTA-04) estão corrigidos e
cobertos por teste; gates, runtime e **ensaio contra o dump real de produção**
verdes (`validate.md`) — a migração preserva vendas, itens, valores e estoque.

Seguem registradas as pendências de concorrência, performance, E2E e extração
dos helpers do formulário (`validate.md`), e o aviso de que "vendas do mês"
muda para uma venda do histórico ao passar a contar por `completed_at`.
