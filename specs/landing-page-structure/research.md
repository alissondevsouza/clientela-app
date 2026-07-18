---
feature: landing-page-structure
module: web
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: Estrutura da landing page

## Código Existente Relevante

| Arquivo | Linhas | Relevância |
|---------|--------|------------|
| `apps/web/src/app/page.tsx` | 1–7 | Home "em construção" — será movida para `(landing)/page.tsx` e substituída |
| `apps/web/src/app/layout.tsx` | 1–17 | Root layout com `lang="pt-BR"`, metadata básica — mantém; landing pode ter layout próprio no group se necessário (não é: root basta) |
| `apps/web/src/app/globals.css` | 1 | Só `@import "tailwindcss"` — o init do shadcn adiciona tema (CSS variables) aqui |
| `apps/web/package.json` | — | Next 16.2, React 19.2, Tailwind v4 via `@tailwindcss/postcss`; sem shadcn ainda |
| `apps/web/next.config.ts` | — | `output: "standalone"` (pensando no LP-11) — não conflita |

## Padrões do Codebase a Seguir

- Named exports (exceto page/layout, exigência do Next); kebab-case nos arquivos.
- pt-BR nos textos de UI; conteúdo centralizado segue o espírito de "constantes nomeadas".
- `core.md`: sem `any`, tipos inferidos; conteúdo tipado com `as const` + `satisfies` quando útil.

## Referências (skills)

- `.claude/skills/shadcn-ui/SKILL.md`: instalação via `bunx shadcn@latest init` + `add button card`; em Tailwind v4 o init escreve CSS variables no globals.css (`@theme inline`), gera `components.json` e `lib/utils.ts` (cn com clsx + tailwind-merge — deps novas: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` conforme componentes).
- `.claude/skills/tailwindcss/SKILL.md`: v4 CSS-first; breakpoints default (`sm:640`, `md:768`, `lg:1024`) — mobile-first = classes sem prefixo para 375px.
- `.claude/skills/react/SKILL.md`: Server Components por default; zero estado/efeito nesta feature.

## Dependências Entre Packages

- Só `apps/web`. Deps novas do shadcn no workspace web (justificativa: ADR-0004 já decidiu shadcn/ui; o init as traz).
- Monorepo: rodar o CLI do shadcn com cwd `apps/web` (components.json local ao workspace).

## Gaps Identificados

- Não há assets: criar placeholders locais em `apps/web/public/` (SVG simples gerado à mão — sem binário externo).
- Não há teste de UI (sem testing-library/E2E): cobertura via lint + typecheck + build + verificação de runtime na QA (HTML servido). Registrar dispensa no plan.
- `(landing)` group não existe — mover `page.tsx` cria a estrutura de `web.md`.

## Referências Externas

- `project-memory/03-features.md` (Fase 1 — apresentação, prova social), `project-memory/UI-resources/` (se houver material de referência visual, usar como inspiração de tom).
