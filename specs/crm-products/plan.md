---
feature: crm-products
module: api, web, shared
phase: plan
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md, research.md]
---

# Plan: crm-products

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Módulo `products` espelha `clients` (routes/service/repository, escopo por consultora, 404 uniforme, uuid⇒404) | Template provado por 2 QAs; consistência |
| **Extrair helper compartilhado** `apps/api/src/lib/route-auth.ts` (`extractBearerToken`, `createConsultantResolver(authService)`, `isUuid`) e migrar auth/clients/leads-crm/products para ele | 4ª duplicação; sugestão registrada na QA do CRM-04; reduz drift |
| CHECKs de banco via `sql.raw` nomeados (`products_cost_cents_check` ≥ 0, `price`, `stock`, `threshold`) | Invariante "estoque nunca negativo" e centavos válidos protegidos na última linha de defesa (lesson sql.raw p/ DDL determinístico) |
| Busca com **escape de LIKE** (`\`, `%`, `_`) num helper `escapeLikeTerm` no repository de products | RF-03; não replicar BUG-001 (clients será corrigido pelo próprio BUG-001 depois) |
| `lowStock` derivado no **mapper do repository** (`stockQty <= lowStockThreshold`), presente no contrato de resposta | Fonte única da regra; SQL do filtro usa a mesma comparação (`stock_qty <= low_stock_threshold`) |
| `GET /products/summary` em SQL: `SUM(cost_cents * stock_qty)`, `SUM(price_cents * stock_qty)`, `COUNT(*) FILTER (WHERE stock_qty <= low_stock_threshold)` escopado por consultora; `COALESCE` p/ 0 sem produtos | Agregação no banco (não em memória); RF-04 |
| Rota `/products/summary` registrada ANTES de `/products/:id` e `summary` excluído do matcher de id | "summary" não é uuid — cairia no 404 do `requireValidId`; ordem + isUuid já resolvem (uuid check primeiro) |
| Dinheiro na UI: `parseBRLToCents(input: string): number \| null` (aceita "12,34", "1.234,56", "1234", "R$ 12,34"; resultado inteiro em centavos via aritmética de string — **sem** `parseFloat`; inválido ⇒ null) + exibição com `formatBRL` existente | Proibido float no payload (`core.md`/`database.md`); parse decimal com string evita 0.1+0.2 |
| Form RHF com schema de UI local (strings de reais) → `.transform`/mapeamento para o contrato em centavos no submit | O contrato shared permanece em centavos (fonte única API+web); a conversão é preocupação exclusiva do form |
| `updateProductSchema`: parcial; só `brandCode` aceita `null` (limpar); números sempre presentes-ou-ausentes (não nuláveis) | Semântica de PATCH consistente com clients |
| Ajuste de estoque no MVP = editar `stockQty` no form de edição | Movimentação/histórico fora de escopo (spec); CRM-06 fará baixa atômica |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `apps/api/src/lib/route-auth.ts` (+ teste unidade) | Helper compartilhado de auth de rota (extração Bearer, resolver, isUuid) |
| `packages/shared/src/products.ts` (+ teste) | Contratos (create/update/response/query/summary) |
| `apps/api/src/db/schema/products.ts` | Tabela com CHECKs |
| `apps/api/drizzle/0004_*.sql` | Migração gerada |
| `apps/api/src/db/products-table.integration.test.ts` | Integração da tabela (CHECKs, FK, defaults) |
| `apps/api/src/modules/products/{products.errors,products.repository,products.service,products.service.test,products.routes,products.integration.test}.ts` | Módulo completo |
| `apps/web/src/lib/products-api.ts` (+ teste) | Helpers puros (CRUD + summary) |
| `apps/web/src/components/products/{product-card,product-form,delete-product-button,products-summary}.tsx` | UI |
| `apps/web/src/app/(crm)/crm/products/{loading,error}.tsx`, `new/page.tsx`, `[id]/{page,loading,error,not-found}.tsx`, `actions.ts` | Páginas/actions |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Reexports |
| `apps/api/src/db/schema/index.ts` | Reexport products |
| `apps/api/src/plugins/error-handler.ts` | `ProductNotFoundError` → 404 |
| `apps/api/src/{app,index}.ts` | Compor módulo products |
| `apps/api/src/modules/{auth/auth.routes.ts,clients/clients.routes.ts,leads/leads-crm.routes.ts}` | Migrar para `route-auth.ts` (comportamento idêntico — suítes existentes provam) |
| `apps/web/src/lib/format.ts` (+ teste) | + `parseBRLToCents` |
| `apps/web/src/app/(crm)/crm/products/page.tsx` | Substituir placeholder pela listagem + summary |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | Regras novas: schemas (inteiros/centavos), service, `parseBRLToCents` (crítico — dinheiro), escapeLike, route-auth |
| Integração (Testcontainers) | **Sim** | Schema novo + contrato novo + invariantes (CHECKs, summary, escopo); refactor do route-auth coberto pelas suítes existentes |
| E2E | **Pendência (sem infra)** | REL-01 |
| Regressão | n.a. | Não é bug (o escape de LIKE nasce certo aqui; BUG-001 de clients é item separado) |

## Checklist de QA de runtime (validate.md)

1. Login → `/crm/products` vazio com CTA; criar produto digitando "R$ 59,90" custo "35,50" → card mostra R$ 59,90; banco tem 5990/3550 (verificar via psql).
2. Summary: com fixtures conhecidas, capital parado e valor de venda corretos; badge/contador de estoque baixo; filtro lowStock funciona e preserva na paginação.
3. Busca por nome e brand_code; busca com `%` não retorna tudo.
4. Editar estoque para ≤ limiar → badge "Estoque baixo" aparece.
5. Excluir com confirmação em 2 passos.
6. Rotas /products sem token ⇒ 401; `/products/summary` responde (não cai no 404 do :id).
7. Payload do POST/PATCH com valores não-inteiros ⇒ 422 pt-BR orientando centavos (via curl).
8. Regressão do refactor route-auth: login/me/logout, CRUD de clients e funil de leads continuam funcionando (smoke por curl).

## Migração de Banco

Aditiva (tabela `products` + CHECKs). Rollback = drop.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Refactor route-auth regredir auth/clients/leads | média | Comportamento idêntico + 340 testes existentes rodando no checkpoint; smoke de runtime na QA |
| `parseBRLToCents` com edge cases de máscara ("1.234", "12,3", "12,345") | média | Tabela de casos exaustiva nos testes; inválido ⇒ null (form mostra erro, nunca envia) |
| `/products/summary` colidir com `/products/:id` | baixa | isUuid⇒404 já protege + teste de integração dedicado |

## Definition of Done

- [ ] Critérios do spec.md testados · lint/typecheck/test verdes · build web ok · rules/ADRs
