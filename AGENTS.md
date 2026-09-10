# Clientela App — instruções para o Codex

Este arquivo é o adaptador do Codex para o harness compartilhado do projeto. A orientação canônica de produto, memória, qualidade e fluxo está em `CLAUDE.md` e `.claude/rules/`; trate toda menção a "Claude" nesses arquivos como aplicável a qualquer agente.

## Antes de qualquer trabalho

1. Leia `CLAUDE.md` por inteiro.
2. Leia `project-memory/README.md` e os documentos relevantes à tarefa.
3. Leia `.claude/rules/workflow/dev-flow-routing.md` e roteie o pedido antes de editar.
4. Carregue somente as rules e skills de biblioteca aplicáveis ao módulo tocado.

## Mapeamento do harness no Codex

- Regras compartilhadas: `.claude/rules/` é a fonte única; não crie cópias em `.codex/`.
- Skills compartilhadas de bibliotecas: `.agents/skills/` contém symlinks para `.claude/skills/`.
- Workflows adaptados ao runtime do Codex: `.agents/skills/clientela-spec-driven/` e `.agents/skills/clientela-fix/`.
- Papéis especializados: `.codex/agents/*.toml`. O fluxo spec-driven deve usar subagentes novos e isolados conforme a skill; não delegue fora dos casos definidos pelo fluxo ou pedidos explicitamente pelo usuário.
- Configuração, guardrails e documentação operacional: `.codex/`.

## Invariantes

- Toda comunicação, documentação, commits sugeridos e textos de UI são em pt-BR; código e nomes de arquivo são em inglês.
- `specs/ROADMAP.md` é a fonte de trabalho e deve refletir o ciclo `[>]` → `[R]` → `[x]` definido nas rules.
- Feature ou bug não trivial usa `clientela-spec-driven`; bug trivial e localizado usa `clientela-fix`; pergunta/análise não cria artefatos.
- Não execute operações Git de escrita. A única exceção é criar ou trocar para a branch de trabalho com `git switch`; commit, push, merge, rebase, cherry-pick, reset, tag e criação/merge de PR são exclusivos do humano (ADR-0006).
- Antes do handoff, execute `bun run lint`, `bun run typecheck` e `bun run test`; acrescente build/integração/E2E quando o plano e as rules exigirem.
- Preserve mudanças preexistentes no working tree e nunca as reverta para concluir outra tarefa.

## Manutenção do adaptador

Ao mudar uma regra comum, edite `.claude/rules/`. Ao mudar comportamento específico do Codex, edite `.codex/`, `AGENTS.md` ou as duas skills adaptadoras. Rode `bun run harness:check` depois de qualquer mudança no harness.
