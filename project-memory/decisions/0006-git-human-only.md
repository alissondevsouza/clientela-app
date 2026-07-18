# ADR-0006 — Operações git de escrita exclusivas do humano

- **Status**: Aceito
- **Data**: 2026-07-16

## Contexto

O harness previa commits locais de checkpoint feitos pelos agentes (por milestone). Porém a máquina de desenvolvimento usa **assinatura GPG obrigatória nos commits**, e a passphrase é fornecida interativamente via pinentry — um agente não-interativo falharia ao commitar, ou precisaria contornar a assinatura (`--no-gpg-sign`), poluindo o histórico com commits não assinados e inconsistentes com a política da máquina.

## Decisão

**Todo git de escrita é do humano**: `commit`, `push`, `merge`, `rebase`, `cherry-pick`, `reset`, `tag` e PRs. Agentes:

- usam git **somente leitura** (`status`, `diff`, `log`, `show`, `blame`);
- podem **criar/trocar de branch de trabalho** (não escreve histórico, não envolve assinatura);
- entregam o trabalho no **working tree** com handoff contendo a mensagem de commit sugerida.

A política é imposta em duas camadas mecânicas em `.claude/settings.json` (além da prosa nas rules): regras `permissions.deny` por prefixo e um hook `PreToolUse` com regex que pega variações disfarçadas (ex.: `git -c commit.gpgsign=false commit`).

## Alternativas consideradas

- **Agente commita com `--no-gpg-sign`** — quebra a consistência do histórico assinado; se o remote exigir commits assinados, esses commits seriam rejeitados.
- **Depender do cache do gpg-agent** — funciona só se o humano assinou algo recentemente (TTL do cache); comportamento intermitente é pior que proibição clara.
- **Skill de commit dedicada** — não resolve o problema de fundo (assinatura interativa); adia a falha.

## Consequências

- Handoffs precisam ser **completos**: diff resumido, testes executados e mensagem de commit pronta — o custo do humano commitar deve ser mínimo.
- Sem checkpoints commitados durante uma feature longa, o working tree acumula o trabalho todo até o handoff; mitigação: o humano pode commitar checkpoints quando quiser no meio do fluxo.
- Guardrail por prefixo/regex não é infalível (é defesa em profundidade, não sandbox) — a última linha continua sendo a revisão humana antes do commit.
