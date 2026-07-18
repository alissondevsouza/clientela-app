---
feature: {{FEATURE_NAME}}
module: {{MODULE_NAME}}
phase: tasks
status: draft
created: {{DATE}}
updated: {{DATE}}
depends_on: [plan.md]
---

# Tasks: {{FEATURE_NAME}}

<!-- Milestones agrupam tasks atômicas ordenadas por dependência.
     Cada milestone fechado = checkpoint de validação (lint + typecheck + testes do escopo). Sem commit — git é do humano (ADR-0006). -->

## Milestone 1: {{NOME}}

- [ ] **Task 1.1** — <!-- descrição atômica -->
  - Arquivos: <!-- paths a criar/modificar -->
  - Dependências: <!-- nenhuma | Task X.Y -->
  - Paralelizável: <!-- sim (arquivos disjuntos) | não -->
  - Verificação: <!-- comando/critério objetivo, ex: `bun run test --filter=@clientela/api` verde -->
  - Implementado por: <!-- preenchido em runtime (rastreabilidade: revisor ≠ implementer) -->
- [ ] **Task 1.2** — <!-- ... -->

## Milestone 2: {{NOME}}

- [ ] **Task 2.1** — <!-- ... -->

## Ordem de Execução
<!-- Sequência dos milestones e quais tasks podem rodar em paralelo -->

## Definition of Done (agregado)
- [ ] Todos os critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos módulos afetados
- [ ] `bun run test` (e `test:integration` quando aplicável) verdes
- [ ] Build dos módulos afetados ok
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
