---
feature: crm-sales
module: api, web, shared
phase: review
status: done
round: 1
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md, plan.md, validate.md]
---

# Review: crm-sales (rodada 1)

Revisão adversarial neutra (revisor não implementou). Arquivos revisados: `packages/shared/src/sales.ts` (+ teste), `apps/api/src/db/schema/{sales,sale-items,receivables}.ts`, `apps/api/drizzle/0005_motionless_doctor_octopus.sql`, `apps/api/src/db/sales-tables.integration.test.ts`, `apps/api/src/modules/sales/*` (6 arquivos), `apps/api/src/plugins/{error-handler,auth-guard}.ts`, `apps/api/src/lib/route-auth.ts`, `apps/api/src/{app,index}.ts`, `apps/web/src/lib/{sales-api,sale-total}.ts` (+ testes), `apps/web/src/components/sales/*` (7), `apps/web/src/app/(crm)/crm/sales/**` (todas as rotas + actions).

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md (todos exercitados por teste ou runtime — mapa abaixo)
- [x] Edge cases: lista vazia, zero, boundary (clamp de mês/bissexto, resto de centavos 1..n−1), duplicidade (pagar pago/estornar pendente/cancelar cancelada), concorrência (último item; cancelar×pagar)
- [x] Tratamento de erro: classes de domínio nomeadas → error-handler central; sem catch engolido
- Análise de serialização (adversarial, confere com o plan):
  - `createSale`: UPDATE condicional `stock_qty >= qty` escopado por consultora, itens ordenados por `product_id` — TOCTOU-safe, anti-deadlock; qualquer falha ⇒ rollback total (provado em teste e runtime).
  - `cancel`: PRIMEIRA escrita é o `UPDATE sales ... WHERE status='completed'` (trava a linha da venda), depois checa parcela paga (rollback), devolve estoque ordenado ASC (mesma ordem da baixa) e apaga pendentes.
  - `setReceivablePaid`: localiza escopado → `SELECT ... FOR UPDATE` na venda → re-checa `status` e o estado da parcela SOB o lock → grava. As duas transações disputam a linha de `sales` ⇒ exatamente um vence na corrida cancelar×pagar (teste de integração dedicado + análise dos dois entrelaçamentos: quem chega depois vê `canceled` (409) ou parcela apagada (404); cancel que perde vê parcela paga (409/rollback)). Nenhum caminho escapa da guarda.
  - Σ centavos: `splitInstallmentAmounts` com Σ exata por construção (teste exaustivo de restos); summary via SUM SQL com `::bigint` + `toSafeInteger`; total sempre do servidor; web soma centavos inteiros (`sale-total.ts`) e formata só na exibição. Nenhum float em nenhuma camada.

### Arquitetura (api.md, web.md)
- [x] routes → service → repository unidirecional; DI por factory no composition root; service sem Elysia; repository única camada com Drizzle; `sales` não importa internals de `products`/`clients` (toca as tabelas via schema compartilhado do próprio repository — padrão aceito no projeto; a porta `findProductsByIds` é do próprio módulo)
- [x] Zod em toda fronteira: rotas (schemas de shared), Server Actions (re-validação com `createSaleSchema`/uuid/paid boolean), form (safeParse do contrato + mapeamento de issues por campo)
- [x] Web: RSC por padrão; client só nas folhas (form, botões de ação); estados loading/vazio/vazio-de-filtro/erro/not-found presentes em todas as telas; mobile-first (h-11 nos alvos de toque, grid 1 coluna)
- [x] Dinheiro em centavos integer em todas as pontas; criação/cancelamento/baixa em `db.transaction`

### Banco (database.md)
- [x] Migração 0005 gerada, versionada, coerente com o schema (CHECKs de enum/valor, defaults, uuidv7)
- [x] FKs todas com índice explícito (5 índices); `GET /sales/:id` em 3 queries escopadas (sem N+1); listagens paginadas com `limit` sempre
- [x] SET NULL (client_id, product_id) e CASCADE (sale_id, consultant_id) provados em teste de integração e em runtime

### Segurança e LGPD (security.md)
- [x] Guard default-deny: rotas novas fora da allowlist pública ⇒ 401 (provado nas 7 rotas em runtime); escopo por `consultant_id` em TODA query (receivables via join com sales — cross-tenant 404 idêntico provado)
- [x] 422 idêntico para produto inexistente × de outra consultora (não vaza existência); id malformado ⇒ 404 (não 422/500)
- [x] Sem PII em log (só requestId/code/path/classe); erros ao cliente sem internals; ids sempre `encodeURIComponent` na URL
- [x] Snapshot `client_name` pós-exclusão: decisão consciente registrada no spec (Restrições) — reafirmar no handoff para o humano decidir sobre anonimização

### Tipos e qualidade (core.md)
- [x] Sem `any`/`as`/`!`; tipos de contrato de `packages/shared`; named exports; constantes nomeadas; early returns

### Testes (testing.md)
- [x] Testes derivados do spec (nomes citam RF-NN; comportamento, não implementação); integração com Testcontainers presente para schema+contrato+invariantes; fakes explícitos na unidade do service (porta injetada); nenhum teste skipado/relaxado
- [x] Concorrência: 2 POSTs paralelos do último item; cancelar×pagar paralelos — ambos presentes e verdes

### Escopo
- [x] Todas as tasks de tasks.md implementadas; arquivos do ciclo dentro do escopo declarado no plan
- [!] A árvore de trabalho contém TRÊS ciclos não commitados (crm-leads, crm-products, crm-sales) — fora do alcance deste review isolar cada um; handoff deve commitar por unidade coerente

## Cobertura dos Critérios de Aceite (spec.md)

| Critério | Evidência |
|---|---|
| RF-01 tabelas/CHECKs/FKs/índices/SET NULL/CASCADE | `sales-tables.integration.test.ts` (18 casos) ✅ |
| RF-03 à vista: estoque exato, total do servidor, forjado ignorado, atomicidade, concorrência, cross-tenant 422, override/default | `sales.integration.test.ts` 484–636 + runtime 1/5/7/8 ✅ |
| RF-03 parcelamento: 3334/3333/3333, clamp, fiado 1× | integração 639–709 + runtime 2 ✅ |
| RF-05 cancelamento (4 casos) | integração 771–929 + runtime 4 ✅ |
| RF-06 recebíveis (ordem, overdue, baixa/estorno, 409s, summary escopado/zeros) | integração 994–1261 + runtime 2/3 ✅ |
| RF-05/06 corrida cancelar×pagar | integração 930–993 ✅ |
| RF-04/05/06 cross-tenant 404 idêntico + não-vazamento em listas | integração 1381–1500 ✅ |
| RF-02 unidade shared (enums, 1..50, 1..24, datas, `{}` pt-BR) + total<installments | `sales.test.ts` + service test + integração 710–770 ✅ |
| RF-03 `addMonthsClamped` ancorada (31/jan→28/fev→31/mar, bissexto, dez→jan) | `sales.test.ts` 110–151 ✅ |
| RF-07 exclusões preservam histórico + cancel pós-exclusão sem devolução | integração 1263–1380 + runtime 6 ✅ |
| RF-08..RF-11 web | unidade helpers (`sale-total`, `sales-api`) + QA runtime (9 itens) ✅ |
| RF-12 logs sem PII / 401 | runtime 9 ✅ |

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | ALERTA | **Overflow de int32 em `total_cents` com payload válido pelo contrato** ⇒ 500 não mapeado. O contrato admite item `qty ≤ 1000 × unitPriceCents ≤ 100.000.000` (= 10¹¹ por item; 5×10¹² no teto de 50 itens), mas a coluna é `integer` (máx. 2.147.483.647). Reproduzido em runtime: `POST /sales` com qty=1000 × R$ 1.000.000,00 ⇒ Postgres `integer out of range` ⇒ 500 genérico. Atomicidade preservada (rollback; estoque intacto) — não corrompe dados, mas input válido-pela-fronteira não deve virar 500. | `apps/api/src/modules/sales/sales.service.ts:172` (cálculo do total) / `packages/shared/src/sales.ts:148` (teto por item) | No service, após calcular `totalCents`, validar `totalCents <= 2_147_483_647` ⇒ `InvalidSaleItemError`/novo erro 422 pt-BR ("Valor total da venda excede o limite"); opcionalmente reduzir o teto por item no contrato. + teste de unidade |
| 2 | ALERTA | **Data fixa em teste de integração = flake com prazo** (`FIRST_DUE_DATE = "2026-08-31"`): a partir de 2026-09-02 o `createSaleSchema` rejeita a data (passado) e o teste do clamp falha. Viola o princípio de determinismo de `testing.md` (sem dependência de relógio real). Já sinalizado em tasks.md (Task 2.3) para avaliação na QA — confirmado como problema real. | `apps/api/src/modules/sales/sales.integration.test.ts:92-94` | Derivar `FIRST_DUE_DATE` da data corrente garantindo um caso de clamp (ex.: próximo dia 31 ≥ hoje via helper, e derivar M1/M2 com `addMonthsClamped`), como já fazem os testes de shared (`isoWithDayOffset`) |
| 3 | SUGESTÃO | Ordenação anti-deadlock da baixa usa `localeCompare` (JS/ICU) e a devolução usa `ORDER BY product_id` (bytes do uuid no Postgres). Para uuids canônicos minúsculos os dois coincidem, mas a equivalência depende de detalhe de collation do ICU — frágil a refactor. | `apps/api/src/modules/sales/sales.repository.ts:243` | Comparar byte-a-byte: `left.productId < right.productId ? -1 : 1` (ordem lexicográfica pura, idêntica à do Postgres) |
| 4 | SUGESTÃO | Venda anônima grava o sentinel `client_name = "Cliente não identificada"`; a UI decide "—" por `clientId === null` na listagem, mas exibe o sentinel no detalhe/quem-me-deve. Comportamento consistente e pt-BR, porém venda de cliente EXCLUÍDA e venda anônima ficam indistinguíveis do sentinel apenas quando os nomes coincidem — cosmético. | `apps/api/src/modules/sales/sales.repository.ts:61` | Nenhuma ação obrigatória; se quiser distinguir, exibir "(cliente excluída)" quando `clientId === null` e `clientName !== sentinel` |
| 5 | SUGESTÃO | Janela TOCTOU estreita: produto excluído entre a validação (`findProductsByIds`, fora da transação) e a baixa ⇒ vira 409 "restam 0 unidades" em vez de 422 (e cliente excluída na mesma janela ⇒ FK violation 500). Improvável em single-user; sem corrupção. | `apps/api/src/modules/sales/sales.repository.ts:246-274` | Aceitável no porte; se quiser, distinguir "produto sumiu" (current undefined) e mapear para `InvalidSaleItemError` |

## Veredito

**APROVADO**

- lint/typecheck limpos · 622/622 testes verdes (unidade + integração Testcontainers) · build de produção ok · checklist de runtime de 9 itens executado fim-a-fim com sucesso · todos os critérios de aceite cobertos por teste executável ou QA de runtime · **zero CRÍTICO**.
- As 5 invariantes do domínio foram atacadas deliberadamente (concorrência, atomicidade, Σ centavos, escopo, forja de payload) e resistiram.
- ALERTAS #1 e #2 não bloqueiam (não corrompem dados; #1 é teto irreal para o domínio, #2 é dívida de teste com prazo), mas devem entrar no handoff: **#2 tem data para explodir (set/2026)** e #1 é correção pequena no service.
- Pendência estrutural: E2E Playwright (REL-01), registrada — não fingida.
