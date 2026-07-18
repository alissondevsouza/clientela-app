---
feature: landing-seo-polish
module: web
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: SEO e polimento da landing

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `SITE_URL` obrigatória (sem default) em `loadWebEnv` | Mesmo racional do `API_URL`: default silencioso geraria canonical/OG errados em prod; dev usa `.env.local` |
| Metadata estática via `export const metadata` no root layout, montada a partir de `content/site.ts` + `loadWebEnv()` | Página única e estática — `generateMetadata` dinâmico é desnecessário; conteúdo trocável no LP-08 sem tocar layout |
| OG image por `app/opengraph-image.tsx` (`ImageResponse`), sem binário versionado | Gerada no build (rota estática), consistente com o tema; evita PNG mantido à mão |
| Header: marca em `<span>` estilizado (não link, não h1) + nav âncoras texto-only | Um só h1 (hero); sem JS; cabe em 375px com `text-sm` + gap compacto |
| Ids de âncora nas seções via prop/edição direta com `scroll-mt-8` (header não é sticky — margem cobre o salto) | Padrão já usado no `#contato` |
| Skip link com classe `sr-only focus:not-sr-only` | Padrão Tailwind de skip link sem CSS custom |
| `content/site.ts` separado de `landing.ts` | Metadata do site ≠ conteúdo das seções; LP-08 edita ambos |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `apps/web/src/content/site.ts` | Nome do site, tagline, description, OG texts (placeholder honesto) |
| `apps/web/src/app/opengraph-image.tsx` | OG image 1200×630 via ImageResponse (+ exports alt/size/contentType) |
| `apps/web/src/app/sitemap.ts` | Sitemap com `/` |
| `apps/web/src/app/robots.ts` | Robots + referência ao sitemap |
| `apps/web/src/components/landing/site-header.tsx` | `<header>` + `<nav aria-label>` com âncoras |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/app/layout.tsx` | Metadata completa (template, metadataBase, OG/Twitter, canonical) |
| `apps/web/src/app/(landing)/page.tsx` | + `<SiteHeader />`, skip link, `id="conteudo"` no main |
| `apps/web/src/components/landing/{featured-catalog,about,testimonials}.tsx` | ids `produtos`/`sobre`/`depoimentos` + `scroll-mt-8` |
| `apps/web/src/lib/env.ts` + `env.test.ts` | + `SITE_URL` (3 casos de teste) |
| `apps/web/.env.example` + `.env.local` | + `SITE_URL` (nota LP-10/12) |
| `apps/web/src/content/landing.ts` | + labels da nav (conteúdo) |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | sim (env) | `SITE_URL` é regra de configuração nova; resto é markup/metadata sem lógica (pirâmide de `testing.md` — sem regra de negócio) |
| Integração | n.a. | Sem banco/API |
| E2E | pendência (sem infra) | Já registrada; Lighthouse real = pendência de handoff |
| Regressão | n.a. | Não é bug |

## Migração de Banco

n.a.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| `ImageResponse` falhar com fonte custom no build | média | Usar fontes default do ImageResponse (sem fetch de fonte); layout simples |
| metadata estática avaliada no import quebrar build sem env | desejado | É o comportamento especificado (build falha claro citando SITE_URL) |
| `next/font/google` sem rede no build Docker (LP-11) | alta (lá) | Registrar no handoff: LP-11 decide self-host da fonte ou rede no build stage |

## Definition of Done
- [ ] Critérios de aceite atendidos
- [ ] lint/typecheck/test verdes; build `/` estática
- [ ] QA runtime: head completo, OG image/sitemap/robots 200, skip link, âncoras
- [ ] Pendências (Lighthouse, fonte no Docker) registradas no handoff
