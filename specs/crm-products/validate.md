---
feature: crm-products
phase: validate
status: done
created: 2026-07-18
updated: 2026-07-18
reviewer: QA adversarial (neutro)
---

# Validate: crm-products

Ambiente: Linux, Bun + Vitest 4.1.10, Docker disponível (Testcontainers), Postgres dev `clientela_pg_dev` em 127.0.0.1:5433 (container já estava no ar antes da QA — mantido no ar ao final).

## Ferramentas (executadas de fato)

| Ferramenta | Comando | Resultado |
|---|---|---|
| Lint | `bun run lint` | ✅ Biome: 186 arquivos, 0 erros |
| Typecheck | `bun run typecheck` | ✅ shared/web/api todos exit 0 |
| Testes | `bun run test` (Vitest + Testcontainers) | ✅ **474 testes / 36 arquivos, 0 falhas** (28,8s) |
| Build web | `cd apps/web && bun run build` | ✅ compilou; `/crm/products`, `/crm/products/new`, `/crm/products/[id]` como rotas ƒ (dynamic) |

Saída dos testes (trecho):

```
Test Files  36 passed (36)
     Tests  474 passed (474)
```

## Migração

- `bun run db:migrate` (apps/api) aplicou `0004_sturdy_thundra.sql` no Postgres dev sem erro (apenas NOTICEs de schema/tabela de controle já existentes).
- `\d products` confirmou: colunas conforme RF-01, defaults `stock_qty=0` / `low_stock_threshold=1`, 4 CHECKs nomeados (`>= 0`), FK `consultant_id → consultants ON DELETE CASCADE`, índice `products_consultant_id_idx`.

## Runtime — checklist do plan.md (8 itens)

Setup: seed de consultora QA (`qa-review@example.com`), API via `bun src/index.ts` (porta 3001), web via `next start` (porta 3000, build de produção). Login pela API → token usado como Bearer (API) e como cookie `clientela_session` (web SSR).

| # | Item | Resultado |
|---|---|---|
| 1 | Criar produto com preço 59,90 / custo 35,50 e conferir centavos no banco | ✅ parcial* — POST com `priceCents:5990, costCents:3550` (equivalente ao que o form produz de "59,90"/"35,50", provado por unidade de `parseBRLToCents`) → psql: `cost_cents=3550, price_cents=5990`. *A digitação real no form não pôde ser exercitada (sem browser/E2E — pendência REL-01); card na listagem SSR mostra `59,90`. |
| 2 | Summary com fixtures conhecidas | ✅ fixtures (3550×10 + 8000×1 + 2000×0) → `{"stockCostCents":43500,"stockPriceCents":71900,"lowStockCount":2}` — exato, incluindo estoque 0 fora das somas e semântica limiar 0 (alerta só com estoque 0). Card "Capital parado" com `435,00` e `719,00` no HTML SSR; "2 produtos" + link "Ver produtos". |
| 3 | Busca por nome/brand_code; `%` não retorna tudo | ✅ `?search=batom` → 1; `?search=mk-202` → 1 (case-insensitive); `?search=%` → total 0; `?search=_` → total 0 (escape provado com 3 produtos no banco) |
| 4 | Editar estoque ≤ limiar → badge | ✅ PATCH `stockQty:2` (limiar 2) → `lowStock:true`; badge "Estoque baixo" presente no card da listagem SSR. **Via UI ficou bloqueado pelo CRÍTICO abaixo** (tela de edição quebrada). |
| 5 | Exclusão com confirmação em 2 passos | ⚠️ DELETE via API → 204 e some da lista. O fluxo de 2 passos é client-side (código revisado, correto), **mas é inalcançável no runtime: a página de detalhe (que hospeda o botão) quebra** — ver CRÍTICO no review.md. |
| 6 | Sem token ⇒ 401; `/products/summary` não cai no `:id` | ✅ `GET /products` e `GET /products/summary` sem token → 401; `/products/summary` com token → 200 com o agregado; `GET /products/nao-uuid` → 404 |
| 7 | Payload não-inteiro ⇒ 422 pt-BR | ✅ POST `priceCents:59.9/costCents:35.5` → 422 "Informe o custo em centavos (número inteiro)"; PATCH `costCents:12.34` → 422 idem; teto `priceCents:100000001` → 422 "O preço deve ser no máximo R$ 1.000.000,00" (nunca 22003) |
| 8 | Regressão route-auth (smoke) | ✅ login → `/auth/me` 200 → logout 200 → relogin 200; clients: POST 201 (id retornado), PATCH 200, DELETE 204, GET 200; leads: GET `/leads?page=1` 200 |

### ❌ Falha de runtime encontrada (fora do checklist, dentro do escopo RF-07)

`GET /crm/products/[id]` (produto EXISTENTE, sessão válida, build de produção):

```
⨯ Error: Attempted to call centsToReaisInput() from the server but centsToReaisInput
  is on the client. It's not possible to invoke a client function from the server...
  digest: '1424776248'
```

- Reproduzível em 100% das requisições ao detalhe (2/2 tentativas, mesmo digest no HTML servido).
- A página nunca renderiza o produto: o shell chega com o skeleton e o cliente cai no `error.tsx` ("Não foi possível carregar o produto") com retry inútil.
- Consequência: detalhe, edição e exclusão (RF-07) **inacessíveis via UI**; o redirect pós-criação (`createProductAction` → detalhe) também aterrissa na tela quebrada.
- Não detectado por lint/typecheck/build/testes (restrição de runtime do RSC; nenhum teste cobre a renderização da página de detalhe).

Detalhes e correção sugerida no `review.md` (achado CRÍTICO-1).

## Estados da UI verificados (SSR por curl, sem JS)

- Listagem com dados ✅ (cards, nome, código, preço, estoque, badge textual)
- Vazio-de-busca ✅ (`?search=zzz` → "Nenhum produto encontrado com os filtros atuais." + "Limpar filtros")
- Filtro `?lowStock=true` ✅ (retorna só os 2 em alerta)
- `/crm/products/new` ✅ (form renderiza; inputs de dinheiro `type="text" inputMode="decimal"`)
- Detalhe ❌ (CRÍTICO-1)

## Limpeza

- Dados de QA removidos: `DELETE FROM consultants WHERE email='qa-review@example.com'` (cascade zerou products/sessions/clients — contagens finais 0/0/0/0).
- Processos API e web derrubados (health checks confirmam).
- Container `clientela_pg_dev` mantido no ar (já rodava antes da QA); migração 0004 permanece aplicada (aditiva, desejada para dev).

## Pendências

1. **CRÍTICO-1** (review.md): detalhe de produto quebrado em runtime — bloqueia aprovação.
2. E2E Playwright inexistente (REL-01) — digitação real no form e clique do fluxo de 2 passos não exercitados; registrado, não fingido.
3. Graduação: menção a `/crm/products` nas entradas BUG-002/BUG-003 do backlog e nota de exclusão física × histórico de vendas em `known-issues.md` (RF-08) — ainda não registradas (fase de graduação, após o fix).

---

# Validate: crm-products — QA round 2 (pós-fix do CRÍTICO-1)

Rodada 2, verifier novo (validação do zero, sem reaproveitar estado da rodada 1 — inclusive removido um consultant de QA remanescente de sessão interrompida antes de começar). Ambiente: Linux, Bun + Vitest 4.1.10, Docker ok, Postgres dev `clientela_pg_dev` em 127.0.0.1:5433.

## Ferramentas (executadas de fato)

| Ferramenta | Comando | Resultado |
|---|---|---|
| Lint | `bun run lint` | ✅ Biome: 186 arquivos, 0 erros |
| Typecheck | `bun run typecheck` | ✅ shared/web/api exit 0 |
| Testes | `bun run test` | ✅ **484 testes / 36 arquivos, 0 falhas** (35,8s; +10 testes vs rodada 1: `centsToReaisInput` em format.test.ts e `toSafeInteger` em products.service.test.ts) |
| Build web | `bun run --filter '@clientela/web' build` | ✅ exit 0; `/crm/products`, `/crm/products/new`, `/crm/products/[id]` como rotas ƒ (dynamic) |

```
Test Files  36 passed (36)
     Tests  484 passed (484)
```

## Migração

`bun run db:migrate` idempotente sem erro (0004 já aplicada); tabela `products` presente no dev.

## Runtime — reexecução com foco no perímetro do fix (itens 1, 4, 5 + redirect ao detalhe)

Setup: seed `qa-round2@example.com` (removida ao final), API `bun run src/index.ts` :3001, web **`next start` (build de produção)** :3000. Login real → token como cookie `clientela_session`. **Server Actions invocadas via HTTP contra o `next start`** (POST com `Next-Action: <id>` extraído de `.next/server/server-reference-manifest.json`) — é o mecanismo real do Next, não chamada direta à API; a única parte não exercitada segue sendo a digitação no browser (sem E2E — REL-01).

| Passo | Resultado |
|---|---|
| Corrente do form provada: `bun -e` com o código real → `parseBRLToCents("59,90")=5990`, `("35,50")=3550`, `("R$ 59,90")=5990` | ✅ |
| `createProductAction` (payload idêntico ao que o form produz de "59,90"/"35,50") via Server Action real | ✅ **303 See Other**, `x-action-redirect: /crm/products/{id};push`, `x-action-revalidated: 1` |
| **Detalhe renderiza de verdade** (`GET /crm/products/{id}`, build de produção, onde o CRÍTICO-1 vivia) | ✅ HTTP 200; HTML contém "Batom QA Round2", "Editar dados", "Excluir produto", `R$ 35,50`/`R$ 59,90` no `<dl>`, e no flight payload `defaultValues: {"costCents":"35,50","priceCents":"59,90"}` — ou seja, `centsToReaisInput` **executou no servidor** sem erro. Nenhum digest, nenhum "Não foi possível carregar o produto" |
| Centavos no banco (psql) | ✅ `cost_cents=3550, price_cents=5990` (inteiros) |
| `updateProductAction` (Server Action real) `stockQty: 10 → 2` (limiar 2) | ✅ 200, `{"ok":true}`, `x-action-revalidated: 1` |
| Badge "Estoque baixo" no **detalhe** e na **lista** pós-edição | ✅ presente nos dois; summary recalculado: Capital parado `R$ 71,00` (3550×2) e `R$ 119,80` (5990×2) — exatos; `?lowStock=true` retorna o produto |
| Exclusão em 2 passos: gate client-side revisado (1º clique só arma a confirmação — `startConfirm`, não chama a action; 2º clique chama `deleteProductAction`); passo 2 exercitado via Server Action real | ✅ 303 → `/crm/products`; lista volta ao vazio com CTA ("Nenhum produto cadastrado ainda"); banco `count=0` |
| Detalhe de produto excluído / id não-uuid | ✅ UI de not-found ("Produto não encontrado"), sem error boundary (status 200 por streaming com `loading.tsx` — comportamento do framework, mesmo padrão de clients) |
| Smokes: `GET /products` sem token ⇒ 401; `/products/summary` com token ⇒ `{"stockCostCents":0,...}` (guarda `toSafeInteger` não quebra o caminho normal) | ✅ |
| Logs da API sem PII/dado de produto (só "API rodando em...") | ✅ |

## Limpeza

- Servidores API e web derrubados (health checks `000`/connection refused confirmam).
- `DELETE FROM consultants WHERE email='qa-round2@example.com'` (cascade) → contagens finais 0/0/0/0.
- Container `clientela_pg_dev` mantido no ar (já rodava antes); migração 0004 permanece (aditiva, desejada para dev).

## Pendências

1. E2E Playwright inexistente (REL-01) — digitação real no form e o clique físico do fluxo de 2 passos seguem sem automação de browser; exercitado no nível Server Action + SSR de produção (registrado, não fingido).
2. Graduação (RF-08): menção a `/crm/products` em BUG-002/BUG-003 do backlog + nota de exclusão física × histórico de vendas em `known-issues.md` — a fazer na fase de graduação/handoff.
