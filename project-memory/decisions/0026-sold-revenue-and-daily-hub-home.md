# ADR-0026 — "Vendido" como faturamento principal e home do CRM como central do dia

- **Status**: Aceito
- **Data**: 2026-09-23
- **Emenda**: "Faturamento por conclusão" do [ADR-0023](./0023-sale-lifecycle-and-payment-plans.md) e item 6 do [ADR-0025](./0025-business-dates-and-sold-at-revenue.md) (filtro `status = 'completed'`); decisão 4 do [ADR-0014](./0014-cost-snapshot-estimated-profit.md) (endpoint único `GET /dashboard/summary`) e a consequência "mês corrente em UTC"; consequência "dashboard continua em UTC" do [ADR-0018](./0018-app-time-zone.md); invariante 10 de `04-domain-model.md`

## Contexto

A home do CRM mostrava cinco números do mês corrente e dois atalhos. A análise crítica de 2026-09-23 (feita com o humano, com referências de Revendedores Boticário, Mary Kay myCustomers+, Shopify, Pipedrive e QuickBooks) encontrou quatro problemas:

- **"Vendas do mês" só contava venda concluída** (entregue e 100% paga — ADR-0023). Uma venda parcelada feita hoje só aparecia meses depois, na quitação, e entrava no mês da venda retroativamente (ADR-0025). A meta usava esse número: para quem vende parcelado, a barra andava devagar e o mês passado "crescia" sozinho.
- **"Previsto para receber" somava o total das vendas abertas**, inclusive o que já tinha sido pago (PIX adiantado aguardando entrega) e o que já aparecia em "A receber". Os dois cartões contavam o mesmo dinheiro.
- **Nenhum número levava à lista que o gerou**, e só o mês corrente existia — o histórico reinserido no CRM-13 estava certo e ilegível por período.
- **A tela não dizia o que fazer hoje**, embora o sistema já tivesse cobranças vencidas, compromissos do dia, entregas pendentes, leads novos, encomendas sem estoque e aniversários.

Além disso, a virada do mês e o "atrasado" aconteciam às 21h (UTC), divergindo da agenda (ADR-0018).

## Decisão

**1. "Vendido" é o faturamento principal.** Vendido = Σ `total_cents` das vendas com `status <> 'canceled'` (abertas e concluídas) e `sold_at` no período. É a base da meta. Decisão do humano em 2026-09-23.

**2. "Recebido" é o caixa do período.** Σ das cobranças com `paid_at` no período e não anuladas. Toda venda com valor gera cobrança (ADR-0023), então o dado existe; o instante é o da baixa registrada (na venda criada como já recebida, o instante da venda — ADR-0025).

**3. "Lucro estimado" acompanha o Vendido.** Σ `(unit_price_cents − cost_cents) × qty` dos itens das vendas do escopo Vendido. Deixa de ser "lucro realizado de concluídas": o número já era estimado (snapshot de custo, ADR-0014) e a consultora quer saber quanto lucrou com o que vendeu.

**4. Período escolhível com comparação justa.** Mês, ano, tudo e intervalo de meses, resolvidos por função pura em `packages/shared/src/dashboard-period.ts`. Comparação por tipo: mês ⇒ mês anterior; ano ⇒ mesmo trecho do ano anterior; intervalo de 2–12 meses ⇒ mesmos meses do ano anterior; > 12 meses ou "tudo" ⇒ sem comparação. Período em andamento compara o **mesmo trecho** (1–23/09 × 1–23/08).

**5. Todo recorte de tempo do painel e do "atrasado" em `APP_TIME_ZONE`.** Bounds calculados em TypeScript a partir do relógio injetado, passados ao SQL como instantes ou datas — inclusive no módulo de vendas (`receivableOverdueExpression(today)` em `apps/api/src/db/derived-expressions.ts`). Nenhuma query de `dashboard` ou `sales` usa mais `CURRENT_DATE`/`date_trunc(now())`.

**6. A home é a central do dia.** Três blocos: **Hoje** (cobranças agrupadas por cliente com WhatsApp e mensagem pronta, compromissos de hoje, vendas a entregar, leads novos, encomendas sem estoque, aniversariantes da semana), **Desempenho** (período, comparação, gráfico de 12 meses, meta com ritmo, mais vendidos e melhores clientes) e **Posição agora** (a receber, em atraso, estoque). Absorve o REL-05 do roadmap. No Hoje entra só a encomenda sem estoque (disponível < 0); o estoque baixo comum fica na Posição, porque com os defaults de produto ele nunca zeraria.

**7. Três fontes, falha isolada.** `GET /dashboard/performance`, `GET /dashboard/today` e, para a Posição, os já existentes `/receivables/summary` e `/products/summary`. Cada bloco é um Server Component em `Suspense` próprio que mostra erro só dele. `GET /dashboard/summary` e o card "Previsto para receber" foram removidos.

**8. O painel é read-model cross-tabela.** Estende o ADR-0014: o módulo `dashboard` lê também `appointments`, `leads`, `clients`, `products` e `monthly_goals` por SQL próprio, em transação read-only `repeatable read`. As regras de reserva/disponível e de atraso que ele compartilha com outros módulos vivem em `apps/api/src/db/derived-expressions.ts`, não copiadas. O `/dashboard/today` devolve o WhatsApp da pessoa dos compromissos de hoje (≤ 5) — divergência consciente da minimização da listagem da agenda, para o botão "Confirmar" sem N+1.

**9. Drill-down com invariante.** A listagem de vendas ganha `soldFrom`/`soldTo`, `status=sold` (open ∪ completed) e `delivery`; a de cobranças ganha `overdue` e `paidFrom`/`paidTo`. A soma da lista filtrada é, por teste de integração, igual ao cartão do mesmo período.

## Alternativas consideradas

- **Manter "vendas do mês" só com concluídas e mostrar "em aberto" ao lado** (ADR-0023 intacto): rejeitada pelo humano. Continuaria subestimando o mês de quem vende parcelado e a meta seguiria medindo o número errado.
- **Lucro só sobre concluídas, mesmo com Vendido incluindo abertas**: rejeitada — dois escopos diferentes na mesma linha de cartões confundem mais do que o risco de uma venda aberta ser cancelada depois.
- **Central do dia em tela separada (REL-05 original)**: rejeitada pelo humano; a home é a tela que ela abre todo dia.
- **Comparação sempre com o período imediatamente anterior**: rejeitada para intervalos e anos — ignora a sazonalidade de cosméticos (Dia das Mães, Natal).
- **Injetar os services de agenda/leads/produtos no painel**: rejeitada — traria N+1 (o WhatsApp do compromisso só existe no detalhe) ou exigiria ampliar contratos minimizados de propósito.
- **Um endpoint único para a home**: rejeitada — uma falha derrubaria a tela inteira, como acontecia.

## Consequências

- **Os números mudam no deploy**: o antigo "Vendas do mês" vira Vendido (inclui abertas), a meta passa a medi-lo, o lucro inclui abertas e o "atrasado" deixa de virar às 21h.
- O Vendido de um mês passado **diminui** se uma venda for cancelada ou excluída depois; deixa de aumentar quando uma venda antiga é quitada (o efeito colateral do ADR-0025 some).
- Recebido depende de quando a baixa foi registrada no app; datar a baixa pela usuária segue adiado (ADR-0025).
- Leads continuam sem escopo por consultora (drift de `04-domain-model.md`); o painel herda isso.
- Sinais futuros de relacionamento (REL-02 recompra, REL-04 leads parados) entram como novas seções do bloco Hoje.
