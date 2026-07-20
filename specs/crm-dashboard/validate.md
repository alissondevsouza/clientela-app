---
feature: crm-dashboard
phase: qa
status: done
created: 2026-07-19
---

# Validate: crm-dashboard (CRM-07 — Dashboard)

Revisor neutro de QA (não implementou a feature). Todos os comandos rodados de
verdade na raiz do monorepo; saídas coladas abaixo.

## Ambiente

- `bun 1.3.11`; Docker disponível (`docker ps` OK) → Testcontainers/Postgres real.
- Branch: `feature/phase-2-crm` (working tree, nada commitado — ADR-0006).

## Comandos e saída

### `bun run lint` (Biome) — OK

```
$ biome check .
Checked 238 files in 122ms. No fixes applied.
```

### `bun run typecheck` (tsc por workspace) — OK

```
$ bun run --filter='*' typecheck
@clientela/shared typecheck: Exited with code 0
@clientela/web typecheck: Exited with code 0
@clientela/api typecheck: Exited with code 0
```

### `bun run test` (Vitest, inclui integração Testcontainers) — OK

```
 RUN  v4.1.10
 Test Files  47 passed (47)
      Tests  674 passed (674)
   Duration  32.53s (import 51.23s, tests 148.75s)
```

Suítes relevantes à feature, todas verdes:
- `packages/shared/src/dashboard.test.ts` — schemas (negativo, null, 0/teto/{} pt-BR).
- `apps/web/src/lib/goal-progress.test.ts` — 0/parcial/100/>100/floor/meta 0 e negativa.
- `apps/api/src/modules/dashboard/dashboard.service.test.ts` — repasse + monthLabel pt-BR (relógio injetado).
- `apps/api/src/modules/dashboard/dashboard.integration.test.ts` — agregados exatos, cancelada/mês-anterior/escopo fora, lucro negativo serializa, recebíveis == /receivables/summary, meta grava/remove, 0/negativo/teto ⇒ 422 pt-BR, 401 sem token.
- `apps/api/src/modules/sales/sales.integration.test.ts` — grava cost_cents do produto por item; mudar custo depois NÃO altera o snapshot (CRM-07/RF-02).

### `bun run --filter='@clientela/web' build` (produção — prova RSC×client) — OK

```
▲ Next.js 16.2.10 (Turbopack)
✓ Compiled successfully in 14.5s
  Finished TypeScript in 6.9s
✓ Generating static pages using 7 workers (16/16)
Route (app)
├ ƒ /crm            (dynamic, server-rendered on demand)
├ ƒ /crm/sales/receivables
├ ƒ /crm/clients/new
├ ƒ /crm/sales/new
...
Exited with code 0
```

A home `/crm` compila como rota dinâmica (RSC) com a folha client `GoalCard` —
o boundary RSC×client (lesson) não quebra o build de produção.

## QA de runtime (skill `verify`) — NÃO executada

A ferramenta `verify` (subir app + Postgres com sessão real e exercitar a home)
não estava disponível neste ambiente de revisão. Verificação manual ponta-a-ponta
(definir/editar/remover meta pela UI, atrasadas em destaque, links) fica como
pendência de handoff. Mitigação já coberta automaticamente:
- Build de produção compila (prova o boundary RSC×client — risco principal da lesson).
- Rotas de link rápido existem no build: `/crm/sales/new`, `/crm/clients/new`, `/crm/sales/receivables`.
- Fluxo de meta (definir/editar/remover/validar) coberto por integração real
  (`dashboard.integration.test.ts`) exercitando o mesmo contrato que a UI consome.

## Status por ferramenta

| Ferramenta | Status |
|---|---|
| lint (Biome) | OK |
| typecheck (tsc) | OK |
| test (Vitest + Testcontainers, 674) | OK |
| build web (produção) | OK |
| QA runtime (verify) | Pendente (manual) — build prova RSC×client |
