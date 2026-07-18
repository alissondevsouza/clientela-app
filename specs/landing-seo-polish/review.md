---
feature: landing-seo-polish
module: web
phase: review
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: landing-seo-polish (rodada 1)

Revisor neutro (não implementou). Arquivos revisados: `apps/web/src/content/site.ts`, `app/layout.tsx`, `app/opengraph-image.tsx`, `app/sitemap.ts`, `app/robots.ts`, `app/(landing)/page.tsx`, `components/landing/{site-header,featured-catalog,about,testimonials,hero,lead-section}.tsx`, `content/landing.ts`, `lib/env.ts`, `lib/env.test.ts`, `.env.example` (+ `.env.local` local).

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md (RF-01..07 exercitados de fato — ver validate.md)
- [x] Edge cases: env ausente/inválida/malformada cobertas; erro de env não vaza valor; ids de âncora únicos; alvos de todas as âncoras existem
- [x] Tratamento de erro: falha de env é explícita, cita só o NOME da variável (security.md)

### Arquitetura (rules typescript/api.md, web.md)
- [x] n.a. camadas de API — escopo é só web
- [x] Zod na fronteira: `SITE_URL` validada em `loadWebEnv` (http/https, obrigatória, sem default)
- [x] Web: nenhum `"use client"` novo (os 3 existentes são do LP-06/shadcn); página `/` permanece estática; mobile-first (ver ALERTA 1)
- [x] n.a. dinheiro/transação

### Banco (database.md)
- [x] n.a. — sem banco no escopo

### Segurança e LGPD (security.md)
- [x] Sem rota nova de API; sem segredo em código; `.env.local` gitignored; `.env.example` sem valores sensíveis e documentado (nota LP-10/12)
- [x] Erro de env nunca ecoa o valor recebido (teste `não vaza o valor inválido` cobre)
- [x] n.a. captura de dados (inalterada)

### Tipos e qualidade (core.md)
- [x] Sem `any`/`as`/`!`; `as const` nos módulos de conteúdo; constantes nomeadas para as cores da OG image
- [x] `export default` só onde o framework exige (layout/page/opengraph-image/sitemap/robots — exceção prevista na rule); demais named exports
- [x] Textos de UI/metadata em pt-BR; placeholders honestos (sem forjar nome/prova social)

### Testes (testing.md)
- [x] RF-01/RF-07: unidade da env (válida https, ausente, protocolo inválido) — derivados do spec; RF-02..06 são markup/metadata sem lógica, validados por execução real (validate.md), conforme decisão de cobertura do plan.md
- [x] n.a. Testcontainers/regressão
- [x] Nenhum teste relaxado/skipado (99/99)

### Escopo
- [x] Tasks 1.1, 2.1, 2.2, 3.1 implementadas; nada além do escopo
- [x] Nenhum arquivo fora do escopo modificado (conferido por leitura dos arquivos do escopo + git status)

## Verificações adversariais específicas (todas negativas)

- Canonical/og:url divergentes do SITE_URL → não: ambos resolvidos de `metadataBase` (`http://localhost:3000`).
- og:image duplicada no objeto metadata → não: `openGraph`/`twitter` não declaram `images`; única og:image vem da convenção de arquivo; twitter:image via fallback (sem arquivo próprio).
- Título duplicando marca → não: default é só a marca; template `%s | marca` aplica-se apenas a sub-páginas.
- 2º h1 no header → não: marca é `<span>`; h1 único no hero.
- Skip link não-primeiro-focável → não: 1º focável do body (antes só `<div hidden>`).
- Âncora sem alvo / id duplicado → não: 4 âncoras + `#conteudo`, todos os ids existem exatamente 1 vez, com `scroll-mt-8`.
- Env de teste desatualizada → não: `validSource` inclui `SITE_URL`.

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | ALERTA | Marca do header oculta abaixo de 400px (`hidden min-[400px]:inline-block`): a 375px — viewport primária do projeto (web.md mobile-first) — o header renderiza sem marca visível. O RF-05 pede "header com marca em texto"; o critério de aceite formal (nav em 1 linha a 375px) está atendido e a decisão foi registrada no Decisions Log, por isso não é CRÍTICO. Estimativa por largura de texto (marca "Mary Kay" ~62px + nav ~257px vs ~343px úteis) indica que a marca provavelmente CABE a 375px com os gaps atuais | `apps/web/src/components/landing/site-header.tsx:16` | Na verificação visual do handoff (junto do Lighthouse), testar remover o `hidden min-[400px]:inline-block` (ou baixar para `min-[360px]:`) e manter a marca visível a 375px |
| 2 | SUGESTÃO | Assimetria de cobertura: `API_URL` tem caso de URL malformada (`"not a url"`), `SITE_URL` só tem protocolo inválido (`ftp://`). Os 3 casos exigidos pelo spec (ausente/inválida/válida) estão cobertos — é completude, não gap de critério | `apps/web/src/lib/env.test.ts:95-99` | Adicionar `rejeita SITE_URL malformada` espelhando o caso da API_URL |

## Veredito

**APROVADO** — lint/typecheck/build limpos, 99/99 testes, todos os critérios de aceite RF-01..07 verificados por execução real (validate.md), zero CRÍTICO. Pendências de handoff: Lighthouse/visual 375px em browser real, E2E (infra futura), fonte Google no build Docker (LP-11).
