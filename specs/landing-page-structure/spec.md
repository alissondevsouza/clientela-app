---
feature: landing-page-structure
module: web
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: Estrutura da landing page (hero, sobre, depoimentos)

## O Que

Estrutura visual da landing page pública no `apps/web`: layout mobile-first com seções **hero** (foto + proposta de valor + CTA WhatsApp), **sobre a consultora** e **depoimentos** — todo o conteúdo como placeholder centralizado (o conteúdo real vem do LP-08, humano). Inclui a instalação e configuração do shadcn/ui e a criação do route group `(landing)` previsto em `web.md`.

## Por Que

Item **LP-03** do roadmap (Fase 1). É o esqueleto sobre o qual LP-04 (CTA WhatsApp), LP-05 (catálogo) e LP-06 (formulário de lead) serão montados. A landing é o rosto público da consultora: precisa nascer mobile-first, rápida e estática (SSG).

## Requisitos

- **RF-01** — shadcn/ui instalado e configurado no `apps/web` (components.json, `lib/utils.ts` com `cn`, tema base em `globals.css`), com pelo menos os componentes `button` e `card` disponíveis em `components/ui/`.
- **RF-02** — Route group `(landing)` em `app/(landing)/` com a página `/` (home) movida para dentro dele, conforme estrutura de `web.md`; página permanece **Server Component estático** (SSG — nenhum `"use client"` na página, nenhuma dependência de runtime para renderizar).
- **RF-03** — Seção **hero**: foto da consultora (placeholder via `next/image`), headline com proposta de valor, subtítulo e botão CTA "Chamar no WhatsApp" (nesta fase, link placeholder `#contato`; o componente real parametrizado é o LP-04).
- **RF-04** — Seção **sobre a consultora**: foto/avatar placeholder, história curta e forma de atendimento (texto placeholder).
- **RF-05** — Seção **depoimentos**: 3 depoimentos placeholder em cards (nome, texto), sem carrossel/JS — grid estático.
- **RF-06** — Todo texto/imagem placeholder centralizado em `src/content/landing.ts` (constante tipada): trocar conteúdo (LP-08) = editar um arquivo só, sem tocar componentes.
- **RF-07** — Mobile-first: layout correto e legível em ~375px (uma coluna, espaçamentos adequados, tipografia fluida) e adaptado em ≥768px/≥1024px (grid nos depoimentos, hero em duas colunas quando couber).
- **RF-08** — Acessibilidade mínima (`web.md`): landmarks semânticos (`header`/`main`/`section` com heading), `alt` em toda imagem, botões/links com texto acessível, contraste AA nos textos sobre fundo, hierarquia de headings (um só `h1`).
- **RF-09** — Textos de UI em pt-BR; componentes de seção em `components/landing/` como Server Components nomeados (named exports; `export default` apenas onde o Next exige).

## Critérios de Aceite

- [ ] (RF-01) `components/ui/button.tsx` e `card.tsx` existem (gerados pelo CLI do shadcn) e são usados na página; `bun run lint`/`typecheck` limpos.
- [ ] (RF-02) `apps/web/src/app/(landing)/page.tsx` renderiza a home; `bun run build` marca a rota `/` como estática (○ ou ●, não ƒ).
- [ ] (RF-03..05) Página renderizada contém as 3 seções na ordem hero → sobre → depoimentos, com os conteúdos de `landing.ts` (verificável no HTML servido).
- [ ] (RF-06) Nenhum texto de seção hardcoded em componente — grep por strings do conteúdo só encontra `content/landing.ts`.
- [ ] (RF-07) Inspeção visual/DOM em 375px e 1024px (QA com runtime real): sem overflow horizontal, grid responsivo nos depoimentos.
- [ ] (RF-08) HTML tem 1 `h1`, headings h2 por seção, `alt` em todas as imagens, links/botões com nome acessível.
- [ ] (RF-09) Zero `"use client"` no escopo da landing; named exports nos componentes de seção.

## Fora de Escopo

- Componente WhatsApp CTA parametrizado por env (**LP-04** — aqui o botão é link placeholder).
- Catálogo de produtos (**LP-05**), formulário de lead (**LP-06**).
- SEO avançado — metadata completa, OG, sitemap (**LP-07**); mantém-se o metadata básico existente.
- Conteúdo real (fotos, história, depoimentos) — **LP-08 (humano)**; tudo aqui é placeholder honesto (sem depoimento inventado parecendo real: rotular como exemplo).
- Área CRM `(crm)` — Fase 2.

## Restrições Conhecidas

- `web.md`: server-first (RSC por default), shadcn/ui + Tailwind, mobile-first obrigatório, estados de loading/vazio/erro n.a. (página estática sem dados dinâmicos).
- Imagens placeholder devem ser assets locais (SVG/PNG em `public/`) — sem serviço externo de placeholder (CSP/performance/SSG determinístico).
- Tailwind v4 (CSS-first, `@import "tailwindcss"`) — configuração do shadcn deve ser compatível com v4 (sem tailwind.config.js legado).
- ADR-0006: sem git de escrita.
