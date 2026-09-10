# Adaptador do harness para Codex

Esta pasta contém apenas integrações específicas do runtime do Codex. As regras de engenharia continuam canônicas em `.claude/rules/`, e `AGENTS.md` conecta o Codex a essa fonte compartilhada.

## Mapeamento Claude Code → Codex

| Responsabilidade | Claude Code | Codex |
|---|---|---|
| Instruções do repositório | `CLAUDE.md` | `AGENTS.md` → `CLAUDE.md` |
| Rules de engenharia/workflow | `.claude/rules/` | as mesmas `.claude/rules/` |
| Skills de bibliotecas | `.claude/skills/` | `.agents/skills/` via symlink |
| Workflow do projeto | `.claude/skills/clientela-*` | `.agents/skills/clientela-*` adaptadas |
| Agentes especializados | `.claude/agents/*.md` | `.codex/agents/*.toml` |
| Configuração e hooks | `.claude/settings.json` | `.codex/config.toml`, `hooks.json` e `rules/` |

As skills de workflow têm adaptadores próprios porque os formatos de subagente e de isolamento diferem. O contrato funcional permanece o mesmo: spec, revisão neutra, implementação, QA adversarial, graduação da memória e handoff sem Git de escrita.

## Ativação

1. Marque o repositório como confiável no Codex; configurações, hooks e rules locais não carregam em projeto não confiável.
2. Reinicie a sessão após alterar `AGENTS.md`, `.codex/config.toml`, hooks, rules, agentes ou metadados de skills.
3. Abra `/hooks`, revise a definição de `.codex/hooks.json` e confie no hook pelo hash. Mudanças futuras no hook exigirão nova revisão.
4. Confirme as instruções com `codex --ask-for-approval never "Resuma as instruções ativas deste projeto"`.
5. Rode `bun run harness:check` para validar links, policy e hook.

## Política de manutenção

- Regra comum: alterar somente `.claude/rules/`.
- Referência de biblioteca: alterar somente `.claude/skills/{skill}/`; o symlink propaga ao Codex.
- Orquestração: manter os dois adaptadores `clientela-*` semanticamente equivalentes e adequados a cada runtime.
- Guardrail de Git: manter `.claude/settings.json`, `.codex/rules/git-human-only.rules` e `.codex/hooks/git-human-only.py` coerentes com o ADR-0006.
