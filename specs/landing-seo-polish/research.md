---
feature: landing-seo-polish
module: web
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: SEO e polimento da landing

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/web/src/app/layout.tsx` | Metadata mínima atual (`title: "Clientela"`); fonte Geist via `next/font/google` (build-time download — flag p/ LP-11) |
| `apps/web/src/app/(landing)/page.tsx` | Monta seções; ganhará ids de âncora, skip target `#conteudo` e `<header>`/nav |
| `apps/web/src/components/landing/{hero,about,testimonials,featured-catalog,lead-section}.tsx` | Seções que recebem ids (`scroll-mt` já usado no `#contato`); hero já tem `priority` na imagem |
| `apps/web/src/lib/env.ts` + `env.test.ts` | `loadWebEnv` — ganha `SITE_URL`; padrão de teste já estabelecido |
| `apps/web/src/content/landing.ts` | Padrão de conteúdo; metadata vem de `content/site.ts` novo |
| `apps/web/.env.example` / `.env.local` | Ganham `SITE_URL` |

## Padrões do Codebase a Seguir

- Conteúdo em `content/` tipado `as const`; env validada em `loadWebEnv` com erro que cita nomes.
- Server Components puros; zero JS novo no client (nav por âncoras, sem hambúrguer).
- `scroll-mt-8` (padrão usado no `#contato`).

## Gaps Identificados

- Não há `metadataBase` → OG/canonical relativos quebrariam; `SITE_URL` resolve.
- Não há OG image; `ImageResponse` (`next/og`) já vem com o Next (sem dep nova).
- Convenções do App Router: `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx` (com `alt`/`size`/`contentType` exportados) — rotas geradas no build para páginas estáticas.
- Header/nav inexistentes (sugestão herdada das QAs LP-03/LP-05).

## Referências Externas

- Rules: `web.md` ("Landing: metadata completa (generateMetadata), Open Graph, next/image"), `core.md`, `security.md` (env Zod).
- Skill `.claude/skills/react/SKILL.md`; docs Next (App Router metadata files) — usar conhecimento das convenções estáveis.
