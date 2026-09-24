---
feature: Data retroativa da venda e exclusão de venda
phase: qa
round: 5
date: 2026-09-19
verdict: approved
reviewer: QA adversarial neutra (não participou da spec nem da implementação)
---

# Revisão adversarial — rodada 5 (neutra)

## Veredito

**APROVADO** — lint limpo, typecheck limpo nos 3 workspaces, 1317/1317 testes verdes em 72 arquivos
(com Postgres real), build do web ok, migração ensaiada sobre dados do estado de produção e
**nenhum achado CRÍTICO**. Há 4 ALERTAS e 4 SUGESTÕES, todos de cobertura/ergonomia, nenhum
bloqueante.

Observação de processo: a `review.md` da rodada 4 registrava "Nenhum achado CRÍTICO, ALERTA ou
SUGESTÃO" e o `ROADMAP.md:89` já declarava "QA aprovada na rodada 4" **antes** desta revisão neutra.
Esta rodada não confirma "zero achados"; confirma "zero CRÍTICOS".

## Arquivos revisados

Todo o diff `feature/sales-lifecycle-payment-plans...` (55 arquivos). Revisão linha a linha em:
`packages/shared/src/sales.ts`, `apps/api/src/modules/sales/{sales.service.ts,sales.repository.ts,sales.routes.ts,sales.errors.ts}`,
`apps/api/src/db/schema/{sales.ts,receivables.ts}`, `apps/api/drizzle/0014_brief_lifeguard.sql`,
`apps/api/src/plugins/error-handler.ts`, `apps/api/src/modules/dashboard/dashboard.repository.ts`,
`apps/web/src/lib/{format.ts,sale-form-defaults.ts,sale-form-payload.ts,sale-delete-warning.ts,sales-api.ts}`,
`apps/web/src/components/sales/{delete-sale-button.tsx,sale-form.tsx,sale-card.tsx}`,
`apps/web/src/app/(crm)/crm/sales/{actions.ts,[id]/page.tsx}` e todos os arquivos de teste tocados.

## O que está sólido (verificado, não presumido)

1. **Predicado de estoque da exclusão** (`sales.repository.ts:583`) — `deliveredAt !== null &&
   status !== CANCELED_STATUS` está **correto** nos três casos do RF-09 e os **quatro quadrantes**
   (entregue×completed, entregue×open, não-entregue×open, entregue×canceled, não-entregue×canceled)
   têm teste de integração dedicado. O caso 9 (`:1492`) — o que pega o crédito em dobro — foi
   auditado com atenção ao defeito histórico apontado: ele usa `on_delivery` + `delivered`
   justamente para o `cancel` não bater no 409 de cobrança paga, e **asserta** `cancelSale ⇒ 200` e
   `stockOf == 10` *antes* de excluir. O setup chega de fato ao estado "cancelada".
2. **Derivação do instante da venda** (`sales.service.ts:219-231`) — `soldOn` ausente **ou** igual
   ao dia local de `transactionNow` devolve `transactionNow` por identidade de referência
   (asserções com `toBe`, não `toEqual`); data passada dá meio-dia local, verificado por **literal
   independente** (`2026-08-15` ⇒ `2026-08-15T15:00:00.000Z`) e não pela mesma função da
   implementação; `createdAt`/`updatedAt` permanecem no relógio em todos os caminhos, incluindo os
   das cobranças. Caminho quente preservado byte a byte.
3. **Migração `0014`** — só DROP/ADD dos dois CHECKs, literais inline, sem placeholders, sem dados
   tocados. Ensaio estrito `0009` (dados semeados como o código antigo grava) → `0010`…`0014`
   executado nesta QA: aplica sem erro, nenhuma linha pré-existente viola as constraints novas,
   estoque/recebíveis/compromissos preservados, venda retroativa aceita e `sold_at > updated_at`
   rejeitado. Detalhe em `validate.md`.
4. **Concorrência** — a ordem de locks é consistente entre `create`/`deliver`/`cancel`/`remove`
   (linha da venda com `FOR UPDATE` primeiro, depois produtos em ordem ascendente de `product_id`),
   o que fecha deadlock e serializa as operações sobre a mesma venda. Sob READ COMMITTED, o
   `SELECT … FOR UPDATE` do `remove` reavalia a linha após adquirir o lock, então enxerga o
   `status='canceled'` de um `cancel` que commitou antes — é isso que impede o crédito em dobro.
5. **RF-15** — `monthSalesScope` alimenta **apenas** `monthSalesCents/Count` e `monthProfitCents`.
   `openSales*`, `pendingCents`, `overdueCents/Count` e a meta mensal usam escopos próprios e não
   foram tocados. Nenhum agregado foi afetado sem querer.
6. **Regressão de cancelamento** — `cancel` não foi alterado; a suíte de cancelamento (`:1227-1389`)
   está intacta e verde.
7. **Conformidade com as rules** — camadas routes→service→repository respeitadas (o `remove` do
   service só repassa escopo; a invariante transacional fica no repository, como o `cancel`); DI por
   construtor; Zod na fronteira com schema de `packages/shared` reusado pelo form; dinheiro sempre em
   centavos; exclusão em `db.transaction`; `DELETE /sales/:id` default-deny (confirmado executando
   `isPublicRoute`); 404 idêntico para inexistente e cross-tenant (não vaza existência); nenhum
   segredo ou PII em log; erro novo mapeado no error-handler central; nenhum `any`/`as`/`!`.

## Achados

### ALERTA 1 — `DELETE /sales/:id` fora do teste de guard default-deny

`apps/api/src/modules/sales/sales.integration.test.ts:2880` — o teste "sem token ⇒ 401 nas **7**
rotas do módulo" não foi estendido: a rota nova (a **mais destrutiva** do módulo) e
`POST /sales/:id/deliver` não estão na lista. Verifiquei empiricamente que a rota **está** protegida
(`isPublicRoute("DELETE", "/sales/<uuid>", DEFAULT_PUBLIC_ROUTES) === false`, inclusive com trailing
slash), então não é furo de segurança — é furo de **rede de regressão**: uma refatoração futura do
`auth-guard` poderia abrir exclusão anônima de venda sem nenhum teste falhar. `security.md` manda
"todas as rotas autenticadas por padrão"; a asserção deve acompanhar a rota.
**Como corrigir**: acrescentar `deleteSale(app, NONEXISTENT_UUID)` (e `deliverSale`) ao `Promise.all`
e atualizar o título para 9 rotas.

### ALERTA 2 — o "caso 6" não exercita a guarda autoritativa que diz exercitar

`apps/api/src/modules/sales/sales.integration.test.ts:975` — o teste se chama "soldOn futuro é
rejeitado com 422 **pela guarda autoritativa do relógio do servidor**", mas asserta
`body.error.code === VALIDATION_ERROR_CODE`, isto é, a guarda do **Zod**. Como o Zod rejeita `soldOn`
futuro antes de chegar ao service, `InvalidSaleDateError` → `INVALID_SALE_DATE`
(`sales.errors.ts:95` / `error-handler.ts:210-215`) é **inalcançável pela rota** e tem **zero
cobertura de integração** — o mapeamento 422 do código de erro novo nunca é exercitado. O `plan.md`
pedia explicitamente, no caso 6, a guarda do service. Há cobertura de unidade
(`sales.service.test.ts`, "soldOn futuro … lança InvalidSaleDateError"), então não é buraco de
comportamento; é teste que promete mais do que prova.
**Como corrigir**: renomear/comentar o caso como "guarda do contrato (Zod)" e, se quiser cobrir a
guarda autoritativa de ponta a ponta, chamar o service com um `transactionNow` anterior ao `soldOn`
(ou testar `composeSaleCreation` via rota com relógio injetado) e assertar `INVALID_SALE_DATE`.

### ALERTA 3 — critério de aceite RF-16/ponta-a-ponta (caso 23 do plan) sem teste

`spec.md:79` — "Venda retroativa registrada **nos padrões do formulário** nasce `completed` e **entra
no faturamento e no lucro do mês da venda**". A primeira metade tem teste
(`sales.integration.test.ts:831`, retroativa + `received` + `delivered` ⇒ `status === "completed"`).
A segunda **não**: nenhum teste registra uma venda retroativa datada **dentro do mês corrente** e
asserta que `monthSalesCents`/`monthProfitCents` sobem. O teste de RF-15 do dashboard
(`dashboard.integration.test.ts:715`) prova só a direção **negativa** (venda de mês passado não conta
hoje). Idem para o critério `spec.md:82`, cuja metade positiva ("conta no mês da venda") não é
verificada. Conferi a aritmética (`sold_at` ao meio-dia local = 15:00 UTC, sempre dentro de
`[date_trunc('month', now()), +1 month)` do mês correspondente) e a composição dos testes existentes
torna o comportamento quase certo — mas o critério escrito não tem teste executável, e o `plan.md`
listava o caso 23 como obrigatório.
**Como corrigir**: um caso em `dashboard.integration.test.ts` criando venda com
`soldOn` = dia 1 do mês corrente, `deliveryStatus: "delivered"`, `paymentCondition: "received"`, e
assertando o delta de `monthSalesCents`/`monthSalesCount`/`monthProfitCents` sobre o baseline.

### ALERTA 4 — os três testes de concorrência da exclusão não são determinísticos

`sales.integration.test.ts:1851`, `:1888`, `:1934` — assertam `deleteResponse.status === 204` e um
invariante de estoque final que vale sob **qualquer** interleaving. Uma execução em que a exclusão
sempre vence a corrida do lock passa sem nunca exercitar o caminho perigoso ("cancel commitou
primeiro, depois delete decide"). São bons testes de invariante, mas **não** são a prova do risco de
crédito em dobro — essa prova é o caso 9, sequencial e determinístico.
**Como corrigir**: não contar `:1934` como cobertura do risco; se quiser determinismo, serializar
explicitamente (cancel await, depois delete) num caso à parte — que é exatamente o caso 9, já
existente. Basta ajustar o comentário para não superestimar o que o teste garante.

### SUGESTÃO 1

`apps/web/src/components/sales/sale-form.tsx:639-652` — `handleSoldOnChange` sobrescreve
`deliveryStatus` e `paymentCondition` a **cada** alteração da data, inclusive depois de a usuária ter
escolhido manualmente outros valores (ex.: escolhe data passada → troca para "parcelado" → ajusta o
dia → volta silenciosamente para "já recebido"). Considerar aplicar os padrões só enquanto os campos
não tiverem sido tocados (`formState.dirtyFields`).

### SUGESTÃO 2

`apps/api/src/modules/dashboard/dashboard.repository.ts:47` — `date_trunc('month', now())` recorta em
UTC enquanto `sold_at` de venda retroativa é meio-dia local. Uma venda feita **hoje** às 22:00 locais
no último dia do mês cai no mês seguinte do agregado. É decisão pré-existente (o comentário assume
UTC) e o meio-dia do RF-03 blinda o caso retroativo, mas o descasamento agora é mais visível.

### SUGESTÃO 3

`apps/api/src/db/sales-lifecycle-migration.integration.test.ts:12-24` — `PRE_EXPANSION_MIGRATIONS`
inclui `0010_green_leo.sql`, então os dados legados são semeados **depois** de `0010`. O teste cobre
`0011`→`0014` sobre dados, não `0010`→`0014` como o `plan.md` pede. `0010` só toca `products` com
coluna nullable + CHECKs tolerantes a NULL, então é inofensivo — mas mover `0010` para fora da lista
e semear antes alinharia o teste ao que o plano promete.

### SUGESTÃO 4

`apps/web/src/components/sales/sale-form.tsx:596` — `buildEmptyValues()` é chamado a cada render
(só o primeiro valor é usado pelo `useForm`). Sem efeito funcional; move-se para `useState(() => …)`
se incomodar.

## Cobertura dos critérios de aceite

| Critério (`spec.md`) | Cobertura |
|---|---|
| RF-01 campo de data / gravação na data escolhida | `sales.integration.test.ts:795`; interação do campo = pendência de E2E declarada |
| RF-01 piso 01/01/2015 (mensagem exata; piso aceito) | `packages/shared/src/sales.test.ts` — OK |
| RF-02 422 data futura / CHECK `sold_at > updated_at` / `created_at > sold_at` aceito | `sales.integration.test.ts:975`, `sales-tables.integration.test.ts:282,310` — OK (ver ALERTA 2) |
| RF-03 hoje ⇒ instante da transação; passada ⇒ 12:00 local | `sales.service.test.ts` (literal) + `sales.integration.test.ts:763,795` — OK |
| RF-04 `delivered_at`=`sold_at`, `created_at` real | `sales.integration.test.ts:831` + unidade — OK |
| RF-05 cobrança retroativa `paid_at`/`due_date` | `sales.integration.test.ts:864`, `sales-tables.integration.test.ts:647` — OK |
| RF-06 `firstDueDate` relativo a `soldOn` | `sales.test.ts` + `sales.integration.test.ts:926` — OK |
| RF-07 helper de dia local + sem `toDatePart` residual | `format.test.ts:50` (regressão 21h locais) + grep — OK; conferência visual = E2E |
| RF-08 texto de consequência por estado | `sale-delete-warning.test.ts` (6 casos) — OK; dois passos do clique = E2E declarado |
| RF-09 três casos de estoque + item órfão | casos 7/7b/8/9/19b/18 — OK |
| RF-10 exclusão com cobrança paga ⇒ 204 | caso 10 (`:1560`) e parcialmente paga (`:1592`) — OK |
| RF-11 itens/cobranças somem, compromisso sobrevive | caso 11 (`:1634`) — OK |
| RF-12 404 cross-tenant | caso 12 (`:1685`) — OK |
| RF-13 venda de +1 ano excluída | caso 20 (`:1782`) — OK |
| RF-14 cancelamento inalterado | suíte `:1227-1389` intacta e verde — OK |
| RF-15 recorte por `sold_at` | `dashboard.integration.test.ts:715` — metade negativa OK; **metade positiva sem teste (ALERTA 3)** |
| RF-16 padrões por data | `sale-form-defaults.test.ts` — OK; **ponta-a-ponta sem teste (ALERTA 3)** |
| Estoque ponta-a-ponta N−Q e volta a N | caso 17 (`:1809`) — OK |

## Conformidade

`core.md`, `api.md`, `database.md`, `web.md`, `testing.md` e `security.md`: **sem violação encontrada**.
Nenhuma operação git de escrita foi feita nesta revisão (ADR-0006).
