# ADR-0021 — Harness compartilhado entre Claude Code e Codex

- **Status**: Aceito
- **Data**: 2026-09-08

## Contexto

O projeto já possuía um harness spec-driven maduro em `.claude/`, mas sessões executadas pelo Codex não descobriam automaticamente `CLAUDE.md`, rules, skills, subagentes e hooks do Claude Code. Copiar tudo para `.codex/` criaria duas fontes de verdade sujeitas a drift.

## Decisão

Adotar uma arquitetura de núcleo compartilhado com adaptadores por runtime:

1. `CLAUDE.md`, `.claude/rules/`, `project-memory/` e `specs/` permanecem fontes canônicas comuns.
2. O Codex usa `AGENTS.md` como entrypoint e lê as rules canônicas por referência.
3. Skills de biblioteca são expostas em `.agents/skills/` por symlinks para `.claude/skills/`, mantendo conteúdo único.
4. Os workflows `clientela-spec-driven` e `clientela-fix` têm adaptadores Codex próprios em `.agents/skills/`, pois isolamento e configuração de subagentes diferem entre runtimes.
5. Papéis especializados do Codex vivem em `.codex/agents/*.toml`; revisores continuam novos, neutros e sem o contexto do autor.
6. O ADR-0006 é aplicado no Codex por defense in depth: execpolicy em `.codex/rules/`, hook `PreToolUse` em `.codex/hooks.json` e instrução declarativa em `AGENTS.md`.
7. `bun run harness:check` verifica os links e os guardrails essenciais.

## Alternativas consideradas

- Duplicar todo `.claude/` sob `.codex/` — simples inicialmente, mas cria drift silencioso em regras e referências.
- Migrar a fonte canônica para uma terceira pasta neutra — reduziria nomes específicos de fornecedor, porém exigiria uma alteração ampla e arriscada no harness já estável.
- Usar apenas `/import` do Codex — útil para setup pessoal, mas não garante configuração versionada e reprodutível para toda a equipe.

## Consequências

- Regras e skills de biblioteca mudam uma vez e valem para os dois agentes.
- Orquestração e guardrails específicos continuam duplicados apenas onde os runtimes realmente diferem; mudanças nessas áreas exigem manter equivalência semântica.
- O projeto precisa ser confiável no Codex, e hooks novos ou alterados precisam ser revisados pelo usuário antes de executar.
- Symlinks pressupõem um checkout que os preserve, comportamento padrão do Git em Linux/macOS; ambientes sem suporte devem materializá-los no setup.
