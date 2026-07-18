---
feature: featured-catalog
module: web
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: Catálogo de destaque na landing

## O Que

Seção de catálogo na landing: cards de produto (foto, nome, preço) com botão "Pedir pelo WhatsApp" que abre o `wa.me` com mensagem pré-preenchida contendo o nome do produto (rastreia qual produto gerou o contato). Dados estáticos em config nesta fase — o CRM alimentará no CRM-08.

## Por Que

Item **LP-05** do roadmap (Fase 1). A landing direciona a venda para o WhatsApp; o catálogo transforma interesse em contato qualificado (a mensagem já diz qual produto a pessoa quer).

## Requisitos

- **RF-01** — Dados estáticos tipados em `src/content/products.ts`: lista de produtos de destaque com `id`, `name`, `priceCents` (**inteiro em centavos** — regra do projeto), `image` (src/alt/width/height) e a config da seção (heading, nota de placeholder). Conteúdo placeholder honesto (produtos rotulados como exemplo até o LP-08).
- **RF-02** — Formatador `formatBRL(cents)` em `lib/format.ts`: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, dividindo por 100 **apenas na formatação** (`web.md`); coberto por unidade (0, valores com centavos, milhares).
- **RF-03** — Componente Server `FeaturedCatalog` (`components/landing/featured-catalog.tsx`): grid mobile-first de cards shadcn (1 coluna em 375px, 2 em `sm`/`md`, 3 em `lg`) — cada card com imagem (`next/image`, placeholder SVG local `unoptimized`), nome (heading), preço formatado e `WhatsAppCta` com `message` pré-preenchida incluindo o nome do produto (template pt-BR único e nomeado).
- **RF-04** — Seção integrada à página entre hero e sobre (prioridade de venda), com `aria-labelledby` e h2 próprio, mantendo a ordem geral hero → catálogo → sobre → depoimentos → rodapé.
- **RF-05** — Página `/` continua 100% estática (zero `"use client"`); acessibilidade: alt por imagem, heading por card não competindo com o h2 da seção (h3), link CTA com nome acessível que inclui o produto no formato WCAG 2.5.3 (texto visível como prefixo contíguo): `aria-label="Pedir pelo WhatsApp: <produto>"`.

## Critérios de Aceite

- [ ] (RF-01) Typecheck prova o shape; grep: nenhum preço/nome de produto hardcoded em componente.
- [ ] (RF-02) Unidade: `formatBRL(3550)` → `R$ 35,50` (com espaço não separável do Intl), `formatBRL(0)` → `R$ 0,00`, `formatBRL(129900)` → `R$ 1.299,00`.
- [ ] (RF-03) HTML servido: um card por produto da config, com preço formatado e link `wa.me` cujo `?text=` urlencoded contém o nome do produto daquele card.
- [ ] (RF-04) Ordem das seções no HTML: hero → catálogo → sobre → depoimentos → rodapé; h2 na seção.
- [ ] (RF-05) Zero `"use client"`; rota `/` estática no build; `aria-label` dos CTAs inclui o nome do produto.

## Fora de Escopo

- Produtos reais e fotos reais (LP-08 — humano); catálogo alimentado pelo CRM (CRM-08).
- Página de detalhe de produto, carrinho, checkout (não existem nesta fase).
- Filtros/busca/carrossel — grid estático simples.

## Restrições Conhecidas

- Dinheiro **sempre** em centavos inteiros no dado; formatação só na borda de exibição (`core.md`/`web.md`/`database.md`).
- Reuso obrigatório de `WhatsAppCta` (LP-04) e `Card` (shadcn, LP-03) — sem componente novo de botão.
- ADR-0006: sem git de escrita.
