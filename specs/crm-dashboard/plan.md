---
feature: crm-dashboard
module: api, web, shared
phase: plan
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md, research.md]
---

# Plan: crm-dashboard

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `sale_items.cost_cents` NOT NULL **default 0** + CHECK ≥ 0 | Aditiva sem backfill custom (sem produção); snapshot imuniza lucro (racional ADR-0013). **O default 0 é rede de segurança da migração p/ linhas pré-existentes, NÃO comportamento pretendido**: `createSale` (único caminho de insert) sempre grava o snapshot explícito — provado pelo teste de snapshot da Task 1.2. Registrar em known-issues na graduação |
| Meta em `consultants.monthly_goal_cents` nullable, CHECK `> 0` quando presente (0 é inválido — evita divisão por zero e não faz sentido de produto) | Meta é atributo da consultora; teto monetário padrão |
| `monthProfitCents` inteiro **com sinal** (aceita negativo) | Override de `unitPriceCents` abaixo do custo produz margem negativa; schema `≥ 0` derrubaria a serialização de uma venda no prejuízo (500). Teste de integração com `unit_price < cost` prova |
| Teto monetário: **exportar/reusar** `MONEY_MAX_CENTS` de `packages/shared/src/products.ts` (hoje `const` privado) em vez de redefinir | core.md: nunca duplicar contrato |
| Módulo `dashboard` (routes/service/repository) — repository lê sales/sale_items/receivables/consultants direto (leitura agregada cross-tabela é o domínio do dashboard) | Mesmo racional dos summaries; não duplica services |
| `GET /dashboard/summary` único (inclui os números de recebíveis — a UI da home NÃO chama /receivables/summary; 1 request) | Menos waterfall; recebíveis continuam com endpoint próprio para /crm/sales |
| Mês corrente: `date_trunc('month', now())` no SQL (UTC) | Consistente com overdue/CURRENT_DATE (decisão aceita) |
| Lucro do mês: Σ sobre `sale_items` join `sales` do mês `completed`: `(unit_price_cents − cost_cents)::bigint * qty` + toSafeInteger | Snapshot → imune a mudanças; bigint + guarda (padrão) |
| `PUT /dashboard/goal` body `updateGoalSchema` (`monthlyGoalCents` int > 0 ≤ teto ou null) | PUT semântico (substitui o valor); null remove |
| Web: home `/crm` RSC com `getDashboardSummary` (1 request); `goal-card.tsx` client pequeno (form em reais, padrão product-form) + `updateGoalAction`; `progress-bar` textual + `role="progressbar"` | Server-first; padrão de dinheiro estabelecido |
| `goalProgressPercent(salesCents, goalCents)` pura em `lib/` (inteiros, floor, sem cap — cap é da barra) + teste | RF-07; nenhum float persistido |
| `centsToReaisInput` reusada no default do form de meta | lib/format (lesson RSC×client já resolvida) |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/dashboard.ts` (+ teste) | dashboardSummarySchema, updateGoalSchema, tipos |
| `apps/api/drizzle/0006_*.sql` | Migração (2 colunas) |
| `apps/api/src/modules/dashboard/{dashboard.repository,dashboard.service,dashboard.service.test,dashboard.routes,dashboard.integration.test}.ts` | Módulo (sem errors próprio — validação 422 padrão; consultant sempre existe na sessão) |
| `apps/web/src/lib/dashboard-api.ts` (+ teste) | getDashboardSummary, updateGoal |
| `apps/web/src/lib/goal-progress.ts` (+ teste) | goalProgressPercent |
| `apps/web/src/components/dashboard/{summary-cards,goal-card}.tsx` | UI |
| `apps/web/src/app/(crm)/crm/{loading,error}.tsx` | Estados da home (não existiam — era estática) |
| `apps/web/src/app/(crm)/crm/actions.ts` → **CRIAR novo** com `updateGoalAction` | Action. Correção (revisão de spec): NÃO existe hoje; `logoutAction` fica em `(crm)/actions.ts` (um nível acima) e não deve ser tocado. Padrão do projeto = um `actions.ts` por seção (clients/sales/products/leads já têm o seu) |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Reexports |
| `apps/api/src/db/schema/{sale-items,consultants}.ts` | Colunas novas |
| `apps/api/src/modules/sales/{sales.service,sales.repository}.ts` (+ testes) | createSale captura cost_cents no item. **Requer ampliar a projeção de `findProductsByIds`** (hoje só `id, name, priceCents` — sales.repository.ts) para incluir `costCents`, e os tipos `SaleProductSnapshot` + `SaleItemData`; a composição no service passa `costCents` e o insert do repository grava (hoje não envia) |
| `apps/api/src/modules/sales/sales.integration.test.ts` | Assert do cost no snapshot (estender, sem reescrever) |
| `apps/api/src/{app,index}.ts` (+ fakes das suítes) | Módulo dashboard |
| `apps/web/src/app/(crm)/crm/page.tsx` | Placeholder → painel |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | Schemas, service (repasse/escopo), goalProgressPercent, helpers web |
| Integração (Testcontainers) | **Sim** | Schema (2 colunas), contrato (2 rotas), regra central (lucro/mês/meta) |
| E2E | Pendência (REL-01) | — |
| Regressão | n.a. | — |

## Checklist de QA de runtime (validate.md)

1. Home em build de produção renderiza o painel (não boundary) com dados criados pela UI (venda à vista + parcelada).
2. Lucro estimado bate com (preço − custo) dos produtos usados; alterar custo do produto depois NÃO muda o painel (snapshot).
3. Meta: definir "1.500,00" → barra/%; editar; remover → CTA volta; 0 rejeitado com pt-BR.
4. Venda cancelada sai das somas.
5. Atrasadas destacadas; links rápidos funcionam.
6. Logs sem PII; 401 nas rotas novas.

## Migração de Banco

Aditiva (2 colunas com default/nullable). Rollback = drop.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Mudança no createSale regredir sales | média | Suíte de sales completa roda no checkpoint; mudança mínima (1 campo no snapshot) |
| Agregado do mês com borda de fuso | baixa (aceito) | Decisão registrada; teste usa fixtures no meio do mês via sold_at controlado |

## Definition of Done

- [ ] Critérios testados · lint/typecheck/test verdes · build ok · rules/ADRs
