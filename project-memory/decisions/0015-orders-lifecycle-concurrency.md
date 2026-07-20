# ADR-0015 — Pedidos de reposição: ciclo de vida por endpoints explícitos e exclusividade só onde há efeito colateral

- **Status**: Aceito
- **Data**: 2026-07-20

## Contexto

O CRM-09 introduz o agregado **Order/OrderItem** (pedidos de reposição à Mary Kay) com ciclo de status `draft → placed → delivered` (+ `canceled` a partir de `draft`/`placed`) e entrada de estoque na entrega. Era preciso decidir (1) como expor transições na API, (2) como proteger as transições sob concorrência, e (3) o que garantir quando duas transições disputam o mesmo pedido — o teste de integração derivado do spec revelou que, sob `READ COMMITTED`, o UPDATE condicional do `cancel` (guard `status IN ('draft','placed')`) é reavaliado pelo Postgres após o commit de um `place` concorrente (EvalPlanQual) e **também casa** — ambas as chamadas vencem.

## Decisão

1. **Transições por endpoints explícitos** (`POST /orders/:id/place|deliver|cancel`), não `PATCH status`: cada transição tem guarda, efeito e erro próprios (espelha `POST /sales/:id/cancel`).
2. **Guarda transacional = UPDATE condicional como primeira escrita** (padrão de sales), gravando o timestamp da transição (`placed_at`/`delivered_at`/`canceled_at`).
3. **Exclusividade estrita ("exatamente uma vence") é exigida apenas onde há efeito colateral** — `deliver`, que credita estoque (crédito único provado por teste de concorrência). Para pares sem efeito colateral (`place`×`cancel`), o contrato garante apenas **história serial legal**: o desfecho é ou "uma vence/outra 409" ou a sequência válida `draft → placed → canceled` (estado final consistente, sem efeito de estoque, sem transição fora da matriz).
4. `delivered` é **terminal** (sem estorno de entrega); pedido não se apaga — cancela-se. Snapshot de item (`product_name`, `unit_cost_cents`) com FK `product_id ON DELETE SET NULL`, consistente com o ADR-0013.

## Alternativas consideradas

- **Exclusividade estrita universal** via controle otimista (cliente envia status/versão observada) ou `SELECT ... FOR UPDATE` antes de toda transição: rejeitada — complexidade e mudança de contrato sem proteger invariante alguma (o desfecho "ambas vencem" é uma sequência legal da matriz; usuária única torna a corrida teórica).
- **Emenda silenciosa do teste** para aceitar qualquer coisa: rejeitada — o critério do spec foi emendado explicitamente (Decisions Log) e o teste cobre os dois desfechos legais e reprova qualquer outro.
- **`PATCH /orders/:id { status }`** genérico: rejeitado — mistura guardas/efeitos distintos num handler só e piora o mapeamento de erros.

## Consequências

- Ganhamos o mesmo padrão de concorrência de sales onde importa (dinheiro/estoque) sem inflar o contrato para um risco teórico.
- O comportamento "cancel concorrente cancela o pedido recém-feito" é documentado e testado como legal — quem ler o teste não deve "corrigi-lo" para exclusividade estrita.
- Gotcha durável de Postgres registrado em `lessons.md`: guard de UPDATE condicional cujo conjunto de estados é **superconjunto** do estado-alvo de outra transição não serializa a corrida (EvalPlanQual).
