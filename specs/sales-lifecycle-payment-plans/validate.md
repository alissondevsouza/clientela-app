---
feature: sales-lifecycle-payment-plans
phase: qa
status: green
updated: 2026-09-10
---

# Validate: sales-lifecycle-payment-plans (CRM-12)

Sessão de fechamento para deploy (2026-09-10). Todos os comandos abaixo foram
executados nesta máquina, na branch `feature/sales-lifecycle-payment-plans`,
com Docker disponível (Testcontainers com Postgres 18 real).

## Gates da raiz

| Ferramenta | Comando | Resultado |
|---|---|---|
| Biome | `bun run lint` | ✅ `Checked 414 files` — nenhum erro |
| TypeScript | `bun run typecheck` | ✅ shared, web e api em `code 0` |
| Vitest | `bun run test` | ✅ **69 arquivos / 1249 testes**, 0 falhas (~35 s) |
| Build web | `bun --cwd apps/web run build` | ✅ `exit 0`, sem warning novo |

Antes desta sessão a suíte tinha 1237 testes; os 12 novos cobrem os defeitos
corrigidos aqui (ver `review.md`).

## Migração contra dados pré-existentes

O banco de desenvolvimento tinha uma venda anterior ao schema `0010`
(`card`/`completed`). Depois de `bun --cwd apps/api run db:migrate`
(`0011 → 0012 → 0013`), o estado ficou:

```
 status    | payment_method | payment_condition | count
 completed | card           | received          |     1
 due_kind  | count | voided
 scheduled |     1 |      0
```

Ou seja: auditoria fail-closed passou, a venda legada foi classificada como
`received` e ganhou a cobrança paga sintetizada — exatamente a tabela de
backfill da spec. A cadeia completa em Postgres 18 limpo continua coberta por
`apps/api/src/db/sales-lifecycle-migration.integration.test.ts`.

## Ensaio contra o dump de PRODUÇÃO (executado em 2026-09-10)

Dump real da VPS restaurado num Postgres 18 descartável e `0010 → 0013`
aplicadas: **`migrations applied successfully`**, auditoria fail-closed passou.

| Medida | Antes (dump) | Depois |
|---|---|---|
| Vendas | 17 (11 pix, 4 credit, 1 cash, 1 pix cancelada) | 17 |
| Itens de venda | 25 | 25 |
| Soma de `total_cents` | 253.350 | 253.350 |
| Produtos / soma de estoque | 88 / 209 | 88 / 209 |
| Recebíveis | 4 (todos pagos) | 17 (16 pagos, 1 anulado) |

- Nenhuma venda voltou para `open` (as 4 de crédito legado estavam quitadas).
- A venda cancelada recebeu cobrança **anulada** — fora de "a receber".
- Invariante estrutural conferida: soma das cobranças ativas = soma das vendas ativas.
- **Uma venda muda de mês no faturamento**: vendida em 08/2026, concluída em
  09/2026 (R$ 249,90). Depois do deploy, "vendas do mês" passa de 16 vendas em
  agosto para 15 (R$ 2.211,70) + 1 em setembro — consequência esperada do
  RF-10 (mês por `completed_at`), não defeito. Vale avisar a consultora.

O procedimento está em `docs/deploy-vps.md`; repita-o se houver movimento novo
relevante entre este ensaio e o deploy.

## QA de runtime (build de produção, API + web reais)

Postgres de dev + `apps/api` (`bun src/index.ts`) + `apps/web` (`next start`
sobre o build de produção). Fluxo percorrido de ponta a ponta:

| Passo | Resultado observado |
|---|---|
| `POST /sales` PIX / receber na entrega / entrega pendente | `status=open`, `deliveryStatus=pending`, `paymentStatus=pending`, `outstandingCents=10000` |
| `GET /products/:id` com venda aberta | `stockQty=3`, `reservedQty=2`, `availableQty=1`, `lowStock=true` — estoque físico intacto |
| `GET /receivables` | cobrança com `dueDate=null`, `dueKind=on_delivery`, `overdue=false` |
| `POST /sales/:id/deliver` | `deliveredAt` gravado, cobrança vira `scheduled` com a data da entrega, estoque 3 → 1 |
| `PATCH /receivables/:id { paid: true }` | venda vira `completed` com `completedAt`, `paidCents=10000`, `outstandingCents=0` |
| `GET /dashboard/summary` | `openSalesCents=10000`, `pendingReceivablesCents=10000`, mês por `completed_at` |
| `GET /sales` (lista) | venda legada backfillada aparece `paid` com `paidCents` real |

Páginas do CRM renderizadas com sessão real (HTTP 200 em todas):
`/crm`, `/crm/sales`, `/crm/sales/new`, `/crm/sales/:id`, `/crm/sales/receivables`,
`/crm/products`, `/crm/products/:id`, `/crm/appointments`, `/crm/orders/new`.

Conteúdo conferido no HTML renderizado:

- detalhe da venda: `Forma de pagamento PIX · Receber na entrega`, `Status Em aberto`,
  `Entrega Entregue em 10/09/2026`, `Pagamento Pendente / Falta receber: R$ 100,00`;
- produto com reserva: `Estoque físico 1 · Reservado 1 · Disponível 0`;
- card de produto: `Estoque: 1 (0 disponíveis)`;
- dashboard: card "Previsto para receber — 1 venda em aberto".

Dados do smoke removidos do banco de dev ao final.

## Pendências declaradas (não executadas aqui)

Nenhuma delas bloqueia o deploy, mas nenhuma foi feita — não contam como cobertura:

- **AC-08/AC-10 (concorrência)**: entrega × entrega e cancelar × entregar não têm
  teste concorrente dedicado. Cancelar × pagar já tinha cobertura anterior.
  A corrida criação × DELETE de produto está protegida pelos locks (`FOR UPDATE`
  nos dois lados) mas não tem teste determinístico.
- **AC-15 (QA mobile em navegador)**: o runtime foi validado por HTML renderizado,
  não em viewport ~375px real. Não há infraestrutura de E2E (Playwright) no projeto.
- **AC-17 (performance)**: nenhuma fixture de 20.000 vendas nem `EXPLAIN (ANALYZE)`
  foi executada. A subquery de reserva e a de `paidCents` são correlacionadas por
  `sale_id`/`product_id` (índices existentes), mas isso não é medição.
- **AC-13 (parcial)**: `lib/sale-lifecycle.ts` (subtítulo entrega × pagamento)
  existe e tem teste, mas a lógica de payload/CTA/prévia de parcelas continua
  dentro de `sale-form.tsx`, sem teste unitário próprio.
- **AC-18**: `scripts/deploy.test.ts` cobre a ordem e os caminhos de falha do
  cutover; o `--dry-run` contra a VPS real não foi executado nesta sessão.
