---
feature: leads-capture-api
module: api, shared
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: Módulo `leads` da API — captura pública de leads

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-16 | spec | Honeypot (`website`) entra no contrato HTTP (`leadCaptureRequestSchema`), mantendo `createLeadSchema` puro para o formulário | Um só ponto de verdade com extensão explícita; bot recebe 201 sintético sem persistência (não revelar detecção) |
| 2026-07-16 | spec | Rate limiter em memória (Map, janela fixa, clock injetado), sem dep nova | ADR-0003: instância única; `testing.md`: determinismo via clock fake; `core.md`: sem dependência sem justificativa |
| 2026-07-16 | spec | IP = 1º `x-forwarded-for` → `server.requestIP` → `"unknown"` (fail-closed) | Prod atrás do Caddy; ausência de IP não pode desligar o limite |
| 2026-07-16 | spec | Error handler central global com envelope `{ error: { code, message } }` compartilhado em shared | `api.md`; front (LP-06) consome o mesmo tipo |
| 2026-07-16 | spec | Repository retorna só `{ id }`; logs nunca contêm dado pessoal | LGPD (`security.md`) |
| 2026-07-16 | spec | `truncateAll()` + erro amigável sem Docker no pg-container (fecha known-issue do LP-01) | Primeiro reuso do helper é aqui; dívida registrada com plano "resolver no LP-02" |
| 2026-07-16 | spec | Review neutra (rodada 1): APROVADO; alertas incorporados — `website: ""`/ausente ≠ bot (campo hidden submete `""`; caso de aceite e teste adicionados); verificação executável do caminho sem Docker; teste unitário do error-handler; verificação da Task 2.4 restrita a unidade | Sem esses ajustes, lead humano poderia ser descartado silenciosamente (perda total de captação) |
| 2026-07-16 | spec | Id sintético do honeypot é UUID v4 (`crypto.randomUUID`), ids reais são v7 — limitação consciente | Distinguível só por bot que inspecione dígito de versão (sinal fraco); gerar v7 manualmente não justifica o custo agora |

## Milestones

- [x] Milestone 1: Contrato compartilhado
- [x] Milestone 2: Plugins e módulo leads
- [x] Milestone 3: Helper endurecido + integração

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-16 | 1 | spec | Intake LP-02, research, spec/plan/tasks autorados | Roadmap marcado `[>]`; branch compartilhada `feature/phase-1-landing-page` (decisão registrada em specs/dev-db-drizzle-leads) |
| 2026-07-16 | 1 | qa | QA rodada 1 (verifier A): REPROVADO — 1 CRÍTICO (422 em inglês p/ campo ausente; assert relaxado mascarava), 3 ALERTAs (PARSE→500, XFF spoofável, 422 não consome janela) | Spec corrigida pelo orquestrador: RF-05 passa a exigir ÚLTIMO valor do XFF (Caddy dá append; primeiro valor é forjável) e rate limit antes da validação. Sugestões: interest "" → undefined acatada; id v4 sintético mantido como limitação documentada; log mínimo de 500 mantido (trade-off LGPD consciente) |
| 2026-07-17 | 1 | qa | Rodada 2 (verifier B): REPROVADO — CRÍTICO novo: bypass do rate limit via `POST /leads/` (trailing slash, roteador non-strict) → fixer normalizou pathname no guard + testes adversariais de roteamento → rodada 3 (verifier C): APROVADO — 52/52 testes, RF-01..09 verificados em runtime real | Sugestões remanescentes (não bloqueantes): id sintético v7, escopo do guard por método (→ known-issues p/ CRM-04), log 500 enriquecido |
| 2026-07-17 | 1 | graduate | Lessons (lifecycle Elysia + Zod v4 campo ausente); known-issues: helper pg-container marcado resolvido; novo item guard×CRM-04 | Roadmap LP-02 → `[R]` |
| 2026-07-16 | 1 | implement | M1–M3 por clientela-implementer; lint/typecheck limpos; suíte 43/43 (8 arquivos, inclui 6 de integração leads) | Decisões do implementer: rate limit no `beforeHandle` (validação roda antes; escopo por rota); mensagem Zod via `error.all[0].summary`; códigos VALIDATION_ERROR/NOT_FOUND/INTERNAL_ERROR/RATE_LIMITED; log 500 só requestId/code/path/error.name; truncateAll via pg_tables com identifiers quoteados; teardown de falha ignora erros de limpeza para preservar causa original ({ cause }) |
