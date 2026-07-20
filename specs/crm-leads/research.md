---
feature: crm-leads
module: api, web, shared
phase: research
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md]
---

# Research: crm-leads

> Contexto herdado dos ciclos CRM-01..03 (mesma sequência de sessões); premissas verificadas no working tree pós-commit `34994a9`.

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/db/schema/leads.ts` | Tabela existente: name, whatsapp, interest (nullable), source, `status` text + CHECK com `leadStatusValues` (`new/contacted/converted/discarded` — enum JÁ existe), consent_at. Ganha `client_id` FK nullable |
| `apps/api/src/modules/leads/leads.routes.ts` | Guard `onRequest` com `matchesLeadsPath` — **cobre qualquer método** (known-issue a corrigir: restringir a POST + path exato) + rota pública `POST /leads` |
| `apps/api/src/modules/leads/{leads.service,leads.repository}.ts` | Factories existentes (insert do lead público); ganham list/updateStatus/convert |
| `apps/api/src/modules/clients/*` | Padrão de rotas autenticadas com `resolveConsultantId` (validateSession), `requireValidId` (uuid ⇒ 404), paginação; `createClientsService.create` para a conversão? — **decisão**: conversão via transação no repository de leads (cross-módulo por service injetado vs transação única — ver plan) |
| `apps/api/src/plugins/error-handler.ts` | Ganha branch 409 (novo status HTTP no envelope) |
| `apps/api/src/modules/clients/clients.integration.test.ts` | Padrão de integração com sessão real (scrypt na porta hasher) |
| `packages/shared/src/leads.ts` | `leadStatusValues`/schemas públicos de captura — NÃO mudar contrato público; adicionar schemas de CRM |
| `packages/shared/src/{pagination,clients}.ts` | `paginated()`, `clientSchema` (resposta do convert) |
| `apps/web/src/app/(crm)/crm/leads/page.tsx` | Placeholder do CRM-02 a substituir |
| `apps/web/src/app/(crm)/crm/clients/*` + `components/clients/*` | Padrões de listagem/estados/actions/confirmação em 2 passos (delete-client-button → modelo do convert-button) |
| `apps/web/src/lib/{clients-api,whatsapp,format}.ts` | Padrão de api-helper; `toWaPhone`; `formatDateBr` |

## Padrões do Codebase a Seguir

- Rotas autenticadas: extração de Bearer + `authService.validateSession` (padrão clients); uuid inválido ⇒ 404; erros de domínio em classes mapeadas no error-handler central.
- Multi-passo atômico = `db.transaction` (database.md) — a conversão é o primeiro caso real do projeto.
- Web: RSC + Server Actions + revalidatePath; estados obrigatórios; confirmação em 2 passos (padrão delete-client-button).

## Schemas e Tipos Relevantes

- Novo: `crmLeadSchema` (resposta), `leadsListQuerySchema`, `updateLeadStatusSchema`; migração `0003` (client_id).
- Reusar: `leadStatusValues` (já em shared), `paginated`, `clientSchema`, `apiErrorSchema`.

## Dependências Entre Packages

shared ← api ← web (mesmo desenho dos ciclos anteriores). A conversão devolve `clientSchema` — o web redireciona para `/crm/clients/[id]`.

## Gaps Identificados

- Nenhuma rota autenticada no módulo leads; service/repository só têm o insert público.
- Guard de rate limit com escopo largo (known-issue com plano "revisitar no CRM-04").
- Não há 409 no error-handler nem erro de domínio de "transição inválida".
- Leads sem `consultant_id` (drift vs domínio `Lead N—1 Consultant`) — decisão de manter global registrada no spec (RF-06).
- Não existe transação em nenhum repository ainda (primeira `db.transaction` do projeto).

## Referências Externas

- Rules: api.md (camadas, paginação), database.md (transação, FK+índice), web.md, security.md, testing.md.
- ADR-0012 (sessão); lessons: Elysia 204/`onRequest` global/`Bun.password`×Vitest.
- Known-issue: "Rate limit do endpoint público cobre qualquer método em `/leads`" (fecha neste ciclo).
