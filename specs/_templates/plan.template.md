---
feature: {{FEATURE_NAME}}
module: {{MODULE_NAME}}
phase: plan
status: draft
created: {{DATE}}
updated: {{DATE}}
depends_on: [spec.md, research.md]
---

# Plan: {{FEATURE_NAME}}

## Decisões Técnicas
<!-- Decisões tomadas e justificativas; as duráveis graduam para project-memory/decisions/ no fechamento -->

| Decisão | Justificativa |
|---------|---------------|
| <!-- decisão --> | <!-- por que --> |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| <!-- path --> | <!-- o que faz --> |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| <!-- path --> | <!-- o que muda --> |

<!-- As tasks em si vivem em tasks.md — não duplicar aqui -->

## Cobertura de Testes (decisão obrigatória — critérios em .claude/rules/workflow/spec-format.md)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | <!-- sim/não --> | <!-- regra de negócio tocada --> |
| Integração (Testcontainers) | <!-- sim/não --> | <!-- muda schema/contrato/invariante? --> |
| E2E | <!-- sim/não/pendência (sem infra) --> | <!-- fluxo crítico de UI? --> |
| Regressão (se BUG-NNN) | <!-- sim/n.a. --> | <!-- teste deve falhar antes do fix --> |

## Migração de Banco
<!-- n.a. | descrever migração; se destrutiva: backfill + plano de rollback (database.md) -->

## Riscos
| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| <!-- risco --> | <!-- alta/média/baixa --> | <!-- como mitigar --> |

## Definition of Done
- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos workspaces afetados
- [ ] `bun run test` (e integração quando obrigatória) verdes
- [ ] Build ok
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
