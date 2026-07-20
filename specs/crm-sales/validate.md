---
feature: crm-sales
module: api, web, shared
phase: validate
status: done
round: 1
created: 2026-07-18
updated: 2026-07-18
depends_on: [tasks.md]
---

# Validate: crm-sales (rodada 1)

Executado de fato pelo revisor QA (neutro) em 2026-07-18, na árvore de trabalho da branch `feature/phase-2-crm` (trabalho não commitado).

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 221 arquivos, limpo |
| Typecheck | `bun run typecheck` | ✅ | 3 workspaces (shared, web, api) exit 0 |
| Testes | `bun run test` | ✅ (622 passed, 0 failed) | 42 arquivos, 33s — inclui Testcontainers (Docker ok) |
| Integração | incluída em `bun run test` | ✅ | `sales.integration.test.ts` (26 casos), `sales-tables.integration.test.ts` (18 casos) com Postgres real |
| Build | `bun run build` (apps/web) | ✅ | Todas as rotas de sales compiladas (`/crm/sales`, `/new`, `/[id]`, `/receivables` — ƒ dynamic) |
| Runtime (build de produção) | checklist de 9 itens do plan.md (abaixo) | ✅ | API `bun run start` + web `next start` (build de produção) + Postgres dev + migração 0005 + seed |

## Runtime QA — checklist do plan.md (executado fim-a-fim)

Setup: `docker-compose.dev.yml` (Postgres 18) já ativo; `bun run db:migrate` (0005 aplicada — 6 migrações no journal); `seed:consultant` (qa@teste.dev); cliente "Maria QA" + 2 produtos via API; sessão real via `POST /auth/login`; páginas RSC via cookie `clientela_session`; Server Actions exercitadas pelo protocolo `next-action` do build de produção (ids extraídos do `server-reference-manifest`), conforme lesson do projeto.

1. **Venda à vista pela UI (createSaleAction, 2 itens, cliente)** ✅ — 303 → `/crm/sales/[id]`; banco: estoque 10→8 e 3→2 (exato), `total_cents=18000` = Σ servidor (override 11000 respeitado + default 3500), snapshots de nome, 0 recebíveis; página de detalhe 200 renderizando itens/total/badge "Concluída".
2. **Venda a prazo 3× (total 10000, 1º venc. 2026-07-31)** ✅ — recebíveis `3334/3333/3333` (Σ exata) com vencimentos `31/07, 31/08, 30/09` (clamp de setembro correto); com parcela vencida semeada no banco, `/crm/sales` mostrou "A receber … R$ 33,34 · 1 parcela atrasada" e `GET /receivables/summary` = `{"pendingCents":10000,"overdueCents":3334,"overdueCount":1}`; "Quem me deve" listou com texto "Atrasada" e link `wa.me/5511988887777` (`toWaPhone`).
3. **Baixa/estorno pela UI (setReceivablePaidAction)** ✅ — baixa: `paid_at` setado, "Atrasada" some da lista (0 ocorrências); estorno: `{"ok":true}`, parcela volta pendente e "Atrasada" reaparece (1 ocorrência).
4. **Cancelamento** ✅ — com parcela paga: `{"ok":false,"message":"Não é possível cancelar: há parcela paga. Estorne o pagamento antes de cancelar."}` e status permanece `completed`; após estorno, cancel OK: status `canceled`, estoque devolvido no banco (7→8), recebíveis pendentes removidos (0), itens e `total_cents` preservados (histórico).
5. **Estoque insuficiente pela UI** ✅ — qty 100 com estoque 2 ⇒ `{"ok":false,"message":"Estoque insuficiente: restam 2 unidades de Perfume QA."}`; nada persistiu (contagem de sales e estoque intactos).
6. **Exclusões com snapshot** ✅ — `DELETE /clients/:id` e `DELETE /products/:id` ⇒ 204; vendas com `client_id NULL` + `client_name` snapshot ("Maria QA"); `sale_items.product_id NULL` + `product_name` snapshot; detalhe renderiza o nome como texto puro (sem link `/crm/clients/...`) e item excluído legível.
7. **Payload forjado via curl** ✅ — `POST /sales` com `totalCents:1, status:"canceled", consultantId:<alheio>` ⇒ campos ignorados (strip do Zod): venda criada com `totalCents:12000` (servidor) e `status:"completed"`.
8. **Duplo-submit / corrida do último item** ✅ — 2 POSTs paralelos do último item ⇒ exatamente um 201 e um 409 ("restam 0 unidades"), estoque final 0. (No browser, o botão fica `disabled` durante o pending — verificado no código; a guarda dura é a do UPDATE condicional.)
9. **Logs sem PII + 401** ✅ — log da API contém apenas o boot e 1 linha de erro com `requestId/code/path/nome da classe` (0 ocorrências de nome/telefone/e-mail); as 7 rotas do módulo sem token ⇒ 401.

Teardown: consultora QA removida (cascade limpou clients/products/sales/receivables/sessions — contagens 0), servidores API/web derrubados; container Postgres dev deixado como encontrado (já estava ativo antes da QA); lead pré-existente preservado.

## Saída Relevante

```
bun run lint      → Checked 221 files in 111ms. No fixes applied.
bun run typecheck → shared/web/api: Exited with code 0
bun run test      → Test Files 42 passed (42) · Tests 622 passed (622) · 33.40s
bun run build     → ✓ Compiled successfully · ƒ /crm/sales /crm/sales/[id] /crm/sales/new /crm/sales/receivables
runtime           → ver checklist acima (comandos curl/psql executados de fato)
```

Achado de runtime fora do happy path (registrado no review.md como ALERTA):

```
POST /sales com item qty=1000 × unitPriceCents=100.000.000 (válido pelo contrato)
→ 500 INTERNAL_ERROR (Postgres: integer out of range em total_cents int32)
→ atomicidade preservada (estoque intacto), mas payload válido-pelo-contrato vira 500 não mapeado
```

## Pendências

- **E2E (Playwright)**: infra inexistente (REL-01) — registrado como pendência de handoff, conforme spec ("Sem E2E; QA de runtime obrigatória"). QA de runtime executada como mitigação.
- Teste de integração com data fixa `2026-08-31` (`sales.integration.test.ts:92`) vira flake a partir de 2026-09-02 — ver review.md (#2).
