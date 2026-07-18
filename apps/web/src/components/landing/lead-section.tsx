import Image from "next/image";
import { landingContent } from "@/content/landing";
import { LeadForm } from "./lead-form";

const { leadSection } = landingContent;

// Seção de captura de lead (RSC): coluna visual (foto real da consultora + isca e
// reforços de valor) + formulário. LP-14 passa de uma coluna centrada para grid
// 2 colunas ≥lg, empilhado no mobile. Mantém a âncora `id="contato"` usada pelos
// CTAs. O formulário (client) segue a única folha interativa, intocado em lógica
// (LP-06); a página permanece estática no build.
export function LeadSection() {
  return (
    <section
      id="contato"
      aria-labelledby="lead-heading"
      className="animate-on-scroll mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 md:py-16"
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,480px)] lg:items-center lg:gap-12">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 text-center lg:text-left">
            <h2
              id="lead-heading"
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {leadSection.heading}
            </h2>
            <p className="text-base text-muted-foreground text-pretty">
              {leadSection.lead}
            </p>
          </div>
          <ul className="flex flex-col gap-2.5 text-left">
            {leadSection.highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex items-start gap-2.5 text-sm text-foreground"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                  ✓
                </span>
                <span className="text-pretty">{highlight}</span>
              </li>
            ))}
          </ul>
          <Image
            src={leadSection.image.src}
            alt={leadSection.image.alt}
            width={leadSection.image.width}
            height={leadSection.image.height}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="h-auto w-full rounded-2xl object-cover ring-1 ring-foreground/10"
          />
        </div>
        <div className="lg:pl-2">
          <LeadForm content={leadSection.form} success={leadSection.success} />
        </div>
      </div>
    </section>
  );
}
