// Catálogo de destaque placeholder (LP-05). Produtos são de exemplo (categorias
// típicas de skincare/maquiagem, sem SKU/nome comercial real) até o LP-08/CRM-08,
// quando a fonte passa a ser o CRM. A nota da seção deixa explícito que é exemplo.
// Dinheiro sempre em centavos inteiros (core.md/database.md); a formatação para R$
// acontece só na borda de exibição (lib/format.ts).

export type ProductImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type FeaturedProduct = {
  id: string;
  name: string;
  priceCents: number;
  image: ProductImage;
};

export type FeaturedCatalogContent = {
  heading: string;
  note: string;
  products: readonly FeaturedProduct[];
};

const PRODUCT_IMAGE_SIZE = 600;

export const featuredCatalog = {
  heading: "Produtos em destaque",
  note: "Produtos ilustrativos (exemplo) — o catálogo real será publicado em breve.",
  products: [
    {
      id: "example-serum-hidratante",
      name: "Sérum facial hidratante (exemplo)",
      priceCents: 8990,
      image: {
        src: "/placeholders/product-1.svg",
        alt: "Ilustração de exemplo de um sérum facial hidratante",
        width: PRODUCT_IMAGE_SIZE,
        height: PRODUCT_IMAGE_SIZE,
      },
    },
    {
      id: "example-creme-noturno",
      name: "Creme antissinais noturno (exemplo)",
      priceCents: 12900,
      image: {
        src: "/placeholders/product-2.svg",
        alt: "Ilustração de exemplo de um creme antissinais noturno",
        width: PRODUCT_IMAGE_SIZE,
        height: PRODUCT_IMAGE_SIZE,
      },
    },
    {
      id: "example-base-liquida",
      name: "Base líquida de cobertura natural (exemplo)",
      priceCents: 9950,
      image: {
        src: "/placeholders/product-3.svg",
        alt: "Ilustração de exemplo de uma base líquida de cobertura natural",
        width: PRODUCT_IMAGE_SIZE,
        height: PRODUCT_IMAGE_SIZE,
      },
    },
    {
      id: "example-batom-matte",
      name: "Batom matte de longa duração (exemplo)",
      priceCents: 4550,
      image: {
        src: "/placeholders/product-4.svg",
        alt: "Ilustração de exemplo de um batom matte de longa duração",
        width: PRODUCT_IMAGE_SIZE,
        height: PRODUCT_IMAGE_SIZE,
      },
    },
    {
      id: "example-mascara-cilios",
      name: "Máscara para cílios com volume (exemplo)",
      priceCents: 5990,
      image: {
        src: "/placeholders/product-5.svg",
        alt: "Ilustração de exemplo de uma máscara para cílios com volume",
        width: PRODUCT_IMAGE_SIZE,
        height: PRODUCT_IMAGE_SIZE,
      },
    },
    {
      id: "example-protetor-solar",
      name: "Protetor solar facial FPS 50 (exemplo)",
      priceCents: 7900,
      image: {
        src: "/placeholders/product-6.svg",
        alt: "Ilustração de exemplo de um protetor solar facial FPS 50",
        width: PRODUCT_IMAGE_SIZE,
        height: PRODUCT_IMAGE_SIZE,
      },
    },
  ],
} as const satisfies FeaturedCatalogContent;

// Mensagem pré-preenchida do WhatsApp por produto (pt-BR). Nomeada e testável:
// inclui o nome do produto para que a consultora saiba o que gerou o contato (RF-03).
export function buildProductMessage(name: string): string {
  return `Olá! Quero pedir o produto ${name}.`;
}
