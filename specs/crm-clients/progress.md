---
feature: crm-clients
module: api, web, shared
phase: spec
status: in_progress
updated: 2026-07-17
---

# Progress: crm-clients (CRM-03)

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | `consultant_id` NOT NULL em clients; 404 uniforme p/ inexistente e de-outra-consultora | 04-domain-model (multi-tenant-ready); não vazar existência |
| 2026-07-17 | spec | perPage > 100 rejeita 422 (não clampa) | Explícito > silencioso; contrato claro |
| 2026-07-17 | spec | `skin_tone` texto livre nullable (sem enum) | Vocabulário é decisão de conteúdo do humano (LP-08) |
| 2026-07-17 | spec | "Produtos que usa" via `notes` nesta fase | Estruturar exigiria FK em products (CRM-05) — escopo novo = item novo |
| 2026-07-17 | spec | Busca ILIKE sem trigram | Escala pequena; revisitar se crescer |
| 2026-07-17 | spec | birthday `date` string-mode; formatação só no front | Sem fuso em aniversário; evita bug de driver |
| 2026-07-17 | spec-review | `toWaPhone` E.164 BR (prefixo "55" p/ 10–11 dígitos); `loading.tsx` nas rotas de dados; format.ts/page.tsx movidos p/ Modificar; tensão LGPD×vendas registrada p/ CRM-06; perPage>100 ⇒ 422; busca numérica só-dígitos; birthday sem futuro; searchParams saneados | Rodada 1 do spec-verifier: 2 CRÍTICOs + 2 ALERTAs + 4 sugestões, todos incorporados |
| 2026-07-17 | spec-review | Rodada 2 (verifier novo): APROVADO; incorporados — `:id` não-uuid ⇒ 404; update aceita `null` p/ limpar nullable (form vazio → null); `toWaPhone` com fallthrough total; redirect pós-create → detalhe; `search` máx 100; QA cobre paginação preservando search | Bordas fechadas antes da implementação |

| 2026-07-18 | implement | DELETE 204: `new Response(null, { status: 204 })` — Elysia 1.4 lança TypeError serializando `undefined` | Bug real pego pelo teste de integração da 2.3 (derivado do spec); candidato a lesson |

## Milestones

- [x] Milestone 1: Contratos e banco (Tasks 1.1, 1.2 + 3.4 antecipada; 2026-07-17)
- [x] Milestone 2: API — módulo clients (18 testes de integração; bug do DELETE achado e corrigido)
- [x] Milestone 3: Web — telas de clientes (listagem/busca/paginação + CRUD + WhatsApp E.164)
- [x] Milestone 4: Checkpoint (279 testes verdes, 2026-07-18)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | intake→spec | Spec set autorado (contexto herdado dos ciclos anteriores) | Size L |
| 2026-07-17 | 1 | spec-review | Rodada 1 REPROVADA (E.164 wa.me + loading.tsx) → corrigida; rodada 2 APROVADA (bordas: id não-uuid, PATCH null, fallthrough) | 2 verifiers neutros |
| 2026-07-17/18 | 1–2 | implement | 9 tasks por implementers isolados; 2 interrompidas por limite de sessão e finalizadas na retomada; bug real do DELETE 204 (Elysia TypeError) achado pelo teste de integração e corrigido | Checkpoint: 279 testes verdes |
| 2026-07-18 | 2 | qa | QA rodada 1: **APROVADO** (checklist 9/9; cross-tenant/mass-assignment/PATCH null provados em runtime) | 2 ALERTAs → BUG-001/002 no backlog; 3 sugestões registradas no review.md |
| 2026-07-18 | 2 | graduate→handoff | Lesson (Elysia 204), known-issue (LGPD×vendas), 04-domain atualizado, BUGs registrados, roadmap [R] | — |
