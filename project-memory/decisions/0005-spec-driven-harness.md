# ADR-0005 — Harness de desenvolvimento: spec-driven com revisão neutra adversarial

- **Status**: Aceito
- **Data**: 2026-07-16

## Contexto

O desenvolvimento será majoritariamente executado por agentes de IA. Sem processo, agentes tendem a: implementar sem especificar, aprovar o próprio trabalho, "validar" sem rodar nada e perder decisões pelo caminho. O time trouxe de outro projeto um fluxo spec-driven com revisores neutros, considerado bom e confiável.

## Decisão

Adotar (adaptado a este projeto) o fluxo em `.claude/skills/clientela-spec-driven/` como **default para toda feature/bug não-trivial**, com:

1. **Separação de papéis por subagentes isolados**: implementer ≠ verifier, sempre; revisores são spawns novos que só veem artefatos + diff (nunca o raciocínio do autor).
2. **Dois loops adversariais com teto** (3 rodadas): revisão de spec antes de implementar; QA (review + execução real de lint/typecheck/testes/build) depois.
3. **Artefatos rastreáveis** em `specs/{slug}/` (spec, plan, tasks, progress, validate, review) a partir de `specs/_templates/`.
4. **Graduação de memória**: decisões duráveis viram ADR em `project-memory/decisions/`; dívidas em `known-issues.md`; gotchas em `lessons.md`.
5. **Rules como contrato de qualidade** em `.claude/rules/` (workflow, typescript, git, security) — todo agente as segue; verificadores as auditam.
6. **Fluxo curto para bug trivial** (`clientela-fix`): causa raiz + teste de regressão que falha antes do fix + validação real.
7. **Limite de autonomia**: commits locais de checkpoint permitidos; `push`, PR e merge são exclusivos do humano. *(Ponto substituído pelo [ADR-0006](./0006-git-human-only.md): nenhum git de escrita por agentes, nem commit.)*

Roteamento entre fluxos: `.claude/rules/workflow/dev-flow-routing.md`.

## Alternativas consideradas

- **Desenvolvimento direto sem spec/revisão** — mais rápido por tarefa, mas sem asseguramento; contradiz o objetivo de confiar no código gerado.
- **Revisão pelo próprio implementador** — barata, porém viés de auto-aprovação é exatamente o risco a eliminar.
- **Gates humanos em toda fase** — vira gargalo; mantido como modo opcional (`--gated`).

## Consequências

- Custo maior por feature (spec + 2 loops + subagentes) em troca de qualidade verificada — aceito explicitamente.
- O processo só protege se os tetos e a neutralidade forem respeitados; violação = execução inválida (regra da skill).
- E2E ainda sem infra: pendências de E2E são registradas no handoff, nunca presumidas (ver `known-issues.md`).
