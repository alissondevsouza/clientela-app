---
feature: whatsapp-cta
module: web
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: Componente WhatsApp CTA

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Builder puro em `lib/whatsapp.ts` separado do componente | Regra testável por unidade sem renderizar React; LP-05 reutiliza para URLs por produto |
| Env do web em `src/lib/env.ts` com Zod (`WHATSAPP_PHONE` obrigatória, `WHATSAPP_DEFAULT_MESSAGE` default nomeado), avaliada no import pelos consumidores RSC | `security.md`: env validada com schema Zod; falha de build explícita > página com link quebrado. Zod já disponível via workspace (dep direta a adicionar no web) |
| Telefone validado como E.164 flexível (normaliza p/ dígitos; 10–15 dígitos) | wa.me exige número internacional sem símbolos; DDD Brasil + país = 12–13 dígitos |
| `WHATSAPP_PHONE` sem prefixo `NEXT_PUBLIC_` | Lida só em RSC/build; o valor aparece no HTML do href por design (público), mas não precisa entrar no bundle JS |
| Componente aceita `message`, `variant`, `size`, `className`, `children` | Reuso no hero (default/lg), rodapé e LP-05 (mensagem por produto) |
| `landing.ts` deixa de ter `ctaHref` (o CTA agora é o componente); labels continuam no content | Conteúdo ≠ comportamento: label é conteúdo, URL é lógica |
| Env do web vive em `apps/web/.env.local` (gitignored) com exemplo versionado `apps/web/.env.example`; raiz `.env.example` ganha nota apontando para lá | Next carrega `.env*` do diretório do app, não da raiz do monorepo; teste negativo do build roda com `env -u WHATSAPP_PHONE` e sem `.env.local` presente (renomear temporariamente) |
| `lib/env.ts` exporta `loadWebEnv(source = process.env)` (parse em função, não no top-level do módulo) | Testável sem esbarrar em throw no import/cache de módulo (padrão já usado na API) |
| `footer.whatsappLabel` com número fake é REMOVIDO; rodapé usa texto sem número + botão CTA | Número hardcoded divergente da env seria mentira no HTML |
| `.env.example` documenta que `WHATSAPP_PHONE` inclui DDI (ex.: `5511912345678`) | Mínimo de 10 dígitos aceita BR sem DDI, que gera wa.me quebrado — mitigado por documentação + exemplo |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `apps/web/src/lib/whatsapp.ts` | `buildWhatsAppUrl` + constantes (min/max dígitos, default message) |
| `apps/web/src/lib/whatsapp.test.ts` | Unidade do builder (RF-01) |
| `apps/web/src/lib/env.ts` | `loadWebEnv(source)` Zod (`WHATSAPP_PHONE`, `WHATSAPP_DEFAULT_MESSAGE`) |
| `apps/web/.env.example` | Exemplo versionado da env do web (DDI documentado) |
| `apps/web/.env.local` | Env local de dev/build (gitignored) com valores de exemplo |
| `apps/web/src/lib/env.test.ts` | Unidade: válida, ausente, telefone inválido, default da mensagem |
| `apps/web/src/components/landing/whatsapp-cta.tsx` | Componente Server `WhatsAppCta` |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/components/landing/hero.tsx` | CTA `#contato` → `WhatsAppCta` |
| `apps/web/src/app/(landing)/page.tsx` | Rodapé ganha `WhatsAppCta`; mantém `id="contato"` |
| `apps/web/src/content/landing.ts` | Remove `ctaHref`; ajusta label do rodapé |
| `apps/web/package.json` | + `zod` (dep direta do web — mesma major do shared) |
| `.env.example` | + `WHATSAPP_PHONE`, `WHATSAPP_DEFAULT_MESSAGE` com comentário (rebuild ao trocar) |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **sim** | `buildWhatsAppUrl` e schema de env são regra nova (normalização, encoding, validação) — `testing.md` |
| Integração | n.a. | Sem banco/API |
| E2E | pendência (sem infra) | Já registrada em known-issues |
| Regressão | n.a. | Não é bug |

## Migração de Banco

n.a.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Env em build time confundir deploy (trocar número sem rebuild) | média | Comentário explícito no `.env.example`; LP-11 documenta rebuild no deploy |
| Vitest não carrega path alias `@/` do web | média | Testes importam por caminho relativo (padrão dos testes atuais da API) ou adicionar alias no vitest.config se necessário |

## Definition of Done
- [ ] Critérios de aceite atendidos e testados
- [ ] lint/typecheck/test verdes; build web com `/` estática
- [ ] QA runtime: hrefs `wa.me` corretos no HTML servido
- [ ] Conformidade com rules/ADRs
