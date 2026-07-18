---
feature: landing-seo-polish
module: web
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: SEO e polimento da landing

## O Que

Passe de SEO, metadata e acabamento da landing: metadata completa (title template, description, canonical, Open Graph/Twitter card com imagem gerada), `sitemap.xml` e `robots.txt` pelas convenções do App Router, header semântico com navegação por âncoras, e passe mecânico de performance/acessibilidade. Fecha a Fase "Página" do roadmap (LP-03..LP-07).

## Por Que

Item **LP-07** (dep: LP-03..LP-06, todos entregues). A landing existe mas está com metadata mínima ("Clientela"), sem OG (compartilhar no WhatsApp — o principal canal! — aparece sem preview), sem sitemap/robots e sem header/nav.

## Requisitos

- **RF-01** — `SITE_URL` na env do web (`loadWebEnv`): URL http(s) obrigatória (dev: `http://localhost:3000`); usada como `metadataBase` e nos arquivos de sitemap/robots. `.env.example` documenta que o domínio real entra no LP-10/12.
- **RF-02** — Metadata completa no root layout a partir de um módulo de conteúdo (`content/site.ts`): `title` com template (`"%s | <nome do site>"` + default), `description`, `metadataBase`, `alternates.canonical`, `openGraph` (type website, locale pt_BR, title, description, url — **sem** `images`: a imagem vem exclusivamente da convenção de arquivo do RF-03, que tem precedência e evita URL divergente) e `twitter` (card summary_large_image; imagem via fallback do og:image — sem arquivo twitter-image próprio). Textos placeholder honestos em pt-BR (conteúdo real: LP-08).
- **RF-03** — Imagem Open Graph gerada em build via `app/opengraph-image.tsx` (`ImageResponse` do `next/og`, 1200×630, nome do site + tagline, cores do tema) — rota estática; imagem do twitter via fallback do og:image (sem arquivo próprio). Sem binário versionado à mão.
- **RF-04** — `app/sitemap.ts` (rota `/` com `SITE_URL`) e `app/robots.ts` (allow geral + referência ao sitemap) — ambos estáticos no build.
- **RF-05** — Header semântico na landing: `<header>` com marca em texto (não h1 — o h1 continua no hero) e `<nav aria-label>` com âncoras (Produtos, Sobre, Depoimentos, Contato); ids correspondentes nas seções (`#produtos`, `#sobre`, `#depoimentos`, `#contato` — os novos ids adicionados às seções existentes com **`scroll-mt-8`**, o mesmo offset já usado no `#contato`); mobile-first (nav horizontal compacta que cabe em 375px sem menu hambúrguer/JS).
- **RF-06** — Passe mecânico de a11y/performance: skip link "Pular para o conteúdo" (primeiro elemento focável → `#conteudo` no main); `priority` apenas na imagem do hero (acima da dobra); demais imagens lazy (default); nenhuma dependência de rede em runtime na página; `html lang="pt-BR"` (já existe). Lighthouse real fica como pendência de handoff (sem browser no ambiente).
- **RF-07** — Página `/` permanece estática; `lint`/`typecheck`/`test` verdes; teste unitário da env estendida (`SITE_URL` ausente/ inválida/ válida).

## Critérios de Aceite

- [ ] (RF-01) Build sem `SITE_URL` falha citando a variável; unidade da env cobre os 3 casos.
- [ ] (RF-02) HTML servido de `/` contém `<title>` default, meta description, canonical com `SITE_URL`, og:title/og:description/og:url/og:image/og:locale=pt_BR e twitter:card=summary_large_image.
- [ ] (RF-03) `GET /opengraph-image` responde 200 `image/png` 1200×630 no servidor de produção local; rota listada como estática no build.
- [ ] (RF-04) `GET /sitemap.xml` e `GET /robots.txt` respondem 200 com `SITE_URL` correto; estáticos no build.
- [ ] (RF-05) HTML: `<header>` com `<nav>` e 4 âncoras; seções com ids `produtos`/`sobre`/`depoimentos`/`contato` e `scroll-mt`; nav renderiza em uma linha a 375px (análise de classes).
- [ ] (RF-06) Primeiro elemento focável é o skip link apontando para `#conteudo`; só a imagem do hero tem `priority`/`fetchpriority=high`.
- [ ] (RF-07) `/` estática no build; suíte raiz verde.

## Fora de Escopo

- Conteúdo real de metadata/OG (LP-08) e domínio real (LP-10/12 — trocar `SITE_URL`).
- Lighthouse/auditoria em browser real — pendência de handoff (sem browser no ambiente do agente).
- Analytics/pixel/Search Console.
- Menu hambúrguer/JS de navegação (nav por âncoras basta nesta fase).

## Restrições Conhecidas

- `next/font/google` (Geist) baixa a fonte em **build time** → build do Docker no LP-11 precisa de rede ou fonte self-hosted; registrar no handoff para o LP-11 decidir.
- OG image via `ImageResponse` roda em build (rota estática) — não pode depender de fetch externo.
- ADR-0006: sem git de escrita.
