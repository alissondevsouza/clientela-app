---
feature: sales-lifecycle-payment-plans
module: shared, api, web, infra
phase: plan
status: approved
created: 2026-09-09
updated: 2026-09-10
depends_on: [spec.md, research.md]
---

# Plan: sales-lifecycle-payment-plans

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Persistir somente `status` terminal/geral e timestamps; derivar entrega e pagamento | Evita três fontes de verdade: entrega vem de `delivered_at`, pagamento da soma dos recebíveis; `completed` é sincronizado na mesma transação das transições |
| Toda venda positiva tem uma expectativa de recebimento; cancelamento anula as linhas com `voided_at`, sem apagá-las | Reaproveita `receivables` para todos os métodos, mantém soma estrutural/auditoria e exclui dívida cancelada sem ambiguidade |
| Parcelas novas ficam em `sales.installments`; condição `received/on_delivery` gera uma única liquidação financeira | Se a operadora assume a dívida da cliente, o CRM não infla “A receber”; o schema 0010 sem essa coluna usa contagem de linhas ou marcador desconhecido |
| Total zero não gera recebível; total positivo deve ter ao menos um centavo por parcela comercial | Preserva `amount_cents > 0` e impede plano matematicamente impossível, inclusive cartão já recebido em N vezes |
| Legado sem parcelas recuperáveis usa `installments=1` + `payment_plan_known=false`; vencimento usa `due_kind` explícito | O schema 0010 perdeu N/datas de crédito cancelado ou zero; marcador honesto evita inventar plano e evita chamar data desconhecida de “na entrega” |
| Reserva é subquery de `sale_items` + venda `open` sem `delivered_at`; `available = physical - reserved` | `stock_qty` preserva significado físico; derivação não sofre drift nem exige compensações manuais |
| Produto com reserva ativa não pode ser excluído | Evita uma entrega futura perder o vínculo de estoque e ainda preserva a exclusão com snapshot depois de entregar/cancelar |
| Criação e exclusão travam a mesma linha de produto antes de validar/inserir | Fecha a corrida em que o DELETE poderia vencer entre a leitura do produto e a criação da reserva |
| Baixa física ocorre em create somente se `deliveryStatus=delivered`, ou no endpoint explícito `deliver` | Permite encomenda sem saldo e garante efeito único e auditável |
| Entrega, pagamento e cancelamento travam primeiro `sales FOR UPDATE`; produtos são atualizados por id ordenado | Fecha corridas com dinheiro/estoque e evita a armadilha EvalPlanQual documentada nas lessons |
| Lista/recebíveis usam uma única statement; detalhe e dashboard usam transação read-only `REPEATABLE READ` | Impede uma resposta combinar venda, itens, cobranças e agregados de commits diferentes durante uma transição |
| Cancelamento entregue e sem pagamento repõe estoque; pendente apenas libera reserva; ambos anulam cobranças e preservam timestamps históricos | Preserva o fluxo existente sem apagar o plano financeiro nem fingir que uma entrega passada nunca ocorreu |
| `completed_at` define o mês de venda/lucro realizado; abertas ganham agregado separado | Uma negociação de agosto paga/entregue em setembro não desaparece do realizado e previsão não contamina lucro |
| Migração expand → backfill custom → contract | Colunas entram nullable, dados reais são normalizados e só então CHECKs/NOT NULL são apertados, conforme `drizzle-safe-migrations` |
| Service orquestra Unit of Work do repository na criação | A rota chama somente o service; o repository abre a transação e entrega operações escopadas ao callback do service, que trava/revalida os produtos antes de executar o composer puro e persistir snapshots/plano, sem regra de negócio no repository |
| Novo create não aceita `credit`; leitura legada continua tipada | “A prazo” é condição, não meio. Preserva histórico sem inferir meio inexistente |
| Form sem meio selecionado e com entrega/pagamento não concluídos por padrão | Impede que o caminho rápido registre recebimento ou conclusão silenciosamente |
| Fuso local via helpers de `packages/shared`; drift histórico de `CURRENT_DATE` não é ampliado | Datas de entrega/vencimento novas são determinísticas sem transformar CRM-12 numa migração de calendário do dashboard |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `apps/api/drizzle/0011_*.sql` + snapshot/journal | Expansão compatível do schema |
| `apps/api/drizzle/0012_*_backfill.sql` | Backfill auditável de vendas/recebíveis legados |
| `apps/api/drizzle/0013_*.sql` + snapshot/journal | Constraints/defaults finais |
| `apps/api/src/db/sales-lifecycle-migration.integration.test.ts` | Upgrade literal `0010 → CRM-12` com dados legados |
| `apps/api/src/db/sales-performance.integration.test.ts` | Fixture e planos objetivos do AC-17 |
| `apps/web/src/lib/sale-lifecycle.ts` + teste | Deriva labels, CTA e payload/previews sem importar Client Component em RSC |
| `apps/web/src/components/sales/deliver-sale-button.tsx` | Confirmação e feedback da entrega |
| `apps/web/src/components/sales/sale-lifecycle-summary.tsx` | Linha do tempo textual acessível |
| `scripts/deploy.test.ts` | Provar ordem stop writers → snapshot → migrate → up e caminhos de falha sem VPS real |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/sales.ts`, `products.ts`, `dashboard.ts`, `index.ts` + testes | Contratos, enums, estados derivados e disponibilidade |
| `apps/api/src/db/schema/sales.ts`, `receivables.ts` + testes de tabela | Novas colunas/CHECKs e vencimento nullable |
| `apps/api/src/modules/sales/*` | Composição do plano, transações de criar/entregar/pagar/cancelar, leituras e testes |
| `apps/api/src/modules/products/products.repository.ts`, errors/handler + testes | Reserva/disponibilidade em find/list/summary e exclusão protegida |
| `apps/api/src/modules/dashboard/*` + testes | Agregados de abertas e uso de `completed_at` |
| `apps/api/src/modules/appointments/appointments.repository.ts` + testes | Permitir vínculo com venda aberta e rejeitar cancelada |
| `apps/web/src/lib/sales-api.ts`, `products-api.ts`, `dashboard-api.ts` + testes | Contratos HTTP novos e endpoint de entrega |
| `apps/web/src/app/(crm)/crm/sales/actions.ts` | Server Action própria para entrega e revalidações de vendas/produtos/dashboard/pedidos |
| `apps/web/src/components/sales/sale-form.tsx` | Etapas de entrega/pagamento, campos progressivos e disponibilidade |
| `apps/web/src/components/sales/{sale-card,sale-status-badge,sale-receivable-row,receivable-row,cancel-sale-button}.tsx` | Estados compostos, vencimento nullable e ações válidas |
| `apps/web/src/app/(crm)/crm/sales/{page,[id]/page,receivables/page}.tsx` | Filtros, lifecycle e previsões |
| `apps/web/src/components/dashboard/dashboard-cards.tsx`, `apps/web/src/app/(crm)/crm/page.tsx` | Vendas abertas e realizado por conclusão |
| `apps/web/src/components/products/product-card.tsx`, detalhe de produto | Estoque físico/reservado/disponível |
| `apps/web/src/app/(crm)/crm/orders/new/page.tsx`, `order-items-form.tsx` | Sugestão e rótulos baseados em disponibilidade |
| `apps/web/src/app/(crm)/crm/appointments/actions.ts` + testes | Buscar/validar vendas abertas ou concluídas no vínculo da agenda |
| `scripts/deploy.sh` | Cutover com writers efetivamente parados, snapshot marcado e recuperação fail-closed |
| `docs/deploy-vps.md` | Indisponibilidade curta, ordem fail-closed e recuperação manual coerentes com o script/ADR novo |
| `vitest.config.ts` | Coletar `scripts/**/*.test.ts` na suíte focada e raiz, incluindo o teste fail-closed de deploy |
| Testes/fixtures consumidores de `Product`, `Sale` e `DashboardSummary` | Atualizar shapes e provar critérios, sem relaxar asserts |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | Schemas condicionais, planos, estados derivados, service e helpers web são regras centrais novas |
| Integração (Testcontainers) | **Sim** | Muda schema, contrato HTTP, estoque, pagamentos, migração com dados e concorrência |
| E2E | **Pendência (REL-01)** | Registro de venda é fluxo crítico, mas a infraestrutura Playwright ainda não existe; executar checklist real em build de produção |
| Regressão | n.a. | Feature, não BUG-NNN; migração e comportamento anterior são cobertos por critérios próprios |

Testes são derivados dos RFs da spec e rastreados em `tasks.md`. A integração usa as migrações reais e Postgres 18; matrizes concorrentes verificam estado/efeito final, não uma ordem específica quando ambas representam sequência serial legal. Performance segue os critérios determinísticos de plano/cardinalidade do AC-17 e registra a latência com as características do ambiente como sinal diagnóstico. O deploy é testado por doubles de `ssh`/`rsync`, sem contato com produção.

A QA final segue papéis separados: um verifier novo e neutro apenas revisa, executa as validações e escreve `validate.md`/`review.md`; se reprovar, um fixer separado aplica estritamente os achados; em seguida outro verifier novo repete a validação. Nenhum verifier corrige código.

## Migração de Banco

Mudança `data+schema` em três passos:

1. Colocar o schema Drizzle no estado de expansão e gerar/testar `0011`: colunas nullable, `open` permitido, `due_date` nullable, `due_kind`/`voided_at`/marcador do plano sem constraints finais.
2. Sem alterar o schema para o estado final, gerar `0012` via comando custom canônico, implementar o SQL fail-closed e testar a tabela exata de `spec.md`.
3. Só depois editar o schema para o estado final, gerar/testar `0013` com defaults/NOT NULL/CHECKs e executar uma nova geração que deve produzir zero drift.

O backfill preserva `sales.updatedAt` salvo no legado `credit` integralmente pago quando a última baixa é posterior; nesse caso usa `max(updatedAt legado, completedAt)` para satisfazer a matriz terminal sem apagar a cronologia financeira. Timestamps inexistentes no 0010 são derivados somente dos eventos definidos na tabela da spec, e uma auditoria pós-DML valida a matriz completa antes da contração.

Na criação, `sales.service` chama `repository.transaction(callback)`. O callback recebe um repository escopado à transação, obtém uma única `transaction_timestamp()` do Postgres, trava somente os produtos referenciados por consultora/id ordenado, revalida a existência e então chama o composer puro do service com esses snapshots travados e esse instante canônico. Só o resultado composto é entregue às operações de insert do repository transacional, que persiste explicitamente todos os timestamps correlatos com o mesmo valor. Nenhum total, custo snapshot, estado inicial ou plano financeiro é calculado antes do lock; o repository conhece persistência/locks e fornece o tempo/transação, mas não decide regra de negócio. Entrega, baixa, estorno e cancelamento repetem o padrão: lock da venda primeiro, um `transaction_timestamp()` e escrita explícita de todos os terminais alterados.

Cutover verificável em `scripts/deploy.sh`:

1. Pull das imagens conclui com a versão antiga ainda servindo.
2. `api` e `web` são parados e o script confirma que não há writer da aplicação antes do snapshot; Caddy pode responder indisponibilidade curta.
3. O dump fail-closed é criado após a parada e seu caminho é persistido em marcador operacional.
4. O job de migração usa a nova tag. Se falhar após começar, `api`/`web` permanecem parados e a mensagem aponta o dump e as opções humanas de forward-fix ou restauração; a API antiga não reinicia sobre schema possivelmente incompatível.
5. Só após sucesso a nova tag sobe, recebe smoke test e atualiza `.image-tag`. Se o snapshot falhar antes de tocar schema, os containers antigos são reiniciados automaticamente.

Rollback de aplicação antiga com schema final é inseguro; preferir forward-fix. Restauração do snapshot é manual, com writers parados e confirmação humana, nunca automática/destrutiva no script. Nunca editar migração já aplicada.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Backfill classificar incorretamente dinheiro/PIX/cartão históricos | média | Semântica anterior os definia como imediatos; teste 0010→final compara cada caso e aborta separadamente para cada anomalia financeira/temporal enumerada |
| Corrida entrega×pagamento×cancelamento duplicar estoque ou conclusão | alta | Lock da venda como primeira operação, ordem de produto determinística e testes concorrentes repetidos |
| Leitura composta exibir estado impossível durante transição | média | Statement única nas listas e snapshot `REPEATABLE READ` no detalhe/dashboard, com testes concorrentes |
| Reserva/agregados degradarem listagens | baixa | Medir dois tenants × 2k produtos/20k vendas/60k itens/30k recebíveis, cinco execuções aquecidas; exigir escopo/cardinalidade por tenant e zero temp write, registrar ambiente/mediana e tratar ≤250 ms como meta diagnóstica |
| Exclusão de produto tornar reserva impossível de entregar | média | DELETE retorna 409 enquanto houver reserva ativa; snapshots continuam permitindo exclusão após entrega/cancelamento |
| Cancelamento apagar ou continuar cobrando dívida | alta | Recebíveis ganham `voided_at`, permanecem no detalhe histórico e são excluídos de listagens/agregados cobráveis |
| Form condicional ficar confuso no celular | média | Progressive disclosure, resumo textual antes do CTA e runtime em 375px/teclado |
| Novo shape quebrar fixtures/Server Actions | alta | Contrato compartilhado primeiro, helpers puros, typecheck raiz e build/runtime de todas as páginas/actions afetadas |
| Plano legado perdido ser apresentado como dado real | alta no subconjunto cancelado/zero | `payment_plan_known=false`, fallback técnico de uma linha e rótulos explícitos; nenhuma inferência de N/data |
| Old API escrever entre auditoria e contração | baixa, impacto alto | Deploy para e confirma `api`/`web` antes do snapshot, mantém writers parados em falha de migração e testa a ordem com doubles |

## Definition of Done

- [ ] Todos os critérios de aceite cobertos e atendidos
- [ ] Migrações geradas/custom ordenadas, upgrade real e segunda geração sem drift
- [ ] `bun run lint`, `bun run typecheck` e `bun run test` verdes na raiz
- [ ] Build web de produção verde e runtime mobile/Server Actions exercitado
- [ ] Rotas/auth/multi-tenant/logs revisados
- [ ] Memória/ADR/domínio/known-issues graduados e roadmap em `[R]`
