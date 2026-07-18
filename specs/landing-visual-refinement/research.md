---
feature: landing-visual-refinement
module: web
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: Refinamento visual da landing

## Assets de origem (`project-memory/UI-resources/`, inspecionados visualmente)

| Arquivo | Dimensões | Conteúdo | Destino proposto |
|---|---|---|---|
| `consultora-lais-barbosa-1.png` | 1254×1254 (1:1) | Retrato estúdio fundo bege | Reserva (avatar/detalhe) |
| `consultora-lais-barbosa-2.png` | 1122×1402 (4:5) | Retrato sorrindo, ambiente rosa c/ flores | **Hero** |
| `consultora-lais-barbosa-3.png` | 1672×941 (16:9) | Paisagem com grande espaço negativo à direita | **Seção contato** (coluna visual) |
| `consultora-lais-barbosa-4.png` | 1086×1448 (3:4) | Retrato em pé, tons claros | **Sobre** |

Paleta das fotos (rosa/bege/creme) conversa com a paleta dos placeholders (`#f6e8ee`/`#cc94ab`) — sem choque de tema.

## Código Existente Relevante

| Arquivo | Relevância |
|---|---|
| `site-header.tsx` | Header atual não-sticky; marca escondida <400px (comentário documenta a decisão a REVERTER); nav text-sm gap-3 |
| `hero.tsx`, `about.tsx` | Usam `next/image` com `unoptimized` (eram SVG) — fotos reais devem tirar o `unoptimized` e ganhar `sizes` |
| `testimonials.tsx` | Cards básicos (avatar+nome+texto); `list-none` sem `role="list"` (sugestão aberta da QA LP-05); avatares SVG fictícios PODEM ficar |
| `lead-section.tsx` | `max-w-xl` centrado, uma coluna — vira grid 2 colunas ≥lg com foto |
| `lead-form.tsx` | Client component do LP-06 — **não tocar em lógica** |
| `content/landing.ts` | `nav.brand` ("Mary Kay" → "Lais Barbosa"), `hero.image`, `about.image`, `leadSection` (ganha bullets/foto), alts |
| `globals.css` | Já importa `tw-animate-css` (shadcn init) — keyframes/utilities prontos; animações scroll-driven exigem CSS custom pequeno aqui |
| `(landing)/page.tsx` | scroll-mt das seções (hoje `scroll-mt-8`) — sobe para compensar header fixo |

## Fatos técnicos

- **Sticky sem JS**: `sticky top-0 z-50 border-b bg-background/80 backdrop-blur` é o padrão shadcn; âncoras precisam de `scroll-mt-` ≥ altura real do header (~52px → `scroll-mt-20` dá folga).
- **Scroll-driven animations**: `animation-timeline: view()` (Chrome/Edge 115+; Safari/Firefox atrás de flag em 2026) → obrigatório `@supports (animation-timeline: view())` para o enhancement e estado final visível por padrão (sem JS de fallback; quem não suporta vê a página estática normal). `prefers-reduced-motion` desliga tudo.
- **Otimizador de imagem**: `sharp` está na árvore do web (observado na QA do LP-11); standalone o inclui. `next/image` sem `unoptimized` gera `/_next/image?url=...&w=...` em runtime — QA deve validar variante otimizada com 200 em prod local.
- Copiar PNGs (2MB cada) para `apps/web/public/images/` — `.dockerignore` não os afeta (public entra no contexto); nomes: `lais-barbosa-portrait.png`, `lais-barbosa-standing.png`, `lais-barbosa-wide.png`, `lais-barbosa-square.png`.

## Gaps Identificados

- Nenhuma infra de animação CSS custom em `globals.css` — criar bloco pequeno (keyframes fade-up + classes utilitárias) com `@supports` + `motion-reduce`.
- `leadSection` no content não tem bullets/imagem — estender tipo.
- Testes: nenhum teste de UI existente cobre estas seções (sem regressão de teste); gates = lint/typecheck/test + build + QA runtime.

## Referências

- Rules `web.md` (mobile-first, server-first, a11y), `core.md`; skills `tailwindcss`, `react`, `shadcn-ui`.
- QA LP-05 (sugestão `role="list"`), QA LP-07 (alerta marca oculta a 375px — este item o resolve), LP-06 (fluxo de lead intocável).
