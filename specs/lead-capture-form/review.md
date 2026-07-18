---
feature: lead-capture-form
module: web, shared
phase: review
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: lead-capture-form (rodada 1)

Revisor neutro (não implementou). Arquivos revisados: `packages/shared/src/{lead-form.ts,lead-form.test.ts,leads.ts,index.ts}`, `apps/web/src/lib/{submit-lead.ts,submit-lead.test.ts,client-ip.ts,client-ip.test.ts,env.ts,env.test.ts}`, `apps/web/src/app/(landing)/{actions.ts,page.tsx}`, `apps/web/src/components/landing/{lead-form.tsx,lead-section.tsx}`, `apps/web/src/components/ui/{input,label,textarea,checkbox}.tsx`, `apps/web/src/content/landing.ts`, `apps/web/package.json`, `apps/web/.env.example`, `.env.local` (gitignored), `bun.lock`; contexto: `apps/api/src/plugins/rate-limit.ts`, `apps/api/src/modules/leads/*`.

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md (todos verificados em runtime real — ver validate.md)
- [x] Edge cases: XFF ausente/vazio/`"1.2.3.4, "` → header omitido (fail-closed na API); resposta não-JSON/shape inesperado → mensagem genérica; honeypot `""` = humano persiste, não-vazio = 201 sintético sem linha
- [x] Tratamento de erro: `submitLead` nunca lança; todo caminho vira resultado discriminado; sem catch engolido silencioso (catch de rede retorna falha mapeada)

### Arquitetura (rules typescript/api.md, web.md)
- [x] `"use client"` só na folha (`lead-form.tsx`); página e seção permanecem RSC; `/` estática no build
- [x] Mutação via Server Action; browser nunca fala com a API; `API_URL` só no servidor (grep no bundle: 0 ocorrências)
- [x] Zod na fronteira: resolver com `leadFormSchema` (shared) no form + revalidação com `leadCaptureRequestSchema` na action/helper — mesmo schema front e API
- [x] Estados obrigatórios: enviando (botão desabilitado + "Enviando…"), sucesso (form substituído, `role="status"`), erro (`role="alert"` + retry com valores preservados no estado do RHF)
- [x] Mobile-first: uma coluna (`flex flex-col`), `w-full`, sem larguras fixas, botão `h-11` (alvo de toque ≥ 44px)

### Banco (database.md)
- [x] n.a. — sem migração; persistência é a do LP-02 (verificada via psql na QA)

### Segurança e LGPD (security.md)
- [x] Consentimento: checkbox NÃO pré-marcado (`aria-checked="false"` no SSR), finalidade declarada no label, `consent_at` registrado (não-nulo no psql)
- [x] Nenhum dado pessoal em log (logs de web e API inspecionados durante todas as submissões, inclusive falhas); action não loga payload
- [x] Erros nunca vazam internals: API off → mensagem genérica; build sem env cita só o NOME da variável
- [x] Honeypot sobrevive do RHF à API (schema preserva `website`; provado por teste unitário e fim-a-fim)
- [x] XFF: **último** valor extraído (1º forjável ignorado) — rotação do 1º valor não escapa do rate limit (provado em runtime); semântica idêntica ao `resolveClientIp` da API
- [x] `.env.local` gitignored; `.env.example` sem valores sensíveis

### Tipos e qualidade (core.md)
- [x] Sem `any`/`as`/`!`; `consent: true as const` em teste é uso legítimo; output do form atribuível a `LeadCaptureRequest` sem cast (provado em teste)
- [x] Named exports; early returns; constantes nomeadas; comentários explicam o porquê

### Testes (testing.md)
- [x] Cada criterion tem verificação executável (unidade e/ou runtime real na QA); testes derivam do spec (mensagens, contrato, header), não do diff
- [x] Integração Testcontainers do LP-02 segue verde (14 testes) — dispensa de integração nova justificada no plan e validada por fim-a-fim real
- [x] Nenhum teste relaxado/skipado; fakes explícitos (fetch stub), sem `vi.mock`

### Escopo
- [x] Todas as tasks do tasks.md implementadas (1.1–3.2), incluindo a mensagem pt-BR no `.max` de `interest`
- [x] Nenhum arquivo fora do escopo modificado (git status conferido; só componentes shadcn gerados + arquivos previstos)

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | `INTEREST_MAX_LENGTH = 500` duplicado no componente (o `maxLength` do textarea) em relação à constante homônima privada de `packages/shared/src/leads.ts`. Se o limite mudar no shared, o cap do client diverge silenciosamente (UX: usuário digita além e só descobre no erro do schema). | `apps/web/src/components/landing/lead-form.tsx:19` | Exportar a constante de `packages/shared` (ao lado do schema) e importá-la no componente |
| 2 | SUGESTÃO | `submitLead` engole a falha de `fetch` sem nenhum log servidor (o plan previa "erro logado só com code/status"). Segurança está correta (nada de PII), mas uma API fora do ar em produção fica invisível para ops — só o visitante vê a mensagem genérica. | `apps/web/src/lib/submit-lead.ts:86-88,90-94` | Logar no servidor apenas status HTTP/nome do erro (nunca payload/headers), ou registrar a decisão de não logar no Decisions Log |
| 3 | SUGESTÃO | Aviso de runtime: `"next start" does not work with "output: standalone"`. Em dev serviu normalmente, mas o deploy precisa usar `node .next/standalone/server.js` — e o `API_URL` precisa existir no runtime do standalone (o spec já prevê; reforçar no LP-11). | `apps/web/next.config.ts` | Documentar no handoff/LP-11 o comando de start do standalone |

Nenhum CRÍTICO ou ALERTA.

## Veredito

**APROVADO** — lint/typecheck/build limpos, 96 testes verdes (incl. integração real), todos os critérios de aceite verificados em runtime real (form → action → API → Postgres; honeypot; rate limit por visitante com XFF multi-valor; API off), zero achados CRÍTICOS. Pendência explícita: E2E Playwright (REL-01) cobrindo este fluxo.
