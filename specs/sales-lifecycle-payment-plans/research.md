---
feature: sales-lifecycle-payment-plans
status: complete
created: 2026-09-09
updated: 2026-09-09
---

# Research: sales-lifecycle-payment-plans

## Estado atual confirmado

- `POST /sales` nasce `completed`, exige estoque e baixa `products.stock_qty` na criação.
- Dinheiro, PIX e cartão são tratados como recebidos sem linha financeira; somente `credit` gera `receivables`.
- O cancelamento atual repõe estoque e remove parcelas pendentes; venda com parcela paga não pode ser cancelada.
- Produtos calculam `lowStock` pelo estoque físico, sem reserva ou disponibilidade.
- O dashboard usa `sold_at` e vendas `completed` para realizado; não separa negociação aberta de saldo a receber.
- A agenda busca/valida apenas vendas `completed`, portanto precisa acompanhar o novo significado de venda ativa.
- O pedido de reposição consome `lowStock`; ao tornar esse indicador baseado na disponibilidade, a demanda reservada passa a aparecer naturalmente na sugestão.

## Pontos de integração encontrados

| Fluxo | Código afetado | Decisão |
|---|---|---|
| Agenda → venda | `appointments.repository.ts` e `appointments/actions.ts` | Aceitar `open` e `completed`; rejeitar `canceled`. O vínculo existente é histórico e não é apagado ao cancelar a venda. |
| Produto → venda pendente | queries e DELETE de produtos | Somar itens de vendas abertas não entregues; bloquear exclusão enquanto houver reserva ativa. |
| Pedido → estoque baixo | produto/summary e formulário de pedido | Usar `availableQty`, mas chegada do pedido só aumenta estoque físico; entrega da venda continua explícita. |
| Recebíveis → dashboard | sales/receivables/dashboard | Toda venda positiva ganha expectativa financeira; realizado usa `completed_at`, previsão aberta fica separada. |

## Alternativas avaliadas

### Coluna mutável de reserva

Rejeitada. Reserva derivada de `sale_items` + venda aberta/não entregue evita drift e compensações em criar, cancelar e entregar. O saldo disponível pode ficar negativo de propósito: ele representa necessidade real de reposição e não promessa física garantida.

### Bloquear venda pendente sem estoque

Rejeitada. Contraria o fluxo aprovado de encomenda. O bloqueio existe somente ao marcar entrega, quando o estoque físico precisa estar disponível.

### Pagamento parcial dentro de uma parcela

Adiado. A baixa continua integral por recebível; o estado `partial` aparece quando parte das N parcelas foi paga. Valor parcial dentro de uma mesma parcela exigiria ledger, rateio, histórico de estorno e reconciliação próprios.

### Usar `delivered_at` para receita realizada

Rejeitada. A regra de produto aprovada define venda concluída somente após entrega e pagamento; por isso o reconhecimento no CRM usa `completed_at`. `delivered_at` continua disponível para operação/logística.

### Excluir produto mesmo reservado e ignorá-lo na entrega

Rejeitada por confiabilidade. Isso faria uma demanda ativa desaparecer do estoque e impediria a baixa futura. A exclusão é bloqueada enquanto houver reserva; depois de entrega/cancelamento, snapshots preservam o histórico conforme ADR-0013.

## Migração e concorrência

- O histórico do schema `0010` já representa vendas ativas com estoque baixado; essas linhas devem nascer entregues no novo modelo.
- Métodos imediatos legados são liquidados no backfill; `credit` preserva as parcelas e só fica concluído se todas estiverem pagas.
- A mudança deve ser expand → backfill custom → constraints, validada literalmente desde `0000`; o deploy precisa parar `api`/`web` antes do snapshot para tornar a janela sem escrita verificável.
- Entrega, pagamento e cancelamento precisam travar a venda primeiro. Produtos são atualizados em ordem determinística e com saldo condicional para impedir baixa dupla/estoque negativo.

## Ajustes após a revisão neutra

- Cancelamento passa a preencher `receivables.voided_at`, preservando o plano e removendo-o dos valores cobráveis; linhas não são mais apagadas.
- A matriz em `spec.md` separa quantidade comercial de parcelas da quantidade de recebíveis e define todos os casos válidos/inválidos, inclusive total zero.
- O schema 0010 não possui `sales.installments`: crédito ativo positivo deriva N das linhas existentes; crédito cancelado ou zero usa fallback técnico 1 com `paymentPlanKnown=false`, sem inventar quantidade/data perdida.
- Criação e DELETE serializam pela linha do produto para que uma reserva nunca perca o vínculo em corrida concorrente.

## Conclusão

A proposta agrega valor se “venda”, “entrega” e “pagamento” forem dimensões distintas, mantendo um status principal simples. A reserva derivada dá visibilidade de reposição sem falsificar estoque físico; os planos estruturados tornam “A receber” completo; e a conclusão automática na última condição reduz trabalho manual sem esconder o estado real.
