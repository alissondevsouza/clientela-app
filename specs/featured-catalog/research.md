---
feature: featured-catalog
module: web
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: Catálogo de destaque

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/web/src/components/landing/whatsapp-cta.tsx` | CTA reutilizável com prop `message` (LP-04) — o catálogo passa mensagem por produto |
| `apps/web/src/components/ui/card.tsx` | Card shadcn (LP-03) — base dos cards de produto |
| `apps/web/src/components/landing/testimonials.tsx` | Padrão de grid responsivo + cards + nota de placeholder — replicar estrutura |
| `apps/web/src/content/landing.ts` | Padrão de conteúdo tipado `as const` — products.ts segue o mesmo |
| `apps/web/src/app/(landing)/page.tsx` | Ponto de integração (ordem das seções) |
| `apps/web/src/lib/whatsapp.ts` | Builder de URL — usado indiretamente via WhatsAppCta |

## Padrões do Codebase a Seguir

- Server Components, named exports, conteúdo separado de componente, placeholders SVG locais com `unoptimized`, seções com `aria-labelledby`.
- `WhatsAppCta` aceita `message`, `variant`, `size`, `className`, `children` — tipo fechado, sem spread para o `<a>`: **precisa ganhar a prop `ariaLabel`** para o RF-05 (mudança prevista no plan).

## Gaps Identificados

- Não existe formatador de moeda no web (`lib/format.ts` novo) nem teste correspondente.
- Não existem SVGs de produto (criar 6 em `public/placeholders/`, um por produto).
- Template da mensagem por produto: constante nomeada em `products.ts` ou `lib/whatsapp.ts`? → decisão no plan (fica no content: é texto pt-BR).

## Referências Externas

- Rules: `web.md` (moeda via Intl, mobile-first, a11y), `core.md` (centavos, constantes), `testing.md` (unidade para lógica nova).
- `project-memory/03-features.md` Fase 1 (catálogo rastreia produto que gerou contato).
