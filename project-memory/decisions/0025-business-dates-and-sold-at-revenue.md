# ADR-0025 — Datas de negócio informadas pela usuária e faturamento recortado por `sold_at`

- **Status**: Aceito
- **Data**: 2026-09-19
- **Emenda**: parágrafos "Tempo canônico do banco" e "Faturamento por conclusão" do [ADR-0023](./0023-sale-lifecycle-and-payment-plans.md); invariante 10 de `04-domain-model.md`

## Contexto

Até aqui, toda data de venda era o relógio: `composeSaleCreation` carimbava `sold_at`, `delivered_at`, `completed_at`, `created_at` e `updated_at` com o mesmo `transaction_timestamp()`. Enquanto a venda é registrada no instante em que acontece, as duas coisas coincidem e a diferença é invisível.

Duas situações revelaram que não coincidem. A imediata: a consultora recadastrou o catálogo e precisa reinserir todo o histórico de vendas já realizadas — com o carimbo do relógio, um ano de vendas ficaria empilhado no dia da digitação, e qualquer leitura por período perderia o sentido. Ela digita esse histórico **uma vez só**; a informação perdida ali não volta. A permanente: quem vende por WhatsApp e lança em lote não registra a venda no mesmo dia. Vendeu sábado, lançou segunda — a venda é de sábado.

Havia ainda um efeito de segunda ordem. O agregado "vendas do mês" recortava o período por `completed_at`, materializando o faturamento por conclusão do ADR-0023. Como `completed_at` é gravado com o relógio na baixa da última parcela, uma venda a prazo retroativa de março, quitada durante a digitação, entraria no faturamento do mês da digitação — inflando exatamente o número que a mudança existe para tornar verdadeiro.

## Decisão

**1. A data da venda é informada pela usuária.** `createSaleSchema` ganha `soldOn` (`yyyy-mm-dd`, opcional; ausente significa hoje). Convenção adotada a partir daqui: sufixo `...On` = dia local, sufixo `...At` = instante.

**2. Dia local vira instante com regra explícita.** Data igual ao dia local de hoje ⇒ usa o `transaction_timestamp()` **exatamente como antes** (o caminho quente fica byte-a-byte idêntico, e o teste assere identidade de referência). Data passada ⇒ **meio-dia** no `APP_TIME_ZONE` via `appLocalDateTimeToUtc`. Meio-dia e não meia-noite porque meia-noite local é ambígua (repetida) ou inexistente (pulada) em virada de horário de verão, e o Brasil teve DST até 2019.

**3. Datas de negócio acompanham a venda; datas de linha não.** `sold_at`, `delivered_at` e `completed_at` recebem o instante da venda; `created_at` e `updated_at` continuam registrando quando a linha foi escrita. As cobranças seguem a mesma divisão: `due_date` e `paid_at` acompanham a venda, `created_at`/`updated_at` acompanham o relógio. Isso emenda o "Tempo canônico do banco" do ADR-0023: o instante da transação continua sendo a única fonte de tempo do servidor, mas deixa de ser atribuído indistintamente a todos os campos correlatos.

**4. Data futura é barrada no service, não no banco.** A guarda autoritativa compara `soldOn` com o dia local do `transaction_timestamp()`. O Zod é feedback de interface (o relógio do cliente é forjável) e o CHECK **não** fecha data futura — um CHECK não pode chamar `now()`, então uma linha com `sold_at` e `updated_at` ambos no futuro passaria. O banco garante apenas coerência (`sold_at <= updated_at`). Piso de 01/01/2015 para barrar erro de digitação de ano.

**5. As CHECK constraints temporais deixam de proibir retroatividade.** `sales_temporal_matrix_check` troca `created_at <= sold_at` por `created_at <= updated_at`; `receivables_temporal_matrix_check` remove `created_at <= paid_at`, mantendo `paid_at <= updated_at`. Migração sem backfill: toda linha existente já satisfaz as novas cláusulas por transitividade.

**6. O faturamento do mês passa a recortar por `sold_at`**, mantendo o filtro `status = 'completed'`. Uma venda conta no mês em que foi vendida, não no mês em que terminou de ser paga.

**7. O padrão do formulário acompanha a data.** Data passada ⇒ os padrões viram "entregue" e "já recebido". Os padrões antigos (`pending`/`on_delivery`) divergiam dos do próprio contrato e, numa reentrada de histórico, produziriam vendas que não baixam estoque, ficam abertas para sempre, reservam produto e não entram no faturamento. O caminho de menor esforço precisa ser o caminho correto.

## Alternativas consideradas

- **Manter o carimbo do relógio e corrigir `sold_at` por SQL depois**: rejeitada. Exigiria mover cinco colunas coerentemente em cada venda, contra CHECKs de matriz temporal, manualmente e em produção.
- **Capturar também a hora da venda**: rejeitada. A consultora pensa em dias; um campo de hora é mais uma coisa para errar no celular a cada venda, e a ordenação dentro do dia não tem valor prático.
- **Meia-noite local como instante da venda retroativa**: rejeitada por ambiguidade em virada de DST.
- **Manter o faturamento por `completed_at` e apenas documentar a limitação**: rejeitada. Deixaria o objetivo declarado sem atender justamente no caso mais comum do histórico (venda a prazo já quitada).
- **Datar também a baixa de pagamento e a entrega**: adiada, não rejeitada. Tornaria "quanto recebi em março" igualmente verdadeiro, mas amplia o escopo com dois campos de data adicionais. Candidata a ADR próprio se a necessidade aparecer.

## Consequências

- O histórico reinserido produz lucro e faturamento corretos **por mês de venda**.
- O faturamento de um mês passado pode **aumentar retroativamente** quando uma venda antiga for quitada, porque a venda só entra no agregado ao ficar `completed`. É o preço de manter o filtro por conclusão junto do recorte por data de venda.
- Venda a prazo retroativa nasce com parcelas vencidas e aparece em "atrasado" (`due_date < CURRENT_DATE`). É verdade — a parcela venceu — mas pode gerar ruído ao fim de uma digitação grande de histórico já pago.
- **A feature torna o dado correto, não cria leitor de período passado.** O dashboard agrega só o mês corrente e a listagem de vendas não tem filtro de data; ver "lucro de março" depende do item CRM-14 do roadmap.
- A borda do mês continua em `date_trunc('month', now())`, no fuso da sessão Postgres (divergência já assumida no [ADR-0018](./0018-app-time-zone.md)). Venda retroativa é imune, porque meio-dia local nunca cruza o dia em UTC; venda de hoje às 21h no último dia do mês ainda cai no mês seguinte.
