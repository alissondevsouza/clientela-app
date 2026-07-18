---
feature: leads-capture-api
module: api, shared
phase: spec
status: draft
size: L
created: 2026-07-16
updated: 2026-07-16
---

# Spec: Módulo `leads` da API — captura pública de leads

## O Que

Endpoint público `POST /leads` na API (Elysia) que persiste leads capturados pela landing page: validação com schema compartilhado de `packages/shared`, rate limit por IP, honeypot anti-bot e registro do consentimento LGPD (`consent_at`). Inclui o módulo completo em camadas (`routes → service → repository`), o error handler central da API e os testes de integração com Testcontainers.

## Por Que

Item **LP-02** do `specs/ROADMAP.md` (Fase 1). É o backend do formulário da landing (LP-06): sem ele não há captação. É também o primeiro módulo de domínio da API — estabelece o padrão de camadas, injeção e error handling que o CRM (Fase 2) seguirá. Único endpoint público previsto em `security.md`.

## Requisitos

- **RF-01** — Contrato público em `packages/shared`: schema Zod do request de captura (reusa `createLeadSchema` + campo honeypot opcional `website`) e tipo da resposta de sucesso (`{ id }`); front e API usam o mesmo schema.
- **RF-02** — `POST /leads` valida o body com o schema compartilhado na fronteira (Standard Schema do Elysia); payload inválido → HTTP 422 com envelope `{ error: { code, message } }` e mensagem em pt-BR, sem stack trace/internals.
- **RF-03** — Lead válido é persistido via camadas `routes → service → repository` (conforme `api.md`): `consent_at` = instante do aceite (clock injetado no service), `status` `new`, `source` `landing`, WhatsApp normalizado para dígitos (transform do schema). Resposta 201 `{ id }` — sem ecoar dados pessoais.
- **RF-04** — Honeypot: se `website` vier **não-vazio** (bots), responde **201 com id sintético** sem persistir nada e sem revelar a detecção; nenhum dado pessoal é logado. **`website` ausente OU string vazia `""` NÃO é bot** (campo hidden de formulário HTML submete `""`) — lead é persistido normalmente.
- **RF-05** — Rate limit por IP no endpoint público: no máximo N requisições por janela (constantes nomeadas; default 5/min), excedente → HTTP 429 com envelope de erro e mensagem pt-BR acionável. IP resolvido do **último** valor de `x-forwarded-for` — é o único anexado pelo proxy confiável (Caddy dá append, não overwrite; valores anteriores são forjáveis pelo cliente) — com fallback para o IP do socket. O rate limit é verificado **antes** da validação do body (payload inválido também consome a janela; flood de 422 não pode escapar do 429). Estado em memória (instância única — ADR-0003) com expiração/limpeza de janelas antigas.
- **RF-06** — Error handler central (plugin Elysia): erros de validação e inesperados viram `{ error: { code, message } }` com status correto; erro inesperado → 500 genérico, detalhe só em log do servidor (sem dado pessoal — logar IDs, nunca nome/whatsapp).
- **RF-07** — Composition root (`index.ts`) monta env → db → repository → service → rotas por injeção explícita; nenhum módulo importa singleton de conexão.
- **RF-08** — Testes: unidade (service: consent_at, honeypot, erro; rate limiter: janela, expiração) e integração com Testcontainers (rota real + Postgres real via migrações reais): happy path persistido com defaults, 422 inválido, honeypot não persiste, 429 ao exceder, envelope de erro correto.
- **RF-09** — Helper `pg-container` endurecido (dívida registrada em `known-issues.md`): `truncateAll()` para limpar estado entre testes e erro compreensível quando Docker está indisponível (com teardown em falha de migração).

## Critérios de Aceite

- [ ] (RF-01) `packages/shared` exporta o schema do request (com honeypot) e o tipo da resposta; `bun run typecheck` prova o reuso sem duplicação de contrato.
- [ ] (RF-02) Integração: body sem `name`/`consent` → 422 `{ error: { code, message } }`, mensagem pt-BR, sem stack.
- [ ] (RF-03) Integração: payload válido → 201 `{ id }` (uuid); linha em `leads` com `consent_at` não-nulo, `status='new'`, `source='landing'`, whatsapp só dígitos.
- [ ] (RF-04) Integração: payload com `website` não-vazio → 201 e tabela `leads` permanece vazia; payload válido com `website: ""` → 201 **e lead persistido** (humano com campo hidden vazio nunca é descartado).
- [ ] (RF-05) Integração: N+1ª requisição do mesmo IP na janela → 429 com envelope; IP diferente na mesma janela → 201. Unidade: janela expira e libera de novo.
- [ ] (RF-06) Integração: erro inesperado injetado → 500 `{ error: { code: "INTERNAL_ERROR", … } }` sem internals no body.
- [ ] (RF-07) Leitura de código: rotas não importam repository; service não importa Elysia; única instanciação de db no composition root.
- [ ] (RF-08) `bun run test` verde incluindo os novos testes; suíte de integração usa `truncateAll()` entre casos (sem vazamento de estado).
- [ ] (RF-09) Sem Docker, o teste de integração falha com mensagem que menciona Docker/Testcontainers (não stack cru de conexão).

## Fora de Escopo

- Formulário da landing e server action (LP-06).
- Autenticação/rotas do CRM sobre leads — listagem, mudança de status (CRM-04).
- Rate limit distribuído (Redis) — instância única por ADR-0003; revisitar se a topologia mudar.
- CAPTCHA ou verificação de WhatsApp real.
- Persistência do honeypot/telemetria de bots.

## Restrições Conhecidas

- `security.md`: este é o ÚNICO endpoint público da API; tudo mais nasce autenticado (Fase 2).
- LGPD: nenhum dado pessoal em log de aplicação (logar id do lead, nunca nome/whatsapp/interesse).
- Vitest roda em Node: rate limiter e service não podem depender de API exclusiva do Bun.
- ADR-0006: nenhum git de escrita; trabalho fica no working tree.
