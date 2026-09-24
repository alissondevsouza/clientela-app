# ADR-0014 — Lucro estimado por snapshot de custo na venda

- **Status**: Aceito
- **Data**: 2026-07-19
- **Emendado por**: [ADR-0026](./0026-sold-revenue-and-daily-hub-home.md) (decisão 4 — endpoint único `GET /dashboard/summary`, removido — e a consequência "mês corrente em UTC", substituída pelo recorte em `APP_TIME_ZONE`) e [ADR-0027](./0027-monthly-goals-history.md) (decisão 3 — meta escalar em `consultants`, substituída por `monthly_goals` com histórico)

## Contexto

O CRM-07 (Dashboard) precisa exibir o **lucro estimado do mês**. Lucro = preço de venda − custo. O CRM-06 capturou o preço de venda como snapshot no item (`sale_items.unit_price_cents`, ADR-0013), mas **não** capturou o custo: `sale_items` não tinha coluna de custo, e o custo só existia (mutável) em `products.cost_cents`. Calcular lucro pelo custo atual do produto faria o lucro de vendas passadas mudar sempre que a consultora reajustasse o custo de cadastro — exatamente o que o ADR-0013 evita para o preço. A feature também precisa de uma **meta mensal** editável.

## Decisão

1. **`sale_items.cost_cents` é o snapshot do custo do produto no momento da venda** (`integer NOT NULL`, CHECK ≥ 0), gravado por `createSale` na mesma transação do item — estende o princípio de imutabilidade do ADR-0013 (preço já era snapshot; custo passa a ser também). O lucro histórico fica imune a reajustes de custo posteriores.
2. **`monthProfitCents` é inteiro com sinal (pode ser negativo)**: `createSale` aceita override de `unit_price_cents` abaixo do custo (venda no prejuízo), então a margem — e a soma do mês — pode ser negativa. O contrato (`dashboardSummarySchema`) não restringe a ≥ 0; restringir derrubaria a serialização de um mês no prejuízo (500).
3. **Meta mensal como atributo da consultora**: `consultants.monthly_goal_cents` (`integer` nullable, CHECK `> 0` quando presente; null = sem meta). 0 é inválido — evita divisão por zero no cálculo de progresso e não é uma meta.
4. **Um endpoint agregado para a home**: `GET /dashboard/summary` devolve vendas do mês, lucro, recebíveis (pendente/atrasado) e meta numa só request (sem waterfall na home); `/receivables/summary` continua existindo para a tela de vendas. O módulo `dashboard` lê `sales`/`sale_items`/`receivables`/`consultants` direto por agregação SQL (leitura cross-tabela é o domínio do dashboard) — não injeta outros services.

## Alternativas consideradas

- **Calcular lucro pelo custo atual do produto (join em `products`)** — descartada: lucro histórico mutável e frágil a `ON DELETE SET NULL` do produto (ADR-0013); contradiz o racional do snapshot.
- **Meta em tabela/módulo de "configuração" próprio** — descartada por ora: a meta é um único atributo escalar da consultora única; uma tabela nova seria estado a mais sem ganho. `PUT /dashboard/goal` mantém o auth enxuto (não infla o módulo `auth`).
- **Adiar o snapshot de custo (backfill depois)** — descartada: sem dados em produção, adicionar a coluna agora é aditivo e barato; adiar exigiria backfill real.

## Consequências

- **"Mês corrente" em UTC** (`date_trunc('month', now())`), consistente com a semântica de `overdue` (CURRENT_DATE) já aceita no CRM-06; virada de mês ~21h BRT do dia anterior — aceito pelo porte. Requer `TimeZone=UTC` na sessão Postgres de produção para o rótulo (formatado em UTC) e os números concordarem na borda.
- O `default 0` de `cost_cents` cobre linhas pré-existentes da migração, **não** é comportamento pretendido: `createSale` (único caminho de insert) sempre grava o custo real — registrado em known-issues.
- Relatórios futuros (MKT-02) herdam o lucro por snapshot — imune a mudanças de cadastro, como o ADR-0013 já previa para preço.
- Lucro de itens de vendas **anteriores** a esta migração tem cost 0 ⇒ lucro superestimado nelas; sem produção, irrelevante e declarado na spec.
