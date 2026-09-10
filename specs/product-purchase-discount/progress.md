---
feature: product-purchase-discount
module: shared, api, web
phase: close
status: completed
updated: 2026-09-09
---

# Progress: product-purchase-discount

**Status:** completed
**Current Phase:** close
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-09-08 | intake | Feature classificada como size L e registrada como CRM-11 | Altera contrato público, schema com dados de produção, regra financeira e UI cross-app |
| 2026-09-08 | spec | Produtos legados permanecem com custo manual (`purchase_discount_bps = null`) | Não é confiável inferir percentual a partir de preço/custo por arredondamentos, promoções e custos especiais |
| 2026-09-08 | spec | `cost_cents` continua persistido e é o valor consumido por estoque, vendas, pedidos e dashboard | Preserva contratos e snapshots existentes; o percentual descreve a origem do custo atual, sem reescrever histórico |
| 2026-09-08 | spec | Modo por desconto usa basis points nullable e cálculo autoritativo no servidor | Evita ponto flutuante, aceita percentuais futuros fracionários e impede manipulação do custo pelo navegador |
| 2026-09-08 | spec | PATCH financeiro será resolvido sob lock de linha em transação | Pesquisa isolada identificou corrida entre leitura e update; resolvedor puro do service preserva camadas e produz história serial |
| 2026-09-09 | spec | Margem percentual usa o preço de venda como denominador, basis points e arredondamento simétrico | Define prejuízo, precisão e preço zero sem `NaN`, usando o custo materializado como fonte |
| 2026-09-09 | spec | Rollback para API anterior exige janela sem escrita e limpeza explícita das taxas | Evita que a aplicação antiga deixe preço/custo incompatíveis com uma taxa persistida |
| 2026-09-09 | spec | Segunda revisão neutra aprovou a implementação | Alertas não bloqueantes de runtime, prioridade de drafts e nomenclatura de rollback foram incorporados antes do código |

## Milestones

- [x] Milestone 1: Contrato financeiro e persistência
- [x] Milestone 2: API e integrações
- [x] Milestone 3: Experiência web mobile-first
- [x] Milestone 4: Validação e graduação

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-09-08 | 1 | spec | Intake, branch `feature/product-purchase-discount`, roadmap e pesquisa isolada concluídos | Working tree já continha mudanças do harness; devem ser preservadas e separadas no handoff |
| 2026-09-09 | 2 | spec | Primeira revisão neutra reprovou; margem percentual, transições da edição, rollback, atomicidade de tasks e DoD raiz foram corrigidos | Nova revisão deve ser feita por verifier isolado diferente |
| 2026-09-09 | 2 | spec | Segunda revisão neutra aprovou spec, plano e tasks | Artefatos promovidos para `approved`; implementação liberada |
| 2026-09-09 | 2 | implementation | Task 1.1 concluída por implementer isolado | 50 testes focados de produtos shared e typecheck do pacote verdes |
| 2026-09-09 | 2 | implementation | Tasks 1.2 e 2.1 concluídas por implementers isolados | 18 testes da tabela e 27 integrações de produtos verdes; API tipada e PATCH concorrente serializado |
| 2026-09-09 | 2 | implementation | Task 2.2 concluiu contrato HTTP e regressões financeiras | 147 testes relevantes verdes; suíte raiz expôs 7 testes antigos de crédito com data fixa vencida, a reavaliar no QA |
| 2026-09-09 | 2 | implementation | Task 3.1 concluiu helpers puros da web | 45 testes cobrem percentuais pt-BR, presets, preview, margens e payloads exclusivos por modo |
| 2026-09-09 | 2 | implementation | Task 3.2 concluiu ProductForm mobile-first | Lint focado, typecheck web e 45 testes de pricing verdes; cadastro continua sem desconto implícito |
| 2026-09-09 | 2 | implementation | Task 3.3 concluiu leitura financeira e fiação da edição | 72 testes web, lint e typecheck raiz e build web verdes; implementação encaminhada a QA neutra |
| 2026-09-09 | 2 | qa | Primeira QA neutra reprovou com dois alertas | Fluxo CRM-11 e runtime mobile aprovados; suíte raiz tem 7 datas antigas vencidas e falta regressão versionada do salto 0009→0010 |
| 2026-09-09 | 2 | implementation | Task 1.2 concluída por implementer isolado | Migração 0010 gerada; 18 testes com Postgres real verdes; segunda geração sem drift |
| 2026-09-09 | 2 | qa | Fixer isolado corrigiu estritamente os dois alertas da rodada 1 | Datas de crédito não expiram; regressão aplica 0000–0009, insere legado e aplica 0010; 1226/1226 testes verdes |
| 2026-09-09 | 2 | qa | Segundo verifier neutro aprovou sem achados | 1226 testes raiz, 273 focados, lint/typecheck/build/harness e migração verdes |
| 2026-09-09 | 2 | graduate→handoff | ADR-0022 e modelo de domínio atualizados; CRM-11 movido para `[R]` | Entrega pronta para revisão e commit humano; nenhuma operação Git de escrita executada |
| 2026-09-09 | 2 | handoff | Gates obrigatórios repetidos na raiz após a graduação | Lint, typecheck e 1226/1226 testes verdes |
| 2026-09-09 | 3 | close | Commit humano `9ce488f` confirmado; CRM-11 marcado como `[x]` no roadmap | Fechamento registrado durante o intake da CRM-12 |
