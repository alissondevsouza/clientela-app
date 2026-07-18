import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { landingContent } from "@/content/landing";

const { testimonials } = landingContent;

// Depoimentos ilustrativos (LP-14 redesenha o LP-05). Honestidade preservada: a
// nota de conteúdo de exemplo e os rótulos "(exemplo)" seguem visíveis; avatares
// são SVGs fictícios (fotos reais da consultora NÃO entram em falas inventadas).
// Aspas decorativas via caractere (sem lib de ícone nova). `role="list"` mantém a
// semântica de lista mesmo com `list-none` (fecha a sugestão da QA LP-05).
export function Testimonials() {
  return (
    <section
      id="depoimentos"
      aria-labelledby="testimonials-heading"
      className="animate-on-scroll mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 md:py-16"
    >
      <div className="flex flex-col gap-2 text-center">
        <h2
          id="testimonials-heading"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {testimonials.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{testimonials.note}</p>
      </div>

      {/* biome-ignore-start lint/a11y/noRedundantRoles: `list-none` remove a semântica de lista no Safari/VoiceOver; `role="list"` a restaura (RF-04, sugestão da QA LP-05). */}
      <ul
        role="list"
        className="mt-8 grid list-none grid-cols-1 gap-6 md:grid-cols-3"
      >
        {testimonials.items.map((item) => (
          <li key={item.id}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none">
              <CardContent className="flex h-full flex-col gap-4">
                <span
                  aria-hidden="true"
                  className="font-heading text-5xl leading-none text-primary/20"
                >
                  &ldquo;
                </span>
                <blockquote className="flex-1 text-sm text-muted-foreground text-pretty">
                  {item.text}
                </blockquote>
                <div className="flex items-center gap-3 border-t border-border/60 pt-4">
                  <Image
                    src={item.avatar.src}
                    alt={item.avatar.alt}
                    width={item.avatar.width}
                    height={item.avatar.height}
                    unoptimized
                    className="size-11 rounded-full"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.context}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {/* biome-ignore-end lint/a11y/noRedundantRoles: fim da supressão do `role="list"`. */}
    </section>
  );
}
