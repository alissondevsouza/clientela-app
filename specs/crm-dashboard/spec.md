---
feature: crm-dashboard
module: api, web, shared
phase: spec
status: draft
size: L
created: 2026-07-18
updated: 2026-07-19
---

# Spec: crm-dashboard (CRM-07 — Dashboard)

## O Que

A home do CRM (`/crm`, hoje placeholder) vira o **painel**: vendas do mês, **lucro estimado** do mês (venda − custo, via **snapshot de custo** capturado na venda), total a receber (reuso do summary de recebíveis) e **meta mensal** com progresso — editável pela consultora. Agregações em SQL.

## Por Que

CRM-07 do roadmap — fecha o MVP do CRM ("substituir o caderno" com visão do mês). Lucro estimado exige custo no momento da venda: o CRM-06 não capturou (`sale_items` sem custo) — corrigir agora é barato (sem dados em produção) e imuniza o lucro contra mudanças de preço de custo (mesmo racional do ADR-0013).

## Requisitos

- **RF-01** — Migração: `sale_items.cost_cents` integer NOT NULL default 0 CHECK ≥ 0 (**snapshot do custo** do produto no momento da venda; default 0 só para linhas pré-existentes — não há produção); `consultants.monthly_goal_cents` integer **nullable** CHECK ≥ 0 (null = sem meta) com teto igual ao monetário do projeto.
- **RF-02** — `createSale` (service/repository existentes) passa a capturar `cost_cents` do produto no snapshot do item (mesma transação; nenhum outro comportamento muda — testes existentes de sales continuam verdes, apenas estendidos onde preciso).
- **RF-03** — Contratos em shared: `dashboardSummarySchema` — `{ monthSalesCents, monthProfitCents, monthSalesCount, pendingReceivablesCents, overdueReceivablesCents, overdueReceivablesCount, monthlyGoalCents nullable, monthLabel }`. **`monthProfitCents` é inteiro COM SINAL** (pode ser negativo: `createSale` aceita `unitPriceCents` override abaixo do custo → margem negativa; o schema não pode exigir ≥ 0, senão uma venda no prejuízo derruba a serialização). `updateGoalSchema` — `{ monthlyGoalCents: int > 0 ≤ teto | null }` (null remove a meta; 0 é inválido — evita divisão por zero na meta e não é meta). O **teto monetário** deve ser o mesmo do resto do projeto: exportar/reusar `MONEY_MAX_CENTS` (hoje `const` privado em `packages/shared/src/products.ts`) — nunca redefinir o número. Mensagens pt-BR.
- **RF-04** — API módulo `dashboard`: `GET /dashboard/summary` — agregados SQL escopados por consultora: vendas do mês corrente (`status = completed`, `sold_at` no mês corrente pela data do servidor — decisão UTC registrada, consistente com `overdue`), `monthSalesCents` = Σ total_cents, `monthProfitCents` = Σ((unit_price − cost) × qty) dos itens dessas vendas (bigint + guarda isSafeInteger), contagem; recebíveis via lógica existente (pendente/atrasado); meta da consultora. `PUT /dashboard/goal` — atualiza `monthly_goal_cents` (400/422 pt-BR; retorna o novo valor). Ambas autenticadas (guard default-deny já cobre).
- **RF-05** — Web `/crm` (home): substituir o placeholder pelo painel mobile-first — cards: "Vendas do mês" (total + contagem), "Lucro estimado" (com nota "estimado"), "A receber" (total + atrasadas em destaque + link "quem me deve"), "Meta do mês": sem meta ⇒ CTA "Definir meta"; com meta ⇒ progresso (barra + % + "R$ X de R$ Y", cap visual em 100% mas % real exibido) e edição. Form de meta em reais (`parseBRLToCents`, padrão products) via client component pequeno + Server Action (`updateGoalAction` com revalidatePath). Links rápidos (Nova venda, Nova cliente). Estados loading (skeleton)/erro (retry).
- **RF-06** — Cancelamento de venda reflete no painel (vendas canceladas fora das somas — decorre do filtro `completed`; teste prova).
- **RF-07** — LGPD/logs (IDs apenas); pt-BR; a11y (barra de progresso com `role="progressbar"`/aria-valuenow ou texto equivalente); nenhum float (percentual calculado sobre centavos inteiros; arredondamento só na exibição).

## Critérios de Aceite

- [ ] (RF-01) Integração: colunas criadas com CHECKs/defaults; migração aditiva.
- [ ] (RF-02) Integração: venda nova grava `cost_cents` do produto em cada item; alterar o custo do produto DEPOIS não muda o lucro da venda antiga (snapshot provado).
- [ ] (RF-03/RF-04) Integração: venda com `unitPriceCents` override ABAIXO do custo ⇒ `monthProfitCents` negativo é serializado sem erro (schema aceita inteiro com sinal).
- [ ] (RF-04) Integração (sessão real): fixtures conhecidas ⇒ `monthSalesCents`/`monthProfitCents`/contagem exatos; venda cancelada fora; venda de mês anterior (sold_at retrodatado via db) fora; recebíveis batem com o summary existente; escopo por consultora; sem dados ⇒ zeros e meta null; PUT goal grava/remove (null) e valida teto/negativo ⇒ 422 pt-BR; 401 sem token.
- [ ] (RF-03) Unidade (shared): schemas com pt-BR incl. `{}`; goal null aceito.
- [ ] (RF-05) Unidade dos helpers web (dashboard-api; percentual em inteiros) + QA de runtime com checklist (painel com dados reais criados pela UI, meta definida/editada/removida, atrasadas destacadas, links).
- [ ] (RF-07) Percentual: função pura testada (0%, parcial, 100%, >100% — exibe real, barra capada; meta 0 tratada — sem divisão por zero: meta 0 é inválida pelo schema? **decisão: meta deve ser > 0 quando presente** — 422 para 0).

## Fora de Escopo

- Relatórios detalhados (MKT-02); gráficos/séries temporais; meta por período customizado; comparação com meses anteriores; edição de perfil além da meta.

## Restrições Conhecidas

- "Mês corrente" pela data do servidor (UTC) — mesma semântica do `overdue` (registrada como aceita); virada de mês ~21h BRT no dia anterior. Aceito pelo porte.
- Lucro é **estimado**: itens de vendas antigas ao snapshot (pré-CRM-07) têm cost 0 ⇒ lucro superestimado nelas — sem produção, irrelevante; declarado.
- Sem E2E (REL-01); QA de runtime obrigatória (lesson RSC×client: exercitar a home nova em build de produção).
