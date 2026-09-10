---
feature: product-purchase-discount
module: shared, api, web
phase: plan
status: completed
created: 2026-09-08
updated: 2026-09-09
depends_on: [spec.md, research.md]
---

# Plan: product-purchase-discount

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Persistir `purchase_discount_bps integer NULL` junto de `cost_cents` | `null` preserva custo manual/legado; o custo materializado mantém integrações e snapshots existentes simples |
| Taxa em basis points (0..10000), não float/numeric | Representa 37,5% como 3750 e mantém cálculo e contrato inteiros |
| Arredondamento half-up por fórmula inteira `(price * remaining + 5000) / 10000` | Determinístico no TS e Postgres; R$ 99,90 com 35% resulta R$ 64,94 |
| Margem percentual sobre preço, em basis points, com arredondamento simétrico | Produz até duas casas sem float persistido; preço zero retorna taxa não calculável e prejuízo mantém sinal |
| Server calcula e banco verifica coerência | Preview client não é autoridade; defesa em profundidade impede persistência divergente inclusive por novo caminho de escrita |
| Repository bloqueia o produto e executa um resolvedor puro do service dentro da transação | Serializa PATCHes concorrentes sem mover regra financeira para Drizzle nem sobrescrever campos alheios com snapshot obsoleto |
| Create aceita o formato manual atual e o novo modo desconto; PATCH mantém parcialidade | Evita quebra desnecessária de clientes/testes e preserva ajustes isolados de estoque |
| Custo direto em PATCH muda o produto para modo manual | Informar um custo concreto deve cessar a derivação automática; evita taxa antiga enganosa |
| Alterar preço isoladamente em modo desconto recalcula custo | Mantém a invariante sem exigir que todo consumidor conheça/reenvie a taxa |
| Produtos existentes não recebem taxa inferida | Preço/custo pode refletir promoção, frete ou arredondamento; inferência criaria dado falso |
| Radios/fieldset nativos estilizados com Tailwind, sem dependência nova | Poucas opções, seleção de um toque, teclado e sem inflar bundle; componentes shadcn existentes seguem usados para input/botão/card |
| Preview calculada durante render via `useWatch`, sem estado duplicado/useEffect | Custo e margem são estado derivado; elimina sincronização e renders extras |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `apps/api/drizzle/0010_*.sql` + `meta/0010_snapshot.json` | Migração Drizzle gerada da coluna e CHECKs |
| `apps/web/src/lib/product-pricing.ts` | Parse/format/modelagem pura dos campos de percentual e preview |
| `apps/web/src/lib/product-pricing.test.ts` | Testes de comportamento da borda web |
| `project-memory/decisions/0022-product-purchase-cost-mode.md` | Graduar a semântica durável de custo manual vs. derivado |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/products.ts` e `.test.ts` | Taxa, helper inteiro, contratos condicionais e testes |
| `apps/api/src/db/schema/products.ts` | Coluna e CHECKs |
| `apps/api/src/db/products-table.integration.test.ts` | Introspecção, faixa, coerência e legado |
| `apps/api/src/modules/products/products.{service,repository}.ts` | Resolver custo autoritativo e mapear taxa |
| `apps/api/src/modules/products/products.service.test.ts` | Matriz de transições de precificação |
| `apps/api/src/modules/products/products.integration.test.ts` | Contrato HTTP e banco real nos dois modos |
| `apps/web/src/components/products/product-form.tsx` | Modos, presets, personalizado, preview e payload |
| `apps/web/src/components/products/product-card.tsx` | Custo/taxa compactos |
| `apps/web/src/app/(crm)/crm/products/[id]/page.tsx` | Leitura financeira e defaults de edição |
| `apps/web/src/lib/products-api.test.ts` e fixtures afetadas | Novo campo de resposta/payload |
| `project-memory/04-domain-model.md` | Campo e semântica do produto |
| `project-memory/decisions/README.md` | Índice do ADR |
| `specs/ROADMAP.md`, `tasks.md`, `progress.md`, `validate.md`, `review.md` | Tracking do ciclo |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | sim | Nova fórmula, arredondamento, contrato condicional, transições do service e helpers do form |
| Integração (Testcontainers) | sim | Altera schema, contrato da API e custo usado em regra central de lucro/estoque |
| E2E | não; runtime manual obrigatório | Cadastro de produto não é fluxo crítico listado e a infra Playwright ainda não existe; build + Server Action real + viewport/teclado documentados cobrem a fiação possível hoje |
| Regressão (se BUG-NNN) | n.a. | Feature nova, sem BUG-NNN associado |

## Migração de Banco

Mudança schema-only e aditiva: adicionar coluna nullable e dois CHECKs. Não há backfill nem reescrita de linhas; existentes satisfazem os CHECKs porque a taxa é `null`. Gerar exclusivamente por `cd apps/api && bun run db:generate`, revisar SQL/journal/snapshot e provar em Postgres real. Deploy usa snapshot pré-migração fail-closed (ADR-0019). Rollback preferencial é forward-fix.

Se for indispensável restaurar a API anterior, executar em janela de manutenção: (1) bloquear escritas de produto; (2) obter snapshot e exportar `id`, `cost_cents` e `purchase_discount_bps`; (3) validar que `cost_cents` já está materializado e definir `purchase_discount_bps = NULL` para impedir metadado obsoleto depois da volta; (4) remover os CHECKs `products_purchase_discount_bps_range_check` e `products_discount_cost_consistency_check` por nova migração, sem editar a aplicada; (5) publicar a API anterior; (6) validar leitura e uma escrita manual controlada; (7) reabrir escritas. A coluna nullable pode permanecer compatível e ser removida apenas em migração posterior, depois da API antiga ativa. Em qualquer falha, manter escritas bloqueadas e restaurar/avançar a partir do snapshot. Essa contingência perde a taxa ativa no banco, mas a preserva no export; preço e custo materializado não são alterados.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Custo e taxa divergirem | baixa | Cálculo server-authoritative + CHECK de igualdade no banco + integração |
| PATCH parcial/concorrente deixar custo obsoleto ao mudar preço | média | Transação com `FOR UPDATE`, resolvedor puro do service, CHECK e teste concorrente |
| Arredondamento divergir TS/Postgres | média | Uma fórmula inteira documentada, casos de meio centavo em unidade e integração |
| Produtos legados serem classificados incorretamente | baixa | Sem inferência/backfill; `null` = manual |
| Form mobile ficar denso ou inacessível | média | Fieldsets semânticos, grid mobile, alvos de 44px e QA em ~375px/teclado |
| Tipos/fixtures quebrarem consumidores de `Product` | alta | Atualizar fixtures por typecheck e rodar suites de products/sales/orders/dashboard + raiz |
| Migração em produção sem backup externo | baixa para esta DDL | Schema aditivo + snapshot pré-deploy existente; manter LP-13 como pendência explícita |

## Definition of Done

- [x] Critérios de aceite do spec.md atendidos e testados
- [x] `bun run lint`, `bun run typecheck` e `bun run test` executados e limpos na raiz
- [x] Integração com Postgres real verde
- [x] Build de produção e runtime do fluxo create/edit ok
- [x] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
