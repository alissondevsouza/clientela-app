---
name: clientela-fix
description: >-
  Fast, root-cause hotfix workflow for a TRIVIAL, localized bug (1-3 files, no
  architectural decision, no contract change). Investigates root cause, writes a
  failing regression test first, applies the minimal fix and validates (lint +
  typecheck + tests). Work stays in the working tree on a fix/ branch — ALL git
  write operations (commit/push/PR) are LEFT TO THE HUMAN (ADR-0006). Use when the user reports a small bug, a broken test, or a typo-level
  defect. Do NOT use for features or non-trivial bugs (use clientela-spec-driven).
  Routing: .claude/rules/workflow/dev-flow-routing.md.
argument-hint: <descricao-do-bug>
---

# Skill: clientela-fix

Correção de bug **trivial e localizado**. Sem spec, sem plano formal, sem loops de revisão — mas **com causa raiz, teste de regressão e validação real**. Se a investigação revelar escopo não-trivial (decisão arquitetural, mudança de contrato/schema, > ~3 arquivos): **parar e redirecionar para `clientela-spec-driven`**.

## Processo

1. **Investigar (causa raiz, não sintoma).** Reproduzir o bug, ler o código real, formar hipótese e **confirmá-la** antes de propor fix. Consultar `project-memory/lessons.md` e `project-memory/known-issues.md` (pode já estar mapeado). Apresentar o diagnóstico ao usuário em 5–10 linhas.
2. **Branch.** A partir da `main` atualizada: `git switch -c fix/{slug}` (criar branch é o único git de escrita permitido — `git-workflow.md`). Nunca corrigir direto na `main`.
3. **Teste primeiro.** Escrever o teste de regressão que reproduz o bug — ele deve **falhar** antes do fix (rodar e confirmar a falha).
4. **Corrigir.** Fix mínimo na causa raiz. Proibido: silenciar erro, relaxar/skipar teste, remendar sintoma. Seguir `.claude/rules/typescript/*` e `security.md`.
5. **Validar de fato.** `bun run lint && bun run typecheck && bun run test` (+ testes de integração se o fix tocar fluxo coberto). Máximo 2 tentativas de correção em caso de falha; depois, reportar ao humano com o estado.
6. **Registrar.** Gotcha durável descoberto → append em `project-memory/lessons.md`. Dívida deliberada deixada → `project-memory/known-issues.md`. Bug veio de `specs/bugs-backlog.md` → marcar resolvido na entrada.
7. **Handoff (sem commit).** O trabalho fica no working tree da branch `fix/{slug}`. Informar o humano: diagnóstico, diff resumido, resultado dos testes e a **mensagem de commit sugerida** no formato `fix({scope}): {descricao}` (Conventional Commits, pt-BR) — o humano commita (ADR-0006).
