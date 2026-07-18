---
feature: landing-page-structure
module: web
phase: review
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: landing-page-structure (rodada 2)

Revisor neutro (não implementou nem corrigiu). Repositório sem commits — sem diff contra `main`; escopo revisado = arquivos da landing + `apps/web/package.json` + `bun.lock` + `biome.json` (mesmo da rodada 1).

## Resumo da rodada 1

**REPROVADO** por 1 CRÍTICO: dependência fantasma `shadcn` — `globals.css:3` importa `@import "shadcn/tailwind.css"`, mas o pacote não estava em `package.json` nem `bun.lock`; o build só passava por resíduo em `node_modules` (estado não reproduzível = deploy quebrado). Também: SUGESTÃO #2 (`lucide-react` declarada e não usada) e SUGESTÃO #3 (RF-08 cita `header`, ausente — sem conteúdo de header nesta fase, não bloqueia). Todo o resto (arquitetura web.md, a11y, RF-01..09, segurança/LGPD, testes) estava conforme.

## O que mudou entre rodadas (fix)

- `apps/web/package.json`: `shadcn@^4.13.0` adicionado como **devDependency**; `lucide-react` removida.
- `bun.lock`: reconciliado (`shadcn@4.13.0` rastreado; `lucide-react` ausente).
- Nenhum arquivo da landing (componentes/CSS/conteúdo/SVGs) alterado — conferido: comportamento de runtime idêntico ao da rodada 1.

## Verificação adversarial do fix (executada de fato — ver validate.md rodada 2)

- [x] **Instalação limpa reproduz o build**: `rm -rf node_modules` (raiz + 3 workspaces) + `rm apps/web/.next` → `bun install` → `next build` compila do zero e marca `/` estática. O CRÍTICO da rodada 1 está **resolvido de verdade**, não mascarado por resíduo.
- [x] **Lockfile estável**: sha256 de `bun.lock` idêntico antes/depois de `bun install` — instalação determinística, working tree não muda.
- [x] **Import resolve por contrato do pacote**: `shadcn@4.13.0` exporta `"./tailwind.css": "./dist/tailwind.css"` — o `@import` de `globals.css` não depende de path interno não exportado.
- [x] **Classificação devDependency é correta**: o CSS do shadcn é consumido só em build-time (Tailwind/PostCSS); o output SSG não referencia o pacote em runtime. O estágio de build (local, CI ou Docker) instala devDeps de qualquer forma (`typescript`, `tailwindcss` já são devDeps).
- [x] **`lucide-react` fora sem quebra**: zero imports no código; únicas menções são `components.json` (`iconLibrary` — config do CLI, inerte) e artefatos `.next/` velhos, apagados; rebuild limpo não a reintroduz. Resolve a SUGESTÃO #2 da rodada 1.
- [x] Gates: lint limpo (54 arquivos) · typecheck 3× exit 0 · 52/52 testes · build ok.
- [x] Runtime re-exercitado pós-instalação limpa: 1 h1 + 3 h2, seções na ordem hero→sobre→depoimentos, 5/5 imgs com alt, CTA `#contato` com alvo (`<footer id="contato">`), 6×"(exemplo)", 4 SVGs 200, zero `"use client"`, RF-06 (conteúdo só em `landing.ts`).

## Critérios de aceite (spec.md)

| Critério | Status |
|---|---|
| RF-01 — button/card gerados e usados; lint/typecheck limpos | ✅ |
| RF-02 — `(landing)/page.tsx`; build `/` estática (○) | ✅ (pós-instalação limpa) |
| RF-03..05 — 3 seções na ordem, conteúdo de `landing.ts` no HTML | ✅ |
| RF-06 — nenhum texto de seção fora de `content/landing.ts` | ✅ |
| RF-07 — responsividade 375px/1024px | ✅ análise estática (rodada 1); **inspeção visual real fica para o humano** |
| RF-08 — 1 h1, h2 por seção, alt em toda img, nomes acessíveis | ✅ |
| RF-09 — zero `"use client"`; named exports | ✅ |

## Problemas Encontrados (rodada 2)

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | `progress.md` não tem entrada de Session Log para a sessão do fix (declaração do `shadcn` devDep + remoção de `lucide-react` + reconciliação do lock) nem para as rodadas de QA — `spec-format.md` diz que `progress.md` espelha e loga o ciclo. Não afeta código nem gates. | `specs/landing-page-structure/progress.md` | Adicionar linhas de Session Log (fix pós-QA-1 e QA rodadas 1–2) antes do handoff. |
| 2 | SUGESTÃO | (herdada da rodada 1, #3) RF-08 lista o landmark `header`; página não tem `<header>` — sem conteúdo de nav/logo nesta fase, critério de aceite não o exige. Registro para LP-07/08. | `apps/web/src/app/(landing)/page.tsx` | Envolver nav/logo em `<header>` quando existirem. |

Nenhum CRÍTICO ou ALERTA aberto. Achados #1 e #2 da rodada 1: resolvidos e verificados.

## Conformidade

- `web.md`: ✅ server-first (zero `"use client"`), mobile-first, `next/image` com alt, pt-BR, shadcn/Tailwind v4.
- `core.md`: ✅ — dependências agora justificadas e rastreadas; named exports; sem `any`/`as`/`!` indevidos.
- `security.md`/LGPD: ✅ sem PII (fotos reais não usadas; placeholders SVG abstratos), depoimentos rotulados "(exemplo)", sem segredo em código.
- `database.md`/`api.md`: n.a. (nada de API/banco tocado).
- `testing.md`/`spec-format.md`: dispensa de unidade/integração justificada no plan/Decisions Log (sem regra de negócio); E2E = pendência registrada; suíte existente 52/52.
- ADR-0006/git: ✅ nenhum git de escrita nesta QA (apenas leitura de status).

## Veredito

**APROVADO** — o CRÍTICO da rodada 1 foi corrigido e provado por instalação limpa reproduzível (lockfile estável, import resolvido por export do pacote, build/runtime verdes do zero). Todos os gates mecânicos verdes e critérios de aceite atendidos. Pendências não-bloqueantes para o handoff: inspeção visual real 375px/1024px (humano) e E2E futuro (known-issues).
