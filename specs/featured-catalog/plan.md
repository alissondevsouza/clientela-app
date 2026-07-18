---
feature: featured-catalog
module: web
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: Catálogo de destaque

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `products.ts` separado de `landing.ts` | CRM-08 substituirá a fonte dos produtos (config → API); seções institucionais permanecem em `landing.ts` |
| Template da mensagem em `products.ts` como função nomeada `buildProductMessage(name)` (texto pt-BR) | É conteúdo (texto), mas parametrizado — função pura no módulo de conteúdo, testável e trocável no LP-08 |
| `formatBRL` em `lib/format.ts` com `Intl.NumberFormat` instanciado uma vez no módulo | Instanciar por chamada é desperdício; formatador é imutável |
| Preço no card com `<data value={cents}>` ou texto simples? → texto simples | `<data>` sem consumidor não paga o custo; HTML simples |
| Cards: imagem no topo (aspect fixo), conteúdo, CTA `variant="default" size="sm"` full-width no rodapé do card | Padrão de e-commerce mobile; toque fácil (44px+) |
| **6** produtos placeholder (skincare/maquiagem típicos Mary Kay, rotulados exemplo) | Grid 1/2/3 colunas fecha sem card órfão em todas as larguras (6 = múltiplo de 2 e de 3) |
| `WhatsAppCta` ganha prop opcional `ariaLabel` (não spread genérico) | RF-05 exige nome acessível com o produto; tipo fechado preserva a disciplina de props do componente |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---------|-----------|
| `apps/web/src/content/products.ts` | Produtos de destaque tipados + heading/nota da seção + `buildProductMessage` |
| `apps/web/src/content/products.test.ts` | Unidade de `buildProductMessage` (contém o nome; pt-BR) |
| `apps/web/src/lib/format.ts` | `formatBRL(cents)` |
| `apps/web/src/lib/format.test.ts` | Unidade RF-02 |
| `apps/web/src/components/landing/featured-catalog.tsx` | Seção + grid de cards |
| `apps/web/public/placeholders/product-{1..6}.svg` | Imagens placeholder de produto (uma por produto) |

### Modificar
| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/app/(landing)/page.tsx` | Insere `<FeaturedCatalog />` entre `<Hero />` e `<About />` |
| `apps/web/src/components/landing/whatsapp-cta.tsx` | + prop opcional `ariaLabel?: string` repassada como `aria-label` do `<a>` (tipo continua fechado — sem spread genérico) |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **sim** | `formatBRL` (moeda é invariante do projeto) e `buildProductMessage` (contém o nome — é o rastreio do RF-03) |
| Integração | n.a. | Sem banco/API |
| E2E | pendência (sem infra) | Registrada em known-issues |
| Regressão | n.a. | Não é bug |

## Migração de Banco

n.a.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Espaço não separável do Intl (U+00A0/U+202F) quebrar asserts ingênuos | alta | Asserts usam o output real do Intl (comparar com string construída com o mesmo separador) |
| Grid 3 colunas apertar em `lg` com card + CTA | baixa | `max-w-6xl` já limita; revisar classes no QA de runtime |

## Definition of Done
- [ ] Critérios de aceite atendidos e testados
- [ ] lint/typecheck/test verdes; build web `/` estática
- [ ] QA runtime: cards no HTML com wa.me por produto
- [ ] Conformidade com rules/ADRs
