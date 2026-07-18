---
feature: crm-clients
phase: review
status: done
reviewer: qa-adversarial (neutro)
created: 2026-07-18
updated: 2026-07-18
---

# Review: crm-clients

## Veredito: **APROVADO** (nenhum CRÍTICO; 2 ALERTAs e 3 SUGESTÕES abaixo, corrigíveis em follow-up)

Suíte 279/279 verde (unidade + integração Testcontainers), lint/typecheck/build ok, os 9 itens do checklist de runtime executados de fato (validate.md). Testes adversariais extras (cross-tenant em runtime, mass-assignment de `consultantId`, traversal de id, wildcard de busca) não encontraram falha de segurança.

## Arquivos revisados

Todo o escopo de tasks.md: shared (`whatsapp-validation`, `pagination`, `clients` + testes, `index`, `leads`), api (`db/schema/clients`, migração 0002, `modules/clients/*`, `plugins/error-handler`, `app`, `index`, testes de integração), web (`lib/clients-api`, `lib/format`, `lib/whatsapp` + testes, rotas `(crm)/crm/clients/**`, `components/clients/*`, `components/crm/{crm-nav,crm-header}`).

## Problemas

### CRÍTICO

Nenhum.

### ALERTA

1. **`apps/api/src/modules/clients/clients.repository.ts:32-45` — wildcards de LIKE não escapados na busca.** `buildSearchCondition` interpola o termo cru em `%${search}%`: `?search=%` retorna TODAS as clientes (verificado em runtime: total=25) e `?search=_` casa qualquer caractere. Sem risco de SQL injection (Drizzle parametriza) e escopado à própria consultora, mas é bug de correção: buscar um literal `%`/`_` (ex.: apelido, anotação "100%") devolve resultado errado, e um nome contendo `_` não é buscável literalmente. — **Como corrigir:** escapar `\`, `%` e `_` no termo antes de montar o pattern (ex.: `search.replace(/[\\%_]/g, "\\$&")`), cobrindo com teste de integração (termo `%` ⇒ total 0 quando nenhum nome contém `%` literal).
2. **`apps/web/src/app/(crm)/crm/clients/page.tsx:83-105` — página além do fim mostra o vazio de "primeira cliente".** Com 25 clientes, `?page=99` (sem `search`) cai em `isEmpty && !search` e renderiza "Nenhuma cliente cadastrada ainda" + CTA de cadastro (verificado em runtime) — estado enganoso, alcançável ao excluir o último item da última página e recarregar, ou por URL manual. — **Como corrigir:** quando `total > 0` e `page > totalPages`, redirecionar/clampar para a última página (ou distinguir o estado "página fora do intervalo" com link de volta).

### SUGESTÃO

1. **`apps/web/src/lib/clients-api.ts:150,226,255` — `id` interpolado no path sem `encodeURIComponent`.** Hoje é seguro (testado: id com `..%2F` termina em 404 pela regex uuid da API; token é o da própria sessão), mas encodar o segmento é hardening barato contra surpresa futura de normalização de URL do fetch.
2. **`apps/api/src/modules/clients/clients.service.ts:46-47` — ordem do spread em `insert({ consultantId, ...input })`.** Se `input` algum dia carregar uma chave `consultantId` (schema com passthrough, refactor de contrato), ela SOBRESCREVERIA o escopo da sessão silenciosamente. Hoje o Zod faz strip (mass-assignment testado em runtime: linha criada com o consultant da sessão), mas inverter para `{ ...input, consultantId }` elimina a classe de bug.
3. **`apps/api/src/modules/clients/clients.repository.ts:113` — ordenação `asc(name)` dependente de collation.** No Postgres do dev (collation C), "ana beatriz" ordena DEPOIS de "Maria Silva"/"Cláudia Souza" (case-sensitive; verificado na paginação de runtime). Para lista de pessoas, considerar `lower(name)` (ou collation `pt-BR` na coluna) para ordenação intuitiva.

## Cobertura dos Critérios de Aceite (spec.md)

| Critério | Status | Evidência |
|---|---|---|
| RF-01 tabela/FK+índice/nullabilidade (integração) | ✅ | `clients-table.integration.test.ts` (9 testes: defaults, nullables, ida-e-volta birthday, NOT NULLs, FK inválida, cascade, índice) + `\d clients` em runtime |
| RF-02 schemas shared (mín. válido, name curto/ausente incl. `{}`, whatsapp pt-BR, birthday futuro, perPage>100⇒422) | ✅ | `clients.test.ts` + `pagination.test.ts`; runtime confirma 422 pt-BR |
| RF-03 fluxo CRUD + busca + paginação (integração) | ✅ | `clients.integration.test.ts` "fluxo CRUD…", "paginação", "busca" (18 testes) |
| RF-04 escopo por consultora, 404 não-vaza (integração) | ✅ | "escopo multi-consultora": lista, GET/PATCH/DELETE de B com sessão A ⇒ 404 idêntico; reproduzido em runtime + mass-assignment negado |
| RF-05 404 pt-BR / id malformado⇒404 / 422 pt-BR / 401 / null limpa / ausente não altera | ✅ | Integração cobre todos; runtime confirma cada um |
| RF-06..08 helpers unidade + QA runtime | ✅ | `clients-api.test.ts` (URLs/Bearer/erros), `format.test.ts` (`formatDateBr`), `whatsapp.test.ts` (`toWaPhone` 10–15 díg.); checklist 9/9 em validate.md; `wa.me/5511912345678` conferido |
| RF-09 datas dd/mm/aaaa, pt-BR, a11y | ✅ | Runtime (25/03/1990); labels/aria-label/`role="alert"` por inspeção de código |
| RF-10 LGPD/logs | ✅ | Grep dos logs limpo; error-handler loga só requestId/code/path/nome da classe |
| RF-11 role="list" + Sair ≥44px | ✅ | DOM renderizado: `role="list"` ×2; `h-11 md:h-7` |

## Conformidade com rules

- **api.md**: camadas routes→service→repository respeitadas (service não importa Elysia; repository sem regra de negócio); factories com deps injetadas no composition root; validação Zod de body/query na fronteira via schemas de `packages/shared`; erros de domínio mapeados no error-handler central; rotas autenticadas (guard default-deny + revalidação na rota para identidade); paginação com default 20/máx 100. ✅
- **database.md**: migração versionada (`0002_clear_yellowjacket.sql`, aditiva); uuid v7 default no banco; timestamptz created/updated; FK com constraint + índice explícito; nullable consciente; sem N+1 (listagem sem relações; 2 queries: página + count); dinheiro n.a. ✅
- **web.md**: Server Components por padrão ("use client" só em form/delete-button/error boundaries — folhas); fetch no servidor com Bearer do cookie; mutações via Server Actions + `revalidatePath`; estados loading/vazio/vazio-de-busca/erro/not-found presentes; mobile-first (alvos h-11/size-11, grid 1 coluna); RHF + schema compartilhado; pt-BR. ✅
- **core.md**: sem `any`/`as`/`!`; named exports (default só onde o Next exige); constantes nomeadas; erros de domínio como classes; contrato único em shared (regra de whatsapp extraída — testes de leads seguem verdes, sem regressão: 279 testes incluem a suíte de leads intacta). ✅
- **testing.md**: comportamento (HTTP → resposta/efeito), fakes por injeção (sem vi.mock), Testcontainers com Postgres real + migrações reais, edge cases (vazio, zero, limite, escopo, id malformado, null-vs-ausente). ✅
- **security.md**: nenhuma rota nova pública (allowlist inalterada); nenhum segredo em código; PII fora de logs; SQL só via Drizzle; erro ao cliente sem internals. ✅
- **ADRs**: 0012 (identidade via `validateSession`, padrão /auth/me) seguido; 0006 respeitado (nenhum git de escrita nesta revisão). ✅

## Observações

- Confirmação de exclusão e interações RHF não são exercitáveis sem E2E (REL-01) — validadas por inspeção + unidade; pendência já registrada no plan/handoff.
- Restrição conhecida do spec segue de pé para o CRM-06: DELETE físico × futuro histórico de vendas (pendência de graduação).
- Dupla validação de sessão por request (guard + rota) é custo aceito e registrado no plan.
