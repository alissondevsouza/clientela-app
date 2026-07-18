---
feature: lead-capture-form
module: web, shared
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: Formulário de captura de lead na landing

## O Que

Formulário de captura de lead na seção `#contato` da landing (substituindo o rodapé placeholder do LP-03): react-hook-form + schema compartilhado de `packages/shared`, isca de conversão, consentimento LGPD explícito, honeypot invisível, submissão via **Server Action** que chama `POST /leads` da API (LP-02) no servidor, com estados de envio/sucesso/erro.

## Por Que

Item **LP-06** do roadmap (Fase 1). É a captação: transforma visitante em lead persistido no banco (aparecerá no CRM na Fase 2). Fecha o fluxo landing → API → banco construído em LP-01/02/03.

## Requisitos

- **RF-01** — `packages/shared` ganha `leadFormSchema`: variante de **`leadCaptureRequestSchema`** (inclui o honeypot!) para react-hook-form em que `consent` é `z.boolean().pipe(z.literal(true, { error: <msg LGPDA> }))` — input `boolean` (RHF consegue `defaultValues.consent: false` sem `as`) e **output literal `true`**, compatível por tipo com `LeadCaptureRequest`; `website` com `.default("")` para o RHF registrar o campo. O contrato da API não muda; o output do form schema DEVE sobreviver com `website` ao parse (teste unitário prova).
- **RF-02** — Componente client `LeadForm` (`"use client"` no menor componente possível — a página continua RSC): react-hook-form + `zodResolver(leadFormSchema)` reusando o schema shared (mesma validação do front e da API); campos nome, WhatsApp, interesse (opcional), checkbox de consentimento **não pré-marcado** com finalidade declarada (LGPD, `security.md`), e honeypot `website` invisível (input hidden de verdade para bots: `tabIndex=-1`, `autoComplete="off"`, `aria-hidden`, container escondido via CSS — não `type="hidden"` que bots ignoram? decisão no plan) — erros de validação por campo em pt-BR, associados via `aria-describedby`, `aria-invalid`.
- **RF-03** — Server Action (`"use server"`) que: revalida o payload com `leadCaptureRequestSchema` (fronteira — input externo), chama `POST {API_URL}/leads` **no servidor** (o browser nunca fala com a API; nenhuma URL/segredo no client — `web.md`), e retorna resultado discriminado `{ ok: true } | { ok: false, message }` mapeando o envelope de erro da API (mensagem pt-BR; 429 repassa a mensagem do rate limit; falha de rede/500 → mensagem genérica acionável). Nunca vaza internals.
- **RF-04** — `API_URL` entra na env do web (`loadWebEnv`): obrigatória, URL http(s) válida (dev: `http://localhost:3001`); `.env.example` do web atualizado.
- **RF-05** — Estados obrigatórios (`web.md`): enviando (botão desabilitado + texto "Enviando…"), sucesso (formulário substituído por mensagem de confirmação com aviso de contato), erro (mensagem + valores preservados + botão tentar de novo). Lead com honeypot preenchido recebe o MESMO fluxo de sucesso (indistinguível).
- **RF-06** — **Repasse do IP do visitante**: a Server Action lê o `x-forwarded-for` recebido (`headers()` do Next) e extrai o **ÚLTIMO** valor — o único anexado pelo proxy confiável (Caddy dá append; o 1º valor é forjável pelo cliente e usá-lo reabriria o bypass do rate limit que o LP-02 fechou; mesma semântica de `resolveClientIp` da API). Envia-o como `x-forwarded-for` (valor único) no fetch para a API, preservando o rate limit **por visitante** (sem repasse, todos os visitantes compartilhariam o IP do servidor web e 5 leads/min derrubariam a captação — limite global inaceitável). Sem XFF disponível, envia sem header (API faz fail-closed no socket). Confiança (API atrás da rede interna do Docker aceita o XFF do web, seu único cliente) registrada; reafirmar no LP-11.
- **RF-07** — Seção `#contato` reformulada: heading + isca de conversão placeholder (`landing.ts` — ex.: análise de pele gratuita) + formulário; âncora `id="contato"` preservada (CTAs continuam funcionando); página `/` permanece prerenderizada (estática) no build.
- **RF-08** — Testes derivados do spec: unidade do `leadFormSchema` (consent false → mensagem; válido passa **e preserva `website`**; output atribuível a `LeadCaptureRequest` por tipo), unidade do helper de submissão com fetch fake (201 → ok; envelope 422/429 → message do envelope; rede caiu → mensagem genérica; resposta não-JSON → genérica; **header `x-forwarded-for` presente quando `clientIp` fornecido e ausente quando não**), e integração real dispensada (justificada no plan — API já coberta pelo LP-02).

## Critérios de Aceite

- [ ] (RF-01) Unidade shared: `leadFormSchema` com `consent: false` → erro com a mensagem LGPD; com dados válidos → output **atribuível a `LeadCaptureRequest` por tipo** (consent literal `true` via pipe) e `website` preservado no output.
- [ ] (RF-02) Página renderiza o form com labels associados, checkbox desmarcado por default, honeypot invisível e fora da ordem de tabulação; validação client-side exibe mensagens pt-BR por campo (verificação de runtime).
- [ ] (RF-03/04) Fluxo real fim-a-fim em dev: compose + migração + API + web rodando → submissão válida cria linha em `leads` no Postgres (verificado via psql) e UI mostra sucesso; API derrubada → UI mostra erro genérico com retry (sem stack). Build sem `API_URL` falha citando a variável.
- [ ] (RF-05) Os três estados observáveis; honeypot preenchido → sucesso na UI e **nenhuma** linha nova no banco.
- [ ] (RF-06) Unidade: `submitLead` envia `x-forwarded-for` com o `clientIp` recebido; extração do IP na action coberta por unidade com XFF **multi-valor** (`"1.2.3.4, 5.6.7.8"` → extrai `"5.6.7.8"`; o valor forjado no início é ignorado). QA fim-a-fim: 6 submissões reais pela action com IPs distintos simulados (curl com XFF variado contra o web) → janela por IP; mesmo IP 6× → 429 repassado como erro de UI; e um caso multi-valor provando que rotacionar o 1º valor NÃO escapa do limite.
- [ ] (RF-07) `id="contato"` presente; rota `/` estática no output do build; nenhuma referência a `API_URL` no bundle client (grep no `.next/static`); **form usável a 375px** (uma coluna, campos/checkbox/botão alcançáveis — análise DOM/classes na QA).
- [ ] (RF-08) `bun run lint`/`typecheck`/`test` verdes com os novos testes.

## Fora de Escopo

- Texto real da isca (LP-08 — humano); e-mail de notificação; CAPTCHA.
- Listagem/gestão de leads (CRM-04).
- E2E Playwright (pendência registrada — este é O fluxo crítico que a justificará).

## Restrições Conhecidas

- `web.md`: mutação só via Server Action; RHF + resolver Zod com schema shared; mobile-first; estados obrigatórios.
- `security.md`: consentimento explícito não pré-marcado + finalidade; dado pessoal não aparece em log do web (action não loga payload).
- A página é SSG e a action roda no runtime Node do standalone — `API_URL` precisa estar disponível também em runtime (documentar para o LP-11).
- ADR-0006: sem git de escrita.
