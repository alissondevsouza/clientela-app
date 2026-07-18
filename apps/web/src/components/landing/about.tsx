import Image from "next/image";
import { landingContent } from "@/content/landing";

const { about } = landingContent;

export function About() {
  return (
    <section
      id="sobre"
      aria-labelledby="about-heading"
      className="animate-on-scroll mx-auto grid w-full max-w-6xl scroll-mt-20 items-center gap-8 px-4 py-12 md:grid-cols-2 md:gap-12 md:py-16"
    >
      <div className="order-last md:order-first">
        <Image
          src={about.image.src}
          alt={about.image.alt}
          width={about.image.width}
          height={about.image.height}
          sizes="(min-width: 1152px) 552px, (min-width: 768px) 50vw, 100vw"
          className="mx-auto h-auto w-full max-w-sm rounded-2xl ring-1 ring-foreground/10 md:max-w-full"
        />
      </div>

      <div className="flex flex-col gap-4">
        <h2
          id="about-heading"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {about.heading}
        </h2>
        {about.paragraphs.map((paragraph) => (
          <p
            key={paragraph}
            className="text-base text-muted-foreground text-pretty"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}
