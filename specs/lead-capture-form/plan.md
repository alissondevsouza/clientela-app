---
feature: lead-capture-form
module: web, shared
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: Formulário de captura de lead

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `leadFormSchema` no shared derivado de **`leadCaptureRequestSchema`** via `.extend`: `consent: z.boolean().pipe(z.literal(true, { error }))` e `website: z.string().default("")` | Deriva do schema COM honeypot (senão o resolver stripa `website` e o bot é persistido); pipe dá input boolean p/ RHF e output literal `true` atribuível a `LeadCaptureRequest`; uma fonte de verdade |
| `submitLead(values, { fetchImpl, apiUrl, clientIp? })` envia `x-forwarded-for: clientIp`; action obtém o IP via `headers()` extraindo o **ÚLTIMO** valor do XFF (helper `extractClientIp` testado, mesma semântica do `resolveClientIp` da API) | Preserva o rate limit POR VISITANTE (sem repasse = limite global de 5 leads/min). Último valor porque o Caddy dá append — o 1º é forjável e reabriria o bypass fechado no LP-02. Confiança: API só alcançável pela rede interna; reafirmar no LP-11 |
| `@hookform/resolvers` **≥ 5.1** (suporte a Zod 4) — ou `standardSchemaResolver` | A linha 3.x só suporta Zod 3; projeto usa zod@4.4.3 |
| Server Action em `app/(landing)/actions.ts` como wrapper fino de `lib/submit-lead.ts` (helper puro com `{ fetchImpl, apiUrl }` injetados) | Action não é unit-testável fora do runtime Next; o helper concentra a lógica (validação, mapeamento de envelope, erros de rede) e é testado com fetch fake (`testing.md`, sem vi.mock) |
| Resultado discriminado `SubmitLeadResult = { ok: true } \| { ok: false; message: string }` | Discriminated union (core.md); UI faz narrowing sem try/catch |
| `API_URL` obrigatória em `loadWebEnv` (z.url http/https) | `security.md` env validada; sem default silencioso apontando para lugar errado em prod (LP-11 configura explícito) |
| Honeypot: input de texto real dentro de `<div aria-hidden="true">` escondido via CSS (`absolute -left-[9999px]`/`sr-only`-like), `tabIndex={-1}`, `autoComplete="off"`, registrado no RHF | `type="hidden"` é ignorado por bots simples; campo precisa parecer preenchível. Não usar `display:none`? — usar posição off-screen: alguns bots pulam `display:none`; off-screen maximiza captura |
| Isca/labels/textos da seção em `landing.ts` (`leadSection`); mensagens de validação vêm do schema shared | Conteúdo trocável no LP-08 sem tocar componente; validação única front+API |
| Sucesso/erro como estado local do client component (sem redirect) | Página estática; UX de seção única; retry preserva valores do RHF |
| Action não loga nada do payload; erro logado só com `code`/status | LGPD (`security.md`) |
| shadcn `add input label textarea checkbox` | Componentes de form acessíveis prontos; regra de usar shadcn quando houver equivalente |
| Integração real (Testcontainers) dispensada NESTE item | O contrato e a persistência já são cobertos pela integração do LP-02; o elo novo (action → API) é HTTP puro coberto pelo helper unit + verificação fim-a-fim real na QA (compose + API + web + psql). Registrado como decisão consciente |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/lead-form.ts` | `leadFormSchema` + `LeadFormInput`/`LeadFormValues` |
| `packages/shared/src/lead-form.test.ts` | Unidade RF-01 |
| `apps/web/src/lib/submit-lead.ts` | `submitLead(values, { fetchImpl, apiUrl })` → valida, POST, mapeia envelope |
| `apps/web/src/lib/submit-lead.test.ts` | Unidade RF-03/RF-08 (201/422/429/rede/não-JSON/header XFF) |
| `apps/web/src/lib/client-ip.ts` (+ `client-ip.test.ts`) | `extractClientIp(headerValue)` — último valor do XFF (RF-06) |
| `apps/web/src/app/(landing)/actions.ts` | `"use server"`; chama `submitLead` com env real |
| `apps/web/src/components/landing/lead-form.tsx` | `"use client"`; RHF + zodResolver + estados + honeypot |
| `apps/web/src/components/landing/lead-section.tsx` | RSC: heading, isca, monta `<LeadForm />` (mantém `id="contato"`) |
| `apps/web/src/components/ui/{input,label,textarea,checkbox}.tsx` | Gerados pelo shadcn CLI |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Re-export de `lead-form` |
| `apps/web/src/lib/env.ts` (+ `env.test.ts`) | + `API_URL` obrigatória validada |
| `apps/web/src/app/(landing)/page.tsx` | Rodapé placeholder → `<LeadSection />` |
| `apps/web/src/content/landing.ts` | `footer.*` → `leadSection.*` (isca, labels, textos de estado) |
| `apps/web/package.json` | + `react-hook-form`, `@hookform/resolvers` |
| `apps/web/.env.example` + `.env.local` | + `API_URL=http://localhost:3001` (nota: runtime também, p/ LP-11) |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **sim** | `leadFormSchema` (consentimento é regra LGPD central) e `submitLead` (mapeamento de contrato/erros) |
| Integração (Testcontainers) | dispensada | Persistência/contrato cobertos pela integração do LP-02 (`leads.integration.test.ts`); elo action→API verificado fim-a-fim real na QA com banco+API+web de verdade. Decisão registrada no Decisions Log |
| E2E | **pendência explícita** | Este é o fluxo crítico "captura de lead" de `testing.md` — registrar no handoff que a infra E2E (REL-01) deve nascer cobrindo-o |
| Regressão | n.a. | Não é bug |

## Migração de Banco

n.a.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Action importada por client component quebrar a estaticidade da rota | baixa | Padrão suportado pelo Next (action = referência RPC); critério RF-07 verifica `/` estática no build |
| `zodResolver` + Zod v4 incompatível na versão instalada | média | `@hookform/resolvers` ≥ 5.1 (Zod 4 suportado; 3.x é Zod 3); fallback `standardSchemaResolver`; testar no milestone 1 |
| `headers()` sem `x-forwarded-for` em dev | média | Verificar empiricamente com `next start`; sem IP → header omitido (API fail-closed); QA simula IPs via curl com XFF |
| Mensagem 429 da API exposta ao usuário confundir | baixa | Mensagem já é pt-BR acionável ("Muitas solicitações…") — repassar é o desejado |
| Honeypot atrapalhar leitores de tela | baixa | `aria-hidden` + `tabIndex=-1` + label não associado a campo visível |

## Definition of Done
- [ ] Critérios de aceite atendidos e testados
- [ ] lint/typecheck/test verdes; build web `/` estática
- [ ] Fluxo real verificado na QA: form → action → API → Postgres (linha com consent_at), honeypot sem linha, API off → erro com retry
- [ ] Conformidade com `web.md`/`security.md`/ADRs
