---
name: clientela-spec-driven
description: >-
  Desenvolvimento autônomo em malha fechada de feature ou bug não trivial:
  cria spec e plano, usa revisores neutros em subagentes isolados, implementa,
  executa QA adversarial até ficar verde, gradua memória e entrega handoff sem
  Git de escrita. É o fluxo padrão do Clientela App para mudanças não triviais.
  Não use para bug trivial localizado (use clientela-fix) nem para perguntas.
---

# Clientela Spec-Driven — adaptador Codex

Orquestre uma feature ou bug não trivial do intake ao handoff. As regras canônicas continuam em `.claude/rules/`; este adaptador define como o Codex usa skills e subagentes para preservar o contrato do ADR-0005.

Modos: autônomo por padrão; `--gated` cria checkpoint humano ao fim de cada fase; `--dry-run` para depois da aprovação da spec.

## Regras invioláveis

1. Quem revisa nunca implementa. Cada `clientela_spec_verifier` e `clientela_implement_verifier` deve ser um subagente novo e isolado, iniciado sem herdar o transcript do autor. Entregue somente objetivo, artefatos, diff e regras necessárias.
2. Depois de qualquer rodada de `clientela_fixer`, descarte o verifier anterior e crie outro verifier isolado.
3. Use os custom agents de `.codex/agents/` quando o cliente suportar perfis. Quando não suportar, crie um subagente novo com contexto vazio e instrua-o a ler o TOML do papel antes de receber a entrada delimitada.
4. O fluxo é autônomo até suíte e revisão verdes, mas nunca grava histórico Git. `git switch` para a branch é a única exceção. Commit, push, merge, rebase, cherry-pick, reset, tag e PR são do humano (ADR-0006).
5. Respeite os tetos: `MAX_SPEC_ROUNDS = 3`, `MAX_IMPL_ROUNDS = 3`, `MAX_VALIDATE_RETRIES = 2`, salvo override explícito do usuário. Ao estourar, pare e escale; nunca force aprovação.
6. Crie os artefatos definidos em `.claude/rules/workflow/spec-format.md` a partir de `specs/_templates/`.
7. Registre decisões no Decisions Log durante o fluxo e gradue decisões duráveis, dívidas e gotchas para `project-memory/` ao fechar.
8. Reporte exatamente o que foi verificado e o que ficou pendente; nunca prometa ausência de bugs.

## Papéis Codex

| Papel | Arquivo | Pode editar? |
|---|---|---|
| Orquestrador | esta skill no agente principal | artefatos e tracking; sem Git de escrita |
| Auditor de spec | `.codex/agents/clientela_spec_verifier.toml` | não |
| Implementador | `.codex/agents/clientela_implementer.toml` | código e testes |
| Verificador QA | `.codex/agents/clientela_implement_verifier.toml` | somente `validate.md` e `review.md` |
| Corretor | `.codex/agents/clientela_fixer.toml` | código e testes no escopo dos achados |

Delegue apenas tarefas concretas e delimitadas. O agente principal continua responsável por tracking, decisões, integração dos resultados e handoff.

## Pré-requisitos

Antes da Fase 1, leia:

- `CLAUDE.md` e `AGENTS.md`;
- `.claude/rules/workflow/spec-format.md`, `dev-flow-routing.md` e `git-workflow.md`;
- `.claude/rules/security.md` e as rules TypeScript aplicáveis;
- `project-memory/README.md`, arquitetura, domínio, ADRs, known issues e lessons;
- as skills de biblioteca em `.agents/skills/` correspondentes ao módulo tocado.

## Pipeline

```text
Fase 0  Intake e triagem       → classificar, dimensionar, branch, diretório, roadmap
Fase 1  Análise e spec         → spec, research quando exigido, plan, tasks, progress
Fase 2  Revisão neutra da spec → verifier novo ↔ orquestrador corrige, máx. 3
Fase 3  Implementação          → implementer por task/milestone, validações locais
Fase 4  QA neutro adversarial  → verifier novo → fixer → verifier novo, máx. 3
Fase 5  Graduação da memória   → ADRs, known issues, lessons e docs vivas
Fase 6  Handoff ao humano      → resumo, evidências e commits sugeridos; parar
```

### Fase 0 — Intake e triagem

1. Classifique feature ou bug, determine size P/M/L conforme `spec-format.md` e gere slug inglês em kebab-case com até 50 caracteres.
2. Localize o item no `specs/ROADMAP.md`; se não existir, adicione-o na fase correta antes de começar.
3. Marque `[>]` com `→ specs/{slug}`.
4. Crie/troque para `feature/{slug}` ou `fix/{slug}` usando `git switch` e inicialize `specs/{slug}/progress.md` com status `in_progress` e fase `spec`.

Não sobrescreva nem reverta mudanças preexistentes do working tree. Se elas colidirem com a tarefa e não houver forma segura de continuar, escale ao usuário.

### Fase 1 — análise e autoria

1. Inspecione código, testes, padrões e histórico relevantes. Para size L, delegue pesquisa read-only a um subagente isolado e peça evidências com caminhos/símbolos.
2. Crie `spec.md`, `research.md` para M/L, `plan.md`, `tasks.md` e `progress.md` a partir dos templates.
3. Registre cada decisão de design no Decisions Log.
4. Inclua no plano a Decisão de Cobertura de Testes: integração para schema/contrato/invariante, regressão obrigatória para `BUG-NNN`, E2E para fluxo crítico e justificativa explícita para qualquer dispensa.
5. Derive testes dos requisitos e critérios de aceite, nunca do diff ou da implementação proposta.

### Fase 2 — loop de revisão da spec

Para cada rodada:

1. Crie um subagente `clientela_spec_verifier` novo com contexto vazio. Mande-o ler `.codex/agents/clientela_spec_verifier.toml` e forneça somente a descrição original, caminhos de `spec.md`, `plan.md`, `tasks.md`, rules e memória relevantes.
2. Colete o veredito estruturado. Não peça ao verifier para corrigir arquivos.
3. Se reprovado, o orquestrador corrige os artefatos, registra decisões e inicia outro verifier novo.
4. Ao aprovar, registre rodada e veredito em `progress.md`. Ao atingir o teto, pare e escale o estado atual.

No modo `--dry-run`, faça o handoff da spec aprovada e pare aqui.

### Fase 3 — implementação

1. Para cada task, crie um `clientela_implementer` com a task delimitada, `spec.md`, `plan.md` e rules necessárias. Tasks independentes podem rodar em paralelo apenas se editarem conjuntos de arquivos disjuntos; caso contrário, execute em sequência.
2. O implementer escreve código e testes, executa a verificação local e não altera artefatos nem Git.
3. O orquestrador integra o retorno, atualiza checkboxes de `tasks.md`, `progress.md` e Decisions Log.
4. Ao fim de cada milestone, execute lint, typecheck e testes do escopo. Pare e investigue qualquer regressão antes de continuar.
5. Registre qual agente implementou cada task para garantir que nenhum deles seja usado como verifier.

### Fase 4 — loop de QA

Para cada rodada:

1. Crie um `clientela_implement_verifier` novo com contexto vazio. Mande-o ler `.codex/agents/clientela_implement_verifier.toml` e forneça somente `spec.md`, `tasks.md`, as rules e o diff atual. Não inclua transcript ou raciocínio dos implementadores.
2. O verifier revisa adversarialmente, executa lint, typecheck, testes, build e validações adicionais exigidas, grava `validate.md`/`review.md` e emite veredito.
3. Se reprovado, crie `clientela_fixer` com achados, `review.md`, `plan.md` e rules. Ele corrige somente o escopo reportado e devolve evidências.
4. Depois do fix, atualize Decisions Log e crie outro implement-verifier novo. Nunca reutilize o anterior.
5. Aprove apenas com critérios de aceite atendidos, lint/typecheck/testes/build verdes e nenhum CRÍTICO. Ao atingir o teto, pare e escale com os artefatos.

### Fase 5 — graduação da memória

1. Transforme decisão durável em ADR numerado e atualize `project-memory/decisions/README.md`.
2. Registre dívida ou drift em `known-issues.md` e gotcha de investigação em `lessons.md`.
3. Atualize documentos vivos de arquitetura, domínio ou escopo quando a realidade tiver mudado.
4. Para `BUG-NNN`, confirme o teste de regressão e marque a entrada resolvida com data e caminho da spec.
5. Feche `progress.md` como `completed`, fase `handoff`, e marque o roadmap `[R]`. `[x]` só depois que o humano confirmar o commit.

### Fase 6 — handoff

Pare com o trabalho no working tree. Informe ao humano:

- objetivo e comportamento entregue;
- branch e arquivos alterados;
- critérios de aceite e resultados reais de lint, typecheck, testes, build e validações adicionais;
- decisões graduadas e pendências conhecidas;
- uma ou mais mensagens de commit atômicas no formato Conventional Commits, em pt-BR.

O humano revisa, adiciona ao índice, commita, envia e abre/mescla o PR.

## Falhas que invalidam o fluxo

- Revisor que implementou, herdou o transcript do autor ou foi reutilizado após fix.
- Aprovação sem executar as verificações obrigatórias.
- Teste derivado do diff em vez da spec.
- Alteração Git fora da exceção de branch.
- Loop além do teto ou aprovação forçada.
- Omissão da graduação da memória ou de pendência conhecida.
