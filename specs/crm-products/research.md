---
feature: crm-products
module: api, web, shared
phase: research
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md]
---

# Research: crm-products

> Contexto herdado dos ciclos CRM-01..04 (mesma sessão de trabalho); o módulo `clients` é o template direto deste ciclo.

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/modules/clients/*` | Template integral: routes (resolveConsultantId, requireValidId, DELETE com `new Response(null, 204)` — lesson Elysia), service (escopo por consultantId), repository (list paginada + busca — **sem escape de wildcard: NÃO copiar o BUG-001**), integração com sessão real |
| `apps/api/src/db/schema/{clients,leads}.ts` | Convenções; CHECK via `sql.raw` (lesson 2026-07-16) para os CHECKs de valores ≥ 0 |
| `packages/shared/src/{clients,pagination}.ts` | Padrão de contrato create/update/response + paginated |
| `apps/web/src/app/(crm)/crm/clients/*` + `components/clients/*` | Padrões de listagem/estados/form RHF/delete 2 passos/actions |
| `apps/web/src/lib/format.ts` | `formatBRL` (centavos → R$) já existe; ganhará `parseBRLToCents` (reais digitados → centavos) |
| `apps/web/src/app/(crm)/crm/products/page.tsx` | Placeholder do CRM-02 a substituir |
| `apps/api/src/modules/leads/leads-crm.routes.ts` | 3ª cópia do resolveConsultantId (sugestão da QA: extrair helper — avaliar extração AGORA que surge a 4ª) |

## Padrões do Codebase a Seguir

- Idênticos ao CRM-03 (rotas autenticadas, escopo, paginação, estados de tela, actions). 
- Novidade deste ciclo: CHECKs de banco para invariantes numéricas; agregação SQL (summary); conversão reais⇄centavos exclusivamente na fronteira da UI (`web.md`: valores circulam em centavos; formatação/parse só no front).

## Schemas e Tipos Relevantes

- Novo: `products` (Drizzle + CHECKs), `createProductSchema`/`updateProductSchema`/`productSchema`/`productsListQuerySchema`/`productsSummarySchema` (shared); migração `0004`.
- Reusar: `paginated`, `apiErrorSchema`.

## Gaps Identificados

- 4ª duplicação iminente de `extractBearerToken`/`resolveConsultantId`/`requireValidId` — extrair para helper compartilhado da API neste ciclo (ex.: `apps/api/src/modules/shared/authenticated-route.ts` ou `plugins/`), atualizando clients/leads-crm/auth de uma vez (QA do CRM-04 sugeriu; agora se paga).
- Não existe agregação SQL em nenhum repository (primeiro `sum()` do projeto).
- Não existe parse de dinheiro na UI (`parseBRLToCents` novo, com testes rigorosos — float é proibido no payload).

## Referências Externas

- Rules: `database.md` (dinheiro em centavos integer; CHECK), `api.md` (invariantes), `web.md` (moeda `Intl` pt-BR; valores em centavos ÷ 100 só na formatação), `testing.md`.
- BUG-001 (escape LIKE — não replicar), BUG-002/003 (registrados; consistência mantida), known-issue LGPD×vendas (products entra na mesma decisão do CRM-06).
