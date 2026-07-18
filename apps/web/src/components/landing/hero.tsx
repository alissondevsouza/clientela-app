import Image from "next/image";
import { WhatsAppCta } from "@/components/landing/whatsapp-cta";
import { landingContent } from "@/content/landing";

const { hero } = landingContent;

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="animate-on-scroll mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:gap-12 md:py-20"
    >
      <div className="flex flex-col gap-5 text-center md:text-left">
        <h1
          id="hero-heading"
          className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl"
        >
          {hero.headline}
        </h1>
        <p className="text-base text-muted-foreground text-pretty sm:text-lg">
          {hero.subtitle}
        </p>
        <div className="flex justify-center md:justify-start">
          <WhatsAppCta size="lg" className="h-11 px-6 text-base">
            {hero.ctaLabel}
          </WhatsAppCta>
        </div>
      </div>

      <div className="order-first md:order-last">
        <Image
          src={hero.image.src}
          alt={hero.image.alt}
          width={hero.image.width}
          height={hero.image.height}
          sizes="(min-width: 1152px) 552px, (min-width: 768px) 50vw, 100vw"
          priority
          className="mx-auto h-auto w-full max-w-sm rounded-2xl ring-1 ring-foreground/10 md:max-w-full"
        />
      </div>
    </section>
  );
}
