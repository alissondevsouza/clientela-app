---
feature: landing-visual-refinement
module: web
phase: validate
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: landing-visual-refinement (rodada 1)

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 88 arquivos, 0 problemas |
| Typecheck | `bun run typecheck` | ✅ | shared, api e web — exit 0 |
| Testes | `bun run test` | ✅ (99 passed, 0 failed) | 15 arquivos — suíte inteira verde, nada regrediu (baseline do plan: 99) |
| Integração | n.a. (sem mudança de banco/API/contrato) | n.a. | Fluxo de lead re-verificado em runtime real (abaixo) |
| Build | `cd apps/web && bun run build` | ✅ | `/` prerenderizada como `○ (Static)`; 6/6 páginas estáticas |
| CSS compilado | inspeção de `.next/static/chunks/2-dwztmw7ff-g.css` | ✅ | ver "Análise do CSS" |
| Runtime (standalone) | `PORT=3999 node .next/standalone/apps/web/server.js` (static + public copiados; `API_URL=http://localhost:3001`) | ✅ | curl de HTML, imagens e fluxo de lead fim-a-fim |
| Fluxo de lead fim-a-fim | compose dev (pg 5433) + `db:migrate` + API `:3001` + POST na Server Action via protocolo RSC (`Next-Action: 401d2c6c…`) | ✅ | linha real no Postgres; honeypot re-testado |
| Higiene (greps) | `use client`, `unoptimized`, `consultant-portrait`, segredos no bundle | ✅ | ver "Higiene" |

## Saída Relevante

### Análise do CSS compilado (RF-06)

```
@keyframes fade-up{0%{opacity:0;transform:translateY(1.25rem)}to{opacity:1;transform:none}}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
  .animate-on-scroll{animation:linear both fade-up;animation-timeline:view();animation-range:entry cover 20%}}}
```

- Única ocorrência de `opacity:0` em todo o CSS está **dentro do `@keyframes`** (inerte sem animação aplicada).
- `.animate-on-scroll` só existe dentro de `@supports (animation-timeline: view())` **aninhado** em `@media (prefers-reduced-motion: no-preference)` → Safari/Firefox (sem suporte) e usuárias com `reduce` recebem conteúdo plenamente visível, sem animação. Nenhum vazamento.
- Hovers dos cards: `transition-all hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none` — transform e transition neutralizados sob `reduce`.

### HTML servido (`curl http://127.0.0.1:3999/`)

- Header: `<header class="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">`.
- Marca: "Lais Barbosa" em `<span class="text-sm font-semibold tracking-tight whitespace-nowrap …">` — **sem nenhuma classe `hidden`/breakpoint que a esconda**.
- Skip link: primeiro elemento focável do body (index 3779 < header 4050 no HTML), com `focus:z-[60]` (> `z-50` do header).
- `scroll-mt-20` presente nas 4 seções ancoradas (`#produtos`, `#sobre`, `#depoimentos`, `#contato`); `animate-on-scroll` nas 5 seções.
- 1 único `<h1>`; `role="list"` no `<ul>` de depoimentos; rótulos "(exemplo)" e nota "Depoimentos ilustrativos — conteúdo real será publicado em breve." presentes.
- Fotos reais com alts pt-BR factuais citando "Lais Barbosa, consultora de beleza Mary Kay…" (hero, sobre, contato); dimensões declaradas = intrínsecas (`file`): portrait 1122×1402, standing 1086×1448, wide 1672×941; mapeamento fonte→destino conferido por md5 (2→portrait, 4→standing, 3→wide, 1→square).
- Hero: `priority` efetivo — `<link rel="preload" as="image" imagesrcset=… imagesizes=…>` no head, sem `loading="lazy"`; about/wide com `loading="lazy"`.
- `sizes` presentes: hero/about `(min-width: 768px) 50vw, 100vw`; contato `(min-width: 1024px) 50vw, 100vw`.

### Imagens em runtime

```
/_next/image portrait w=384 → 200 image/webp 17.9KB · w=640 → 32.8KB · w=1080 → 59.1KB
/_next/image standing w=1080 → 200 image/webp 58.2KB · wide w=1080 → 22.5KB
/images/lais-barbosa-{portrait,standing,wide,square}.png → 200 (fontes 1.8–2.0MB)
```

Otimizador ativo no standalone: variantes webp de 18–59KB (« gate de 200KB do plan) a partir de PNGs de ~2MB.

### Fluxo de lead fim-a-fim (RF-05)

1. POST `/` com `Next-Action: 401d2c6cd964339555daccadd7ebdc974b25a5596a` (manifest do standalone), payload válido → `{"ok":true}`; psql: linha em `leads` com `whatsapp` normalizado (`(11) 91234-7014` → `11912347014`), `status=new`, `consent_at` não-nulo.
2. Honeypot preenchido (`website:"http://spam.example"`) → `{"ok":true}` sintético e `count(*)=0` para o nome — **nenhuma linha criada**.
3. Logs de web e API sem PII (grep por nome/telefone/spam → vazio).

### Higiene

- `"use client"`: apenas `lead-form.tsx` + `ui/{checkbox,label}.tsx` (todos pré-existentes do LP-06) — **zero novo**.
- `unoptimized`: só nos SVGs placeholder (produtos e avatares fictícios) — nenhuma foto real.
- `consultant-portrait`: **zero referências** em `src/` e `public/` (grep) — o arquivo SVG órfão permanece em `public/placeholders/` (sem uso).
- Bundle client (`.next/static/`): sem `API_URL`/`localhost:3001`/telefone.
- `lead-form.tsx`: comparado ao contrato aprovado no LP-06 (`specs/lead-capture-form/review.md`) — mesma lógica (RHF + `leadFormSchema` do shared, honeypot, estados enviando/sucesso/erro com retry, ids, `INTEREST_MAX_LENGTH`); **nenhuma mudança de lógica**.

### Teardown

Lead de QA removido do banco; web standalone e API encerrados; `docker compose -f docker-compose.dev.yml down` executado (volume preservado).

## Pendências

- **E2E Playwright** (REL-01): infra inexistente — âncoras com scroll real, animações e foco visual do skip link não exercitados em browser.
- **Verificações sem browser** (análise estática + estimativa, registradas no review): nav em linha única a 375px (estimativa ~311px ≤ 343px úteis), headings não escondidos sob o header (scroll-mt 80px vs header ~45px), contraste dos links sobre o blur (ver ALERTA #1 do review).

---

# Validate: landing-visual-refinement (rodada 2 — delta pós-fix)

Escopo: re-verificação focada do delta aplicado após a rodada 1 (ALERTA #1 + SUGESTÕES #2/#3/#4-SVG) + não-regressão. Revisor neutro, sem acesso ao raciocínio do fixer.

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 87 arquivos, 0 problemas |
| Typecheck | `bun run typecheck` | ✅ | shared, web e api — exit 0 |
| Testes | `bun run test` | ✅ (99 passed, 0 failed) | 15 arquivos — idêntico ao baseline da rodada 1 |
| Build | `cd apps/web && bun run build` | ✅ | `/` prerenderizada `○ (Static)`; 6/6 páginas estáticas |
| HTML prerenderizado | grep em `.next/server/app/index.html` | ✅ | ver "Delta verificado" |
| CSS compilado | grep em `.next/static/chunks/40ugfkgfczbky.css` | ✅ | utilities novas emitidas |
| Contraste (estimativa numérica) | script Python (WCAG relative luminance) | ✅ | ver "Contraste" |
| Higiene (greps) | `consultant-portrait`, `bg-background/80`, `sizes` | ✅ | zero referência em código/HTML/public |

## Delta verificado

- `site-header.tsx:15` — `bg-background/90` (era `/80`); demais classes do header idênticas à rodada 1 (`sticky top-0 z-50 border-b border-border/60 backdrop-blur`).
- `site-header.tsx:26` — links da nav: `text-foreground/70 transition-colors motion-reduce:transition-none hover:text-foreground` (era `text-muted-foreground`); presentes nos 4 links no HTML prerenderizado.
- `hero.tsx:36` / `about.tsx:19` — `sizes="(min-width: 1152px) 552px, (min-width: 768px) 50vw, 100vw"` (exatamente o valor sugerido na rodada 1); `priority` do hero e lazy do about preservados.
- `public/placeholders/consultant-portrait.svg` — **removido**; grep por `consultant-portrait` em `src/`, `public/` e no HTML/CSS buildado: zero (menções restantes só em specs históricas).
- CSS compilado emite `text-foreground\/70` e `bg-background\/90` com `color-mix(in oklab, …)` + fallback sólido; `motion-reduce\:transition-none` presente.
- Nada mais mudou nos 3 arquivos vs o contrato documentado na rodada 1: marca "Lais Barbosa" sem classe de ocultação, `whitespace-nowrap`, `text-xs min-[420px]:text-sm`, `scroll-mt-20`, `animate-on-scroll`, alts, width/height — intactos. `lead-section.tsx` (sizes `(min-width: 1024px) 50vw, 100vw`) e `page.tsx` (skip link `focus:z-[60]`) inalterados.

## Contraste (ALERTA #1 da rodada 1)

`text-foreground/70` (`oklch(0.145 0 0)` ≈ #0a0a0a a 70%) composto sobre `bg-background/90` (branco a 90%) sobre conteúdo blurado X:

| Cenário sob o blur | Contraste |
|---|---|
| Foto clara/branca (pior caso pedido) | **7.63:1** |
| Foto média-alta (lum. média 184) | 7.42:1 |
| Foto escura (p10 = 60) | 7.05:1 |
| Preto absoluto (piso teórico) | **6.86:1** |

Todos os cenários ≥ 4.5:1 (AA) com folga ampla — o piso teórico (6.86:1) supera até AAA (4.5:1) para o body text em questão. O ALERTA #1 está **resolvido por margem**, sem depender de browser.

## Pendências (inalteradas da rodada 1)

- E2E Playwright (REL-01) — infra inexistente.
- Confirmação em browser real do comportamento visual (nav 375px, âncoras com scroll, foco do skip link).
