---
feature: landing-visual-refinement
module: web
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: Refinamento visual da landing

## Decisões Técnicas

| Decisão | Justificativa |
|---|---|
| Header `sticky top-0 z-50 bg-background/80 backdrop-blur border-b`; `scroll-mt-20` nas seções (substitui `scroll-mt-8`) | Padrão sem JS; 20 (80px) cobre a altura do header (~52px) com folga em todos os breakpoints |
| Marca sempre visível: remover `hidden min-[400px]:`; nav `text-xs min-[420px]:text-sm` + `gap-2.5 sm:gap-5` | "Lais Barbosa" (12 chars, ~80px em text-sm) + 4 links precisam caber a 375px — reduzir tipografia da nav no estreito é melhor que esconder a marca (resolve o alerta da QA LP-07) |
| Fotos copiadas para `public/images/` com nomes descritivos em inglês; dimensões intrínsecas reais no `next/image`; `sizes` por layout; `priority` continua só no hero | Otimizador serve variantes; PNG fonte fica como está (sem compressão manual — fora de escopo) |
| Atribuição: hero=retrato-2 · sobre=retrato-4 · contato=paisagem-3 · quadrada-1 sem uso obrigatório | Ver research (inspeção visual); a 1 fica disponível sem forçar uso |
| Avatares SVG fictícios dos depoimentos permanecem | Fotos reais em falas inventadas associariam a pessoa real a conteúdo fictício — vetado no spec |
| Animações: bloco pequeno em `globals.css` — keyframes `fade-up` + utilitária `.animate-on-scroll` aplicada nas seções, dentro de `@supports (animation-timeline: view())` e fora de `prefers-reduced-motion`; hovers com utilities Tailwind (`transition`, `hover:shadow-lg hover:-translate-y-0.5`, `motion-reduce:transform-none`) | CSS-only, progressive enhancement real (default = visível); tw-animate-css já dá keyframes de entrada, mas scroll-driven exige CSS custom mínimo |
| `lead-section`: grid `lg:grid-cols-[1fr_minmax(0,480px)]` (foto+bullets | form) com foto `aria-hidden` decorativa? → NÃO: foto com alt real (conteúdo, não decoração) | A foto da consultora na seção de contato é informativa (quem vai te atender) |
| `content/landing.ts`: `nav.brand` → "Lais Barbosa"; `leadSection` ganha `highlights: string[]` e `image`; alts reescritos | Conteúdo continua centralizado; LP-08 edita textos sem tocar componentes |
| `lead-form.tsx` intocado em lógica (no máximo classes) | Fluxo aprovado no LP-06 com QA fim-a-fim; risco desnecessário |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---|---|
| `apps/web/public/images/lais-barbosa-{portrait,standing,wide,square}.png` | Cópias das fotos de UI-resources (2→portrait, 4→standing, 3→wide, 1→square) |

### Modificar
| Arquivo | Mudança |
|---|---|
| `apps/web/src/components/landing/site-header.tsx` | sticky + marca sempre visível + ajustes de nav |
| `apps/web/src/app/(landing)/page.tsx` | — (scroll-mt vive nas seções; conferir skip link/ordem) |
| `apps/web/src/components/landing/{hero,about}.tsx` | Foto real otimizada (`sizes`, sem `unoptimized`), `scroll-mt-20`, animação de entrada |
| `apps/web/src/components/landing/featured-catalog.tsx` | `scroll-mt-20`, hover dos cards, animação de entrada |
| `apps/web/src/components/landing/testimonials.tsx` | Redesign dos cards (aspas, contexto), `role="list"`, `scroll-mt-20`, animação |
| `apps/web/src/components/landing/lead-section.tsx` | Grid 2 colunas ≥lg com foto wide + bullets; `scroll-mt-20`; animação |
| `apps/web/src/content/landing.ts` | brand, alts, `leadSection.highlights`/`image`, contexto dos depoimentos |
| `apps/web/src/app/globals.css` | Bloco de animações scroll-driven (@supports + motion-reduce) |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|---|---|---|
| Unidade | não | Nenhuma regra de negócio nova (pirâmide `testing.md`); mudanças são markup/estilo/conteúdo |
| Integração | n.a. | Sem banco/API; fluxo de lead intocado em lógica |
| E2E | pendência (sem infra) | Inalterada |
| Regressão | n.a. | Não é bug |

Gates: lint + typecheck + suíte existente (99 testes — nada pode regredir) + build `/` estática + QA de runtime real (inclui re-verificar a submissão de lead fim-a-fim, pois a seção mudou de markup).

## Migração de Banco

n.a.

## Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| PNGs de 2MB pesarem no LCP mesmo com otimizador | média | `sizes` correto + `priority` só no hero; QA valida `/_next/image` servindo variante <200KB; se falhar, follow-up de compressão de fonte |
| `backdrop-blur` sem fundo suficiente prejudicar contraste AA dos links do header | baixa | `bg-background/80` + QA checa contraste das classes |
| Animação scroll-driven "piscar" conteúdo em navegadores sem suporte | baixa | Estado default = visível; animação só dentro de `@supports` |
| Nav + marca não caberem a 375px | média | text-xs no estreito; QA mede por análise de classes/comprimento; wrap proibido |

## Definition of Done
- [ ] Critérios de aceite RF-01..07 atendidos
- [ ] lint/typecheck/test verdes (99+); build `/` estática
- [ ] QA runtime: fluxo de lead re-verificado fim-a-fim; imagens otimizadas servidas
- [ ] Conformidade `web.md`/`core.md`; Decisions Log com a autorização das fotos
