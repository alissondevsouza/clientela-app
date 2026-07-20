---
feature: Encomendas de clientes no pedido (order item ↔ client)
module: orders
phase: validate
status: done
round: 1
created: 2026-07-20
updated: 2026-07-20
depends_on: [tasks.md]
---

# Validate: Encomendas de clientes no pedido (rodada 1)

Execução real (não presumida) na raiz do monorepo. Docker disponível
(server 29.1.5) — Testcontainers exercitados. Runtime da API subido de fato e
exercitado com curl; processo derrubado ao final.

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 270 arquivos checados, nenhum fix |
| Typecheck | `bun run typecheck` | ✅ | shared/web/api todos exit 0 |
| Testes | `bun run test` | ✅ (807 passed, 0 failed) | 52 arquivos; 66,7s |
| Integração | incluída em `bun run test` (Testcontainers + Postgres real) | ✅ | orders.integration.test.ts com casos de vínculo/SET NULL/escopo |
| Build | `cd apps/web && bun run build` | ✅ | 21 rotas; /crm/orders, /crm/orders/[id], /crm/orders/new dinâmicas |
| Runtime (curl) | subir API + fluxo autenticado ponta-a-ponta | ✅ | ver abaixo |

## Saída Relevante

### Lint / Typecheck
```
$ biome check .
Checked 270 files in 887ms. No fixes applied.

$ bun run --filter='*' typecheck
@clientela/shared typecheck: Exited with code 0
@clientela/web typecheck: Exited with code 0
@clientela/api typecheck: Exited with code 0
```

### Suíte
```
Test Files  52 passed (52)
     Tests  807 passed (807)
  Duration  66.67s
```

### Build web
```
✓ Generating static pages (18/18)
├ ƒ /crm/orders
├ ƒ /crm/orders/[id]
├ ƒ /crm/orders/new
```

### Runtime — API real (localhost:3001), consultora do seed (laisbarbosa@gmail.com)
- **401 sem token**: `GET /orders` → 401; `POST /orders` → 401.
- **Login**: 200, token emitido.
- **Criar pedido com item vinculado + item de reposição no mesmo pedido**:
  item 1 → `clientId` e `clientName:"QA Encomenda"` preenchidos;
  item 2 (sem cliente) → `clientId:null, clientName:null`. `totalCents` 6000 (calc. servidor).
- **Rename da cliente reflete no GET (join, não snapshot)**: PATCH `/clients/:id`
  `Nome Antigo`→`Nome Novo` (200); GET do pedido: `clientName` passou de
  `"Nome Antigo"` para `"Nome Novo"`.
- **422 sem vazar existência**: `clientId` inexistente ⇒ HTTP 422
  `{"code":"INVALID_ORDER_CLIENT","message":"Cliente inválida para este pedido."}`.
- **DELETE da cliente ⇒ vínculo apagado (LGPD)**: DELETE `/clients/:id` (204);
  GET do pedido: o item antes vinculado passou a `clientId:null, clientName:null`;
  demais campos do pedido íntegros (total, itens, status).
- **Processo da API derrubado** ao final (`/health` sem resposta — 000).

```
=== 401 sem token ===
GET /orders  -> 401
POST /orders -> 401
=== order criado ===
items:[{clientId:"019f8098-5c01-...",clientName:"QA Encomenda",qty:2,...},
       {clientId:null,clientName:null,qty:1,...}]  total=6000
=== rename via PATCH ===
antes: "clientName":"Nome Antigo"  -> PATCH 200 -> depois: "clientName":"Nome Novo"
=== 422 clientId inexistente ===
{"error":{"code":"INVALID_ORDER_CLIENT","message":"Cliente inválida para este pedido."}}  HTTP 422
=== DELETE cliente ===
DELETE 204 -> GET item: clientId:null, clientName:null (vínculo apagado); pedido íntegro
```

## Pendências
- **E2E (Playwright)**: infra ainda não existe — seletor de cliente com busca
  digitada e cadastro rápido inline validados só por build/typecheck + inspeção
  de código. Pendência já registrada no plan (REL-01). Sem fingir cobertura.
- Runtime cobriu API; a UI (RF-05/RF-06/RF-07 no browser) não foi exercitada
  ponta-a-ponta por falta de E2E — comportamento coberto por unidade/integração
  no back-end e por leitura crítica dos componentes.
