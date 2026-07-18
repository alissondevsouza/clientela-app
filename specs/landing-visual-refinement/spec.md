---
feature: landing-visual-refinement
module: web
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: Refinamento visual da landing (header fixo, fotos reais, animações)

## O Que

Passe visual na landing pedido pelo humano: header fixo no scroll, marca "Lais Barbosa", substituição dos placeholders SVG pelas fotos profissionais reais da consultora (`project-memory/UI-resources`, **uso autorizado pelo humano nesta sessão**), redesign das seções de depoimentos e contato, e animações sutis (CSS-first, respeitando `prefers-reduced-motion`).

## Por Que

Item **LP-14** (novo, pedido direto do humano — dep: LP-07). A landing está estruturalmente pronta mas visualmente placeholder; as fotos reais e o polimento aproximam a página do lançamento (LP-08 segue dono dos textos/depoimentos reais).

## Requisitos

- **RF-01** — **Header fixo**: o header permanece visível ao rolar (`sticky top-0` com fundo translúcido + `backdrop-blur` e borda), acima do conteúdo (`z-50`). Os offsets de âncora das seções são ajustados para a altura do header (scroll-mt compatível — nenhuma âncora fica escondida sob o header ao navegar). Zero JS.
- **RF-02** — **Marca "Lais Barbosa"** no header, **sempre visível** (inclusive a 375px — remove-se o `hidden min-[400px]:`); a nav continua em linha única a 375px (ajustar tipografia/gaps; sem hambúrguer/JS). Conteúdo via `landing.ts` (`nav.brand`).
- **RF-03** — **Fotos reais** copiadas para `apps/web/public/images/` (nomes kebab em inglês) e usadas com `next/image` **otimizado** (sem `unoptimized` — são PNGs de ~2MB; o otimizador com sharp deve servir variantes menores; `sizes` correto por layout): hero → foto retrato 2 (1122×1402); sobre → foto retrato 4 (1086×1448); seção de contato → foto paisagem 3 (1672×941); foto quadrada 1 disponível para avatar/detalhe. Alts reais em pt-BR ("Lais Barbosa, consultora Mary Kay…"). Os SVGs placeholder de retrato/avatar da consultora saem de uso (avatares fictícios de depoimentos podem permanecer — pessoas fictícias continuam ilustrativas).
- **RF-04** — **Depoimentos melhorados**: cards com hierarquia visual melhor (citação com aspas estilizadas, avatar, nome e contexto curto), mantendo os rótulos "(exemplo)" e a nota de conteúdo ilustrativo (honestidade preservada até o LP-08); grid responsivo 1/3 colunas; `role="list"` no `ul` (fecha sugestão da QA LP-05).
- **RF-05** — **Seção de contato melhorada**: layout em duas colunas no desktop (formulário + coluna visual com a foto paisagem e reforços de valor — bullets curtos da isca), empilhado no mobile; formulário mantém TODO o comportamento do LP-06 intocado (schema, action, honeypot, estados — nenhuma mudança em `lead-form.tsx` além de estilos, se necessária); âncora `id="contato"` preservada.
- **RF-06** — **Animações sutis, CSS-only**: entrada das seções ao entrar no viewport via CSS scroll-driven animations (`animation-timeline: view()`) com `@supports` como progressive enhancement (navegador sem suporte = sem animação, página íntegra), transições de hover em cards/CTAs (elevação/escala leve), e **tudo desabilitado sob `prefers-reduced-motion`** (`motion-reduce:` / media query). Zero JS novo, zero dependência nova (usar `tw-animate-css`/Tailwind já presentes).
- **RF-07** — Nada estrutural regride: página `/` continua estática, zero `"use client"` novo, um só h1, skip link e a11y do LP-07 intactos — **skip link focado deve ficar VISÍVEL sobre o header sticky** (`focus:z-[60]` ou header em z-40; z-index empatado pinta o header por cima), testes existentes verdes.

## Critérios de Aceite

- [ ] (RF-01) HTML/classes: header `sticky top-0` com blur; âncoras navegam sem esconder heading sob o header (scroll-mt ≥ altura do header); verificação de runtime com curl + análise de classes.
- [ ] (RF-02) Marca "Lais Barbosa" presente no HTML sem classes que a escondam em nenhum breakpoint; nav em linha única a 375px (análise de classes; sem wrap forçado).
- [ ] (RF-03) `/images/*.png` servidas; hero/sobre/contato referenciam as fotos reais com `alt` pt-BR citando Lais Barbosa; nenhuma `<img>` das fotos reais com `unoptimized`; atributo `sizes` presente; SVGs de retrato da consultora sem referência restante (grep).
- [ ] (RF-04) Depoimentos: novo markup com citação/contexto, rótulos "(exemplo)" e nota preservados; `role="list"`.
- [ ] (RF-05) Contato em 2 colunas ≥lg e 1 coluna no mobile; fluxo de lead continua funcionando (QA de runtime real: submissão → linha no banco, como LP-06).
- [ ] (RF-06) CSS contém `animation-timeline: view()` sob `@supports` e variantes `motion-reduce`; nenhuma animação roda com `prefers-reduced-motion: reduce` (análise de CSS); hover transitions nos cards.
- [ ] (RF-07) `/` estática no build; zero `"use client"` novo (grep); `bun run lint`/`typecheck`/`test` verdes; 1 h1; skip link primeiro focável.

## Fora de Escopo

- Textos reais (história, depoimentos de clientes reais, isca definitiva) — LP-08.
- Trocar metadata/OG image para "Lais Barbosa" — fica para o LP-08 junto do conteúdo definitivo (evita retrabalho de branding).
- Carrossel/slider de depoimentos (JS) — grid estático melhorado basta.
- Compressão/conversão manual dos PNGs (otimizador do Next responde por variantes; se a QA de performance reprovar, vira follow-up).

## Restrições Conhecidas

- Fotos de pessoa real: uso autorizado pelo humano nesta sessão (Decisions Log); alts respeitosos e factuais; **não** usar as fotos em depoimentos fictícios (associaria a pessoa real a falas inventadas).
- Otimizador de imagem em produção standalone requer sharp na árvore (presente via Next) — QA valida variante otimizada servida em prod local.
- `web.md`: mobile-first; zero JS novo para animação/navegação.
- ADR-0006: sem git de escrita.
