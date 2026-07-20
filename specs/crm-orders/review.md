---
feature: Pedidos de reposição (orders)
module: orders
phase: qa
status: done
veredito: APROVADO
updated: 2026-07-20
---

# Review: Pedidos de reposição (orders) — QA adversarial rodada 1

## Resumo

Feature CRM-09 revisada de forma neutra (revisor não implementou). Contrato compartilhado, schema/migração, módulo API (routes→service→repository), wiring e tela web conferidos contra os critérios de aceite do spec.md, as rules e os ADRs 0012 (auth default-deny) e 0013 (snapshot/SET NULL). Lint, typecheck, suíte completa (784/784 incl. integração Testcontainers), build web e validação de runtime (curl) — todos verdes. Nenhum achado CRÍTICO.

**VEREDITO: APROVADO.**

## Arquivos revisados

- shared: `orders.ts` (+ `.test.ts`), `index.ts`
- api schema/migração: `db/schema/orders.ts`, `order-items.ts`, `index.ts`, `drizzle/0007_rare_solo.sql`
- api módulo: `orders.errors.ts`, `orders.service.ts` (+ `.test.ts`), `orders.repository.ts`, `orders.routes.ts`, `orders.integration.test.ts`
- api wiring: `plugins/error-handler.ts`, `plugins/auth-guard.ts`, `lib/route-auth.ts`, `app.ts`
- web: `lib/orders-api.ts`, `lib/order-total.ts`, `lib/order-item-schema.ts`, `lib/products-api.ts` (perPage aditivo), `app/(crm)/crm/orders/**` (page, actions, loading, error, new, [id]), `components/orders/*`, `components/crm/nav-items.ts`

## Conformidade

- **Camadas (api.md)**: routes só validam/mapeiam e delegam ao service; service não conhece Drizzle/HTTP (portas + fakes na unidade); repository é a única camada que toca o banco. DI por construtor no composition root. OK.
- **Zod na fronteira**: body/query validados com schemas do shared; contratos reusados no web (form + api-client). OK.
- **Dinheiro em centavos**: colunas `integer`, total sempre calculado no servidor (Σ qty×unitCost), cliente nunca dita total; conversão reais→centavos só na UI. OK.
- **Transação multi-passo**: create/replace/place/deliver/cancel em `db.transaction`; entrega credita estoque na MESMA transação da mudança de status (atômico). OK.
- **Concorrência**: guarda por UPDATE condicional (status esperado) como 1ª escrita serializa transições; deliver com exclusividade estrita provada (crédito único). place×cancel resolve como história serial legal (critério emendado — ver mérito abaixo). OK.
- **Paginação (api.md)**: list com page/perPage (default 20, máx 100), ordenada desc, sem itens no payload de lista. OK.
- **N+1 (database.md)**: loadOrder em 2 queries; list em 2 queries (rows + count); nenhum load por linha. FKs indexadas (consultant_id, order_id, product_id). OK.
- **Snapshot/SET NULL (ADR-0013/RF-05)**: item grava product_name + unit_cost_cents; product_id FK ON DELETE SET NULL; item com produto excluído não credita estoque e permanece no histórico. Provado em integração. OK.
- **Segurança (security.md/ADR-0012)**: `/orders/*` autenticado por default-deny (não entra na allowlist pública) — provado por curl (401 em todas as rotas) e pelo teste de integração. Toda query escopada por consultant_id (inclusive o UPDATE de estoque no deliver). Erros mapeados (404/409/422) sem vazar internals; catch-all loga só requestId/code/path/errorName — sem PII/body/token. OK.
- **Web (web.md)**: Server Components por padrão; mutações via Server Actions com revalidatePath (deliver revalida também /crm/products). Estados loading (skeleton)/vazio (CTA)/erro (retry)/not-found presentes na lista e no detalhe. Mobile-first (alvos h-11 em ~375px, md: menor). Labels, aria-invalid/aria-describedby, role="alert". Badge de status com rótulo pt-BR textual (cor é reforço). OK.
- **Testes (testing.md)**: derivados do spec.md; happy + edge (vazio/zero/limite/duplicado/concorrência) + caminho de erro com código certo; timestamps assertados por não-nulo/ordem relativa (determinismo); Testcontainers com Postgres real, truncateAll por teste. OK.

## Critérios de aceite × cobertura

Todos os itens do spec.md têm teste executável correspondente (integração/unidade): RF-01 (vazio/total servidor/422/override), RF-02 (draft+vazio+409), RF-03 (matriz completa + place vazio + concorrência place×cancel), RF-03/04 (deliver concorrente crédito único), RF-04 (crédito atômico + SET NULL + cancel sem efeito), RF-05 (snapshot), RF-06 (paginação/filtro/escopo/404 alheio), RF-09 (401 por rota). RF-07/RF-08 (UI) cobertos por build + validação manual; E2E é pendência declarada (REL-01).

## Problemas encontrados

Nenhum CRÍTICO. Nenhum ALERTA.

### SUGESTÕES (não bloqueiam)

- **[SUGESTÃO] total_cents é `integer` (int4) — overflow teórico em valores extremos.**
  `apps/api/src/db/schema/orders.ts:42`. Com os limites do contrato (qty ≤ 1.000, unitCostCents ≤ 100.000.000, ≤ 50 itens), um item extremo (1.000 × 100.000.000 = 1e11) ou um total > ~R$ 21.474.836 excede int4 e resultaria em erro Postgres não mapeado (500 genérico) em vez de 422 limpo.
  Porquê: fora da faixa realista de uma consultora Mary Kay e — importante — **idêntico ao módulo sales** (`sales.total_cents integer`, mesmos QTY_MAX/UNIT_PRICE_MAX/ITEMS_MAX), logo é limitação já aceita no projeto, não regressão desta feature.
  Como corrigir (se um dia importar): validar o total composto no service contra um teto (`MONEY_MAX_CENTS`-derivado) e devolver 422, ou migrar a coluna monetária para `bigint` de forma consistente com sales.

- **[SUGESTÃO] Seletor/sugestão de produtos limitado às primeiras 100 entradas.**
  `apps/web/src/app/(crm)/crm/orders/new/page.tsx:23` e `[id]/page.tsx:39` (PRODUCTS_PAGE_SIZE=100, fetch único). Consultora com > 100 produtos não veria todos no `<select>` nem na sugestão de estoque baixo.
  Porquê: decisão consciente do plan (teto do contrato, sem busca assíncrona no escopo); aceitável na escala atual.
  Como corrigir (futuro): seletor com busca/paginação server-side quando o catálogo crescer.

- **[SUGESTÃO] Edição de rascunho descarta silenciosamente itens de produto excluído (productId null).**
  `apps/web/src/app/(crm)/crm/orders/[id]/page.tsx:124` (`defaultItems` filtra `hasProductId`). Ao salvar a edição de um draft que contém item com produto excluído, esse item some (não é re-selecionável no catálogo).
  Porquê: afeta apenas rascunhos (lista de compras, sem valor de histórico parcial); decisão registrada no Decisions Log; snapshot segue preservado na leitura de pedidos placed/delivered. Não viola RF-05.
  Como corrigir (se desejado): sinalizar na UI que itens de produto excluído serão removidos ao salvar.

## Recomendação

APROVADO para handoff ao humano. Registrar no handoff a pendência de E2E (REL-01) e a nota do critério emendado place×cancel (história serial legal, sem invariante de domínio violada — exclusividade estrita mantida e provada onde há efeito colateral: deliver).
