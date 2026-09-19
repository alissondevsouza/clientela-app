# ADR-0024 — Exclusão de venda pela consultora (emenda a invariante "venda não se apaga")

- **Status**: Aceito
- **Data**: 2026-09-19
- **Emenda**: invariante 5 de `04-domain-model.md` e item 3 do [ADR-0013](./0013-sales-snapshot-set-null.md)

## Contexto

O domínio afirmava, desde o CRM-06, que "venda não se apaga — cancela-se". O [ADR-0013](./0013-sales-snapshot-set-null.md) item 3 fechava a questão: "sem edição de venda: apenas cancelamento". O [ADR-0023](./0023-sale-lifecycle-and-payment-plans.md) reforçou: "cancelar anula, não apaga".

A regra nasceu correta para o caso que tinha em mente: uma venda que **aconteceu** é registro financeiro e não deve desaparecer do histórico.

O que a realidade trouxe foi outro caso. A consultora recadastrou o catálogo inteiro do zero e precisou remover as vendas antigas para reinserir o histórico sem duplicar. A única saída disponível era acesso SSH à VPS e `DELETE` em SQL, executado por terceiro — e a operação correta não é óbvia: apagar a venda **não** devolve estoque, e a regra de devolução tem três estados em que dois não devem creditar nada. Concentrar isso numa pessoa com acesso ao banco é bus factor e risco de corromper o estoque em silêncio.

Cancelar não resolvia. O cancelamento é bloqueado quando existe cobrança paga, e toda venda à vista nasce com uma cobrança sintética já baixada (ADR-0023). Limpar duplicatas por cancelamento exigiria estornar e cancelar venda a venda, e ainda deixaria dezenas de vendas fantasma na lista. Durante a implementação, o teste do caso "entregue → cancelada → excluída" esbarrou exatamente nisso: com venda à vista, o `cancel` responde 409 antes de a venda chegar a "cancelada".

## Decisão

Cancelar e excluir passam a ser **verbos distintos**, ambos disponíveis, porque descrevem fatos diferentes:

- **cancelar** = a venda existiu e não se concretizou (a cliente desistiu, devolveu o produto). O registro sobrevive porque aconteceu;
- **excluir** = a venda nunca existiu (duplicata, erro de digitação, teste). Não há histórico a preservar — há lixo a remover.

A invariante 5 passa a valer para o primeiro caso. Um erro de digitação não é uma venda, e mantê-lo como "venda cancelada" para sempre não preserva o histórico: polui.

A exclusão (`DELETE /sales/:id`) **reverte os efeitos e remove as linhas na mesma transação**, nunca um `DELETE` cru:

1. venda **entregue e não cancelada** (`delivered_at IS NOT NULL AND status <> 'canceled'`) ⇒ os itens **voltam** ao estoque;
2. venda **aberta não entregue** ⇒ estoque intocado (nunca foi debitado; a reserva é derivada e desaparece com as linhas);
3. venda **já cancelada** ⇒ estoque intocado (o cancelamento já devolveu, se havia o que devolver).

Itens com `product_id` nulo (produto excluído depois da venda, ADR-0013 item 2) são ignorados na devolução. O `UPDATE products` é escopado por `consultant_id` e os itens são percorridos ordenados por `product_id`, na mesma ordem da baixa (anti-deadlock). A venda é travada com `SELECT ... FOR UPDATE`; a cascata do banco leva `sale_items` e `receivables`, e `appointments.sale_id` vira nulo, preservando o compromisso da agenda.

Diferente do cancelamento, a exclusão é **permitida com cobrança paga** — é o caso de uso central — e não tem trava de prazo. A proteção é de interface: confirmação em dois passos cujo aviso reflete o estado real da venda, incluindo o valor já recebido que sairá do histórico.

## Alternativas consideradas

- **Manter só cancelamento**: rejeitada. Não resolve o caso real (bloqueio por cobrança paga), deixa registros fantasma permanentes e mantém a limpeza dependente de SQL manual em produção.
- **Soft delete / lixeira**: rejeitada. O projeto não usa soft delete por padrão (`database.md`), e uma venda "excluída mas presente" reintroduz o problema que a exclusão existe para resolver — o registro continuaria atrapalhando agregados e listagens, ou exigiria filtrar em todo lugar.
- **Permitir editar a venda em vez de excluir**: rejeitada por ora. Editar item, valor ou pagamento exigiria recompor estoque e cobranças a cada alteração, com muito mais superfície de erro. Corrigir uma venda continua sendo excluir e registrar de novo.
- **Restringir a exclusão a vendas recentes**: rejeitada. A limpeza que motivou a decisão é justamente de vendas antigas.

## Consequências

- A consultora resolve sozinha a classe de problema que hoje exige acesso ao banco de produção. A lógica correta de estoque passa a viver em código testado, não na cabeça de quem roda o SQL.
- Exclusão é **irreversível** e destrói registro financeiro (itens, cobranças, baixas). O risco é aceito e mitigado só na interface. Não há desfazer.
- Agregados históricos mudam quando uma venda antiga é excluída — o faturamento de um mês passado pode diminuir. É o comportamento pretendido.
- O quadrante mais perigoso é "venda entregue, depois cancelada, depois excluída": creditar estoque ali seria crédito em dobro silencioso. Protegido por caso de integração dedicado e por teste de concorrência `excluir × cancelar`, já que `cancel` é a única outra operação que credita estoque.
- Cancelar permanece inalterado, inclusive o bloqueio com cobrança paga.
