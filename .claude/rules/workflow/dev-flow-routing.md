# Rule: Roteamento do fluxo de desenvolvimento

Como decidir qual fluxo usar quando o usuário pede algo. O usuário **não precisa digitar comando** — classifique o pedido e roteie.

| Pedido | Fluxo | Por quê |
|---|---|---|
| "Continue o roadmap" / "próximo item" / pedido sem alvo específico | Ler `specs/ROADMAP.md`, pegar o próximo item elegível (regras no próprio documento) e rotear pela linha correspondente abaixo | O roadmap é a fonte de trabalho — dispensa prompt detalhado |
| Feature nova (qualquer tamanho não-trivial) | skill `clientela-spec-driven` | Precisa de spec, plano, revisão neutra e QA |
| Bug não-trivial (causa desconhecida, cross-module, decisão de design) | skill `clientela-spec-driven` (modo bug) | Mesmo rigor de uma feature |
| Bug trivial e localizado (1–3 arquivos, sem decisão arquitetural) | skill `clientela-fix` | Rápido, mas com causa raiz + teste de regressão |
| Pergunta, análise, discussão, opinião | Responder direto | Não criar artefatos para conversa |
| Mudança só de documentação/harness | Editar direto | Se envolver decisão → registrar ADR em `project-memory/decisions/` |

## Critério de trivialidade (para `clientela-fix`)

Trivial = **todas** as condições: ≤ 3 arquivos afetados · causa raiz identificável por inspeção/reprodução direta · sem mudança de contrato (schema, rota, tipo compartilhado) · sem decisão arquitetural. Na dúvida, ou se a investigação revelar escopo maior: **redirecionar para `clientela-spec-driven`**.

## Roadmap (obrigatório em qualquer fluxo de código)

- Item veio do roadmap → atualizar o status nele: `[>]` ao iniciar (com `→ specs/{slug}`), `[R]` no handoff, `[x]` só com commit confirmado.
- Trabalho pedido que **não** está no roadmap → adicioná-lo (na fase certa, com ID) antes de começar, para o registro ficar completo.

## Invariantes de qualquer fluxo

- Consultar `project-memory/` antes de decidir; registrar decisões duráveis como ADR.
- Seguir as rules de `.claude/rules/typescript/*`, `git-workflow.md` e `security.md`.
- Nenhuma operação git de escrita (commit, push, merge, PR…) — todo git é do humano; agente só cria a branch de trabalho (ADR-0006, `git-workflow.md`).
