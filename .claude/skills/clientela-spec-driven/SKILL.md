---
name: clientela-spec-driven
description: >-
  Autonomous, closed-loop development of a feature or non-trivial bug from a
  free-form description. The orchestrator analyzes the codebase, authors the full
  spec set (spec.md, plan.md, tasks.md, progress.md), then runs two adversarial
  neutral-review loops: a NEUTRAL spec-verifier validates the spec until approved;
  after implementation, a NEUTRAL implement-verifier (never the implementer) reviews
  the diff, ACTUALLY RUNS tests/lint/typecheck/build, and loops fixes until green.
  Neutrality is guaranteed by spawning reviewers as fresh isolated subagents that see
  only artifacts + diff — never the author's context. Decisions persist in the
  feature's Decisions Log and graduate to project-memory/. Autonomous up to a passing
  suite; ALL git write operations (commit/push/PR/merge) are LEFT TO THE HUMAN. This is the DEFAULT flow for any
  non-trivial feature or bug described in natural language (per
  .claude/rules/workflow/dev-flow-routing.md — the user does NOT need to type a
  command). Do NOT use for trivial localized fixes (use clientela-fix) or for
  questions/analysis (just answer).
argument-hint: <descricao-da-feature-ou-bug> [--dry-run] [--gated]
---

# Skill: clientela-spec-driven

Desenvolvimento **autônomo em malha fechada** de uma feature ou bug não-trivial. O orquestrador analisa, especifica, implementa e submete o resultado a **loops de revisão neutra e adversarial** — parando sozinho apenas quando a suíte passa e a revisão aprova. **Todo git de escrita (commit, push, PR, merge) é do humano** (ADR-0006).

Modos: default autônomo · `--gated` = checkpoint humano ao fim de cada fase · `--dry-run` = para após a spec aprovada.

---

## REGRAS INVIOLÁVEIS

1. **Neutralidade obrigatória.** Quem **revisa/testa NUNCA é quem implementou.** Todo revisor (`clientela-spec-verifier`, `clientela-implement-verifier`) é um subagente **novo, de contexto isolado**, que recebe **apenas artefatos + diff + acceptance criteria** — nunca o raciocínio/transcript de quem produziu. Após uma rodada do `clientela-fixer`, spawnar um `clientela-implement-verifier` **novo** (nunca reaproveitar).
2. **Autônomo até a suíte verde — e para aí.** **NENHUM git de escrita**: sem commit, push, PR ou merge (ADR-0006 — commits são assinados com GPG pelo humano; guardrail mecânico em `.claude/settings.json`). Único git permitido além de leitura: criar/trocar para a branch de trabalho. O trabalho fica no working tree; ao terminar, **handoff ao humano** com mensagem de commit sugerida.
3. **Loops têm teto** (`spec-format.md`): `MAX_SPEC_ROUNDS`/`MAX_IMPL_ROUNDS` = 3, `MAX_VALIDATE_RETRIES` = 2. Estourou → **parar e escalar ao humano** com o estado atual.
4. **Artefatos obrigatórios** em `specs/{slug}/`: `spec.md`, `plan.md`, `tasks.md`, `progress.md`, `validate.md`, `review.md` (+ `research.md` se M/L). Formato: `.claude/rules/workflow/spec-format.md`; templates: `specs/_templates/`.
5. **Registro persistente.** Toda decisão entra no Decisions Log do `progress.md`; ao fechar, decisões duráveis **graduam** para `project-memory/decisions/` (ADR numerado) e dívidas/drifts para `project-memory/known-issues.md`.
6. **Nada de "zero bugs" prometido.** Reportar honestamente o que foi verificado e o que ficou pendente.

**Violação de qualquer uma = execução inválida.**

---

## Papéis (subagentes)

| Papel | Definição | Pode editar código? |
|---|---|---|
| **orchestrator** (esta skill) | main loop | coordena; edita artefatos `specs/` (nunca commita) |
| **clientela-spec-verifier** | `.claude/agents/clientela-spec-verifier.md` | ❌ só emite veredito |
| **clientela-implementer** | `.claude/agents/clientela-implementer.md` | ✅ implementa tasks |
| **clientela-implement-verifier** | `.claude/agents/clientela-implement-verifier.md` | ❌ revisa + roda testes |
| **clientela-fixer** | `.claude/agents/clientela-fixer.md` | ✅ corrige achados apontados |

> Spawnar via tool de subagente com o `subagent_type` do papel. Se os agents custom não estiverem carregados, usar `general-purpose` passando o corpo do arquivo do papel como prompt — a neutralidade vem do **spawn novo e isolado**, não do nome.

## Pré-requisitos (ler antes da Phase 1)

- `.claude/rules/workflow/spec-format.md` (formato, sizing, cobertura de testes, tetos).
- Rules aplicáveis: `.claude/rules/typescript/*`, `security.md`, `git-workflow.md`.
- **Memória do projeto**: `project-memory/README.md`, `02-architecture.md`, `04-domain-model.md`, `decisions/` (ADRs), `known-issues.md`, `lessons.md` — toda decisão deve ser coerente com elas.
- Skills de biblioteca conforme o módulo tocado: `elysia`, `drizzle-postgres`, `react`, `shadcn-ui`, `tailwindcss`, `zod`, `vitest`, `typescript-advanced`.

---

## Pipeline

```
Phase 0  Intake & Triagem       → classifica feature/bug, size, slug; cria branch + dir
Phase 1  Análise & Spec         → spec.md, (research.md se M/L), plan.md, tasks.md, progress.md
Phase 2  LOOP Revisão de Spec   → clientela-spec-verifier ↔ orchestrator corrige   [máx 3]
Phase 3  Implementação          → clientela-implementer por task; validação por milestone
Phase 4  LOOP QA                → implement-verifier → fixer → implement-verifier novo [máx 3]
Phase 5  Graduação da Memória   → ADRs + known-issues + project-memory + lessons
Phase 6  Handoff ao Humano      → PARA. Resumo + testes. Humano faz push/PR/merge
```

### Phase 0 — Intake & Triagem
1. Receber a descrição livre (feature ou bug; texto, stack trace, referência `BUG-NNN` de `specs/bugs-backlog.md` ou item `XX-NN` de `specs/ROADMAP.md`).
2. Classificar **feature** vs **bug**; definir `size` (P/M/L) e `slug` (kebab-case, inglês, ≤ 50).
3. Criar branch `feature/{slug}` (ou `fix/{slug}` se bug), criar `specs/{slug}/`, inicializar `progress.md` (`in_progress`, `Current Phase: spec`).
4. **Roadmap**: marcar o item como `[>]` com `→ specs/{slug}`; se o pedido não está no roadmap, adicioná-lo primeiro (regra de `dev-flow-routing.md`).

### Phase 1 — Análise & Autoria da Spec
1. Analisar o codebase (arquivos relevantes, padrões, riscos — subagente de pesquisa read-only para size L). Consultar `project-memory/` e as rules.
2. Escrever, a partir de `specs/_templates/`: `spec.md`, `research.md` (M/L), `plan.md`, `tasks.md`, `progress.md`.
3. Registrar cada decisão de design no **Decisions Log**.
4. **Decisão de Cobertura de Testes** no `plan.md`, seguindo os critérios de `spec-format.md` (integração obrigatória quando muda schema/contrato/invariante; regressão obrigatória para `BUG-NNN`; dispensa sempre justificada). Testes derivam do `spec.md`, **nunca** do diff.

### Phase 2 — Loop de Revisão de Spec (neutro, adversarial)
Repetir até **APROVADO** ou teto:
1. Spawnar **`clientela-spec-verifier`** novo. Entregar: descrição original + `spec.md`/`plan.md`/`tasks.md` + rules relevantes. **Não** entregar o raciocínio do autor.
2. Veredito `APROVADO`/`REPROVADO` + problemas (severidade, o quê, por quê, correção sugerida).
3. `REPROVADO` → orchestrator corrige, registra no Decisions Log, volta ao passo 1 com verifier **novo**.
4. Teto estourado → parar, atualizar `progress.md`, escalar ao humano.

### Phase 3 — Implementação
1. Para cada task de `tasks.md` (ordem de dependência): spawnar **`clientela-implementer`** com a task, `plan.md`, `spec.md` e as rules do módulo.
2. O implementer aplica a mudança, roda a verificação local da task e **não commita**.
3. Após cada task: marcar checkbox em `tasks.md`, atualizar `progress.md`, registrar decisões. Após cada **milestone**: rodar lint+typecheck+testes do escopo (checkpoint de validação — sem commit).
4. Registrar quem implementou o quê (rastreabilidade: revisor ≠ implementer).

### Phase 4 — Loop de QA (neutro, adversarial)
Repetir até **verde** ou teto:
1. Spawnar **`clientela-implement-verifier`** novo (≠ implementer). Entregar: `spec.md` + **diff** (`git diff main...`) + `tasks.md`. Sem transcript do implementer.
2. O verifier revisa o diff (correção, edge cases, conformidade com as rules), **roda de fato** `bun run lint`, `bun run typecheck`, `bun run test` (+ integração quando aplicável) e, havendo superfície de runtime, aciona a skill `verify`. Escreve `validate.md` e `review.md` e emite veredito.
3. `REPROVADO` → spawnar **`clientela-fixer`** com os achados; corrige **só** o escopo apontado, registra no Decisions Log, não commita. Voltar ao passo 1 com verifier **novo**.
4. Teto estourado → parar, escalar com `review.md`/`validate.md`.

**Definition of Done:** acceptance criteria atendidos · lint/typecheck limpos · suíte passando · build ok · conformidade com rules e ADRs · `review.md` sem CRÍTICO aberto.

### Phase 5 — Graduação da Memória
1. Decisões duráveis → **novo ADR numerado** em `project-memory/decisions/` (+ índice no README da pasta).
2. Dívidas/drifts descobertos → `project-memory/known-issues.md`.
3. Gotchas não-óbvios de investigação → `project-memory/lessons.md`.
4. Arquitetura/domínio mudou → atualizar `project-memory/02-architecture.md` / `04-domain-model.md`.
5. Input era `BUG-NNN` → confirmar teste de regressão criado; marcar a entrada no `specs/bugs-backlog.md` com `**Resolvido em**: YYYY-MM-DD (specs/{slug})`.
6. Fechar `progress.md`: `status: completed`, `Current Phase: handoff`. Marcar o item do roadmap como `[R]` (vira `[x]` só quando o humano commitar).

### Phase 6 — Handoff ao Humano
1. **PARAR.** Resumo: o que foi feito, branch de trabalho, arquivos alterados, resultado dos testes (números), decisões graduadas, pendências (ex.: E2E sem infra) e a(s) **mensagem(ns) de commit sugerida(s)** prontas para copiar.
2. Humano revisa o diff e faz commit/push/PR/merge. **A skill não faz nenhuma operação git de escrita.**

---

## Anti-padrões (não fazer)

- ❌ Revisor que implementou ou viu o raciocínio do implementer.
- ❌ Reaproveitar implement-verifier após um fix.
- ❌ Aprovar sem **rodar** os testes (revisão "no olho" não conta).
- ❌ Qualquer git de escrita — commit/push/PR/merge é do humano (ADR-0006).
- ❌ Loop além do teto; forçar aprovação.
- ❌ Pular a graduação da memória "porque a feature era pequena".
- ❌ Derivar teste do diff em vez do `spec.md`.
