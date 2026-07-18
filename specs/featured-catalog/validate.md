---
feature: featured-catalog
module: web
phase: validate
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: featured-catalog (rodada 1)

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 70 arquivos, limpo |
| Typecheck | `bun run typecheck` | ✅ | shared/web/api todos exit 0 |
| Testes | `bun run test` | ✅ (74 passed, 0 failed) | 12 arquivos de teste |
| Integração | n.a. | n.a. | Sem banco/API no escopo (plan.md) |
| Build | `cd apps/web && bun run build` | ✅ | Next 16.2.10; rota `/` prerenderizada estática (`○ (Static)`) |
| Runtime (skill verify) | `bun run start` + curl SVGs e `/` | ✅ | `product-{1..6}.svg` → 200 `image/svg+xml`; `/` → 200 |

## Saída Relevante

```
$ bun run lint
Checked 70 files in 18ms. No fixes applied.

$ bun run typecheck
@clientela/shared typecheck: Exited with code 0
@clientela/web typecheck: Exited with code 0
@clientela/api typecheck: Exited with code 0

$ bun run test
Test Files  12 passed (12)
     Tests  74 passed (74)

$ cd apps/web && bun run build
✓ Generating static pages using 4 workers (3/3)
Route (app)
┌ ○ /
└ ○ /_not-found
○  (Static)  prerendered as static content
```

### Inspeção do HTML gerado (`.next/server/app/index.html`)

- **6 cards** (`<h3>` por produto), nomes na ordem exata da config.
- **`?text=` de cada card** (urldecoded) contém o nome exato do produto:
  `Olá! Quero pedir o produto <nome>.` — verificado para os 6 produtos.
- **aria-labels**: 6 × `Pedir pelo WhatsApp: <produto>` — texto visível
  ("Pedir pelo WhatsApp") é prefixo contíguo (WCAG 2.5.3 ok).
- **Preços**: `R$ 89,90`, `R$ 129,00`, `R$ 99,50`, `R$ 45,50`,
  `R$ 59,90`, `R$ 79,00` presentes — separador **U+00A0** confirmado
  byte a byte no HTML servido (mesmo separador que o Intl real emite; verificado
  independentemente com `Intl.NumberFormat` no runtime: `52,24,a0,...`).
- **Ordem das seções** por offset dos ids: `hero-heading` (1558) →
  `featured-catalog-heading` (3419) → `about-heading` (17442) →
  `testimonials-heading` (18189) → `<footer` (22704). ✅
- **Imagens**: 6 `<img src="/placeholders/product-N.svg">` distintas, todas com
  `alt` não vazio e único por produto.
- **Hierarquia**: 1 × `<h1>` (hero), 4 × `<h2>` (catálogo, sobre, depoimentos,
  rodapé), h3 só dentro dos cards.
- **`"use client"`**: zero ocorrências em `apps/web/src/` (grep).
- **Hardcode**: grep por nomes de produto/`R$`/`priceCents`/valores em
  `components/` e `app/` — zero ocorrências fora de `content/products.ts`.

### SVGs

- `product-{1..6}.svg` bem-formados (parse XML ok), 600×600, `role="img"` +
  `aria-label` interno, servidos com `content-type: image/svg+xml`.

### Responsividade (análise estática — sem browser)

- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (1 col ≤ sm ⇒ 375px ok;
  2 em sm/md; 3 em lg — exatamente o RF-03). Container `w-full max-w-6xl px-4`;
  imagem `aspect-square w-full object-cover`; CTA `w-full` no rodapé do card.
  Sem larguras fixas em px.

## Pendências

- **E2E (Playwright)**: infra inexistente — pendência já registrada em
  `project-memory/known-issues.md` ("Infra de E2E ainda não existe"). Fluxo
  crítico (captura de lead/CTA) validado apenas via HTML estático gerado.
- **Responsividade real em viewport 375px**: verificada só por análise estática
  de classes (sem browser no ambiente de QA).
