---
feature: crm-leads
phase: review
status: done
created: 2026-07-18
updated: 2026-07-18
reviewer: QA adversarial (neutro — não implementou)
verdict: APROVADO
---

# Review: crm-leads (QA adversarial — rodada 1)

## Resumo

Implementação do CRM-04 revisada contra `spec.md` (RF-01..RF-09), rules e `project-memory/`. Lint/typecheck/suíte (340 testes)/build verdes; QA de runtime completo (8/8 itens do checklist do plan.md, com extras adversariais — corrida de conversão em paralelo e bypass de path no rate limit). **Nenhum achado CRÍTICO.** Invariante `Lead 1—0..1 Client` protegida por guarda transacional provada sob concorrência real; known-issue do rate limit fechável.

## Arquivos revisados

Diff completo `git diff 34994a9` (17 modificados + 12 novos): migração `0003`, `db/schema/leads.ts`, módulo `leads` (repository/service/routes públicas e CRM/errors/testes), `error-handler`, `app.ts`, `packages/shared/src/leads.ts` (+index/testes), web (`page/loading/error/actions`, `lib/leads-api.ts` + teste, `components/leads/*`), `specs/ROADMAP.md`. Suporte lido: `auth-guard`, `pagination`, `whatsapp`, `format`, `clients/page.tsx` (consistência de padrão).

## Problemas encontrados

### CRÍTICO

Nenhum.

### ALERTA

- **[ALERTA] `apps/web/src/app/(crm)/crm/leads/page.tsx:~117` (bloco `!result.ok`) — sessão expirada vira error boundary, não redirect** — porquê: se o token do cookie existir mas a sessão estiver expirada na API, `listLeads` devolve `{ok:false}` e a page lança para o `error.tsx` (“Não foi possível carregar os leads” + retry), quando o caminho correto seria reautenticar. Retry não resolve; a usuária só sai do loop navegando para `/login`. — como corrigir: tratar `401` como caso discriminado no helper (`unauthorized: true`) e `redirect(LOGIN_PATH)` na page. **Mitigante (por isso não é CRÍTICO): é o MESMO padrão já entregue em `clients/page.tsx`** — corrigir nos dois lugares em item próprio, não neste diff.

### SUGESTÃO

- **[SUGESTÃO] `apps/api/src/modules/leads/leads-crm.routes.ts:23` — 3ª cópia de `extractBearerToken`** (auth-guard, clients, agora leads) e do padrão `resolveConsultantId`. Extrair helper compartilhado (ex.: `plugins/auth-guard.ts` exportar) na próxima passada de refactor.
- **[SUGESTÃO] `apps/web/src/app/(crm)/crm/leads/page.tsx` — `?page` além do total renderiza o vazio “Nenhum lead capturado ainda”** (sem paginação para voltar). Só alcançável editando a URL à mão (lead não é excluível), mas um clamp para a última página ou o estado vazio-de-página com link “voltar” seria mais honesto.
- **[SUGESTÃO] `apps/api/src/modules/leads/leads.repository.ts:convert` — corrida rara lead-sumiu-entre-findById-e-transação responderia 409 em vez de 404** (update condicional não distingue “não existe” de “já convertido”). Hoje inalcançável (não há DELETE de lead); se exclusão de lead surgir (LGPD), re-checar dentro da transação.

## Testes

- **Suíte**: `bun run test` — 30 arquivos / **340 testes / 0 falhas** (inclui Testcontainers com Postgres real: migração 0003, FK/SET NULL/índice, rotas CRM com sessão real via login, transação de conversão, escopo do rate limit).
- **Neutralidade**: casos derivam do spec (409/404/422, ordem desc, contratos parseados com os schemas de shared), não do diff. Mensagens pt-BR assertadas por igualdade exata + guarda anti-inglês.
- **Regressão do known-issue**: caso “rajada GET sem 429” presente em dois níveis (plugin isolado em `leads.integration.test.ts` — red→green documentado na Task 1.3 — e app composto com sessão real em `leads-crm.integration.test.ts`).
- **Runtime**: ver `validate.md` — 8/8 itens, incluindo Server Actions reais (via `next-action` no build de produção), redirect 303 ao detalhe da cliente, corrida de conversão em paralelo (1×201/1×409/1 cliente) e bypass de trailing slash no POST público (continua limitado).

## Cobertura dos critérios de aceite (spec.md)

| Critério | Evidência | Status |
|---|---|---|
| RF-01 coluna/FK/índice + SET NULL | `leads-table.integration.test.ts` (5 casos novos) + `leads-crm.integration.test.ts` (delete via API) + runtime item 8 | ✅ |
| RF-02 schemas shared pt-BR (incl. `{}`; `converted` rejeitado no PATCH) | `packages/shared/src/leads.test.ts` (11 casos novos) | ✅ |
| RF-03 lista/ordem/filtro/PATCH/409/404/401 | `leads-crm.integration.test.ts` (sessão real) + unidade do service | ✅ |
| RF-04 conversão atômica, consultant da sessão, notes, 409 sem 2ª cliente | integração (contagem de clientes) + unidade + **runtime: corrida paralela** | ✅ |
| RF-05 escopo do rate limit (GET sem 429; POST público 429; honeypot intacto) | integração (2 níveis) + testes públicos pré-existentes intactos + runtime item 6 | ✅ |
| RF-07/08 web (estados, filtro, ações, conversão→detalhe, convertido→link, excluída→sem link) | unidade `leads-api.test.ts` (18) + runtime itens 1–5/7/8 | ✅ |
| RF-09 logs sem PII | error-handler (só ids/classe) + runtime grep 0 ocorrências | ✅ |

## Conformidade (rules)

- **api.md**: camadas respeitadas (routes validam e delegam; service sem Elysia; repository sem regra — a guarda `WHERE status <> 'converted'` é mecanismo de atomicidade, regra decidida no service; trade-off do insert em `clients` dentro da transação registrado no plan). DI por construtor; composition root em `app.ts`/`index.ts`; paginação com default 20/max 100; erro padronizado `{error:{code,message}}`. ✅
- **database.md**: migração versionada gerada (`0003`), FK com índice, transação para o multi-passo, sem N+1 (lista = select + count, sem relação), `limit` sempre presente. ✅
- **web.md**: RSC por padrão; `"use client"` só nas folhas (ações/confirmação); dados no servidor; mutação via Server Action + `revalidatePath`; estados loading/vazio/vazio-de-filtro/erro-retry; mobile-first (alvos h-11 no mobile, grid 1 col → 2 em sm); pt-BR; `dd/mm/aaaa`; schemas de shared nas fronteiras (page `searchParams` saneados com `.catch`, actions com Zod). ✅
- **core.md**: sem `any`/`as`/`!` no diff; erros de domínio nomeados mapeados na fronteira; named exports (default só onde o Next exige); literal único do enum em shared. ✅
- **security.md**: default-deny mantido (allowlist pública inalterada: só `POST /leads`, `POST /auth/login`, `GET /health` — provado 401 nas 3 rotas novas e 307→login no web); id `encodeURIComponent` na URL; nenhum segredo/PII em código ou log. ✅
- **testing.md**: comportamento (efeito observável), fakes explícitos sem `vi.mock`, Postgres real na integração, edge cases (vazio, inválido, corrida, duplicado). ✅
- **known-issues.md**: entrada “Rate limit do endpoint público cobre qualquer método em `/leads`” — **fechável na graduação** (fix provado em teste + runtime). Drift RF-06 (lead sem dono) a registrar na graduação, conforme spec.

## Veredito

**APROVADO** — lint/typecheck/suíte/build verdes, 7/7 critérios de aceite com evidência executável, runtime 8/8, nenhum CRÍTICO. Os 1 ALERTA (compartilhado com código pré-existente de clients) e 3 SUGESTÕES não bloqueiam: recomendo registrá-los como itens futuros na graduação.
