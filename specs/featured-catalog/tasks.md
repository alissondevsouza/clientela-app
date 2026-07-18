---
feature: featured-catalog
module: web
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: Catálogo de destaque

## Milestone 1: Dados e formatação

- [x] **Task 1.1** — `content/products.ts` (6 produtos exemplo com priceCents inteiro, imagens, heading/nota da seção, `buildProductMessage(name)`) + SVGs `product-{1..6}.svg` (um por produto) + teste de `buildProductMessage` (inclui o nome; pt-BR)
  - Arquivos: `apps/web/src/content/products.ts`, `apps/web/src/content/products.test.ts`, `apps/web/public/placeholders/product-{1..6}.svg`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: unidade verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 1.2** — `lib/format.ts` (`formatBRL`) + `format.test.ts` (0, centavos, milhares — atenção ao espaço não separável do Intl)
  - Arquivos: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: unidade verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Componente e integração

- [x] **Task 2.1** — Adicionar prop opcional `ariaLabel?: string` ao `WhatsAppCta` (repassada como `aria-label` do `<a>`; tipo fechado, sem spread); criar `FeaturedCatalog` (grid 1/2/3 colunas, Card shadcn, imagem `unoptimized`, h2 da seção + h3 por card, preço `formatBRL`, `WhatsAppCta` com `message={buildProductMessage(name)}` e `ariaLabel` incluindo o produto) + integração na página entre Hero e About
  - Arquivos: `apps/web/src/components/landing/whatsapp-cta.tsx`, `apps/web/src/components/landing/featured-catalog.tsx`, `apps/web/src/app/(landing)/page.tsx`
  - Dependências: Task 1.1, Task 1.2
  - Paralelizável: não
  - Verificação: `bun run lint`/`typecheck`/`test` raiz verdes; `cd apps/web && bun run build` → `/` estática; HTML gerado tem 6 cards com wa.me por produto, **cada `?text=` urlencoded contém o nome do produto do card** e cada CTA tem `aria-label="Pedir pelo WhatsApp: <produto>"` (grep no HTML)
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem de Execução

M1 (1.1 ∥ 1.2) → M2 (2.1).

## Definition of Done (agregado)
- [ ] Critérios do spec.md atendidos e testados
- [ ] lint/typecheck/test verdes; build `/` estática
- [ ] Zero `"use client"`
