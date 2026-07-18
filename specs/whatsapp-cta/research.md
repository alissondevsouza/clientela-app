---
feature: whatsapp-cta
module: web
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: Componente WhatsApp CTA

## Código Existente Relevante

| Arquivo | Linhas | Relevância |
|---------|--------|------------|
| `apps/web/src/components/landing/hero.tsx` | 25–35 | CTA atual: `<a href={hero.ctaHref}>` com `buttonVariants` — padrão a replicar no componente |
| `apps/web/src/app/(landing)/page.tsx` | 15–29 | Rodapé `id="contato"` com `footer.whatsappLabel` estático — vira CTA real |
| `apps/web/src/content/landing.ts` | — | `hero.ctaLabel`/`ctaHref`, `footer.whatsappLabel` (contém número fake "(00) 00000-0000" que NÃO pode permanecer) |
| `apps/api/src/env.ts` | — | Padrão de env do projeto: schema + `loadEnv(source)` testável — replicar no web |
| `vitest.config.ts` | — | Sem alias `@/` — testes do web importam por caminho relativo (como os da API) |
| `.env.example` | — | Env da raiz (API). Next carrega `.env*` do diretório do app, não da raiz |

## Padrões do Codebase a Seguir

- `loadEnv(source = process.env)` com Zod, erro citando só nomes de variáveis (padrão da API, `security.md`).
- `buttonVariants` + `cn` para links estilizados sem virar client component.
- Constantes nomeadas; conteúdo em `landing.ts`, comportamento em `lib/`.

## Gaps Identificados

- **Mecanismo de env do build web**: Next.js lê `.env*` de `apps/web/`, não da raiz → env do web vive em `apps/web/.env.local` (gitignored pelo padrão `.env.*` da raiz) com exemplo em `apps/web/.env.example`; a raiz `.env.example` ganha nota apontando para lá.
- Sem alias `@/` no Vitest raiz → imports relativos nos testes do web.
- `footer.whatsappLabel` atual tem número fake — remover ao integrar o CTA.

## Referências Externas

- Skills `zod`, `react`, `tailwindcss`; rules `web.md`, `core.md`, `security.md`, `testing.md`.
- wa.me: formato `https://wa.me/<E.164 sem símbolos>?text=<urlencoded>`; número deve incluir DDI (Brasil: `55` + DDD + número).
