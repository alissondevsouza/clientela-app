---
feature: landing-visual-refinement
module: web
phase: review
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: landing-visual-refinement (rodada 1)

Revisor neutro (não implementou). Arquivos revisados: `apps/web/public/images/lais-barbosa-{portrait,standing,wide,square}.png`, `apps/web/src/content/landing.ts`, `apps/web/src/components/landing/{site-header,hero,about,featured-catalog,testimonials,lead-section,lead-form}.tsx`, `apps/web/src/app/(landing)/page.tsx`, `apps/web/src/app/globals.css`; contexto: `apps/web/src/content/products.ts`, `next.config.ts`, `specs/lead-capture-form/{spec,review,validate}.md` (contrato LP-06).

## Checklist

### Correção e edge cases
- [x] RF-01: header `sticky top-0 z-50 bg-background/80 backdrop-blur border-b`; `scroll-mt-20` (80px) nas 4 seções ancoradas ≥ altura estimada do header (~45px = py-3×2 + linha de 20px + borda) — folga ampla em todos os breakpoints
- [x] RF-02: marca "Lais Barbosa" sem classe que a esconda em qualquer breakpoint (`whitespace-nowrap`); nav a 375px: estimativa de largura ≈ 311px (marca ~85px text-sm + gap 10 + 4 links text-xs ~186px + 3×gap-2.5) ≤ 343px úteis (375 − px-4×2) — linha única sem wrap (flex nowrap default + `whitespace-nowrap` por link); **limitação: sem browser, estimativa tipográfica**
- [x] RF-03: fotos com dimensões intrínsecas idênticas às declaradas (`file` vs `landing.ts`); mapeamento fonte→destino conferido por md5; alts pt-BR factuais; `priority` só no hero (preload no head; about/wide lazy); nenhuma foto real com `unoptimized`; otimizador servindo webp 18–59KB em runtime standalone
- [x] RF-04: citação em `<blockquote>`, aspas decorativas `aria-hidden`, avatar SVG fictício, nome + contexto; rótulos "(exemplo)" e nota ilustrativa preservados; **nenhuma foto real nos depoimentos fictícios** (restrição de honestidade cumprida); grid 1/3 col (`md:grid-cols-3`)
- [x] RF-05: `lg:grid-cols-[1fr_minmax(0,480px)]` ≥lg, empilhado no mobile; 3 highlights; foto wide com alt informativo (não decorativa — coerente com a decisão do plan); `id="contato"` preservado; fluxo de lead re-verificado fim-a-fim real (action → API → linha no Postgres; honeypot intacto)
- [x] RF-06: CSS compilado — `opacity:0` só dentro de `@keyframes fade-up`; `.animate-on-scroll` exclusivamente sob `@supports (animation-timeline:view())` aninhado em `prefers-reduced-motion: no-preference` → sem suporte (Safari/Firefox) ou com `reduce`, conteúdo 100% visível; hovers com `motion-reduce:transform-none motion-reduce:transition-none`
- [x] RF-07: `/` `○ (Static)` no build; zero `"use client"` novo; 1 h1; skip link primeiro focável no DOM com `focus:z-[60]` > `z-50` do header (empate resolvido); 99 testes verdes

### Arquitetura (web.md)
- [x] Tudo RSC; única folha client continua `lead-form.tsx` (pré-existente)
- [x] Mobile-first: grids empilham por default e abrem em `md:`/`lg:`; tipografia da nav reduzida no estreito
- [x] Conteúdo centralizado em `content/landing.ts` (LP-08 edita sem tocar componentes); zero JS novo, zero dependência nova
- [x] Estados do formulário (loading/sucesso/erro) intactos do LP-06

### Banco (database.md)
- [x] n.a. — sem mudança de banco (migração não requerida; fluxo de lead usa schema existente)

### Segurança e LGPD (security.md)
- [x] Nenhuma rota nova; consentimento/honeypot/normalização do LP-06 intactos (verificado em runtime)
- [x] Sem PII em log (verificado nos logs de web/API durante as submissões); sem segredo no bundle client (grep)
- [x] Fotos de pessoa real: uso autorizado registrado no spec/Decisions Log; alts factuais e respeitosos; não associadas a falas fictícias

### Tipos e qualidade (core.md)
- [x] Sem `any`/`as`/`!`; `as const` no conteúdo; named exports; comentários explicam o porquê
- [x] `biome-ignore` do `role="list"` com justificativa técnica válida (Safari/VoiceOver + `list-none`)

### Testes (testing.md)
- [x] Nenhuma regra de negócio nova → dispensa justificada no plan (mudança de markup/estilo/conteúdo); suíte existente (99) protege regressão do fluxo de lead; critérios visuais verificados por QA de runtime real (curl + CSS compilado) — método aceito pelo spec ("análise de classes/CSS")
- [x] Nenhum teste relaxado/skipado

### Escopo
- [x] Tasks 1.1–3.2 implementadas; nenhum arquivo fora do escopo alterado (`lead-form.tsx` byte-compatível com o comportamento LP-06; `whatsapp-cta.tsx` intocado)

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | ALERTA | Contraste dos links da nav sob o header translúcido: `text-muted-foreground` (oklch 0.556 ≈ #737373) sobre `bg-background/80` dá ~4.7:1 sobre fundo branco (AA ok), mas quando uma **foto** rola sob o header (luminância média das fotos 168–184/255, p10 até 60), a composição estimada cai para ~4.1:1 — abaixo de AA (4.5:1). Estimativa numérica sem browser (blur não modelado); risco previsto no próprio plan. | `apps/web/src/components/landing/site-header.tsx:26` | `bg-background/90` no header ou links em `text-foreground/70`; confirmar em browser real |
| 2 | SUGESTÃO | `sizes` do hero/about superestima no desktop largo: `50vw` a 1920px pede a variante 1080w (~59KB), mas a coluna real satura em ~552px (`max-w-6xl`/2) — a variante 640w (~33KB) bastaria. Não fere o critério (sizes presente e coerente por breakpoint), só superdimensiona. | `apps/web/src/components/landing/hero.tsx:36`, `about.tsx:19` | `sizes="(min-width: 1152px) 552px, (min-width: 768px) 50vw, 100vw"` (idem lead-section com 624px) |
| 3 | SUGESTÃO | `transition-colors` dos links do header roda sob `prefers-reduced-motion: reduce` (fade de cor não é "motion" pela WCAG, mas o RF-06 pede "nenhuma animação"). Cosmético. | `apps/web/src/components/landing/site-header.tsx:26` | `motion-reduce:transition-none` no link, por consistência com os cards |
| 4 | SUGESTÃO | Assets órfãos publicados: `public/placeholders/consultant-portrait.svg` (zero referências — critério RF-03 atendido) e `public/images/lais-barbosa-square.png` (2MB, sem uso na página; o spec a declara "disponível"). Não pesam na página, mas ficam publicamente acessíveis por URL. | `apps/web/public/placeholders/consultant-portrait.svg`, `apps/web/public/images/lais-barbosa-square.png` | Remover o SVG órfão; manter a square só se houver uso previsto no LP-08 |

Nenhum CRÍTICO. O ALERTA #1 não bloqueia: o caso base (fundo branco, que é o predominante) passa AA; o cenário abaixo do limiar é transitório/estimado e o próprio plan o classificou como risco a confirmar — recomendo verificação em browser no LP-08/E2E ou aplicar o ajuste de 1 classe.

## Cobertura dos Critérios de Aceite

| Critério | Status | Evidência |
|---|---|---|
| RF-01 sticky + âncoras | ✅ | HTML runtime + análise de offsets (80 vs ~45px) |
| RF-02 marca + nav 375px | ✅ (estimativa) | HTML sem classes de ocultação; largura estimada 311/343px |
| RF-03 fotos otimizadas | ✅ | md5, `file`, alts, srcset/webp em runtime, greps |
| RF-04 depoimentos | ✅ | HTML: blockquote, contexto, "(exemplo)" ×labels, nota, `role="list"` |
| RF-05 contato 2 col + lead | ✅ | classes grid + submissão real → linha no Postgres + honeypot |
| RF-06 animações CSS-only | ✅ | CSS compilado: @supports aninhado, opacity:0 só no keyframes |
| RF-07 sem regressão | ✅ | build `○ /`, greps, 1 h1, skip link, 99 testes |

## Veredito

**APROVADO** — lint/typecheck/build limpos, 99 testes verdes, todos os critérios RF-01..07 verificados (runtime real para HTML, imagens otimizadas e fluxo de lead fim-a-fim; análise de CSS compilado para animações), `lead-form.tsx` sem mudança de lógica, zero achados CRÍTICOS. Pendências explícitas: E2E Playwright (REL-01) e confirmação em browser real do ALERTA #1 (contraste do header) e do comportamento visual (nav 375px, âncoras).

---

# Review: landing-visual-refinement (rodada 2 — delta pós-fix)

Revisor neutro (não implementou nem aplicou o fix). Arquivos revisados: `site-header.tsx`, `hero.tsx`, `about.tsx`, `public/placeholders/` (listagem), HTML prerenderizado e CSS compilado do build. Evidências em `validate.md` (rodada 2).

## Disposição dos achados da rodada 1

| # (rodada 1) | Status | Evidência |
|---|---|---|
| 1 ALERTA (contraste nav) | ✅ Resolvido | Fixer aplicou **as duas** alternativas sugeridas (`bg-background/90` **e** `text-foreground/70`): contraste estimado 6.86–7.63:1 em todos os cenários (piso teórico com preto sob o blur = 6.86:1) — AA (4.5:1) com folga ampla, inclusive pior caso de foto clara |
| 2 SUGESTÃO (sizes) | ✅ Aplicada em hero/about | `(min-width: 1152px) 552px, …` exatamente como sugerido. `lead-section.tsx` (624px) **não** foi ajustada — segue como sugestão em aberto, não-bloqueante (o próprio achado registrou que não fere critério) |
| 3 SUGESTÃO (transition sob reduce) | ✅ Aplicada | `motion-reduce:transition-none` nos 4 links da nav (HTML prerenderizado confere) |
| 4 SUGESTÃO (órfãos) | ✅ Parcial (conforme recomendado) | `consultant-portrait.svg` removido (grep zero em código/HTML/public); `lais-barbosa-square.png` mantida — coerente com o spec ("disponível para avatar/detalhe") e com a própria recomendação |

## Não-regressão (RF-01/02/03/06/07)

- RF-01: `sticky top-0 z-50 border-b border-border/60 backdrop-blur` intacto; só a opacidade do fundo mudou (80→90) — comportamento sticky/blur/borda preservado; `scroll-mt-20` inalterado.
- RF-02: marca "Lais Barbosa" sem classe de ocultação; nav com as mesmas classes de layout (`whitespace-nowrap`, `text-xs min-[420px]:text-sm`, gaps) — troca de cor não afeta largura; estimativa de linha única a 375px da rodada 1 permanece válida.
- RF-03: `sizes` presente e mais preciso; sem `unoptimized` em foto real; alts/`priority`/lazy intactos; zero referência a SVG de retrato da consultora.
- RF-06: `animate-on-scroll`/`@supports`/`prefers-reduced-motion` intocados; `transition-colors` do header agora também neutralizado sob `reduce` (fecha a inconsistência com os cards).
- RF-07: build `○ /` estática (6/6), zero `"use client"` novo, 99 testes verdes, lint/typecheck limpos, skip link `focus:z-[60]` inalterado.

## Problemas Encontrados (rodada 2)

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | O `552px` do `sizes` superestima em ~16px a coluna real no desktop: com `max-w-6xl` (1152px) − `px-4` (32px) − `gap-12` (48px), cada coluna satura em ~536px. Superestimar é a direção segura (nunca serve variante menor que o necessário) e o valor é o que a própria rodada 1 sugeriu — apenas registro de precisão. | `hero.tsx:36`, `about.tsx:19` | Opcional: `536px`; irrelevante na prática (mesma variante 640w é escolhida) |
| 2 | SUGESTÃO | Remanescente da SUGESTÃO #2 da rodada 1: `lead-section.tsx:53` segue com `50vw` no desktop largo (coluna real ~624px máx). Não-bloqueante. | `lead-section.tsx:53` | `sizes="(min-width: 1024px) 624px, 100vw"` quando conveniente |

Nenhum CRÍTICO, nenhum ALERTA.

## Veredito (rodada 2)

**APROVADO** — delta aplicado exatamente como recomendado (ALERTA #1 resolvido com margem: contraste ≥ 6.86:1 em qualquer cenário), zero regressão detectada nos três arquivos e no build (lint/typecheck/99 testes/`/` estática verdes), higiene confirmada por grep no código e no artefato buildado. Pendências herdadas da rodada 1 (E2E/browser real) permanecem registradas e não bloqueiam.
