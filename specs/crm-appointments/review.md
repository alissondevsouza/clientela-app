---
feature: Agenda de compromissos
phase: qa
round: 4 (incremento pós-QA — cadastro rápido de pessoa)
veredito: APROVADO
reviewed: 2026-08-06
---

# Review — incremento pós-QA (RF-23 / RF-24 / RF-25)

## Resumo

O CRÍTICO da rodada 3 está **realmente corrigido**, e não apenas mudado de lugar. Reproduzi o
gate do zero (`next build` + standalone servido, Postgres de dev migrado, sessão real no
navegador): o `server-reference-manifest` das duas páginas da agenda passou de **8 → 22 ids**, e
**todas** as Server Actions da agenda respondem em produção — busca de pessoa, cadastro rápido
como cliente, cadastro rápido como lead, criação, conflitos, transição de status, vínculo de
venda e conversão de lead. Nenhuma resposta ≥400 saiu do web durante a sessão de teste, e nenhum
`404 Server action not found`.

A correção é um Server Action **próprio** do módulo (`quickCreateClientAction`) que delega ao de
`orders/actions.ts`. Isso é o que registra o id no manifest da rota — confirmado tanto pela
contagem quanto pelo comportamento (o cadastro rápido de cliente criou a cliente no banco e
vinculou ao compromisso).

Os dois ALERTAS de cobertura da rodada 3 foram fechados com testes reais (não teatro): a regra do
RF-25 saiu do RSC para `lib/appointment-lead-conversion.ts` com os 4 ramos cobertos, e o gatilho do
RF-23 saiu do componente para `lib/appointment-person-search.ts` com 6 casos. Backend do RF-24
segue correto e a captura pública da landing continua funcionando **sem token** — verificada no
navegador (contexto sem cookie) e por `curl`.

Sem CRÍTICO em aberto. Restam 1 ALERTA de processo e 4 SUGESTÕES, todas não bloqueantes.

## Arquivos revisados (incremento)

- `apps/web/src/app/(crm)/crm/appointments/actions.ts` (wrapper `quickCreateClientAction`,
  `quickCreateLeadAction`, `convertAppointmentLeadAction`)
- `apps/web/src/app/(crm)/crm/appointments/[id]/page.tsx` · `new/page.tsx`
- `apps/web/src/components/appointments/person-select.tsx` · `appointment-actions.tsx`
- `apps/web/src/lib/appointment-lead-conversion.ts` (+ `.test.ts`) — **novo**
- `apps/web/src/lib/appointment-person-search.ts` (+ `.test.ts`) — **novo**
- `apps/web/src/lib/leads-api.ts` (+ `.test.ts`) — `createLead`, `getLead`
- `apps/api/src/modules/leads/leads-crm.routes.ts` · `leads.service.ts` · `leads.repository.ts`
  (+ `leads.service.test.ts`, `leads-crm.integration.test.ts`)
- `apps/api/src/plugins/auth-guard.ts` (allowlist — conferida, inalterada)
- `packages/shared/src/leads.ts` (+ `leads.test.ts`)
- `project-memory/decisions/0020-crm-created-lead-consent.md` · `lessons.md` ·
  `known-issues.md` · `decisions/README.md`

## Problemas

### [ALERTA] repositório inteiro — nenhum gate automatizado impede a regressão do reexport de Server Action

- **O quê**: o defeito da rodada 3 (reexport apagando o manifest) continua **indetectável** por
  `lint`, `typecheck`, 1119 testes e `next build`. O que impede a volta hoje é (a) o comentário de
  17 linhas em `actions.ts:50-66` e (b) a lesson de 2026-08-06. Nenhum dos dois falha um pipeline.
- **Por que importa**: a classe do bug é silenciosa, mora só no artefato de produção (`output:
  "standalone"` → `apps/web/Dockerfile` → VPS), e o custo de reincidir é a feature inteira ficar
  somente-leitura em produção. `testing.md` exige que invariante de domínio protegida tenha teste;
  aqui a invariante é de build, e está desprotegida.
- **Como corrigir** (não bloqueante, cabe num item de roadmap): um teste de nó rodando após o
  build que lê `.next/server/server-reference-manifest.json` e assere que cada rota `(crm)` com
  módulo `actions.ts` tem **pelo menos** N ids, ou um lint check proibindo
  `export { … } from "…/actions"` em arquivo `"use server"`. O segundo é barato e determinístico.

### [SUGESTÃO] `apps/web/src/lib/appointment-lead-conversion.ts:4,22` — status do lead entra como `string`, sem ligação de tipo com `packages/shared`

`CONVERTIBLE_LEAD_STATUSES = new Set<string>(["new","contacted"])` e o parâmetro
`leadStatus: string | null` aceitam qualquer texto. O call site já passa um `LeadStatus`
(`leadStatusResult.lead.status`), então tipar `Set<LeadStatus>` / `leadStatus: LeadStatus | null`
não custa nada e faz um rename futuro no enum compartilhado quebrar em compile time, em vez de
silenciosamente sumir com o botão. `core.md` pede union types em vez de string solta.

### [SUGESTÃO] `apps/api/src/modules/leads/leads.service.ts` (`createManual`) — insert + select onde caberia `RETURNING` (carregada da rodada 3, não endereçada)

`repository.insert` devolve só `{ id }` e o service faz `findById` logo depois, com
`throw new Error(...)` genérico para o caso impossível — dois round-trips e um caminho de erro que
vira 500 sem código de domínio. Uma porta `insertReturning`/`create` devolvendo o `CrmLead`
elimina os dois.

### [SUGESTÃO] `apps/web/src/components/appointments/person-select.tsx` — mini-form perde o WhatsApp digitado se o termo de busca mudar

`canOfferQuickCreate` vira `false` assim que a busca entra em `loading`, o que **desmonta**
`QuickCreatePersonForm`. Se a consultora já digitou o WhatsApp e volta ao campo de busca para
corrigir um typo do nome, o WhatsApp se perde (o `useEffect` novo sincroniza o Nome, mas o
componente é remontado). Elevar o estado do mini-form para o `PersonSelect` resolveria.

### [SUGESTÃO] duplicidade de pessoa no cadastro rápido (carregada da rodada 3)

Nada impede criar dois leads/clientes com o mesmo WhatsApp pelo cadastro rápido. Fora do escopo do
RF-23, mas é o caminho natural para poluir a base — vale um item de roadmap.

## Testes

- **Suíte**: 65 arquivos, **1119 testes, 0 falhas** (rodada 3: 1106 — +13).
- **Testes novos são reais, não teatro**:
  - `appointment-lead-conversion.test.ts` (7 casos) cobre os **4 ramos negativos** que o RF-25
    exige (compromisso com cliente mesmo tendo `leadId` — estado pós-RF-12; sem pessoa; lead
    `converted`; lead `discarded`), os **2 positivos** (`new`, `contacted`) devolvendo o `leadId`,
    e o fail-closed de `leadStatus === null`. Cada caso tem assert de valor, não `toBeTruthy`.
    Confirmei que a page **consome** o helper (`[id]/page.tsx:160`) — não há cópia da regra inline.
  - `appointment-person-search.test.ts` (6 casos) cobre termo vazio, termo só com espaços,
    `loading`, `error`, `idle` com resultados e `idle` sem resultados. `person-select.tsx:485`
    consome o helper. Cobre o gatilho, não a interação completa (declarado como pendência de E2E).
- **RF-24 — muito bem coberto** (`leads-crm.integration.test.ts`, contra Postgres real e contra o
  app **composto**): 201 autenticado com `source=crm_manual`/`status=new`/`consentAt` conferido no
  banco; **401 sem token com contagem 0 no banco**; 422 pt-BR de WhatsApp e de nome; distinção pelo
  `source` na listagem; e um bloco de **regressão da rota pública** (honeypot 201-sem-persistir,
  rate limit por IP → 429, `source` default `landing`). `leads.service.test.ts` prova o
  `consentAt` vindo do **clock injetado** (`FIXED_NOW`). `GET /leads/:id` (novo, usado pelo RF-25)
  tem 200/404-inexistente/404-malformado/401.
- **RF-23** — coberto no client tipado (`leads-api.test.ts`: URL `/leads/manual`, Bearer, corpo
  validado, não emite request com input inválido), nos schemas compartilhados e no gatilho de UI.
  A composição completa (digitar → cadastrar → vincular) foi verificada em **runtime de produção**,
  não por teste automatizado — pendência de E2E, declarada, não simulada.
- **RF-25** — regra coberta por unidade; efeito ponta-a-ponta (converter → `client_id` populado com
  `lead_id` preservado, lead vira `converted`) verificado **no banco** em runtime.
- **Lacuna estrutural** (ver ALERTA): nenhum teste exercita Server Action sobre build de produção.

## Conformidade

| Regra | Situação |
|---|---|
| `api.md` camadas routes→service→repository | ✔ rota valida com Zod e delega; `createManual`/`getById` no service; repository só executa |
| DI por construtor / composition root | ✔ `clock` injetado; nenhum singleton novo |
| Zod em toda fronteira | ✔ `createLeadCrmSchema` na rota, na Server Action, no client tipado e nos dois botões do mini-form |
| Paginação em listagem | ✔ `leadsListQuerySchema` (search combina com page/perPage) |
| Dinheiro em centavos | n/a no incremento (`saleTotalCents` inalterado) |
| Transação em multi-passo | ✔ RF-12 propaga a agenda no mesmo `db.transaction` da conversão |
| `security.md` — rota autenticada por padrão | ✔ `/leads/manual` e `/leads/:id` fora de `DEFAULT_PUBLIC_ROUTES`; 401 provado em teste **e** em runtime |
| `security.md` — allowlist pública inalterada | ✔ só `/health`, `POST /leads`, `POST /auth/login` |
| `security.md` — PII em log | ✔ grep por nomes/números do teste em `api.log`/`web.log` → zero |
| LGPD — resposta mínima ao client | ✔ actions devolvem `{ id, name }`; o `CrmLead` completo (com WhatsApp) fica no RSC, só o `status` atravessa |
| ADR-0020 (`consent_at` + `source`) | ✔ conferido no banco em runtime (`crm_manual`, `consent_at` não nulo) |
| `database.md` — migração/índices | n/a (o incremento não mexe em schema) |
| `web.md` — Server Components por padrão | ✔ RSC busca; `"use client"` só no seletor e nas ações |
| `web.md` — estados loading/vazio/erro | ✔ e **alcançáveis em produção** (verificado: "Buscando…", "Nenhum resultado encontrado.", erro com `role="alert"`) |
| `web.md` — schemas de `packages/shared` no form | ✔ `createClientSchema` / `createLeadCrmSchema` antes de qualquer chamada |
| `web.md` — mobile-first | ✔ exercitado a 375px; alvos `h-11` no mini-form e nos botões |
| `core.md` — sem `any`/`as`/`!` | ✔ (typecheck limpo com `noUncheckedIndexedAccess`); ver SUGESTÃO sobre `Set<string>` |
| `testing.md` — critérios de aceite cobertos | ✔ RF-23/24/25 cobertos por teste executável (com a fatia de UI declarada como pendência de E2E) |
| ADR-0006 — git só do humano | ✔ nenhuma operação git de escrita nesta rodada |

## Veredito

**APROVADO** — lint, typecheck, 1119 testes e build limpos; CRÍTICO da rodada 3 reproduzido como
**corrigido** no artefato de produção (manifest 8 → 22, todas as ações respondendo, efeitos
confirmados no banco); captura pública da landing intacta sem token; critérios de aceite do RF-23,
RF-24 e RF-25 atendidos; nenhum CRÍTICO em aberto.

Pendências para o handoff: 1 ALERTA (falta de gate automatizado contra a regressão do reexport de
Server Action) e 4 SUGESTÕES (tipagem do status do lead, `RETURNING` no `createManual`, estado do
mini-form, duplicidade de pessoa) — nenhuma bloqueia a entrega.
