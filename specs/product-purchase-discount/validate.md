---
feature: product-purchase-discount
module: shared, api, web
phase: validate
status: passed
round: 2
created: 2026-09-09
updated: 2026-09-09
depends_on: [tasks.md]
---

# Validate: product-purchase-discount (rodada 2)

## Resultado

**VEREDITO: APROVADO.** Os dois alertas da rodada 1 foram corrigidos e revalidados por um verifier novo: a suíte raiz está verde em 1226/1226, e a regressão versionada executa o upgrade real 0000–0009 → linha legada → 0010. Nenhum CRÍTICO ou ALERTA permaneceu.

## Comandos Executados

| Ferramenta | Comando | Status | Evidência |
|------------|---------|--------|----------|
| Lint | `bun run lint` | ✅ | 317 arquivos verificados; nenhum fix aplicado |
| Typecheck | `bun run typecheck` | ✅ | shared, web e api encerraram com código 0 |
| Testes raiz | `bun run test` | ✅ | 66 arquivos; 1226 testes passaram, 0 falhas |
| Build web | `cd apps/web && bun run build` | ✅ | Next.js 16.2.10 compilou; 20 páginas geradas; rotas de produtos presentes |
| Suíte focada CRM-11 | `bunx vitest run packages/shared/src/products.test.ts apps/api/src/db/products-table.integration.test.ts apps/api/src/modules/products/products.service.test.ts apps/api/src/modules/products/products.integration.test.ts apps/api/src/modules/sales/sales.integration.test.ts apps/api/src/modules/orders/orders.integration.test.ts apps/api/src/modules/dashboard/dashboard.integration.test.ts apps/web/src/lib/product-pricing.test.ts apps/web/src/lib/products-api.test.ts` | ✅ | 9 arquivos; 273 testes passaram, incluindo Postgres real |
| Estabilidade sales | `for run in 1 2 3; do bunx vitest run apps/api/src/modules/sales/sales.integration.test.ts; done` | ✅ | 27/27 em cada uma das três execuções; 81 passes acumulados |
| Upgrade legado isolado | `bunx vitest run apps/api/src/db/products-table.integration.test.ts -t "preserva todos os campos da linha criada em 0009 e adiciona taxa nula"` | ✅ | 1 teste passou; 18 ficaram fora pelo filtro |
| Integridade do diff | `git diff --check` | ✅ | sem erros de whitespace |
| Harness preexistente | `bun run harness:check` | ✅ | regras compartilhadas, skills, agentes e guardrails válidos |
| Limpeza | `docker ps`, `docker ps -a --filter ancestor=postgres:18-alpine` e inspeção de portas | ✅ | nenhum container de teste permaneceu; 3000, 3001 e 55432 livres; banco local preexistente em 5432 não foi tocado |

## Correção 1 — datas dinâmicas dos testes de crédito

`apps/api/src/modules/sales/sales.integration.test.ts` agora deriva o primeiro vencimento como 31 de janeiro do ano seguinte ao relógio corrente e calcula corretamente 28/29 de fevereiro pela regra gregoriana. O teste principal continua comparando explicitamente a sequência:

```text
31/jan do próximo ano → último dia de fevereiro → 31/mar
```

Isso preserva a prova de clamp mensal e de ausência de drift. As sete ocorrências que antes usavam `2026-08-31` passaram na suíte raiz, na suíte focada e em três execuções completas consecutivas de `sales.integration.test.ts`. Como as constantes são avaliadas uma vez no carregamento do módulo e janeiro do ano seguinte é sempre futuro, os cenários não voltam a expirar com a passagem do calendário.

## Correção 2 — regressão real da migração 0010

O novo teste em `apps/api/src/db/products-table.integration.test.ts`:

1. inicia um `postgres:18-alpine` próprio;
2. lê e executa, em ordem, os arquivos literais `0000_new_gideon.sql` até `0009_dizzy_polaris.sql`;
3. insere consultora e produto enquanto `purchase_discount_bps` ainda não existe;
4. captura todos os campos do produto anterior à migração;
5. lê e executa literalmente `apps/api/drizzle/0010_green_leo.sql`;
6. relê e compara a linha inteira, exigindo todos os valores originais intactos e `purchaseDiscountBps: null`;
7. em `finally` aninhado, encerra a conexão e para o container mesmo se setup, migração ou asserção falhar.

A execução isolada passou. Após as suítes, não restou container Postgres nem Ryuk. A comparação estrutural entre `0009_snapshot.json` e `0010_snapshot.json` encontrou somente:

- encadeamento normal de `id`/`prevId` do snapshot;
- `products.purchase_discount_bps` como `integer`, nullable e sem default;
- `products_purchase_discount_bps_range_check`;
- `products_discount_cost_consistency_check`.

O SQL 0010 contém apenas os três DDLs aditivos esperados: uma coluna nullable e dois `ADD CONSTRAINT`, sem backfill ou alteração de dados.

## Gates Principais

```text
$ bun run lint
Checked 317 files in 235ms. No fixes applied.

$ bun run typecheck
@clientela/shared typecheck: Exited with code 0
@clientela/web typecheck: Exited with code 0
@clientela/api typecheck: Exited with code 0

$ bun run test
Test Files  66 passed (66)
Tests       1226 passed (1226)

$ cd apps/web && bun run build
✓ Compiled successfully
✓ Generating static pages using 7 workers (20/20)
```

O build atualizou automaticamente `apps/web/next-env.d.ts` para o path de tipos de produção; iniciar o gerador em modo dev restaurou o conteúdo original automaticamente. O arquivo terminou sem diff, e nenhum código ou teste foi editado pelo verifier.

## Critérios de Aceite

| Critério | Estado | Evidência |
|----------|--------|-----------|
| RF-01/RF-02 — fórmulas, margem e contratos | ✅ | unidade shared cobre 30/35/37,5/40%, 0/100%, R$ 99,90 → R$ 64,94, frações/faixa, preço zero, margem negativa, duas casas e custo arredondado |
| RF-02/RF-08 — HTTP manual/desconto e 422 pt-BR | ✅ | integração de produtos cobre POST legado, POST desconto, combinação ambígua, PATCH vazio e taxa inválida |
| RF-03 — matriz do service | ✅ | criação calculada, mudança de taxa, custo manual, taxa nula, reprecificação e PATCH não financeiro |
| RF-03/RF-04 — concorrência | ✅ | PATCHes preço × taxa sob Postgres real observam estados serializados e terminam coerentes, sem 500 |
| RF-04 — DDL e legado | ✅ | introspecção/CHECKs + regressão automatizada real 0000–0009 → insert → 0010 → comparação integral |
| RF-03/RF-04/RF-08 — HTTP, leitura e isolamento | ✅ | POST/PATCH/GET/list nos dois modos, cálculo server-authoritative e isolamento A × B |
| RF-05 — formulário | ✅ | helpers cobrem parser pt-BR, presets/custom, preview e payload exclusivo; runtime mobile completo da rodada 1 permanece válido porque as correções tocaram apenas testes |
| RF-06 — detalhe e card | ✅ | código server-safe, build de produção e runtime de listagem/detalhe manual e desconto da rodada 1 |
| RF-07 — vendas, pedidos e dashboard | ✅ | suites específicas e raiz verdes; snapshots de venda/pedido e lucro histórico permanecem imunes a mudanças do desconto |
| RF-08 — gates | ✅ | lint, typecheck, 1226 testes, build web e `git diff --check` verdes |

## Runtime

O runtime manual completo de API, Server Actions, RSC e browser 375×812 já foi executado e documentado na rodada 1. As correções posteriores foram estritamente em dois arquivos de teste: datas de fixtures de crédito e regressão de migração. Nesta rodada, os caminhos afetados foram reexecutados em Vitest com Postgres real; não havia mudança de runtime que justificasse repetir toda a automação browser ad hoc.

## Escopo e Limpeza

- Nenhuma operação Git de escrita foi executada.
- Nenhum código ou teste foi alterado pelo verifier.
- Somente `validate.md` e `review.md` foram gravados.
- Mudanças preexistentes do harness, backlog e tracking fora da CRM-11 foram preservadas.
- O banco local em 5432 não foi usado pelas integrações.

## Pendências

Nenhuma pendência bloqueante para a CRM-11. A infraestrutura Playwright continua como dívida já documentada do projeto; o formulário de produto não é fluxo crítico obrigatório segundo o plano aprovado.
