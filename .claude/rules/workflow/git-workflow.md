# Rule: Git

> Política definida no [ADR-0006](../../../project-memory/decisions/0006-git-human-only.md): commits são assinados com GPG (chave do humano) — **todo git de escrita é exclusivo do humano**. Guardrail mecânico em `.claude/settings.json` (deny + hook PreToolUse).

## O que agentes PODEM fazer

- Git **somente leitura**: `status`, `diff`, `log`, `show`, `blame`.
- Criar/trocar para a branch de trabalho (`git switch -c feature/{slug}` | `fix/{slug}`) — não escreve histórico nem envolve assinatura. Nunca trabalhar direto na `main`.

## O que agentes NUNCA fazem

`commit`, `push`, `merge`, `rebase`, `cherry-pick`, `reset`, `tag`, PR (criar/mergear), qualquer alteração de histórico ou de config do git. Sem exceção, mesmo que pareça seguro. O trabalho fica no **working tree**; o humano revisa e commita.

## Handoff (obrigatório ao fim de qualquer fluxo)

Informar ao humano: branch de trabalho, arquivos alterados, resultado dos testes, e a(s) **mensagem(ns) de commit sugerida(s)** prontas para copiar.

## Convenções para os commits do humano

- **Conventional Commits** com descrição em pt-BR: `feat(sales): registra venda com baixa de estoque`.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`. Scope = app/módulo (`web`, `api`, `shared`, `sales`, `harness`…).
- `main` protegida por convenção: commit sempre em branch de trabalho.
- Sugerir commits atômicos: um por milestone/unidade coerente, com lint + typecheck + testes passando.
