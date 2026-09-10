---
feature: product-purchase-discount
module: shared, api, web
phase: tasks
status: completed
created: 2026-09-08
updated: 2026-09-09
depends_on: [plan.md]
---

# Tasks: product-purchase-discount

## Milestone 1: Contrato financeiro e persistência

- [x] **Task 1.1** — Especificar e testar taxa em basis points, fórmula inteira e contratos create/update/response.
  - Arquivos: `packages/shared/src/products.ts`, `packages/shared/src/products.test.ts`
  - Dependências: nenhuma
  - Paralelizável: não
  - Verificação: testes shared cobrem matriz e arredondamento; typecheck shared verde
  - Implementado por: `/root/discount_task_1_1`
- [x] **Task 1.2** — Adicionar coluna/CHECKs, gerar migração e provar DDL/legado em Postgres real.
  - Arquivos: `apps/api/src/db/schema/products.ts`, `apps/api/drizzle/*0010*`, `apps/api/src/db/products-table.integration.test.ts`
  - Dependências: Task 1.1
  - Paralelizável: não
  - Verificação: SQL/journal coerentes; integração de tabela verde
  - Implementado por: `/root/discount_task_1_2`

## Milestone 2: API e integrações

- [x] **Task 2.1** — Implementar resolução autoritativa de custo no service e update transacional com lock/resolvedor no repository.
  - Arquivos: `apps/api/src/modules/products/products.service.ts`, `apps/api/src/modules/products/products.repository.ts`, `apps/api/src/modules/products/products.service.test.ts`, `apps/api/src/modules/products/products.integration.test.ts`
  - Dependências: Milestone 1
  - Paralelizável: não
  - Verificação: unidade do service cobre toda a matriz de create/PATCH; integração concorrente prova serialização e coerência
  - Implementado por: `/root/discount_task_2_1`
- [x] **Task 2.2** — Expandir integração HTTP autenticada e ajustar fixtures/consumidores API afetados.
  - Arquivos: `apps/api/src/modules/products/products.integration.test.ts`, testes/fixtures TypeScript afetados pelo novo campo
  - Dependências: Task 2.1
  - Paralelizável: não
  - Verificação: produtos + vendas + pedidos + dashboard verdes em unidade/integração
  - Implementado por: `/root/discount_task_2_2`

## Milestone 3: Experiência web mobile-first

- [x] **Task 3.1** — Criar helpers puros de percentual/preview/payload e testes.
  - Arquivos: `apps/web/src/lib/product-pricing.ts`, `apps/web/src/lib/product-pricing.test.ts`
  - Dependências: Task 1.1
  - Paralelizável: não
  - Verificação: testes web cobrem presets, custom, inválidos e ambos os payloads
  - Implementado por: `/root/discount_task_3_1`
- [x] **Task 3.2** — Adaptar ProductForm com modos, seleção acessível e preview derivada.
  - Arquivos: `apps/web/src/components/products/product-form.tsx`
  - Dependências: Task 3.1
  - Paralelizável: não
  - Verificação: lint/typecheck web; inspeção sem useEffect/estado derivado duplicado
  - Implementado por: `/root/discount_task_3_2`
- [x] **Task 3.3** — Exibir custo, taxa e margem em detalhe/card e ajustar API client/fixtures.
  - Arquivos: `apps/web/src/app/(crm)/crm/products/[id]/page.tsx`, `apps/web/src/components/products/product-card.tsx`, `apps/web/src/lib/products-api.test.ts`, fixtures afetadas
  - Dependências: Task 3.2
  - Paralelizável: não
  - Verificação: testes web, typecheck e build verdes; helpers RSC server-safe
  - Implementado por: `/root/discount_task_3_3`

## Milestone 4: Validação e graduação

- [x] **Task 4.1** — Executar validações completas e runtime real create/edit nos dois modos.
  - Arquivos: `specs/product-purchase-discount/{validate,review}.md`
  - Dependências: Milestones 1–3
  - Paralelizável: não
  - Verificação: lint, typecheck, test, build, integração e runtime documentados pelo verifier neutro, incluindo listagem/detalhe manual e por desconto
  - Implementado por: `/root/discount_qa_2`
- [x] **Task 4.2** — Graduar decisão de domínio e fechar tracking/handoff.
  - Arquivos: `project-memory/04-domain-model.md`, `project-memory/decisions/0022-product-purchase-cost-mode.md`, `project-memory/decisions/README.md`, `specs/ROADMAP.md`, `progress.md`
  - Dependências: Task 4.1 aprovada
  - Paralelizável: não
  - Verificação: memória coerente; roadmap `[R]`; handoff completo sem Git de escrita
  - Implementado por: `/root`

## Ordem de Execução

Task 1.1 → 1.2 → Milestone 2 → Milestone 3 → QA neutro → graduação. Embora 2.x e 3.1 tenham partes disjuntas, serão sequenciais porque compartilham o contrato `Product` e o fluxo exige implementadores delimitados sem conflito.

## Definition of Done (agregado)

- [x] Todos os critérios de aceite do spec.md atendidos e testados
- [x] `bun run lint`, `bun run typecheck` e `bun run test` executados e limpos na raiz
- [x] Integração com Postgres real verde
- [x] Build dos módulos afetados ok
- [x] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
