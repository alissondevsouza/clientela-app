# ADR-0023 — Ciclo de venda em aberto, planos de pagamento e reserva de estoque

- **Status**: Aceito
- **Data**: 2026-09-10

## Contexto

Até a CRM-11 a venda nascia `completed`, baixava o estoque na hora e tratava dinheiro, PIX e cartão sempre como recebidos; só `credit` gerava recebíveis. Isso não representa o fluxo real da consultora: ela combina a venda antes de ter o produto (encomenda), entrega depois, recebe antes, na entrega ou parcelado, e usa o cartão da cliente em débito ou crédito. O modelo antigo também misturava três coisas distintas num único campo `status` — o que foi vendido, o que foi entregue e o que foi pago — e deixava valor futuro fora de "A receber".

Já existe banco de produção com dados reais (LP-12), então qualquer mudança precisa preservar histórico, snapshots financeiros (ADR-0013, ADR-0014, ADR-0022) e estoque.

## Decisão

**Três dimensões independentes.** `sales.status` (`open | completed | canceled`) é persistido; entrega é derivada de `delivered_at`; pagamento é derivado das cobranças (`pending | partial | paid | voided`). Uma venda só é `completed` quando está entregue **e** integralmente paga. `completed_at`, `delivered_at` e `canceled_at` registram cada evento, com CHECK de matriz temporal no Postgres.

**Plano de pagamento explícito.** `payment_condition` (`received | on_delivery | installments`), `card_type` (`debit | credit`, nulo fora de cartão) e `installments` (1..24) descrevem o combinado. Um CHECK de matriz no banco recusa combinação impossível (cartão de débito parcelado, dinheiro parcelado etc.). A criação aceita apenas `cash | pix | card`: `credit` sobrevive somente como leitura do histórico anterior a esta ADR.

**Toda venda com valor gera cobrança.** `received` cria uma liquidação já paga; `on_delivery`, uma cobrança sem data (`due_kind = on_delivery`), materializada na entrega; `installments`, N cobranças com soma exata. A soma estrutural das cobranças não anuladas é sempre o total — dinheiro à vista deixa de ser um caso sem registro financeiro.

**Cancelar anula, não apaga.** Cobrança pendente de venda cancelada recebe `voided_at`; nada é removido. O plano continua auditável no detalhe da venda, e cobrança anulada fica fora de "quem me deve", do resumo e do dashboard. Cancelar continua bloqueado enquanto houver parcela paga (estorne antes).

**Reserva derivada, nunca persistida.** `reservedQty` é a soma dos itens de vendas `open` não entregues; `availableQty = stockQty - reservedQty` e pode ficar negativo para revelar reposição. Venda em aberto **não** move estoque físico — a baixa acontece na entrega. `lowStock` passa a usar a disponibilidade; capital em estoque continua usando o estoque físico. Excluir produto reservado retorna 409; criação e DELETE serializam pela linha do produto (`SELECT ... FOR UPDATE`).

**Tempo canônico do banco.** Na criação, o repository lê um único `transaction_timestamp()` dentro da transação e todos os campos correlatos (`sold_at`, `created_at`, `updated_at`, `delivered_at`, `completed_at`, `receivables.*`) recebem exatamente esse valor — as relações temporais dos CHECKs não dependem do relógio da aplicação nem de defaults independentes.

**Faturamento por conclusão.** "Vendas do mês" e lucro realizado passam a usar `completed_at`, não a data da negociação; vendas abertas aparecem separadas (`openSalesCents`/`openSalesCount`) e nunca se misturam ao realizado.

**Migração em três passos** (`0011` expansão → `0012` backfill *fail-closed* → `0013` contração), com auditoria antes e pós-condições depois. Venda de crédito legada concluída com parcela em aberto volta a `open`; crédito cancelado ou de total zero perde o N original e é marcado honestamente com `payment_plan_known = false`.

## Alternativas consideradas

- **Manter um único `status` com mais valores** (`aguardando_entrega`, `aguardando_pagamento`, …): rejeitada — o produto cartesiano de entrega × pagamento explode em estados e impede consultar "tudo que falta entregar" sem enumerar combinações.
- **Coluna `reserved_qty` persistida**: rejeitada — duplicaria a verdade que já está nos itens das vendas abertas e exigiria manter dois números sincronizados em toda transição.
- **Baixar estoque na criação e devolver no cancelamento** (como antes): rejeitada — impede registrar encomenda sem estoque, que é justamente o caso de uso da mudança.
- **Apagar cobranças ao cancelar** (comportamento anterior): rejeitada — destrói o plano combinado e a soma estrutural, e apaga a razão pela qual a venda existia.
- **Continuar aceitando `credit` na criação**: rejeitada — o método dizia "a prazo" e escondia o instrumento real (PIX, cartão); o parcelamento agora é uma condição, não uma forma de pagamento.
- **Inferir o parcelamento perdido do crédito cancelado**: rejeitada — o schema `0010` não guardava N; inventar um número é pior que declarar que o histórico não tem essa informação.
- **`timestamp` da aplicação em cada escrita**: rejeitada — dois relógios (app e banco) em CHECKs cross-table produzem violação intermitente sob desvio de relógio.
- **Migração em uma migração só**: rejeitada — apertar constraint antes do backfill trava a migração no meio, com o schema já alterado.

## Consequências

- O CRM passa a representar encomenda, entrega e recebimento separadamente; "A receber" inclui o que era invisível.
- Os números do dashboard **mudam** no deploy: venda concluída num mês diferente do fechamento migra de mês, e vendas em aberto saem do faturamento realizado.
- Toda venda à vista do histórico ganha uma cobrança paga sintética — cancelar uma dessas exige estornar a baixa antes (o 409 explica).
- O deploy que aplica `0012` é *fail-closed*: anomalia no histórico interrompe a migração com `api`/`web` já parados. Por isso o ensaio contra um restore do dump de produção passa a ser obrigatório antes do deploy (`docs/deploy-vps.md`).
- Reverter depois de aplicado exige forward-fix: as cobranças sintetizadas e os estados derivados não têm caminho automático de volta ao schema `0010`.
