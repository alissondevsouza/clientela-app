---
feature: crm-leads
module: api, web, shared
phase: plan
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md, research.md]
---

# Plan: crm-leads

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `leads.client_id` FK nullable `ON DELETE SET NULL` + índice | Lead é histórico de captação: sobrevive à exclusão da cliente (LGPD apaga a cliente; o lead perde só o vínculo). Índice por `database.md` |
| Conversão como **transação no repository de leads** (`db.transaction`: insert em `clients` + update do lead), sem chamar o service de clients | Atomicidade exige uma transação única; o service de clients não expõe transação (e `api.md` manda usar service de outro módulo por injeção — porém aqui a operação é UMA unidade atômica de domínio do funil; o insert reusa o schema Drizzle de `clients`, não internals do módulo). Registrar o trade-off; revisitar se surgir 2º caso |
| Guard público de leads: rate limit passa a casar **método POST + path exato `/leads`** (normalizado) | Fecha o known-issue; rotas autenticadas (`GET /leads`, `PATCH /leads/:id/status`, `POST /leads/:id/convert`) fora do bucket de visitante |
| Rotas autenticadas no MESMO módulo leads (`createLeadsCrmRoutes({ service, authService })` separado das públicas) | Coesão de domínio; separação pública×autenticada explícita no composition root |
| Erros de domínio novos: `LeadNotFoundError` → 404; `LeadAlreadyConvertedError` → **409** (`LEAD_ALREADY_CONVERTED`) — usado tanto no PATCH em lead convertido quanto no convert repetido | Padrão de classes nomeadas; erro de transição separado seria redundante (único 409 alcançável é "já convertido") — revisão de spec |
| Guarda de corrida da conversão DENTRO da transação: update condicional `WHERE id = $1 AND status <> 'converted'`; `rowCount = 0` ⇒ rollback + `LeadAlreadyConvertedError` | Invariante `Lead 1—0..1 Client` sob concorrência (testing.md); checagem só no service seria TOCTOU |
| Service compõe o payload da cliente; `repository.convert(insertClient, leadId)` só executa a transação | api.md: repository sem regra de negócio (prefixo do interesse/consultant é regra do service) |
| `leadStatusValues`/`LeadStatus` movem para `packages/shared`; `db/schema/leads.ts` importa de shared | Web precisa do enum (filtro/labels) e não pode importar de `db/`; literal único (core.md) |
| PATCH de status: schema só aceita `new`/`contacted`/`discarded` (união sem `converted`); qualquer transição entre esses três é permitida; sair de `converted` é proibido (409) | Funil simples para usuária única (re-engajar descartado é legítimo); `converted` só via convert (invariante do vínculo) |
| Ordenação da lista: `created_at desc, id desc` | Leads novos primeiro; desempate determinístico |
| Interesse do lead → `clients.notes` com prefixo `"Interesse (lead): "` | Não perde a informação de captação sem criar campo novo |
| Leads sem dono nesta fase (RF-06) | Captura pública não conhece consultora; usuária única. Drift vs `Lead N—1 Consultant` registrado — resolver junto com multi-tenant |
| Web: `lib/leads-api.ts` (helpers puros: `listLeads`, `updateLeadStatus`, `convertLead`) + `LEAD_STATUS_LABELS` pt-BR em módulo puro testável | Padrão clients-api; labels testáveis sem DOM |
| Filtro de status na UI: links (`?status=`) estilo tabs — RSC, sem estado client | Server-first; preserva na paginação via querystring |
| Botão de conversão: confirmação em 2 passos (padrão delete-client-button) com aviso "cria cadastro de cliente" | Ação com efeito permanente no funil |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `apps/api/drizzle/0003_*.sql` | Migração `client_id` (gerada) |
| `apps/api/src/modules/leads/leads-crm.routes.ts` | Rotas autenticadas (GET lista, PATCH status, POST convert) |
| `apps/api/src/modules/leads/leads.errors.ts` | 3 erros de domínio |
| `apps/api/src/modules/leads/leads-crm.integration.test.ts` | Integração das rotas novas + escopo do rate limit + transação |
| `apps/web/src/lib/leads-api.ts` (+ teste) | Helpers puros |
| `apps/web/src/components/leads/lead-card.tsx` | Card com badge, ações, WhatsApp |
| `apps/web/src/components/leads/lead-status-badge.tsx` | Badge pt-BR (texto, não só cor) |
| `apps/web/src/components/leads/convert-lead-button.tsx` | Conversão com confirmação (client) |
| `apps/web/src/components/leads/lead-actions.tsx` | Ações de status (client, useTransition) |
| `apps/web/src/app/(crm)/crm/leads/{loading,error}.tsx` | Estados |
| `apps/web/src/app/(crm)/crm/leads/actions.ts` | Server Actions (status, convert) |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `apps/api/src/db/schema/leads.ts` | + `client_id` FK nullable set-null + índice |
| `packages/shared/src/leads.ts` | + `crmLeadSchema`, `leadsListQuerySchema`, `updateLeadStatusSchema` (contrato público de captura INTACTO) |
| `packages/shared/src/index.ts` | Reexports |
| `apps/api/src/modules/leads/leads.repository.ts` | + list (paginada/filtro/ordem), findById, updateStatus, `convert` transacional |
| `apps/api/src/modules/leads/leads.service.ts` | + regras: transições, already-converted, convert |
| `apps/api/src/modules/leads/leads.service.test.ts` | + unidade das regras novas |
| `apps/api/src/modules/leads/leads.routes.ts` | Guard: rate limit só em `POST /leads` exato |
| `apps/api/src/modules/leads/leads.integration.test.ts` | + caso: GET /leads autenticado não sofre 429 (existentes intactos) |
| `apps/api/src/plugins/error-handler.ts` | + 404/409 dos erros de leads |
| `apps/api/src/{app,index}.ts` | Compor rotas CRM de leads (deps: leadsService, authService) |
| `apps/api/src/{app.test,modules/clients/clients.integration.test,modules/auth/auth.integration.test}.ts` | Ajuste de deps do createApp se assinatura mudar |
| `apps/web/src/app/(crm)/crm/leads/page.tsx` | Substituir placeholder pela listagem |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | Regras de transição/conversão (service), schemas novos, helpers/labels do web |
| Integração (Testcontainers) | **Sim** | Muda schema (client_id), contrato (3 rotas novas + 409) e invariantes (conversão atômica com vínculo; captura de lead é regra central; escopo do rate limit) |
| E2E | **Pendência (sem infra)** | REL-01 |
| Regressão | **Sim (known-issue do guard)** | Caso de integração provando `GET /leads` autenticado sem 429 — falharia antes do fix do guard |

## Checklist de QA de runtime (validate.md)

1. Semear leads via `POST /leads` público (form da landing intacto) → aparecem em `/crm/leads` ordenados do mais novo.
2. Filtro por status funciona e é preservado na paginação; estados vazio/skeleton presentes.
3. "Marcar como contatado" e "Descartar" mudam badge sem reload manual (revalidate); lead convertido não mostra ações, mostra link da cliente.
4. Conversão: confirmação em 2 passos → redireciona ao detalhe da cliente criada (nome/whatsapp do lead; notes com interesse); lead na lista aparece "Convertido" com link da cliente; excluir a cliente → lead mostra "cliente excluída" sem link.
5. Converter de novo (via API direta) ⇒ 409; PATCH de status em convertido ⇒ 409.
6. Rajada autenticada em `GET /leads` (> 10 req) sem 429; `POST /leads` público além do limite ⇒ 429.
7. `wa.me/55…` no botão de conversa do lead.
8. Logs sem PII (grep).

## Migração de Banco

Aditiva (`ALTER TABLE leads ADD COLUMN client_id ... REFERENCES clients ON DELETE SET NULL` + índice), gerada via `drizzle-kit generate`. Sem backfill; rollback = drop da coluna.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Fix do guard regredir o rate limit público (bypass por variação de path no POST) | média | Testes existentes de trailing-slash do POST continuam + caso novo autenticado; teste adversarial no QA |
| Transação da conversão com Drizzle (primeira do projeto) — API do `db.transaction` com o driver postgres.js | baixa | Teste de integração prova commit e o caminho 409 sem efeito parcial |
| Mudança em `createApp` quebrar 3 suítes existentes | alta | Ajuste incluído nas tasks (padrão dos ciclos anteriores) |

## Definition of Done

- [ ] Critérios do spec.md atendidos e testados
- [ ] lint/typecheck/test verdes (incl. integração); build web ok
- [ ] Conformidade com rules/ADRs; known-issue do guard fechado na graduação
