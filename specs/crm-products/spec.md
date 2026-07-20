---
feature: crm-products
module: api, web, shared
phase: spec
status: draft
size: L
created: 2026-07-18
updated: 2026-07-18
---

# Spec: crm-products (CRM-05 — Produtos & estoque)

## O Que

Catálogo e estoque da consultora no CRM: tabela `products` (pendurada em `consultants`), CRUD autenticado com busca e paginação, **valores monetários em centavos (integer)**, controle de quantidade em mãos, **alerta de estoque baixo** (limiar por produto) e visão de **capital parado** (custo total do estoque). Telas mobile-first com formulário que converte reais ⇄ centavos na fronteira da UI.

## Por Que

CRM-05 do roadmap; pré-requisito das vendas (CRM-06 — baixa de estoque) e do catálogo dinâmico da landing (CRM-08). Invariantes de `04-domain-model.md`/`api.md`: dinheiro **inteiro em centavos** (nunca float), estoque nunca negativo.

## Requisitos

- **RF-01** — Tabela `products` via migração Drizzle: `consultant_id` uuid NOT NULL FK → `consultants` com índice; `name` text NOT NULL; `brand_code` text nullable (código Mary Kay); `cost_cents` integer NOT NULL com CHECK `>= 0`; `price_cents` integer NOT NULL com CHECK `>= 0`; `stock_qty` integer NOT NULL default 0 com CHECK `>= 0`; `low_stock_threshold` integer NOT NULL default 1 com CHECK `>= 0`; convenções `database.md`.
- **RF-02** — Contratos em `packages/shared`: create (name ≥ 2, costCents/priceCents inteiros ≥ 0 com **teto de 100.000.000 centavos (R$ 1 milhão)**, stockQty inteiro ≥ 0 **máx. 1.000.000** default 0, lowStockThreshold inteiro ≥ 0 máx. 1.000.000 default 1, brandCode opcional ≤ 40; mensagens pt-BR incl. campo ausente; **rejeitar não-inteiro** — ex.: 12.34 ⇒ mensagem orientando centavos; acima do teto ⇒ 422 pt-BR, nunca erro 22003 do Postgres), update parcial (nullable com `null` para limpar só em `brandCode`; demais campos não-nuláveis), resposta (com `lowStock: boolean` derivado — `stockQty <= lowStockThreshold`), query de listagem (paginação + `search` ≤ 100 + `lowStock=true` filtro).
- **RF-03** — API módulo `products` (camadas padrão; rotas autenticadas; escopo por consultora da sessão com 404 uniforme — padrão clients): `GET /products` (paginada, busca por nome/brand_code case-insensitive com escape de wildcards `%`/`_` — não repetir o BUG-001, filtro `lowStock`), `POST /products` (201), `GET/PATCH/DELETE /products/:id` (200/200/204; uuid inválido ⇒ 404).
- **RF-04** — `GET /products/summary`: agregado da consultora — `stockCostCents` (Σ cost_cents × stock_qty — capital parado), `stockPriceCents` (Σ price_cents × stock_qty — valor de venda do estoque), `lowStockCount` (produtos com estoque ≤ limiar). Calculado em SQL com **cast `::bigint` na multiplicação por linha** (evita overflow de integer antes do SUM) e `COALESCE` para 0.
- **RF-05** — Erro de domínio `ProductNotFoundError` → 404 pt-BR no error-handler central; validações 422 pt-BR.
- **RF-06** — Web `/crm/products`: listagem mobile-first substituindo o placeholder — estados loading (skeleton)/vazio (CTA)/vazio-de-busca/erro (retry); header com resumo (capital parado e valor de venda formatados `formatBRL`, contagem de estoque baixo com link/filtro); busca (form GET) e filtro "estoque baixo" preservados na paginação; card com nome, brand_code, preço, quantidade e badge "Estoque baixo" (texto, não só cor).
- **RF-07** — Web `/crm/products/new` e `/crm/products/[id]`: formulário RHF único (create/edit) com **preço e custo digitados em reais** (input decimal pt-BR) convertidos para centavos na fronteira do form via `parseBRLToCents` (aritmética de string, nunca float), com tabela de comportamento **fixa**: `"12,34"→1234` · `"12,3"→1230` · `"12"→1200` · `"1.234,56"→123456` · `"1.234"→123400` (ponto = milhar) · `"R$ 12,34"→1234` · `"12,345"→null` (3 casas) · `"12.34"→null` (grupo de milhar inválido) · `""`/espaços→null · negativos→null. Estoque e limiar como inteiros; detalhe com exclusão em confirmação de 2 passos; sucesso → redirect ao detalhe; `loading.tsx`/`error.tsx`/`not-found.tsx` (padrão clients).
- **RF-08** — Exclusão física nesta fase; registrar a mesma tensão com histórico de vendas (CRM-06 criará FK em sale_items — decisão de anonimização/bloqueio fica lá, junto com a de clientes).
- **RF-09** — LGPD/logs: produtos não têm dado pessoal, mas manter padrão (log só IDs); pt-BR; a11y (labels, botões com texto).

## Critérios de Aceite

- [ ] (RF-01) Integração: tabela/colunas/CHECKs (inserir cost_cents negativo falha; stock_qty negativo falha), FK+índice, defaults (stock 0, threshold 1).
- [ ] (RF-02) Unidade (shared): mínimo válido aceito; costCents 12.34 (não-inteiro) rejeitado com mensagem pt-BR de centavos; negativos rejeitados; **acima do teto rejeitado pt-BR**; `{}` coberto; update `{}` rejeitado; `lowStock` derivado corretamente no mapper.
- [ ] (RF-04) Integração: summary com valores grandes (produtos próximos do teto × estoque alto) calcula sem overflow (cast bigint provado).
- [ ] (RF-03) Integração (sessão real): CRUD completo; busca por fragmento de nome e brand_code; busca com `%` não retorna tudo (escape provado); filtro `lowStock=true` só retorna produtos com estoque ≤ limiar; escopo entre 2 consultoras (404); 401 sem token; uuid inválido 404; paginação com defaults/máximo.
- [ ] (RF-04) Integração: summary com valores corretos calculados de fixtures conhecidas (incl. produto com estoque 0 não afeta somas; limiar 0 nunca alerta... conferir semântica: estoque 0 ≤ limiar 0 ⇒ alerta? **decisão**: `lowStock = stockQty <= lowStockThreshold` sempre; com limiar 0, alerta só com estoque 0) e escopado por consultora.
- [ ] (RF-06/RF-07) Unidade dos helpers web (products-api; `parseBRLToCents` com "12,34"/"1.234,56"/inválidos; formatação); QA de runtime com checklist.
- [ ] (RF-08) Nota registrada (known-issue existente ganha menção a products na graduação).

## Fora de Escopo

- Movimentação/histórico de estoque (entradas/saídas — MVP ajusta `stockQty` direto no PATCH; baixa automática vem com vendas CRM-06); fotos de produto; flag "destaque" da landing (CRM-08); importação de catálogo; categorias.

## Restrições Conhecidas

- Sem E2E (REL-01); Vitest sob Node (hasher scrypt na porta, padrão estabelecido).
- BUG-002 (page além do fim) e BUG-003 (401→boundary) existem nas listagens anteriores — **escolha deliberada de consistência**: replicar o padrão atual em products e corrigir as três telas juntas nos itens dos bugs (as entradas do backlog ganham menção a `/crm/products` na graduação). BUG-001 (escape de LIKE) **não** deve ser replicado (RF-03 exige escape).
