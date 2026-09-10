# ADR-0022 — Custo de produto manual ou derivado do desconto de compra

- **Status**: Aceito
- **Data**: 2026-09-09

## Contexto

Consultoras de venda direta compram produtos com um desconto sobre o preço sugerido de catálogo — com frequência 30%, 35% ou 40% — e a diferença forma sua margem bruta potencial. O cadastro de produtos guardava somente preço e custo digitados diretamente, o que exigia cálculo manual e favorecia erros.

Ao mesmo tempo, `products.cost_cents` já alimenta o capital em estoque, o custo padrão de pedidos e o snapshot de custo das vendas. Substituí-lo por um cálculo tardio ou reclassificar automaticamente registros existentes poderia alterar resultados correntes e atribuir uma origem falsa a custos que incluem promoções ou ajustes particulares.

## Decisão

O produto mantém `cost_cents` como custo atual materializado e passa a ter `purchase_discount_bps integer NULL` como origem opcional desse custo:

- `purchase_discount_bps IS NULL` significa custo informado diretamente, inclusive para todo produto legado;
- um valor entre 0 e 10.000 representa o desconto de compra em basis points (`3500` = 35%);
- no modo desconto, o servidor calcula `cost_cents = floor((price_cents × (10000 − purchase_discount_bps) + 5000) / 10000)`, com aritmética inteira e arredondamento de meio para cima;
- CHECKs no Postgres protegem a faixa da taxa e a igualdade entre taxa, preço e custo, usando `bigint` antes da multiplicação;
- a prévia do navegador reutiliza a mesma fórmula, mas nunca envia nem determina o custo no modo desconto;
- alterar o preço de um produto com desconto recalcula o custo. Informar custo diretamente limpa a taxa; limpar apenas a taxa preserva o custo materializado;
- o estado atual e o PATCH são resolvidos depois de `SELECT ... FOR UPDATE`, na mesma transação, para serializar edições concorrentes de preço e taxa.

A margem mostrada no cadastro e detalhe é bruta e estimada: `price_cents - cost_cents`. Sua taxa usa o preço sugerido como denominador, pode ser negativa e é não calculável quando o preço é zero. Essa apresentação não promete lucro líquido.

## Alternativas consideradas

- **Manter apenas custo manual**: rejeitada porque preserva uma conta repetitiva e sujeita a erro justamente no fluxo mais comum da consultora.
- **Persistir somente o percentual e derivar o custo em toda leitura**: rejeitada porque quebraria consumidores e snapshots existentes, complicaria agregados e tornaria o significado histórico dependente do preço atual.
- **Persistir modo e percentual em colunas separadas**: rejeitada porque criaria estados contraditórios; a nulabilidade da taxa já discrimina os dois modos.
- **Usar float ou numeric para o percentual**: rejeitada; basis points representam duas casas decimais e mantêm contrato, TypeScript e SQL determinísticos.
- **Inferir a taxa dos produtos legados**: rejeitada porque preço e custo podem refletir arredondamento, promoção, frete ou ajuste manual.
- **Introduzir custo por lote, FIFO ou média ponderada**: adiada; exige histórico de movimentação e uma decisão contábil mais ampla do que o cadastro de catálogo.

## Consequências

- Produtos existentes migram sem backfill: conservam preço/custo e recebem taxa nula.
- Estoque e pedidos continuam consumindo `cost_cents`; vendas continuam congelando esse valor em `sale_items.cost_cents`. Editar desconto nunca reescreve venda ou pedido histórico.
- A consistência financeira passa a ser defendida no contrato, service, transação e banco.
- Exceções reais continuam possíveis pelo modo de custo direto.
- O custo permanece uma estimativa corrente do catálogo, não um custo contábil por lote.
- Reverter para uma API anterior exige bloquear escritas, preservar/exportar as taxas, defini-las como `NULL` e remover os novos CHECKs antes de reabrir edições; forward-fix é preferível.
