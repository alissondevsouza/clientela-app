import { About } from "@/components/landing/about";
import { FeaturedCatalog } from "@/components/landing/featured-catalog";
import { Hero } from "@/components/landing/hero";
import { LeadSection } from "@/components/landing/lead-section";
import { SiteHeader } from "@/components/landing/site-header";
import { Testimonials } from "@/components/landing/testimonials";
import { landingContent } from "@/content/landing";

const { nav } = landingContent;

export default function HomePage() {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        {nav.skipToContent}
      </a>
      <SiteHeader />
      <main id="conteudo" className="flex flex-col">
        <Hero />
        <FeaturedCatalog />
        <About />
        <Testimonials />
        <LeadSection />
      </main>
    </>
  );
}
