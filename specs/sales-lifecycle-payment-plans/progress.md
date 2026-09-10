---
feature: sales-lifecycle-payment-plans
module: shared, api, web, infra
phase: handoff
status: ready_for_review
updated: 2026-09-10
---

# Progress: sales-lifecycle-payment-plans

**Status:** ready_for_review (handoff entregue; commit é do humano — ADR-0006)
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-09-09 | intake | Feature classificada como size L e registrada como CRM-12 | Altera contrato público, schema com dados reais, invariantes de estoque e recebimento e fluxo crítico cross-app |
| 2026-09-09 | intake | Branch CRM-12 deriva do commit da CRM-11 | Mantém a migração nova depois da `0010`; a integração da CRM-11 deve preceder a da CRM-12 |
| 2026-09-09 | spec | Reserva pode deixar disponibilidade negativa, mas bloqueia exclusão do produto | Venda pendente precisa registrar demanda sem estoque; exclusão não pode quebrar uma entrega futura |
| 2026-09-09 | spec | Agenda passa a aceitar vendas abertas e concluídas | O consumidor atual filtra apenas `completed` e ficaria incompatível com o novo ciclo |
| 2026-09-09 | spec | Baixa financeira permanece integral por recebível | Pagamento parcial existe entre parcelas; ledger parcial dentro da mesma parcela fica fora do escopo |
| 2026-09-09 | spec-review-1 | Recebíveis cancelados passam a ser anulados, não removidos | Preserva soma/auditoria e elimina dívida cobrável por `voided_at`/status `voided` |
| 2026-09-09 | spec-review-1 | Matriz de pagamento e backfill tornados exaustivos | Remove duplo significado de parcelas e determina valores/timestamps para cada classe do schema 0010 |
| 2026-09-09 | spec-review-1 | Criação e DELETE serializam pela linha do produto | Impede reserva nova apontar para produto excluído em corrida concorrente |
| 2026-09-09 | spec-review-1 | Leituras compostas usam snapshot coerente e tasks/aceites foram decompostos | Evita estado impossível e torna cada critério verificável por arquivo/comando |
| 2026-09-09 | spec-review-2 | Legado sem plano recuperável recebe marcador desconhecido, não inferência | O schema 0010 não persiste N de crédito cancelado/zero; fallback técnico é 1 e UI explica a ausência histórica |
| 2026-09-09 | spec-review-2 | Migração decomposta estritamente em 0011→0012→0013 | Journal Drizzle e tightening seguem a ordem executável, sem renomear artefatos |
| 2026-09-09 | spec-review-2 | Deploy passa a parar writers antes do snapshot e dashboard usa snapshot coerente | Fecha escrita entre auditoria/backfill e respostas financeiras híbridas |
| 2026-09-10 | spec-review-4 | Grafo temporal, total zero, performance e tasks foram tornados inequívocos | Inclui `createdAt >= soldAt`, `paidAt <= updatedAt`, estado zero por entrega, aceite de plano independente do runner e papéis QA separados |
| 2026-09-10 | spec-review-5 | Backfill passa a gravar timestamps técnicos; fronteira transacional e runbook foram explicitados | Linhas sintetizadas preservam o grafo histórico, service compõe somente após locks e documentação operacional acompanha o cutover |
| 2026-09-10 | spec-review-6 | Coleta do teste de deploy e matriz temporal terminal foram fechadas | Vitest passa a coletar scripts; CHECKs/testes cobrem todos os terminais; backfill eleva `updatedAt` apenas quando baixa legada posterior exigir |
| 2026-09-10 | spec-review-8 | Escritas novas passam a usar tempo canônico da transação | Evita defaults independentes violarem relações cross-table de criação/baixa/entrega |
| 2026-09-10 | spec-review-9 | Entrega, baixa e estorno ganham igualdade temporal verificável | A mesma data transacional é persistida e testada em todos os campos correlatos alterados |
| 2026-09-10 | spec-review-10 | Spec, plano e tasks aprovados por revisor isolado | Sem achados; implementação pode iniciar pela sequência planejada |
| 2026-09-10 | implementation | Task 1.1 concluída | Contrato shared de ciclo/plano, matriz e helper entregues com testes e typecheck shared verdes |
| 2026-09-10 | implementation | Task 1.2 concluída | Contratos de disponibilidade e previsão de vendas abertas entregues com testes/typecheck shared verdes |
| 2026-09-10 | implementation | Task 1.3 concluída | Migração expansiva 0011 gerada, Testcontainers e segunda geração sem drift verdes |
| 2026-09-10 | implementation | Task 1.6 concluída | Cutover fail-closed, teste shell coletado pela raiz e runbook operacional entregues |
| 2026-09-10 | implementation | Task 1.4 concluída | Backfill 0012 fail-closed testado em Postgres 18 com 14 cenários literais |
| 2026-09-10 | implementation | Task 1.5 concluída | Schema final/0013 e cadeia literal 0010→0013 validados em Postgres 18; cartão legado sem tipo preservado apenas no formato compatível |
| 2026-09-10 | implementation | Task 2.1 concluída | Composer puro de venda/plano e projeções financeiras entregue com 20 testes unitários verdes |
| 2026-09-10 | implementation | Task 2.7 concluída | Reserva/disponibilidade por subquery tenant-safe entregue com 66 testes API focados verdes |
| 2026-09-10 | qa | Estado financeiro passa a ter UMA regra (`derivePaymentSummary`) usada por composer, detalhe e listagem | A listagem devolvia valores de fachada (`paidCents: 0`); duplicar a regra em SQL e em TS voltaria a divergir |
| 2026-09-10 | qa | Criação trava as linhas de produto e usa `transaction_timestamp()` dentro da transação | Fecha a janela criação × DELETE do RF-05 e tira os CHECKs temporais da dependência do relógio da aplicação |
| 2026-09-10 | qa | Cobrança anulada é excluída de toda cobrança (dashboard e listagem, inclusive `pending=false`) | Dívida anulada não é dívida; o backfill cria uma anulada com o valor cheio para cada crédito legado cancelado |
| 2026-09-10 | qa | Vínculo da agenda aceita venda `open` | Sem isso a encomenda combinada no compromisso — o caso mais comum — ficaria sem vínculo |
| 2026-09-10 | qa | Ensaio da migração contra o dump de produção vira passo obrigatório documentado | A auditoria é fail-closed e falha com `api`/`web` já parados: descobrir a anomalia no deploy custa indisponibilidade |
| 2026-09-10 | qa | Decisões duráveis graduadas no ADR-0023 | Ciclo, matriz de pagamento, anulação, reserva e tempo canônico passam a valer além desta feature |

## Milestones

- [x] Milestone 1: contrato e migração do ciclo de venda
- [x] Milestone 2: transições, estoque e pagamentos na API
- [x] Milestone 3: experiência web e previsão financeira
- [x] Milestone 4: validação e graduação (com pendências declaradas em `validate.md`)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-09-09 | 1 | intake→spec | Branch criada, CRM-12 registrado e regras/memória aplicáveis carregadas | Feature empilhada sobre CRM-11; nenhum Git de histórico executado |
| 2026-09-09 | 1 | spec | Fluxos de vendas, estoque, recebíveis, dashboard, pedidos e agenda mapeados; spec/plano/tasks/research redigidos | Próximo passo: revisão neutra dos artefatos antes da implementação |
| 2026-09-09 | 1 | spec-review-1 | Revisor neutro pediu mudanças em cancelamento, matriz, backfill, concorrência e performance | Artefatos corrigidos; nova revisão deve usar agente isolado |
| 2026-09-09 | 1 | spec-review-2 | Segunda revisão reprovou plano perdido, ordem de migração, cutover, due date e snapshot do dashboard | Correções incorporadas; próxima revisão é a terceira e última permitida |
| 2026-09-09 | 1 | spec-review-3 | Terceira revisão reprovou o caso `totalCents < installments` e trouxe dois alertas menores | `MAX_SPEC_ROUNDS=3` atingido; workflow exige parar e solicitar override explícito antes de nova correção/revisão |
| 2026-09-09 | 2 | spec-review-override | Humano autorizou explicitamente exceder `MAX_SPEC_ROUNDS` | Regra total×parcelas, predicados temporais e dependência 2.2→2.6 corrigidos antes da quarta revisão isolada |
| 2026-09-10 | 2 | spec-review-4 | Quarta revisão encontrou duas ambiguidades críticas restantes e alertas de atomicidade/workflow | Correções incorporadas; quinta revisão isolada deve confirmar os artefatos antes de qualquer código de produção |
| 2026-09-10 | 2 | spec-review-5 | Quinta revisão encontrou defaults temporais incorretos no backfill e duas lacunas de implementação/operação | Timestamps exatos, Unit of Work service/repository e `docs/deploy-vps.md` incorporados; próxima revisão permanece isolada |
| 2026-09-10 | 2 | spec-review-6 | Sexta revisão detectou teste de deploy fora da coleta e relações terminais ainda implícitas | `vitest.config.ts`/comandos, matriz temporal completa e ownership do service na 2.2 incorporados antes da sétima revisão |
| 2026-09-10 | 2 | spec-review-7 | Sétima auditoria não executou por limite temporário do revisor | Nenhuma conclusão técnica foi produzida; nova revisão isolada foi aberta |
| 2026-09-10 | 2 | spec-review-8 | Oitava revisão detectou fonte temporal não única na criação recebida | Tempo canônico do Postgres e persistência explícita foram incorporados; nona revisão isolada deve confirmar antes de código |
| 2026-09-10 | 2 | spec-review-9 | Nona revisão exigiu cobertura executável do tempo canônico em entrega e baixa/estorno | RFs, critérios e tasks agora exigem igualdade dos timestamps correlatos; décima revisão isolada pendente |
| 2026-09-10 | 2 | spec-review-10 | Décima auditoria aprovou os artefatos | Início da implementação autorizado pela QA neutra |
| 2026-09-10 | 3 | qa+fix | Auditoria de prontidão para deploy pedida pelo humano: 3 defeitos críticos e 5 alertas encontrados e corrigidos, 12 testes novos, runtime real exercitado, ADR-0023 escrito | Revisão feita pelo mesmo agente que corrigiu — **não** foi a QA neutra da Task 4.1 (registrado no cabeçalho de `review.md`) |
