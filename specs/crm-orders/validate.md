---
feature: Pedidos de reposição (orders)
module: orders
phase: qa
status: done
updated: 2026-07-20
---

# Validate: Pedidos de reposição (orders) — QA rodada 1

Ambiente: branch `feature/phase-2-crm`; Docker `clientela_pg_dev` em localhost:5433; API de dev na porta 3001.

## Comandos executados

| Ferramenta | Comando | Resultado |
|---|---|---|
| Lint | `bun run lint` (Biome) | OK — `Checked 267 files. No fixes applied.` (exit 0) |
| Typecheck | `bun run typecheck` (tsc por workspace) | OK — shared/web/api exit 0 |
| Testes | `bun run test` (Vitest + Testcontainers) | OK — **52 arquivos, 784 testes, 784 passaram** (exit 0), ~57s |
| Build web | `cd apps/web && bun run build` (next build) | OK — exit 0; `/crm/orders`, `/crm/orders/[id]`, `/crm/orders/new` como rotas dinâmicas (ƒ) |
| Runtime API | `bun --env-file=../../.env src/index.ts` + curl | OK — ver abaixo |

## Suíte de testes — trecho

```
 Test Files  52 passed (52)
      Tests  784 passed (784)
```

Cobertura do módulo orders: unidade do service (14 testes, composição/override/dedup/erros), schemas do shared, integração Testcontainers (23 testes: criação vazia/com itens/422, replace draft+vazio+409, matriz de transições completa + place vazio, estoque atômico na entrega + SET NULL, concorrência deliver×deliver crédito único, place×cancel história serial legal, cancel sem efeito, snapshot, listagem/paginação/filtro/escopo, 401 por rota, 404 alheio/malformado).

## Runtime — curl (API porta 3001)

| Requisição | Esperado | Obtido |
|---|---|---|
| `GET /health` (sem token) | 200 público | 200 `{"status":"ok"}` |
| `GET /orders` (sem token) | 401 | 401 `{"error":{"code":"UNAUTHORIZED","message":"Sessão inválida ou expirada."}}` |
| `POST /orders` (sem token) | 401 | 401 |
| `POST /orders/:id/place` (sem token) | 401 | 401 |
| `POST /orders/:id/deliver` (sem token) | 401 | 401 |
| `POST /orders/:id/cancel` (sem token) | 401 | 401 |
| `PUT /orders/:id/items` (sem token) | 401 | 401 |
| `GET /orders/:id` (sem token) | 401 | 401 |
| `GET /orders` (token inválido) | 401 | 401 |

Guard default-deny (ADR-0012) intacto: `/orders/*` fora da allowlist pública; `GET /health` segue público. Processo derrubado ao fim.

## Status por ferramenta

- Lint: OK
- Typecheck: OK
- Testes (unidade + integração): OK (784/784)
- Build web: OK
- Runtime/guard: OK

## Pendências

- E2E Playwright (RF-07/RF-08 UI) não exercitado — infra ainda não existe (REL-01). Pendência já registrada no plan.md/handoff; comportamento de UI coberto por build + validação manual.
