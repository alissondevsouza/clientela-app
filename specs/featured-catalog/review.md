---
feature: featured-catalog
module: web
phase: review
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: featured-catalog (rodada 1)

Revisor: clientela-implement-verifier (QA adversarial, neutro — sem acesso ao
raciocínio do implementador). Base: spec.md + working tree (repo sem commits;
todo o conteúdo é o "diff").

## Arquivos Revisados

- `apps/web/src/content/products.ts` + `products.test.ts`
- `apps/web/src/lib/format.ts` + `format.test.ts`
- `apps/web/src/components/landing/featured-catalog.tsx`
- `apps/web/src/components/landing/whatsapp-cta.tsx` (mudança: prop `ariaLabel`)
- `apps/web/src/app/(landing)/page.tsx`
- `apps/web/public/placeholders/product-{1..6}.svg`
- Suporte lido para contexto: `lib/whatsapp.ts`, `components/ui/card.tsx`, `hero.tsx`

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md (RF-01..05 — evidências no validate.md)
- [x] Edge cases: `formatBRL` coberto para 0/centavos/milhares; separador NBSP assertado contra o output real do Intl (verificado independentemente — não é falso verde)
- [x] Tratamento de erro: `buildWhatsAppUrl` valida telefone e lança; sem catch engolido

### Arquitetura (web.md)
- [x] Server Components — zero `"use client"` em todo `apps/web/src`
- [x] Conteúdo/dado em `content/products.ts`; componente só renderiza (nenhum nome/preço hardcoded em componente — grep limpo)
- [x] Mobile-first: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, sem larguras fixas
- [x] Dinheiro em centavos inteiros (`priceCents` int, `as const satisfies`); divisão por 100 só em `formatBRL` (borda de exibição)
- [x] Estados loading/vazio/erro: n.a. — conteúdo estático em build, sem fetch em runtime
- [x] Rota `/` 100% estática no build

### Banco (database.md)
- n.a. — sem banco no escopo

### Segurança e LGPD (security.md)
- [x] Sem segredo em código; telefone vem de env validada (`loadWebEnv`); página pública é a exceção prevista (landing)
- [x] Sem PII nova; sem log de dado pessoal

### Tipos e qualidade (core.md)
- [x] Sem `any`/`as` para calar compilador/`!`; `as const satisfies FeaturedCatalogContent` é uso legítimo (narrowing + checagem)
- [x] Constantes nomeadas (`CENTS_PER_UNIT`, `PRODUCT_IMAGE_SIZE`); named exports; kebab-case
- [x] `WhatsAppCta` com tipo **fechado** (sem spread genérico) — `ariaLabel` é prop explícita, conforme decisão do plan

### Acessibilidade (RF-05)
- [x] `aria-labelledby` + h2 próprio na seção; h3 real por card (não CardTitle, que é `div`)
- [x] Hierarquia h1 → h2 → h3 íntegra no HTML gerado
- [x] WCAG 2.5.3: texto visível "Pedir pelo WhatsApp" é prefixo contíguo do `aria-label="Pedir pelo WhatsApp: <produto>"`
- [x] `alt` único e descritivo por imagem

### Testes (testing.md)
- [x] RF-02 coberto por unidade (0, centavos, milhares); RF-01/03/04/05 provados por typecheck + inspeção do HTML de build (comportamento estático — sem superfície de runtime adicional)
- [x] Nenhum teste relaxado/skipado; asserts reais (sem `expect(true)`)
- [x] Testes derivam do spec (valores do RF-02 batem 1:1 com os critérios)

### Escopo
- [x] Todas as tasks do tasks.md implementadas; nada fora do escopo declarado
- [x] Reuso de `WhatsAppCta` e `Card` (restrição do spec) — sem componente novo de botão

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | `formatBRL` aceita qualquer `number` (não-inteiro, `NaN`, negativo) sem guarda — hoje inócuo (dados são literais inteiros typechecados), mas no CRM-08 o dado virá de API | `apps/web/src/lib/format.ts:12` | Quando a fonte virar dinâmica, guardar com `Number.isSafeInteger(cents)` (ou validar no schema Zod da fronteira) e cobrir com teste |
| 2 | SUGESTÃO | `<ul>` com `list-none`: VoiceOver/Safari remove a semântica de lista quando `list-style: none` | `apps/web/src/components/landing/featured-catalog.tsx:25` | Adicionar `role="list"` ao `<ul>` para preservar a semântica |
| 3 | SUGESTÃO | h3 do card duplica manualmente as classes do `CardTitle` (`font-heading text-base leading-snug font-medium`) — se o estilo do CardTitle mudar, os cards do catálogo divergem | `apps/web/src/components/landing/featured-catalog.tsx:38` vs `components/ui/card.tsx:41` | Extrair a lista de classes compartilhada, ou evoluir `CardTitle` para aceitar `asChild`/`as="h3"` |
| 4 | SUGESTÃO | 3º teste de `buildProductMessage` (loop sobre o catálogo) é quase tautológico — a função é `template + name`, já provada pelos 2 primeiros testes | `apps/web/src/content/products.test.ts:17-21` | Manter (barato) ou remover; sem impacto no veredito |

Nenhum CRÍTICO. Nenhum ALERTA.

## Veredito

**APROVADO** — lint/typecheck/testes/build verdes (validate.md), RF-01..05 e os
5 critérios de aceite comprovados no HTML gerado e por teste executável, zero
CRÍTICO. Pendências registradas: E2E (sem infra — já em known-issues) e
verificação de viewport real (sem browser no ambiente).
