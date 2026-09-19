---
feature: Data retroativa da venda e exclusão de venda
module: sales (packages/shared + apps/api + apps/web)
phase: plan
status: draft
created: 2026-09-19
updated: 2026-09-19
depends_on: [spec.md, research.md]
---

# Plan: Data retroativa da venda e exclusão de venda

## Decisões Técnicas

| Decisão | Justificativa |
|---|---|
| Campo de entrada chamado **`soldOn`** (`yyyy-mm-dd`), distinto do `soldAt` (instante) da resposta | Convenção explícita do projeto a partir daqui: `...On` = dia local, `...At` = instante. Reusar `soldAt` no input com outro tipo confundiria contrato de entrada e de saída |
| `soldOn` é **opcional** no contrato; ausente ⇒ hoje | Mantém compatível todo chamador atual (e a suíte existente) sem alteração; o formulário envia sempre, mas a API não exige |
| **Data = hoje ⇒ `transactionNow` intacto**; data passada ⇒ meio-dia local | O caminho quente (99% das vendas) fica byte-a-byte idêntico ao atual — nenhuma regressão possível no fluxo normal. A retroatividade é um ramo novo, isolado |
| Meio-dia local (não meia-noite) via `appLocalDateTimeToUtc(soldOn, "12:00")` | Meia-noite local pode ser ambígua (repetida) ou inexistente (pulada) em virada de DST; meio-dia nunca é. Datas brasileiras anteriores a 2019 têm DST (`time.ts` alerta explicitamente) |
| A conversão dia→instante acontece no **service**, a partir do `transactionNow` injetado | O service continua sem ler o relógio (`composeSaleCreation` recebe o instante canônico do repository). Preserva a arquitetura testável sem mock de tempo |
| Guarda de data futura: Zod (feedback de UI) + **service (autoritativo)**; o banco só garante coerência | O relógio do cliente é forjável. A verdade é o `transactionNow` do Postgres, no service. O CHECK **não** fecha data futura: um CHECK não pode chamar `now()`, então `sold_at` e `updated_at` ambos no futuro passariam — o CHECK garante só `sold_at <= updated_at` |
| Novo erro de domínio **`InvalidSaleDateError`** → 422 | Segue o padrão de `InvalidSaleCreditError`/`InvalidSaleClientError`; mensagem pt-BR acionável mapeada no error-handler central |
| `firstDueDate` validado contra **`soldOn`** (não contra hoje) | Regra atual (`sales.ts:342`) impede qualquer venda parcelada retroativa. "Vencimento não pode ser anterior à venda" é a regra correta também para venda de hoje — a mudança generaliza, não relaxa |
| Cobranças seguem a data da venda (`paid_at`, `due_date`); `created_at`/`updated_at` seguem o relógio | Decisão do usuário. Sem isso, o fluxo de caixa afirma que o dinheiro de março entrou hoje — a mesma classe de erro que a feature existe para corrigir |
| `delivered_at`/`completed_at` seguem `soldAt`; `created_at`/`updated_at` seguem o relógio | Exigido pelo `sales_temporal_matrix_check` (`sold_at <= delivered_at <= updated_at`). Semanticamente correto: são eventos do negócio, não da linha |
| Migração altera **apenas CHECK constraints** — nenhuma coluna nova, nenhum backfill | O schema já tem tudo. Reduz a migração ao mínimo e elimina a classe de risco de migração destrutiva |
| Exclusão = **reversão + DELETE na mesma transação**, nunca `DELETE` cru | A cascata do banco não devolve estoque. Um DELETE cru recriaria exatamente o descasamento de estoque que motivou a feature |
| Devolução de estoque condicionada a `delivered_at IS NOT NULL AND status <> 'canceled'` | Três estados, dois não devolvem: venda aberta nunca debitou; venda cancelada já devolveu no cancelamento. Errar o segundo credita em dobro, silenciosamente |
| `DELETE /sales/:id` responde **204 com `new Response(null, { status: 204 })`** | Lesson 2026-07-18: no Elysia 1.4, handler que retorna `undefined` com `set.status = 204` derruba o request com TypeError na serialização |
| Excluir **redireciona** para a lista; cancelar permanece no detalhe | Após excluir, o detalhe não existe mais — permanecer geraria 404. Padrão já usado em `DeleteProductButton` |
| Exibição da data passa a usar `appLocalDateIso` no lugar do slice de string | `toDatePart` corta o ISO em UTC: venda das 21:00 locais exibe a data do dia seguinte. Entregar a feature "a data da venda é a data certa" com esse bug vivo seria incoerente |
| Agregado do mês passa a recortar por **`sold_at`** (RF-15), mantendo o filtro `status = 'completed'` | Decisão do usuário. `completed_at` é carimbado com o relógio na baixa da última parcela (`sales.repository.ts:811-813`), então venda retroativa a prazo cairia no mês da digitação. Emenda o "faturamento por conclusão" do ADR-0023 ⇒ **ADR próprio** |
| Os dois casos de invariante temporal que a migração torna válidos são **reescritos como casos positivos**, não removidos | `sales-tables.integration.test.ts:282` (caso `created_at > sold_at`) e `:623` (caso `created_at > paid_at`) asseveram exatamente o que o RF-02/RF-04 passam a permitir. São testes legítimos cuja premissa mudou por decisão de produto — relaxar ou skipar seria violar `testing.md` |
| Correção de exibição da data = **um helper compartilhado em `lib/format.ts`**, não quatro correções locais | `toDatePart` está duplicado em 4 arquivos, sendo `const` local em `.tsx`. O Vitest coleta só `*.test.ts` em `environment: "node"` (sem jsdom), então um helper exportado em `lib/format.ts` é a **única forma de o teste de regressão do RF-07 existir** — e elimina a duplicação |
| Data passada ⇒ padrões viram "entregue" **e** "já recebido" (RF-16) | Trocar só a entrega resolve metade: com `on_delivery` a cobrança nasce com `paid_at` nulo (`sales.service.ts:260-268`), `deriveInitialSaleStatus` devolve `open` (`:181-187`) e a venda fica fora do faturamento (que o RF-15 mantém filtrando `status = 'completed'`). Os defaults do formulário (`pending`/`on_delivery`) divergem dos do próprio contrato (`delivered`/`received`, `shared/src/sales.ts:283-287`) — o RF-16 alinha os dois para o caso retroativo |
| Toda decisão de UI verificável vira **helper puro em `apps/web/src/lib/`** | O projeto não tem como testar componente React: sem jsdom, sem `@testing-library`, zero `.test.tsx`, Vitest em `environment: "node"` coletando só `.ts`. Precedente já estabelecido no próprio módulo: `sale-lifecycle.ts`, `sale-total.ts`, `appointment-form-payload.ts`. Prometer "teste do formulário" seria fingir cobertura |
| Devolução de estoque ignora item com `product_id` nulo | ADR-0013 item 2 (`ON DELETE SET NULL`): produto excluído deixa o item órfão. O `cancel` já trata assim (`sales.repository.ts:503-527`) — a exclusão segue o mesmo padrão, sem inventar comportamento novo |
| **Cancelar permanece intocado** | Verbos distintos com semânticas distintas (RF-14). Alterar o cancelamento ampliaria o raio de regressão sem necessidade |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---|---|
| `apps/api/drizzle/0014_*.sql` | Migração gerada por `drizzle-kit generate`: DROP + ADD dos dois CHECKs temporais |
| `apps/web/src/components/sales/delete-sale-button.tsx` | Botão de exclusão com confirmação em dois passos (RF-08) |

### Modificar

| Arquivo | Mudança |
|---|---|
| `packages/shared/src/sales.ts` | `createSaleSchema`: campo `soldOn` opcional (`z.iso.date()`), guarda de data futura, `firstDueDate` relativo a `soldOn` |
| `packages/shared/src/index.ts` | Exportar o que for novo do contrato |
| `apps/api/src/db/schema/sales.ts` | `sales_temporal_matrix_check`: remover `created_at <= sold_at`, adicionar `created_at <= updated_at` |
| `apps/api/src/db/schema/receivables.ts` | `receivables_temporal_matrix_check`: remover `created_at <= paid_at`, manter `paid_at <= updated_at` |
| `apps/api/src/modules/sales/sales.service.ts` | `composeSaleCreation`: derivar `saleInstant` de `soldOn`+`transactionNow`; aplicar a `soldAt`/`deliveredAt`/`completedAt` e às cobranças; validar data futura; expor `remove` no service |
| `apps/api/src/modules/sales/sales.repository.ts` | `create`: persistir os instantes compostos. Novo `remove`: lock da venda, reversão condicional de estoque, DELETE com cascata |
| `apps/api/src/modules/sales/sales.routes.ts` | `DELETE /sales/:id` → 204 explícito |
| `apps/api/src/modules/sales/sales.errors.ts` | `InvalidSaleDateError` (422) |
| `apps/api/src/plugins/error-handler.ts` (ou equivalente) | Mapear o erro novo |
| `apps/web/src/components/sales/sale-form.tsx` | Campo "Data da venda" (`type="date"`, default hoje, `max` = hoje, piso) + consumo do helper de padrões do RF-16 |
| `apps/web/src/lib/sale-form-defaults.ts` + `.test.ts` (criar) | Helper puro: dada a data escolhida e a data de hoje, devolve os padrões de entrega e condição de pagamento (RF-16) — o único caminho executável para verificar o RF-16 |
| `apps/web/src/lib/sale-delete-warning.ts` + `.test.ts` (criar) | Helper puro: dado o estado da venda (entregue, cancelada, valor já recebido), devolve o texto de consequência da confirmação (RF-08) |
| `apps/web/src/lib/sales-api.ts` | `deleteSale` (204/404) |
| `apps/web/src/app/(crm)/crm/sales/actions.ts` | `deleteSaleAction` com revalidação + redirect |
| `apps/web/src/app/(crm)/crm/sales/[id]/page.tsx` | Renderizar `DeleteSaleButton`; trocar `toDatePart` por dia local |
| `apps/web/src/components/sales/sale-card.tsx` | Mesma correção de exibição de data (se aplicável) |
| `apps/api/src/modules/dashboard/dashboard.repository.ts` | **RF-15**: `monthSalesScope` recorta por `sold_at` em vez de `completed_at`; comentário alinhado ao SQL |
| `packages/shared/src/sales.test.ts` | Asserção da mensagem de primeiro vencimento (linha 223) — a premissa muda com o RF-06 |
| `apps/api/src/modules/sales/sales.integration.test.ts` | Asserção da mesma mensagem na fronteira HTTP (linha 918) — idem |
| `apps/web/src/app/(crm)/crm/sales/actions.ts` (constante) | Criar a constante de path do dashboard — hoje não existe nenhuma em `apps/web`, e excluir venda entregue altera os números dele |
| `apps/api/src/db/sales-tables.integration.test.ts` | Reescrever os dois casos de invariante que a migração torna válidos (linhas 282 e 623) como casos positivos, e acrescentar os casos negativos que passam a carregar o guard (`sold_at > updated_at`, `paid_at > updated_at`) |
| `apps/web/src/lib/format.ts` + `format.test.ts` | Helper exportado que formata o instante da venda no dia local (`APP_TIME_ZONE`), com teste de regressão |
| `apps/web/src/components/sales/sale-card.tsx`, `apps/web/src/components/appointments/sale-link-form.tsx`, `apps/web/src/components/appointments/appointment-actions.tsx` | Trocar o `toDatePart` local pelo helper compartilhado (os outros 3 dos 4 pontos de exibição) |
| `apps/api/src/modules/dashboard/dashboard.integration.test.ts` | Caso do RF-15 (venda retroativa quitada hoje conta no mês da venda) |
| `specs/ROADMAP.md` | Item CRM-13 |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|---|---|---|
| Unidade | **sim** | `composeSaleCreation` muda de comportamento (data, entrega, conclusão, cobranças) e ganha a validação de data futura; as regras de reversão de estoque da exclusão são regra de negócio nova. Dependências já são injetadas — fakes explícitos, sem `vi.mock` |
| Integração (Testcontainers) | **sim** | Cumpre os três gatilhos de `spec-format.md` ao mesmo tempo: altera **schema** (CHECK constraints), altera **contrato da API** (campo novo + rota nova) e altera **regra de negócio central** (venda, estoque, recebíveis). Mock de Drizzle não provaria nada aqui — os CHECKs só existem no Postgres real |
| E2E | **pendência (sem infra)** | Registro de venda é fluxo crítico de UI e exclusão é destrutiva, mas não há Playwright (REL-01) **nem qualquer infra de teste de componente** (sem jsdom/`@testing-library`, zero `.test.tsx`). O que é decisão (padrões do RF-16, texto de consequência do RF-08, data default) sai para helper puro e é testado em `.ts`; o que é interação pura (clique, render) fica como pendência explícita de E2E no handoff — nunca fingir cobertura |
| Regressão | **sim (RF-07)** | O slice UTC é defeito pré-existente: exige teste que **falhe antes** do fix (instante equivalente a 21:00 locais exibido como o dia seguinte). Só é executável depois que o helper virar módulo exportado em `apps/web/src/lib/format.ts` — o Vitest coleta `apps/**/*.test.ts` em `environment: "node"`, sem jsdom e sem `.tsx`, então não há como testar uma `const` local dentro da página |

**Casos de integração obrigatórios** (derivados do `spec.md`, nunca do diff):

1. Venda com `soldOn` = hoje ⇒ `sold_at` = instante da transação (caminho quente inalterado).
2. Venda com `soldOn` passado ⇒ `sold_at` = 12:00 local daquele dia, conferido **no fuso da aplicação**.
3. Venda retroativa entregue ⇒ persiste e satisfaz `sales_temporal_matrix_check` (`delivered_at` = `sold_at`, `created_at` = agora).
4. Venda retroativa à vista ⇒ cobrança com `paid_at`/`due_date` na data da venda, satisfazendo `receivables_temporal_matrix_check`.
5. Venda retroativa parcelada com `firstDueDate` entre a venda e hoje ⇒ aceita; anterior à venda ⇒ 422.
6. `soldOn` futuro ⇒ 422 (pela guarda do service, com o relógio do servidor).
7. **Exclusão, caso (a1)**: venda `completed` + entregue ⇒ estoque volta exatamente às quantidades dos itens.
7b. **Exclusão, caso (a2)**: venda `open` + entregue (entregue pela rota `POST /sales/:id/deliver`, débito fora do `create`) ⇒ estoque volta. É o quadrante mais comum do dia a dia com o ciclo do CRM-12.
8. **Exclusão, caso (b)**: venda aberta não entregue ⇒ `stock_qty` inalterado; reserva do produto volta a zero.
9. **Exclusão, caso (c)**: venda entregue → cancelada → excluída ⇒ estoque creditado **uma vez só** (o teste que pega o crédito em dobro).
10. Exclusão com cobrança paga ⇒ 204 (não 409).
11. Exclusão ⇒ itens e cobranças somem; compromisso vinculado sobrevive com `sale_id` nulo.
12. Exclusão de venda de outra consultora ⇒ 404 e a venda permanece.
13. Rota DELETE devolve 204 **sem corpo** sem derrubar o request (lesson do Elysia).
14. **Guard de data futura no banco** (RF-02): INSERT direto com `sold_at > updated_at` é rejeitado pelo CHECK; INSERT com `created_at > sold_at` (venda retroativa) é **aceito**.
15. **Cobrança retroativa no banco** (RF-05): INSERT com `paid_at < created_at` é aceito; com `paid_at > updated_at` é rejeitado.
16. **RF-15**: venda retroativa a prazo do mês anterior, quitada na data corrente, entra no agregado de vendas/lucro do **mês da venda** e não no mês corrente.
17. **Ponta-a-ponta do estoque**: produto com estoque N, M vendas retroativas entregues somando Q unidades ⇒ `stock_qty` = N − Q; excluir todas devolve a N.
18. **Item órfão**: excluir venda entregue cujo item tem `product_id` nulo não falha e não altera nenhum produto.
19. **Concorrência** (padrão de `sales.integration.test.ts:1088`, `Promise.all` em `:1118`): `excluir × entregar`, `excluir × pagar parcela` e — o mais importante — **`excluir × cancelar`** na mesma venda resultam em história serial legal, com crédito de estoque **único**. `cancel` é a única outra operação que credita estoque, logo é o cenário direto do risco "crédito em dobro".
19b. Venda **aberta não entregue → cancelada → excluída** ⇒ estoque nunca creditado (quadrante `canceled` + `delivered_at` nulo).
20. **RF-13**: venda com data de mais de um ano atrás é excluída sem erro.
21. Venda retroativa `on_delivery` (a receber na entrega) compõe cobrança coerente com a data da venda.
22. Exclusão de venda **parcialmente** paga (uma parcela baixada, outras pendentes) remove tudo e responde 204.
23. **RF-16 ponta-a-ponta**: venda retroativa criada com os padrões do formulário (entregue + já recebido) nasce `completed` e entra no faturamento e no lucro do mês da venda.

## Migração de Banco

**Escopo**: apenas `ALTER TABLE ... DROP CONSTRAINT` + `ADD CONSTRAINT` nos dois CHECKs temporais. Nenhuma coluna criada, alterada ou removida; nenhum dado tocado.

`sales_temporal_matrix_check` — remove `created_at <= sold_at`, adiciona `created_at <= updated_at`, mantém todo o resto (inclusive `sold_at <= updated_at`, que passa a ser o guard de data futura no banco).

`receivables_temporal_matrix_check` — remove `created_at <= paid_at`, mantém `paid_at <= updated_at`, `created_at <= updated_at`, as cláusulas de `voided_at` e a exclusão mútua pago×anulado.

**Não é destrutiva e não exige backfill.** Prova, com a premissa correta: o CHECK temporal **não existe em produção hoje** — nasce em `0013_optimal_midnight.sql:41`, parte do CRM-12, que está `[R]`: **commitado na branch base, mas não mergeado na `main` nem deployado**. No deploy desta feature rodam `0010` → `0014` na mesma sequência. Após `0013` aplicada vale `created_at <= sold_at <= updated_at` em toda linha, logo `created_at <= updated_at` segue por transitividade; idem `created_at <= paid_at <= updated_at` ⇒ `paid_at <= updated_at`. Independentemente disso, as linhas de produção foram criadas pelo código atual, que carimba os cinco campos com o mesmo instante. **Ensaio obrigatório na QA**: restaurar um dump com dados do estado de produção (hoje em **`0009`** — a `main`, única branch que dispara deploy, não contém as migrações `0010`+) e rodar **`0010` → `0014`** em sequência. Não basta banco novo.

**Rollback**: reverter é o DROP/ADD inverso — restaurar as constraints antigas. Só é possível enquanto não existir venda retroativa gravada; depois disso, o rollback exigiria remover essas linhas. Mencionar no handoff. O pipeline já tira snapshot pré-migração (ADR-0019/INF-07).

Gerar com `drizzle-kit generate` (nunca `push`) e **conferir o SQL emitido**: a lesson de 2026-07-16 mostra que derivação de DDL pode emitir placeholders `$1..$n` — os literais devem sair inline.

## Bordas aceitas (registradas, não tratadas)

- **Virada de dia com o formulário aberto**: formulário aberto às 23:59 envia `soldOn` = hoje; se a transação commitar depois da meia-noite local, o dia enviado passa a ser "passado" e a venda grava 12:00 do dia anterior — em vez do instante da transação. Borda aceita: o dia gravado continua sendo o dia que a usuária viu e escolheu, que é o comportamento menos surpreendente.
- **Guarda de data futura no Zod depende do relógio real** (herda o padrão de `sales.ts:342`), o que contraria o determinismo de `testing.md`. Aceito para manter um único padrão no arquivo; os testes do schema usam `vi.useFakeTimers` para não depender do relógio da máquina. A guarda autoritativa (service) é determinística por receber o instante injetado.

## Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Exclusão credita estoque em dobro no caso "entregue → cancelada → excluída" | **alta** se implementado sem atenção | Caso 9 da lista de integração existe só para isso; o predicado fica em um único ponto, com comentário do porquê |
| Regressão no caminho quente (venda de hoje) | média | RF-03 preserva `transactionNow` idêntico. Nenhum teste de **comportamento** de venda muda; mudam apenas **quatro** testes cuja premissa é alterada por decisão explícita: os dois casos de invariante temporal (RF-02/RF-04), a asserção da mensagem de primeiro vencimento em `packages/shared/src/sales.test.ts:223` e a asserção equivalente em `apps/api/src/modules/sales/sales.integration.test.ts:918` (ambas RF-06 — o comportamento, 422 + código de validação, permanece idêntico; muda só o texto esperado). Qualquer OUTRO teste existente que precise mudar é sinal de regressão, não de teste desatualizado — e relaxar/skipar teste é proibido por `testing.md` |
| `drizzle-kit generate` não detectar mudança de CHECK, ou emitir placeholders | média | Conferir o SQL gerado antes de seguir; rodar a migração em banco com dados do estado anterior |
| DELETE 204 derrubando o request (TypeError do Elysia) | média | `new Response(null, { status: 204 })` explícito + caso 13 de integração (a lesson diz que isso passa por typecheck e lint) |
| Data futura entrando por cliente com relógio adiantado | baixa | Guarda autoritativa no service com o `transactionNow` do Postgres; CHECK como última barreira |
| Venda a prazo retroativa inundar o "atrasado" do dashboard | média | Fora de escopo por decisão; comunicar no handoff e registrar como candidato a item de roadmap |
| Reentrada do histórico deixada nos defaults do formulário (sem baixa de estoque **e** fora do faturamento) | **alta** sem o RF-16 completo | RF-16 alinha **os dois** padrões (entrega e condição de pagamento) ao caso correto; caso 23 de integração prova ponta-a-ponta; precondição e procedimento no handoff |
| Escopo duplo (data + exclusão) num único ciclo de QA | média | Milestones separados e independentes; a QA pode reprovar uma parte sem bloquear a outra. Risco aceito por decisão explícita do usuário (registrado no Decisions Log) |

## Definition of Done

- [ ] Critérios de aceite do `spec.md` atendidos e cobertos por teste executável
- [ ] `bun run lint` e `bun run typecheck` limpos nos três workspaces
- [ ] `bun run test` verde, incluindo os 24 casos de integração com Postgres real
- [ ] Migração gerada por `drizzle-kit generate`, SQL conferido, aplicada com sucesso sobre banco com dados do estado anterior
- [ ] Build de `apps/web` e `apps/api` ok
- [ ] Conformidade com `.claude/rules/*` e com os ADRs vigentes; **dois ADRs novos**: exclusão de venda (emenda ADR-0013 item 3 + invariante 5) e faturamento por `sold_at` (emenda ADR-0023 + invariante 10)
- [ ] Pendência de E2E registrada explicitamente no handoff
