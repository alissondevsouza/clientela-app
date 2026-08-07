---
feature: Agenda de compromissos
phase: qa
round: 4 (incremento pós-QA — rodada final)
status: passou
validated: 2026-08-06
---

# Validate — incremento pós-QA (RF-23 / RF-24 / RF-25)

> Rodada 4. Escopo: RF-23, RF-24 e RF-25 + detecção de regressão no restante.
> A rodada 3 reprovou por um CRÍTICO só observável em **build de produção servido pelo
> standalone** (reexport de Server Action apagando o `server-reference-manifest` das páginas
> da agenda). Esta rodada **reproduziu o gate do zero** — não confiou no relato do corretor.

## 1. Ferramentas estáticas

| Comando | Status | Saída |
|---|---|---|
| `bun run lint` | ✅ ok | `biome check .` → `Checked 313 files in 222ms. No fixes applied.` (exit 0) |
| `bun run typecheck` | ✅ ok | `@clientela/shared` 0 · `@clientela/web` 0 · `@clientela/api` 0 (exit 0) |
| `bun run test` | ✅ ok | `Test Files 65 passed (65)` · `Tests 1119 passed (1119)` · 87.32s (exit 0) |
| `bun run --filter=@clientela/web build` | ✅ ok | `✓ Compiled successfully in 45s` · 24 rotas · exit 0 |

Suíte: **1119 testes, 0 falhas** (rodada 3: 1106 — +13 dos testes novos de
`appointment-lead-conversion.test.ts` (7) e `appointment-person-search.test.ts` (6)).

## 2. Runtime — build de PRODUÇÃO servido pelo standalone

Este é o único gate que pega o defeito da rodada 3. Montagem exata:

```
docker compose -f docker-compose.dev.yml   # clientela_pg_dev (postgres:18) já ativo
cd apps/api && bun run db:migrate          # → [✓] migrations applied successfully
                                           # consultora seed já presente (1 linha em consultants)
bun run --filter=@clientela/web build      # next build (output: "standalone")
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
cp -r apps/web/public       apps/web/.next/standalone/apps/web/public
bun --env-file=.env apps/api/src/index.ts                       # API :3001
PORT=3100 API_URL=http://localhost:3001 node apps/web/server.js  # standalone :3100
```

Driver: Playwright (`playwright-core` no scratchpad) + Chrome headless, viewport **375×800**
(mobile-first), sessão real obtida pelo `/login` do próprio app.

### 2.1 Contagem de ids no `server-reference-manifest.json`

```
app/(crm)/crm/appointments/[id]/page      22
app/(crm)/crm/appointments/new/page       22
app/(crm)/crm/appointments/page            1
app/(crm)/crm/orders/[id]/page             8
app/(crm)/crm/orders/new/page              8
```

**22 ids** nas duas páginas da agenda (rodada 3: **8**). 22 = 14 actions do próprio
`appointments/actions.ts` + 7 de `orders/actions.ts` (alcançados pela delegação) + `logoutAction`.
Regressão do CRÍTICO: **corrigida**.

### 2.2 Ações reais disparadas no standalone (não em `next dev`)

| # | Ação | Página | Resultado |
|---|---|---|---|
| A1 | `searchClientsAction` (digitar nome inexistente) | `/crm/appointments/new` | ✅ 200 → "Nenhum resultado encontrado." |
| A2 | gatilho RF-23 | idem | ✅ CTA "Cadastrar pessoa" renderizado |
| A3 | `quickCreateClientAction` (wrapper que delega) | idem | ✅ cliente criado e vinculado (`QA Cliente … (Cliente)`) |
| A4 | `createAppointmentAction` | idem | ✅ 201 + redirect para `/crm/appointments/<uuid>` |
| B1 | `searchLeadsAction` | idem (aba Lead) | ✅ 200 → "Nenhum resultado encontrado." |
| B2 | RF-23 WhatsApp inválido (`1234`) | idem | ✅ erro de campo, nenhuma chamada, nada criado |
| B3 | `quickCreateLeadAction` | idem | ✅ lead criado e vinculado (`QA Lead … (Lead)`) |
| B4 | `createAppointmentAction` com lead | idem | ✅ 201 + redirect |
| C1 | RF-25 gating | `/crm/appointments/<id>` | ✅ "Converter em cliente" presente (lead `new`) |
| C2 | `convertAppointmentLeadAction` | idem | ✅ 200; botão some após revalidar |
| C3 | RF-25 negativo (compromisso com cliente) | `/crm/appointments/<id>` | ✅ botão ausente |
| D1 | `noShowAppointmentAction` | idem | ✅ 200; badge "Não compareceu" |
| E1 | `checkConflictsAction` | form de edição | ✅ 200 ("Verificando conflitos de horário…" resolve) |
| E2 | `listLinkableSalesAction` | detalhe | ✅ 200 (mensagem de lista vazia renderizada) |
| E3 | busca **positiva** cliente/lead (RF-14) | `/crm/appointments/new` | ✅ encontra os recém-criados |
| E4 | listagem | `/crm/appointments` | ✅ abas Próximos/Pendentes/Histórico, agrupamento Hoje/Depois |

`BAD_RESPONSES` (respostas ≥400 vindas do origin do web, capturadas pelo listener do Playwright):
**`[]`** — nenhuma. Nenhum `404 Server action not found`.

### 2.3 Efeitos confirmados no BANCO (não só na UI)

Cadastro rápido como lead (RF-24, ADR-0020):

```
       name          |  whatsapp   | status |   source
---------------------+-------------+--------+------------
 QA Lead 1786069…    | 11933334444 | new    | crm_manual
```

Após "Converter em cliente" (RF-25 + RF-12):

```
appointments: client_id = 019fda04-0be1-…  |  lead_id = 019fda03-111c-…  (PRESERVADO)
leads:        status = converted           |  client_id = 019fda04-0be1-…
clients:      QA Lead 1786069…  11933334444  (cliente criada)
```

`client_id` populado **mantendo** `lead_id` — exatamente o contrato do RF-12/RF-25.

### 2.4 Regressão: captura pública de leads da landing SEM token

- **Navegador, contexto sem cookie** (`cookies antes: []`), landing servida pelo standalone →
  form preenchido + checkbox de consentimento → submit → persistido:
  `QA Landing 1786069224297 | 11955556666 | source=landing | status=new | consent_at NOT NULL`.
- **`curl` direto na API, sem Authorization**: `POST /leads` → **201**
  (`{"id":"019fda04-5517-…"}`), `source=landing`.
- **`curl` sem Authorization em `POST /leads/manual`** → **401**
  `{"error":{"code":"UNAUTHORIZED","message":"Sessão inválida ou expirada."}}`.

Nenhuma regressão na captura pública.

### 2.5 PII em log (security.md / LGPD)

`grep` por nomes e números usados no teste (`QA Lead`, `QA Cliente`, `QA Landing`,
`11933334444`, `11955556666`) em `api.log` e `web.log` do runtime: **zero ocorrências**.

## 3. Limpeza do ambiente

- Processos do standalone (:3100) e da API (:3001) encerrados.
- Dados de QA removidos do banco de dev: 2 `appointments`, 3 `leads`, 2 `clients`.
- `apps/web/.next` removido (lesson 2026-08-06: `.next` de produção faz o `next dev` seguinte
  responder 404 em todas as rotas).
- Nenhuma operação git de escrita; nenhum arquivo de código alterado; working tree preservado
  (62 entradas em `git status --short`, iguais às do início).

## 4. Pendências declaradas (não bloqueantes)

- **E2E (Playwright) inexistente no repositório** — a verificação acima foi feita com um driver
  descartável no scratchpad, não versionado. Continua valendo o known-issue REL-01.
- **Nenhum gate automatizado impede a regressão do reexport de Server Action** — hoje a proteção é
  a lesson de 2026-08-06 + disciplina de review. Ver ALERTA no `review.md`.
