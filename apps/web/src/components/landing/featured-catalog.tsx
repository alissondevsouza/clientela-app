import Image from "next/image";
import { WhatsAppCta } from "@/components/landing/whatsapp-cta";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { buildProductMessage, featuredCatalog } from "@/content/products";
import { formatBRL } from "@/lib/format";

const { heading, note, products } = featuredCatalog;

export function FeaturedCatalog() {
  return (
    <section
      id="produtos"
      aria-labelledby="featured-catalog-heading"
      className="animate-on-scroll mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 md:py-16"
    >
      <div className="flex flex-col gap-2 text-center">
        <h2
          id="featured-catalog-heading"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {heading}
        </h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>

      <ul className="mt-8 grid list-none grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none">
              <Image
                src={product.image.src}
                alt={product.image.alt}
                width={product.image.width}
                height={product.image.height}
                unoptimized
                className="aspect-square w-full object-cover"
              />
              <CardContent className="flex flex-col gap-1">
                <h3 className="font-heading text-base leading-snug font-medium">
                  {product.name}
                </h3>
                <p className="text-base font-semibold text-foreground">
                  {formatBRL(product.priceCents)}
                </p>
              </CardContent>
              <CardFooter>
                <WhatsAppCta
                  size="sm"
                  className="w-full"
                  message={buildProductMessage(product.name)}
                  ariaLabel={`Pedir pelo WhatsApp: ${product.name}`}
                >
                  Pedir pelo WhatsApp
                </WhatsAppCta>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
