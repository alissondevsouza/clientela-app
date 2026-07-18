---
feature: leads-capture-api
module: api, shared
phase: plan
status: draft
created: 2026-07-16
updated: 2026-07-16
depends_on: [spec.md, research.md]
---

# Plan: Módulo `leads` da API

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `leadCaptureRequestSchema` em shared = `createLeadSchema.extend({ website: z.string().optional() })` | Honeypot faz parte do contrato HTTP público, mas `createLeadSchema` continua puro para o formulário (LP-06); um só ponto de verdade, extensão explícita |
| Honeypot responde 201 com `crypto.randomUUID()` sintético, sem persistir | Não revelar a detecção a bots; `crypto.randomUUID` existe em Bun e Node. Detecção no service (regra de negócio testável), não na rota |
| Rate limiter próprio: janela fixa por IP em `Map`, clock injetado, GC de entradas expiradas a cada verificação | Sem dep nova (`core.md`); instância única (ADR-0003) dispensa Redis; clock injetável = teste determinístico sem relógio real (`testing.md`) |
| Limites como constantes nomeadas: `RATE_LIMIT_MAX_REQUESTS = 5`, `RATE_LIMIT_WINDOW_MS = 60_000` | Sem magic numbers; env só quando houver necessidade real de variar por ambiente |
| IP: primeiro item de `x-forwarded-for`; fallback `server.requestIP`; sem IP resolvível → trata como IP único `"unknown"` (ainda rate-limitado) | Produção fica atrás do Caddy (header confiável); fail-closed: ausência de IP não desliga o limite |
| Error handler central via `onError` de um plugin `error-handler` com `as("global")` | `api.md`: mapeamento central, sem try/catch por rota; validação (422), NOT_FOUND (404), demais → 500 genérico + log completo só no servidor |
| Log de erro: apenas `code`, rota e id — nunca body/nome/whatsapp | LGPD (`security.md`): dado pessoal não entra em log |
| Service recebe `{ repository, clock, generateId }` por parâmetro de factory | `api.md`: injeção explícita; unidade testa com fakes, sem `vi.mock` |
| Repository devolve apenas `{ id }` do insert (`returning({ id })`) | Resposta não ecoa dados pessoais; menos superfície de vazamento |
| `truncateAll()` no pg-container via `TRUNCATE` de todas as tabelas do schema public (exceto `__drizzle_migrations`) | Limpeza genérica: LP-02+ e Fase 2 reutilizam sem manutenção por tabela |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/api.ts` | Envelope de erro compartilhado: `apiErrorSchema` / `type ApiError` |
| `apps/api/src/plugins/error-handler.ts` | Plugin Elysia global: mapeia validação/404/500 para envelope pt-BR |
| `apps/api/src/plugins/rate-limit.ts` | Factory `createRateLimiter({ max, windowMs, clock })` + plugin/guard por IP |
| `apps/api/src/plugins/rate-limit.test.ts` | Unidade: dentro/fora da janela, expiração, IPs independentes, GC |
| `apps/api/src/modules/leads/leads.repository.ts` | `createLeadsRepository(db)` — insert retornando `{ id }` |
| `apps/api/src/modules/leads/leads.service.ts` | `createLeadsService({ repository, clock, generateId })` — consent_at, honeypot |
| `apps/api/src/modules/leads/leads.service.test.ts` | Unidade com fakes: persistência, honeypot, consent_at, propagação de erro |
| `apps/api/src/modules/leads/leads.routes.ts` | `createLeadsRoutes({ service, rateLimiter })` — POST /leads validado com schema shared |
| `apps/api/src/modules/leads/leads.integration.test.ts` | Testcontainers: RF-02..RF-06 fim-a-fim via `app.handle` |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/leads.ts` | + `leadCaptureRequestSchema` (extend honeypot) e `type LeadCaptureResponse = { id: string }` |
| `packages/shared/src/index.ts` | Re-exports novos |
| `packages/shared/src/leads.test.ts` | Casos do schema estendido (website opcional/preenchido) |
| `apps/api/src/app.ts` | `createApp(deps)` monta error-handler + rotas leads (deps opcionais para manter `/health` standalone? Não — deps obrigatórias; ver tasks) |
| `apps/api/src/app.test.ts` | Ajustar construção do app com fakes mínimos |
| `apps/api/src/index.ts` | Composition root: env → createDb → repository → service → rateLimiter → createApp |
| `apps/api/test/helpers/pg-container.ts` | + `truncateAll()`; try/catch com teardown e erro amigável sem Docker (fecha known-issue) |
| `project-memory/known-issues.md` | Marcar item do helper como resolvido (na Phase 5) |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | sim | Regra de negócio nova: service (consent_at, honeypot) e rate limiter (janela/expiração) com fakes/clock injetado |
| Integração (Testcontainers) | **sim** | Contrato de API novo + captura de lead é regra de negócio central (critérios mandatórios de `spec-format.md`) |
| E2E | pendência (sem infra) | Fluxo crítico de UI só existirá no LP-06; registrar pendência no handoff (known-issue já existe) |
| Regressão (se BUG-NNN) | n.a. | Não é bug |

Testes derivam do `spec.md` (RF-02..RF-06, RF-08/09), nunca do diff.

## Migração de Banco

n.a. — tabela `leads` já existe (LP-01); nenhum schema change.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| `app.handle()` em teste não tem socket → IP indefinido | alta | Testes enviam `x-forwarded-for`; caminho sem IP coberto por unidade (`"unknown"`) |
| Envelope de validação do Elysia difere do desenhado | média | Error handler intercepta `ValidationError` e reescreve para `{ error: { code, message } }`; integração prova o formato |
| Rate limiter global vazando entre testes de integração | média | Limiter instanciado por app (factory), nunca módulo-singleton; cada teste monta app próprio |
| Mensagens Zod do schema shared em pt-BR não propagadas pelo Elysia | média | Error handler extrai a primeira issue do Zod e a expõe como `message` |

## Definition of Done
- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos
- [ ] `bun run test` verde (unidade + integração com Docker)
- [ ] API sobe e responde `/health` e `POST /leads` de verdade (skill `verify` na QA)
- [ ] Conformidade com `.claude/rules/*` e ADRs (0003, 0006, 0007)
