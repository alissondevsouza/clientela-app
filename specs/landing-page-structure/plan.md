---
feature: landing-page-structure
module: web
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: Estrutura da landing page

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| shadcn/ui via CLI oficial (`bunx shadcn@latest init` + `add button card`) com cwd em `apps/web` | ADR-0004 já fixa shadcn/ui; CLI garante compat com Tailwind v4 e gera `components/ui/` canônico (não editar à mão — `web.md`) |
| Conteúdo placeholder em `src/content/landing.ts` tipado com `as const` | RF-06: trocar conteúdo real (LP-08) sem tocar componente; tipagem previne seção sem texto |
| Depoimentos rotulados como exemplo (“(exemplo)” no nome/rotulagem) | Honestidade: prova social falsa parecendo real viola o espírito LGPD/confiança; conteúdo real vem do LP-08 |
| Seções como Server Components em `components/landing/{hero,about,testimonials}.tsx` | `web.md` server-first; zero JS de cliente nesta feature |
| Imagens placeholder: SVGs locais em `public/placeholders/` renderizados com `next/image` + prop `unoptimized` | Sem serviço externo; o Image Optimizer do Next não serve SVG por padrão (`dangerouslyAllowSVG` seria config global desnecessária) — `unoptimized` por imagem resolve; quando o LP-08 trouxer fotos reais (PNG/JPG), remove-se a prop e o otimizador atua |
| CTA do hero aponta para `#contato`, e a própria página já tem um elemento `id="contato"` (rodapé "fale comigo" placeholder) | Âncora resolve desde já (sem fragment morto); LP-06 substitui o rodapé pelo formulário |
| Fotos reais de `project-memory/UI-resources/` NÃO entram como placeholder | Imagem de pessoa é dado pessoal; uso do material real é decisão do humano (LP-08) — placeholders são SVGs abstratos |
| Sem layout próprio no group `(landing)` por ora | Root layout basta; layout do group nasce quando o CRM (`(crm)`) exigir divergência |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `apps/web/components.json` | Config do shadcn (gerado pelo init) |
| `apps/web/src/lib/utils.ts` | `cn()` (gerado pelo init) |
| `apps/web/src/components/ui/button.tsx`, `card.tsx` | Componentes shadcn (gerados) |
| `apps/web/src/content/landing.ts` | Conteúdo placeholder tipado (hero, sobre, depoimentos) |
| `apps/web/src/components/landing/hero.tsx` | Seção hero |
| `apps/web/src/components/landing/about.tsx` | Seção sobre |
| `apps/web/src/components/landing/testimonials.tsx` | Seção depoimentos |
| `apps/web/src/app/(landing)/page.tsx` | Home montando as seções |
| `apps/web/public/placeholders/*.svg` | Fotos placeholder (consultora, avatares) |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/app/globals.css` | Tema shadcn (CSS variables) adicionado pelo init |
| `apps/web/src/app/page.tsx` | **Removida** (movida para o group `(landing)`) |
| `apps/web/package.json` | Deps do shadcn (cva, clsx, tailwind-merge, lucide-react) |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **dispensada** | Pela pirâmide de `testing.md`, unidade é obrigatória para "regra de negócio nova/alterada" — esta feature não tem nenhuma (componentes estáticos de apresentação). Gates: lint + typecheck + `next build` + verificação de runtime na QA (HTML servido, responsividade com check mecânico de overflow a 375px, a11y) |
| Integração | n.a. | Sem banco/API tocados |
| E2E | pendência (sem infra) | Registrada em known-issues; fluxo crítico de UI real só no LP-06 |
| Regressão | n.a. | Não é bug |

Dispensa registrada também no Decisions Log (critério de `spec-format.md`: "refactor/mudança sem regra de negócio, comportamento verificado por build + QA de runtime").

## Migração de Banco

n.a.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| CLI do shadcn incompatível com estrutura do monorepo/Tailwind v4 | média | Rodar com cwd `apps/web`; se o init falhar, instalação manual conforme docs oficiais do shadcn para **Tailwind v4** (CSS variables + `@theme inline` no globals.css, `components.json` e `lib/utils.ts` à mão — a seção manual da skill local é da era v3/tailwind.config.js e NÃO deve ser seguida) e registrar no Decisions Log |
| `next build` no monorepo com workspace deps | baixa | Build já era verde no F0-04; nada de novo em resolução de módulos |
| Placeholder parecer conteúdo real (depoimentos) | baixa | Rotular como exemplo no próprio conteúdo |

## Definition of Done
- [ ] Critérios de aceite do spec.md atendidos
- [ ] `bun run lint` e `bun run typecheck` limpos
- [ ] `bun run test` verde (suíte existente não regride)
- [ ] `next build` do web ok com `/` estática
- [ ] QA de runtime: página servida, 3 seções, responsiva (375px/1024px), a11y básica
- [ ] Conformidade com `web.md`, `core.md` e ADRs
