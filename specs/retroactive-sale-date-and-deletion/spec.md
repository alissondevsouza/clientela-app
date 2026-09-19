---
feature: Data retroativa da venda e exclusão de venda
module: sales (packages/shared + apps/api + apps/web)
phase: spec
status: draft
size: L
created: 2026-09-19
updated: 2026-09-19
---

# Spec: Data retroativa da venda e exclusão de venda

## O Que

Duas mudanças no módulo de vendas, entregues no mesmo ciclo:

1. **Data da venda escolhível** — o registro de venda ganha um campo de data, pré-preenchido com hoje e alterável para qualquer data passada. A venda passa a ter a data em que *aconteceu*, não a data em que foi digitada.
2. **Exclusão de venda** — o detalhe da venda ganha um botão "Excluir venda" que reverte os efeitos da venda (estoque) e remove o registro, com confirmação em dois passos.

## Por Que

A consultora recadastrou o catálogo inteiro do zero (com o estoque histórico) e vai reinserir todas as vendas já realizadas para enxergar lucro e histórico reais.

Hoje isso é impossível de fazer direito:

- `createSaleSchema` não aceita data e o service carimba `soldAt: transactionNow` (`sales.service.ts:313`). Todo o histórico ficaria empilhado na data de digitação, tornando inútil qualquer leitura por período (lucro do mês, evolução, sazonalidade). Ela digita esse histórico **uma vez só** — a informação perdida agora não volta.
- Quando errar, não existe forma de remover a venda pela interface. A única saída hoje é SSH + SQL na produção, feito por terceiro: bus factor e risco real de corromper o estoque (a lógica de devolução tem três casos e um deles credita em dobro se for tratado errado).

Benefício permanente, além da migração: ela deixa de ser obrigada a registrar a venda no mesmo dia. Vendeu sábado, lançou segunda — a venda continua sendo de sábado. Para quem vende por WhatsApp e lança em lote, esse é o uso normal, não a exceção.

Roadmap: **CRM-13** (Fase 2). Depende de CRM-12 (`specs/sales-lifecycle-payment-plans`, hoje `[R]`).

## Requisitos

### Parte 1 — Data da venda

- **RF-01** — O formulário de registro de venda tem um campo de data ("Data da venda"), pré-preenchido com a data de hoje e alterável pela usuária, com piso em **01/01/2015** (constante nomeada; data anterior rejeitada com a mensagem "A data da venda não pode ser anterior a 01/01/2015"), para barrar erro de digitação de ano sem bloquear histórico legítimo.
- **RF-02** — Data futura é rejeitada. A guarda **autoritativa** é o service, comparando com o relógio do Postgres; o Zod dá o feedback imediato na interface. O banco garante apenas a coerência `sold_at <= updated_at` — um CHECK não pode chamar `now()`, então uma linha com ambos no futuro passaria pelo banco e é barrada antes, no service.
- **RF-03** — Quando a data escolhida é **hoje**, a venda é gravada com o instante do relógio da transação — comportamento idêntico ao atual. Quando é uma data **passada**, é gravada ao **meio-dia do fuso da aplicação** (`APP_TIME_ZONE`), via `appLocalDateTimeToUtc`.
- **RF-04** — Em venda retroativa, `delivered_at` e `completed_at` acompanham a data da venda; `created_at` e `updated_at` continuam registrando o relógio real (quando a linha foi criada/alterada).
- **RF-05** — As cobranças de venda retroativa acompanham a data da venda: a cobrança sintética de venda à vista nasce com `paid_at` e `due_date` na data da venda, não no relógio.
- **RF-06** — A validação de `firstDueDate` passa a ser relativa à **data da venda** (não pode ser anterior a ela), substituindo a regra atual "não pode ser anterior a hoje", que impede qualquer venda parcelada retroativa.
- **RF-07** — A data da venda exibida no CRM é o **dia local** (`APP_TIME_ZONE`) do instante gravado, não o dia UTC. Dentro do escopo de vendas o defeito está duplicado em quatro pontos (detalhe da venda — `soldAt` e `deliveredAt` —, card da venda, vínculo de venda na agenda e ações da agenda); a correção é um helper único e compartilhado. O mesmo defeito existe em outros três arquivos fora do escopo desta feature (cards de pedido e de lead, detalhe do pedido): ficam registrados em `known-issues.md` e viram item de roadmap, não são corrigidos aqui.

- **RF-16** — Quando a data escolhida é **passada**, os padrões do formulário passam a ser "entregue" **e** "já recebido" (a usuária pode alterar ambos). Hoje o formulário nasce com `deliveryStatus: "pending"` e `paymentCondition: "on_delivery"` (`sale-form.tsx:138-139`) — divergindo dos próprios defaults do contrato, que já são `delivered`/`received` (`packages/shared/src/sales.ts:283-287`). Deixado no padrão atual, o registro histórico não baixa estoque, fica `open` para sempre, reserva o produto, infla "a receber" e **nunca entra em faturamento nem em lucro**. Trocar só a entrega resolveria metade: com `on_delivery` a cobrança nasce com `paid_at` nulo, o status permanece `open` e a venda continua fora do faturamento.

### Parte 2 — Exclusão de venda

- **RF-08** — O detalhe da venda tem um botão "Excluir venda" com confirmação em dois passos: o primeiro clique abre um aviso com as consequências concretas (efeito no estoque, cobranças removidas, valor já recebido que some do histórico, compromisso desvinculado) e o segundo confirma.
- **RF-09** — A exclusão reverte o estoque conforme o estado da venda, em três casos: (a) venda entregue e não cancelada ⇒ os itens **voltam** ao estoque; (b) venda aberta e não entregue ⇒ estoque **não é tocado** (nunca foi debitado; a reserva é derivada e desaparece com as linhas); (c) venda já cancelada ⇒ estoque **não é tocado** (o cancelamento já devolveu, se havia o que devolver). Em qualquer caso, itens cujo produto já foi excluído (`product_id` nulo, ADR-0013 item 2) são ignorados na devolução — não há linha de produto para creditar.
- **RF-10** — A exclusão é permitida mesmo com cobrança já paga — ao contrário do cancelamento, que a bloqueia. O valor já recebido é exibido na confirmação antes de excluir.
- **RF-11** — A exclusão remove a venda, seus itens e suas cobranças numa única transação; compromissos da agenda vinculados à venda são **preservados**, apenas perdendo o vínculo.
- **RF-12** — A exclusão é escopada por consultora: venda inexistente ou de outra consultora responde 404 com a mesma mensagem (não vaza existência).
- **RF-13** — Não há trava de prazo: qualquer venda pode ser excluída, de qualquer data.
- **RF-14** — Cancelar continua existindo e inalterado. São verbos distintos: cancelar = a venda existiu e não se concretizou; excluir = a venda nunca existiu.

### Parte 3 — Coerência dos relatórios

- **RF-15** — O agregado "vendas do mês" / "lucro do mês" do dashboard passa a recortar o período por **`sold_at`** (mantendo o filtro de venda concluída), em vez de `completed_at`. Sem isso, uma venda retroativa a prazo quitada hoje entra no faturamento do mês da digitação, e não no mês em que a venda aconteceu — o oposto do objetivo da feature.

## Critérios de Aceite

- [ ] (RF-01) O formulário de nova venda exibe campo de data preenchido com a data de hoje; alterá-lo para uma data passada e salvar grava a venda naquela data.
- [ ] (RF-01) `soldOn` anterior a 01/01/2015 é rejeitado com a mensagem exata; 01/01/2015 é aceito.
- [ ] (RF-02) Enviar data futura à API retorna 422 com mensagem pt-BR; um INSERT direto com `sold_at > updated_at` é rejeitado pelo CHECK; um INSERT com `created_at > sold_at` (venda retroativa) é aceito.
- [ ] (RF-03) Venda criada com a data de hoje tem `sold_at` igual ao instante da transação; venda criada com data passada tem `sold_at` às 12:00 locais daquele dia (verificado no fuso da aplicação, não em UTC).
- [ ] (RF-04) Venda retroativa criada como entregue persiste com `delivered_at` = `sold_at` e satisfaz `sales_temporal_matrix_check`; `created_at` permanece o instante real da criação.
- [ ] (RF-05) Venda retroativa à vista gera cobrança com `paid_at` e `due_date` na data da venda, satisfazendo `receivables_temporal_matrix_check`.
- [ ] (RF-06) Venda retroativa parcelada com `firstDueDate` posterior à data da venda e anterior a hoje é aceita; `firstDueDate` anterior à data da venda é rejeitada com 422.
- [ ] (RF-07) O helper compartilhado converte um instante equivalente a 21:00 locais no dia local (teste em `.test.ts`), e `grep` não encontra definição residual de `toDatePart` nos quatro arquivos do escopo de vendas. A conferência visual dos quatro pontos fica como pendência de E2E.
- [ ] (RF-08) O helper puro deriva o texto de consequência correto para cada estado da venda (entregue / não entregue / cancelada / com valor recebido), verificado em `.test.ts`. O comportamento de dois passos do clique fica como pendência de E2E declarada.
- [ ] (RF-09) Excluir venda entregue devolve as quantidades ao estoque; excluir venda aberta não entregue deixa `stock_qty` inalterado e libera a reserva; excluir venda cancelada que havia sido entregue **não** credita estoque uma segunda vez.
- [ ] (RF-10) Excluir venda com cobrança paga responde sucesso e remove a venda (não retorna 409 como o cancelamento).
- [ ] (RF-11) Após excluir, a venda, seus itens e suas cobranças não existem mais; o compromisso que apontava para ela continua existindo com `sale_id` nulo.
- [ ] (RF-12) Excluir venda de outra consultora responde 404 com a mesma mensagem de venda inexistente, e a venda permanece intacta.
- [ ] (RF-13) Uma venda com data de mais de um ano atrás pode ser excluída sem erro.
- [ ] (RF-14) A suíte existente de cancelamento continua verde, sem alteração de comportamento.
- [ ] (RF-16) Escolher uma data passada muda os padrões para "entregue" e "já recebido"; escolher hoje mantém os padrões atuais; a usuária consegue alterar ambos. Verificado por teste do helper puro de decisão de padrões.
- [ ] (RF-16/ponta-a-ponta) Venda retroativa registrada **nos padrões do formulário** nasce `completed` e entra no faturamento e no lucro do mês da venda.
- [ ] (RF-09/ponta-a-ponta) Partindo de um produto com estoque inicial N, registrar M vendas retroativas entregues somando Q unidades resulta em `stock_qty` = N − Q; excluir todas devolve a N.
- [ ] (RF-09) Excluir venda entregue cujo item tem `product_id` nulo não falha e não altera nenhum produto.
- [ ] (RF-15) Venda retroativa a prazo, registrada com data de um mês anterior e quitada hoje, conta no faturamento e no lucro do **mês da venda** — não no mês corrente.

## Fora de Escopo

- **Editar uma venda existente** (data, itens, cliente ou forma de pagamento). O ciclo continua sendo criar → cancelar/excluir. Corrigir uma venda = excluir e registrar de novo.
- **Registrar venda a prazo já quitada em um passo.** Venda parcelada retroativa nasce com as parcelas pendentes; se já foram pagas, a consultora precisa dar baixa em cada uma. Ver Restrições.
- **Importação em lote / CSV** do histórico. A entrada continua sendo uma venda por vez pelo formulário.
- **Desfazer exclusão** (lixeira, soft delete, restauração). Exclusão é definitiva — daí a confirmação em dois passos.
- **Alterar o cancelamento**, incluindo a regra que o bloqueia com parcela paga.
- **E2E (Playwright)**: a infra não existe no projeto (REL-01 pendente). Consequência assumida: o projeto **não tem nenhuma forma de testar componente React** — não há jsdom, `@testing-library` nem um único `.test.tsx` (24 testes de `apps/web` são módulos `.ts` puros). Portanto o comportamento de interação (o campo renderizado, o primeiro clique que não exclui, o padrão que muda ao trocar a data) é coberto **extraindo a decisão para helper puro testável** e, no que sobra de puramente visual/interativo, registrado como pendência explícita de E2E no handoff — sem fingir cobertura.
- **Leitura de períodos passados**: esta feature torna o **dado** correto, não cria tela para lê-lo. Hoje o dashboard agrega só o mês corrente (`monthSalesScope`) e a listagem de vendas não tem filtro de data (`salesListQuerySchema` só tem `status` e `clientId`). Depois desta entrega, o histórico reinserido aparece corretamente na **lista cronológica** e no **mês corrente**; ver "lucro de março" depende do MKT-02 (relatórios, Fase 4). Nomeado no handoff para não criar expectativa falsa.
- **Corrigir o slice UTC fora do escopo de vendas** (cards de pedido e de lead, detalhe do pedido — 3 dos 7 pontos): mesmo defeito, arquivos de outros módulos. Vai para `known-issues.md` + roadmap.

## Restrições Conhecidas

- **Precondição da reentrada do histórico** (não é requisito de código, é procedimento): o `stock_qty` cadastrado em cada produto precisa ser o estoque **anterior** às vendas a reinserir, não o que restou hoje. As vendas retroativas entregues é que derrubam o estoque até o valor atual. Se o número cadastrado já for o atual, a reentrada bate em `InsufficientStockError` (mensagem pt-BR clara) no primeiro produto sem saldo. Cada venda histórica deve ser registrada como **entregue** (RF-16 ajuda, mas não impede o contrário) e com a condição de pagamento real — deixar em "a receber na entrega" mantém a venda aberta, reservando estoque e inflando "a receber". Vai para o handoff como procedimento.

- **Exclusão é irreversível** e destrói registro financeiro (itens, cobranças, baixas). A mitigação é de interface (confirmação em dois passos com consequências explícitas), não de dados.
- **Venda a prazo retroativa nasce vencida.** Cobranças com `due_date` no passado entram em "atrasado" no dashboard (`receivables.due_date < CURRENT_DATE`, `dashboard.repository.ts:88`). É informação verdadeira — a parcela venceu mesmo — mas, ao terminar de digitar o histórico, a consultora pode ver um volume grande de "atrasado" que na verdade já foi pago. Mitigar via comunicação no handoff; se incomodar, vira item de roadmap próprio ("registrar venda a prazo já quitada").
- **Mudança de semântica do faturamento (RF-15)**: hoje `monthSalesScope` (`dashboard.repository.ts:36-37`) recorta o mês por `completed_at`, materializando o "faturamento por conclusão" do ADR-0023. O RF-04 só resolve o caso da venda que **nasce** concluída (entregue + à vista): venda retroativa a prazo nasce `open` com `completed_at` nulo e, ao ser quitada, recebe `completed_at = now` (`sales.repository.ts:811-813`), caindo no mês da digitação. O RF-15 troca o recorte para `sold_at` e **emenda o ADR-0023 nesse ponto** — exige ADR próprio. Efeito colateral aceito: o faturamento de um mês passado pode aumentar retroativamente quando uma venda antiga for quitada.
- **Drift documentado**: o comentário de `dashboard.repository.ts:32` já afirmava `sold_at` enquanto o SQL usava `completed_at`. O RF-15 faz o código alcançar o comentário; o achado vai para `known-issues.md` como registro de que a divergência existiu.
- **Meio-dia, não meia-noite** (RF-03): meia-noite local pode ser ambígua ou inexistente em virada de horário de verão — o próprio `packages/shared/src/time.ts` alerta. Datas anteriores a 2019 no Brasil têm DST.
- Dependência de CRM-12 (`sales-lifecycle-payment-plans`), ainda não mergeado na `main`. A branch de trabalho sai da branch de CRM-12, não da `main`.
