---
name: clientela-fix
description: >-
  Corrige bug trivial e localizado (1-3 arquivos, causa conhecida, sem mudança
  arquitetural ou de contrato) com causa raiz, teste de regressão e validação
  real. Use para defeitos pequenos. Não use para feature ou bug não trivial;
  nesses casos use clientela-spec-driven. Todo Git de escrita fica com o humano.
---

# Clientela Fix — adaptador Codex

Execute uma correção curta, mas comprovada. As regras canônicas estão em `.claude/rules/`; este arquivo adapta apenas a execução ao Codex.

## Limite do fluxo

Este fluxo só é válido quando todas as condições são verdadeiras: no máximo três arquivos afetados, causa raiz confirmável por inspeção ou reprodução direta, nenhum contrato/schema compartilhado muda e nenhuma decisão arquitetural é necessária.

Se a investigação revelar escopo maior, pare e redirecione para `clientela-spec-driven`. Não comprima uma mudança não trivial para fazê-la caber neste fluxo.

## Processo

1. Leia `CLAUDE.md`, `project-memory/lessons.md`, `project-memory/known-issues.md`, `.claude/rules/workflow/git-workflow.md` e as rules do módulo.
2. Reproduza o bug, trace o caminho real e confirme a causa raiz. Antes de editar, apresente ao usuário um diagnóstico conciso.
3. Localize o item no `specs/ROADMAP.md`; se não existir, adicione-o segundo `.claude/rules/workflow/dev-flow-routing.md`. Marque `[>]` ao iniciar.
4. Crie ou troque para `fix/{slug}` com `git switch`; essa é a única exceção à proibição de Git de escrita.
5. Escreva um teste de regressão que reproduza o defeito e execute-o para confirmar que falha antes da correção.
6. Aplique o menor fix na causa raiz. Não silencie erro, não relaxe teste e não faça refatoração oportunista.
7. Execute `bun run lint`, `bun run typecheck` e `bun run test`, além das verificações específicas do módulo. Faça no máximo duas tentativas de correção de falhas; depois escale com evidências.
8. Registre gotcha durável em `project-memory/lessons.md`, dívida deliberada em `project-memory/known-issues.md` e decisão relevante em novo ADR. Se vier do backlog de bugs, atualize a entrada.
9. Marque o roadmap como `[R]` e entregue o handoff: causa raiz, arquivos alterados, evidência do teste vermelho/verde, resultado das validações, branch e mensagem sugerida `fix({scope}): {descricao}`.

Nunca execute `git add`, commit, push, merge, rebase, reset, tag ou criação/merge de PR. O humano revisa e grava o histórico (ADR-0006).
