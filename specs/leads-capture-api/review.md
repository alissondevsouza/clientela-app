---
feature: leads-capture-api
module: api, shared
phase: review
status: done
round: 3
created: 2026-07-16
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: leads-capture-api (rodada 3 — final)

Revisor neutro e adversarial (não implementou o código; não viu o raciocínio de ninguém). Revalidação completa do zero. Arquivos revisados na íntegra:
`packages/shared/src/{leads,api,index,leads.test}.ts` ·
`apps/api/src/plugins/{error-handler,error-handler.test,rate-limit,rate-limit.test}.ts` ·
`apps/api/src/modules/leads/{leads.repository,leads.service,leads.service.test,leads.routes,leads.integration.test}.ts` ·
`apps/api/src/{app,app.test,index}.ts` · `apps/api/test/helpers/pg-container.ts`
(+ contexto: `env.ts`, `db/client.ts`, `docker-compose.dev.yml`).

## Histórico resumido das rodadas 1–2

- **Rodada 1 — REPROVADO**: 1 CRÍTICO (422 de campo ausente em inglês) + 3 ALERTAs (JSON malformado → 500; XFF usava primeiro valor, spoofável; 422 não consumia a janela do limiter) + 3 SUGESTÕES.
- **Rodada 2 — REPROVADO**: os 4 achados acionáveis da r1 corrigidos e reverificados, mas a correção do ALERTA #4 (limite movido para `onRequest` com guard por path) introduziu um **CRÍTICO novo (Problema A)**: bypass do rate limit via trailing slash `/leads/` (igualdade exata de pathname), provado em runtime com 12 inserts sem 429 no único endpoint público.

## Status do CRÍTICO da rodada 2

| # r2 | Sev | Descrição | Situação na r3 |
|---|---|---|---|
| A | CRÍTICO | Bypass do rate limit via `POST /leads/` (guard comparava pathname por igualdade exata) | **CORRIGIDO** — `matchesLeadsPath` normaliza barras finais (`/\/+$/`) antes de comparar (`leads.routes.ts:20-29`). Provado em runtime: `/leads/` → `201×5 429`, 5 linhas; e mais 8 variantes adversariais (`/leads//`, `/leads/?x=1`, `/leads?x=1`, `/leads%2F`, `/lead%73`, `//leads`, `/leads/../leads`, `/LEADS`) sem nenhum bypass — toda variante que alcança o handler é limitada; as que não casam o guard também não roteiam (404, 0 linhas). `/health` e `/leadsX` seguem fora do limite. |
| B | SUGESTÃO | Nenhum teste cobria variação de rota | **CORRIGIDO** — 2 testes de integração novos (trailing slash e query string), ambos assertando 429 + contagem exata no banco. O assert do 429 também foi endurecido para `toBe(RATE_LIMITED_MESSAGE)` (observação da r2 atendida). |

## Problemas encontrados nesta rodada

Nenhum CRÍTICO ou ALERTA novo. Sugestões (não bloqueiam):

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | (herdada da r1, #5) Honeypot é distinguível pela versão do uuid: id sintético é v4 (`crypto.randomUUID`), id persistido é v7 — um bot sofisticado detecta a diferença. Risco baixo. | `apps/api/src/index.ts:21` | Gerar id sintético também em formato v7 (ex.: `Bun.randomUUIDv7()` no composition root; testes já injetam `generateId`). |
| 2 | SUGESTÃO | O guard limita QUALQUER método em `/leads` (GET/PUT/OPTIONS consomem a janela do IP e recebem 404 depois). Fail-closed e inofensivo hoje (front chama a API server-side, sem preflight), mas quando o CRM ganhar rotas autenticadas de leads (CRM-04), este guard global por path precisará ser revisitado para não limitar/afetar as rotas internas. | `apps/api/src/modules/leads/leads.routes.ts:48-62` | Ao implementar CRM-04, restringir o guard a `request.method === "POST"` e/ou repensar o escopo (comentário no código já documenta a razão do design atual). |
| 3 | SUGESTÃO | (herdada, r1 #6 — decisão consciente) Log do 500 registra só o nome da classe do erro; diagnóstico de produção pode ficar difícil. Mantido por LGPD. | `apps/api/src/plugins/error-handler.ts:64-68` | Se necessário no futuro, logar `error.message` após sanitização — decisão para quando houver observabilidade real. |

## Conformidade

- **Camadas (api.md)**: OK — routes→service→repository unidirecional; routes não importa repository; service não importa Elysia (só tipos de `@clientela/shared`); repository é a única camada que toca o db; DI explícita por factory; instanciação única no composition root (`index.ts`).
- **Zod na fronteira / contrato em shared (RF-01)**: OK — `leadCaptureRequestSchema` de `packages/shared` usado na rota; sem duplicação; typecheck verde prova o reuso.
- **Banco (database.md)**: OK — sem mudança de schema nesta feature; insert único parametrizado via Drizzle; sem N+1; sem SQL interpolado (o `sql.unsafe` do helper de teste usa nomes do catálogo, quoteados, fora de produção).
- **Segurança/LGPD (security.md)**: OK — único endpoint público com rate limit efetivo (10 variantes de path testadas sem bypass); resposta 201 não ecoa dado pessoal (`.strict()` no teste prova); log sem PII confirmado em runtime; `.env` fora do git; sem segredo em código; erros nunca expõem stack/internals (422/400/404/429/500 todos com envelope).
- **Tipos (core.md)**: OK — sem `any`/`as`/`!`; named exports; constantes nomeadas; mensagens pt-BR.
- **Testes (testing.md)**: OK — comportamento (entrada→saída/efeito), fakes por injeção (sem `vi.mock`), clock fake no limiter, Testcontainers com migrações reais, `truncateAll()` entre casos, asserts exatos (mensagens pt-BR literais).

## Cobertura dos Critérios de Aceite

| Critério | Status | Evidência |
|---|---|---|
| RF-01 contrato em shared, reuso provado | OK | typecheck verde; rota usa schema de shared |
| RF-02 422 envelope pt-BR sem stack | OK | integração + runtime (name e consent) |
| RF-03 201 `{id}` + defaults + whatsapp normalizado | OK | integração + runtime + psql (v7, `new`, `landing`, só dígitos, `consent_at` não-nulo) |
| RF-04 honeypot não persiste; `""` persiste | OK | integração + runtime (0 linhas vs 1 linha, `interest IS NULL`) |
| RF-05 rate limit por IP, XFF último valor, antes da validação, TODAS as variantes de path | **OK** | runtime: 10 variantes sem bypass; spoof de XFF neutralizado; flood de 422 → 429; unidade: janela expira e libera |
| RF-06 500 genérico sem internals | OK | integração ("segredo interno" não vaza) + unidade do plugin |
| RF-07 camadas e composition root | OK | leitura de código |
| RF-08 suíte verde com truncateAll | OK | 52/52; truncate em `afterEach` |
| RF-09 mensagem amigável sem Docker | OK | `DOCKER_HOST` inválido → mensagem pt-BR sobre Docker/Testcontainers |

## Veredito

**APROVADO** — O CRÍTICO da rodada 2 foi corrigido e provado em runtime contra 10 variantes adversariais de path, com testes de integração de regressão adicionados e endurecidos. Todos os fixes das rodadas 1–2 continuam de pé. Lint/typecheck limpos, suíte 52/52 verde (unidade + integração com Postgres real), RF-09 provado, runtime ponta-a-ponta limpo com teardown completo. Restam 3 SUGESTÕES não-bloqueantes (id sintético v4 vs v7; escopo do guard por método quando CRM-04 chegar; verbosidade do log de 500). Pendência já conhecida: E2E Playwright (infra futura).
