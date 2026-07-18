import { landingContent } from "@/content/landing";

const { nav } = landingContent;

// Header semântico da landing (LP-07, refinado no LP-14). Marca em <span> (não é
// h1 — o único h1 fica no hero — e não é link, pois a home é a própria página).
// Navegação por âncoras, texto-only, sem JS/hambúrguer. Header sticky: fica
// visível ao rolar (`sticky top-0 z-50` + fundo translúcido com `backdrop-blur`
// e borda inferior); as seções usam `scroll-mt-20` para não ficarem escondidas
// sob ele. Mobile-first: a marca é SEMPRE visível (inclusive a 375px) e a `<ul>`
// cabe em uma linha nesse breakpoint com tipografia reduzida (`text-xs` →
// `text-sm` a partir de 420px) e gaps compactos.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2.5 px-4 py-3 sm:gap-5">
        <span className="text-sm font-semibold tracking-tight whitespace-nowrap text-foreground">
          {nav.brand}
        </span>
        <nav aria-label={nav.ariaLabel}>
          <ul className="flex list-none items-center gap-2.5 text-xs min-[420px]:text-sm sm:gap-5">
            {nav.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="whitespace-nowrap text-foreground/70 transition-colors motion-reduce:transition-none hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
