---
feature: product-purchase-discount
module: shared, api, web
phase: review
status: approved
round: 2
created: 2026-09-09
updated: 2026-09-09
depends_on: [spec.md, plan.md, validate.md]
---

# Review: product-purchase-discount (rodada 2)

## Resumo

VEREDITO: **APROVADO**

SUÍTE: **passou** (1226 testes, 0 falhas)

LINT/TYPECHECK/BUILD: **ok / ok / ok**

ACCEPTANCE CRITERIA: **atendidos**

ACHADOS:

- Nenhum achado crítico, alerta ou sugestão nesta rodada.

As duas pendências da rodada 1 foram resolvidas com evidência executável. A revisão integral não encontrou regressão funcional, de segurança, arquitetura ou aderência às rules/ADRs.

## Revalidação dos Achados da Rodada 1

### Resolvido — datas vencidas em sete testes de crédito

O antigo literal `2026-08-31` foi substituído por 31 de janeiro do ano seguinte, com fevereiro calculado como 28/29 conforme a regra gregoriana e retorno explícito a 31 de março. A prova continua sendo independente da implementação do calendário de parcelas e mantém a característica relevante: clamp no mês curto sem drift no mês posterior.

Todos os 27 testes de integração de sales passaram três vezes consecutivas, além da suíte raiz e da suíte focada. Os sete cenários antes bloqueados pela fronteira 422 agora alcançam e validam seus comportamentos de domínio originais.

### Resolvido — teste “linha legada” não atravessava a migração

Há agora uma regressão separada que sobe Postgres 18, aplica os dez arquivos reais de 0000 a 0009, insere a linha ainda no schema antigo, aplica o arquivo real 0010 e exige igualdade integral antes/depois com a única adição `purchaseDiscountBps: null`.

O teardown usa `try/finally` desde a criação do container, encerra `postgres.js` quando inicializado e para o container mesmo se o encerramento da conexão falhar. A prova passou isoladamente e não deixou container em execução.

## Revisão Adversarial

### Correção e edge cases

- [x] O cálculo de custo usa inteiros e half-up; presets, personalizado, 0%, 100% e R$ 99,90 × 35% estão cobertos.
- [x] A margem usa o custo materializado, preserva sinal, arredonda simetricamente e retorna taxa não calculável para preço zero.
- [x] Create e PATCH distinguem ausência de `null`, rejeitam combinações ambíguas, body vazio, frações e faixa.
- [x] PATCH financeiro resolve o estado atual depois do lock e recalcula com preço/taxa efetivos.
- [x] PATCH não financeiro preserva preço, custo e taxa.
- [x] As datas de crédito são futuras e continuam provando 31 → fevereiro → 31 sem expirar.

### Banco e migração

- [x] `purchase_discount_bps` é `integer NULL`, sem default/backfill.
- [x] CHECK de faixa aceita 0 e 10000 e rejeita valores externos.
- [x] CHECK de consistência faz cast de preço para `bigint` antes da multiplicação e usa a mesma fórmula half-up.
- [x] A migração 0010 contém apenas DDL aditivo.
- [x] Snapshot/journal adicionam somente coluna e CHECKs esperados.
- [x] Regressão versionada aplica literalmente 0000–0009, insere no schema antigo, aplica literalmente 0010 e compara a linha.
- [x] Teardown encerra conexão/container em todos os caminhos cobertos pelo bloco `try/finally`.

### Arquitetura e concorrência

- [x] Contrato e matemática permanecem em `packages/shared`; API e web reutilizam os mesmos helpers.
- [x] Routes → service → repository permanece unidirecional.
- [x] A regra financeira é um resolvedor puro do service executado pelo repository dentro da transação, após `SELECT ... FOR UPDATE`.
- [x] Dois PATCHes concorrentes produzem uma história serial legal e custo final coerente.
- [x] Web permanece server-first; interatividade está confinada ao `ProductForm` e a prévia é derivada durante render, sem `useEffect`.

### HTTP, segurança e isolamento

- [x] Nenhuma rota pública ou nova foi criada; products permanece sob o guard autenticado existente.
- [x] `consultantId` vem da sessão e todas as leituras/escritas continuam escopadas.
- [x] Input externo é validado por Zod e SQL usa Drizzle/postgres.js parametrizado.
- [x] Erros 422 são acionáveis em pt-BR; nenhuma stack, query, segredo ou dado pessoal novo é exposto.
- [x] O browser envia somente a taxa no modo desconto; o service é autoridade do custo.

### Web, mobile e leitura

- [x] Cadastro abre sem taxa silenciosa; edição restaura preset, personalizado ou modo manual conforme o produto.
- [x] A alternância preserva rascunhos com a prioridade especificada.
- [x] Fieldsets, legends, labels, ARIA, radios nativos e alvos `min-h-11` atendem teclado/mobile.
- [x] Detalhe mostra preço sugerido, forma do custo, custo e margem bruta com disclaimer.
- [x] Card mostra custo e desconto quando aplicável sem importar helper de Client Component em RSC.
- [x] Build e runtime de produção documentado na rodada 1 cobrem listagem, detalhe, create/edit e viewport 375×812.

### Integrações e qualidade

- [x] Venda congela `products.costCents` em `sale_items.cost_cents`.
- [x] Pedido usa o custo atual como default e preserva seu snapshot após mudança de taxa.
- [x] Dashboard mantém lucro histórico por snapshot; resumo de estoque continua usando custo persistido.
- [x] Lint, typecheck, suíte raiz, suíte focada, build e diff estão verdes.
- [x] Não há `any`, `@ts-ignore`, skip/only, asserção vazia, `useEffect` ou supressão nova no diff da CRM-11.

## Critérios de Aceite

| Critério | Estado | Evidência principal |
|----------|--------|--------------------|
| RF-01/RF-02 — fórmula, margem e schemas | ✅ | `products.test.ts` + `product-pricing.test.ts` |
| RF-02/RF-08 — contrato HTTP e 422 pt-BR | ✅ | `products.integration.test.ts` |
| RF-03 — transições do service | ✅ | `products.service.test.ts` |
| RF-03/RF-04 — concorrência | ✅ | integração real de products |
| RF-04 — schema, DDL e legado | ✅ | integração de tabela + upgrade real 0000–0010 |
| RF-03/RF-04/RF-08 — leitura e isolamento | ✅ | integração HTTP autenticada A × B |
| RF-05 — formulário | ✅ | helpers unitários + runtime da rodada 1 |
| RF-06 — detalhe e card | ✅ | build + runtime RSC da rodada 1 |
| RF-07 — integrações e snapshots | ✅ | sales/orders/dashboard + suíte raiz |
| RF-08 — gates | ✅ | 1226/1226, lint/typecheck/build/diff verdes |

## Veredito

**APROVADO.** Todos os critérios de aceite estão atendidos, os gates obrigatórios estão verdes e não há CRÍTICO. A CRM-11 pode seguir para graduação de memória e handoff humano.
