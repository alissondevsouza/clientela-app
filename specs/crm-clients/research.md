---
feature: crm-clients
module: api, web, shared
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: crm-clients

> Contexto herdado dos ciclos crm-auth e crm-layout (mesma sessão, 2026-07-17); padrões verificados no working tree.

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/modules/leads/*` e `modules/auth/*` | Padrão canônico de módulo (factories `create*`, porta mínima no service, repository único no db) — replicar em `modules/clients` |
| `apps/api/src/plugins/auth-guard.ts` | Guard default-deny já cobre rotas novas automaticamente (nada a fazer para autenticar `/clients`) |
| `apps/api/src/modules/auth/auth.service.ts` | `validateSession(token)` → consultora da sessão; rotas de clients precisam do consultant_id da sessão (o guard valida mas não injeta contexto — rotas revalidam via service, padrão do /auth/me) |
| `apps/api/src/plugins/error-handler.ts` | Mapear `ClientNotFoundError` → 404 (novo branch, padrão dos erros de auth) |
| `apps/api/src/db/schema/{consultants,sessions,leads}.ts` | Convenções de schema; `consultants` para a FK |
| `apps/api/test/helpers/pg-container.ts` + `auth.integration.test.ts` | Padrão de integração com sessão real (semear consultora + login p/ obter token) |
| `packages/shared/src/{leads,auth,api}.ts` | Padrão de contrato (schemas + variantes + pt-BR incl. campo ausente); validação de whatsapp existente no lead (reusar regra) |
| `apps/web/src/lib/{auth,submit-lead,whatsapp}.ts` | Helpers puros com deps injetadas; `buildWhatsAppUrl` (LP-04) para o botão de conversa |
| `apps/web/src/app/(crm)/*` | Shell/guard prontos (CRM-02); pages de seção como RSC; `fetchSession` no layout |
| `apps/web/src/components/{crm,ui}/` | shadcn: button, card, checkbox, input, label, textarea; nav com ULs a retocar (RF-11) |
| `apps/web/src/components/landing/lead-form.tsx` | Padrão RHF + zodResolver + estados |

## Padrões do Codebase a Seguir

- API: rotas validam com schema shared na fronteira; service com portas; repository Drizzle; paginação a definir em shared (novo — não existe listagem paginada ainda no projeto).
- Web: RSC busca no servidor com Bearer do cookie (novo padrão a criar: helper que lê cookie + chama API — análogo ao guard do layout); mutações via Server Actions + `revalidatePath`; dinheiro/datas formatados no front (`Intl`).
- Testes: unidade com fakes; integração com Testcontainers + sessão real (login antes); factories/helpers de semeadura.

## Schemas e Tipos Relevantes

- Novo: `clients` (Drizzle), `createClientSchema`/`updateClientSchema`/`clientSchema` + `paginatedSchema` genérico (shared).
- Reusar: validação de whatsapp do `createLeadSchema` (extrair/duplicar a regra com fonte única — checar como está definida), `apiErrorSchema`.

## Dependências Entre Packages

shared ← api (fronteira + db) e ← web (RHF + api-client). Web fala com API server-side com Bearer (cookie → header), padrão já provado no `fetchSession`.

## Gaps Identificados

- Não existe listagem paginada em nenhum módulo (contrato novo de paginação nasce aqui).
- Não existe helper genérico de fetch autenticado no web (nasce aqui, em `lib/`).
- Rotas de clients precisam da identidade da sessão: revalidação no handler (padrão /auth/me) — ou o service de clients recebe o consultantId resolvido pela rota.
- `date` (sem hora) é tipo novo no schema Drizzle do projeto (birthday) — atenção ao mapeamento string/Date do driver.

## Referências Externas

- Rules: `api.md` (paginação obrigatória, camadas), `database.md`, `web.md` (estados obrigatórios, mobile-first), `security.md` (LGPD, logs), `testing.md`.
- ADR-0012 (auth/guard), ADR-0008 (web único cliente da API).
- Lessons: Zod v4 campo ausente; Elysia lifecycle; `Bun.password`×Vitest (irrelevante aqui — sem hasher).
