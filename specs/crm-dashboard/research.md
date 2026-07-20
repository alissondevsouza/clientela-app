---
feature: crm-dashboard
module: api, web, shared
phase: research
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md]
---

# Research: crm-dashboard

> Contexto herdado do ciclo crm-sales (mesma sessão).

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/db/schema/{sale-items,consultants}.ts` | Ganham as colunas novas (cost_cents snapshot; monthly_goal_cents) |
| `apps/api/src/modules/sales/sales.repository.ts` | `createSale` captura o custo (produtos já são carregados na composição — o custo está disponível); `receivablesSummary` é o modelo do agregado + `toSafeInteger` |
| `apps/api/src/modules/sales/sales.service.ts` | Composição dos itens — adicionar costCents |
| `apps/api/src/modules/products/products.repository.ts` | Padrão summary SQL/COALESCE/bigint |
| `apps/api/src/lib/route-auth.ts` | Auth de rota |
| `apps/web/src/app/(crm)/crm/page.tsx` | Home placeholder (CRM-02) a substituir |
| `apps/web/src/components/products/product-form.tsx` + `lib/format.ts` | Padrão de dinheiro em reais na UI (parseBRLToCents/centsToReaisInput/formatBRL) |
| `apps/web/src/lib/sales-api.ts` | Padrão de helper; getReceivablesSummary reusável? (dashboard summary já traz os números — decidir no plan: um endpoint só) |

## Padrões do Codebase a Seguir

Todos estabelecidos nos ciclos anteriores (módulo com camadas, agregação SQL com guarda, helpers puros testados, RSC + skeleton + error boundary, Server Action com revalidate, QA em build de produção).

## Gaps Identificados

- `sale_items` sem custo (CRM-06) — motivo central do RF-01/02.
- Não há endpoint de "perfil"/configuração da consultora — a meta nasce no módulo dashboard (PUT /dashboard/goal) para não inflar auth.
- A home `/crm` é estática desde o CRM-02 — vira página de dados (ganha loading/error).

## Referências Externas

- ADR-0013 (snapshot — mesmo racional para custo); decisões aceitas: agregados SQL, UTC para datas correntes.
- Rules: database.md (migração aditiva com default p/ NOT NULL novo), api.md, web.md, testing.md.
