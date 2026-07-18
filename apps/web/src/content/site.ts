// Conteúdo de identidade do site (LP-07): nome, tagline, descrição e textos de
// Open Graph. Separado de `landing.ts` (conteúdo das seções) porque metadata do
// site ≠ conteúdo de página. Textos são PLACEHOLDER honestos: descrevem de forma
// verdadeira uma consultoria Mary Kay, sem forjar nome próprio, foto ou prova
// social. O conteúdo real (nome da consultora, chamada final) entra no LP-08 —
// trocar aqui, sem tocar em layout/metadata. `as const` para tipos literais.

export const siteContent = {
  name: "Consultoria de Beleza Mary Kay",
  tagline: "Atendimento personalizado para a sua pele e a sua rotina",
  description:
    "Consultoria de beleza Mary Kay com atendimento próximo e personalizado: recomendações sob medida para a sua pele e acompanhamento de verdade pelo WhatsApp.",
  og: {
    // Título e descrição usados no cartão de compartilhamento (WhatsApp, redes).
    // Placeholder honesto — o texto final de divulgação é definido no LP-08.
    title: "Consultoria de Beleza Mary Kay",
    description:
      "Atendimento próximo e personalizado para você encontrar os produtos certos para a sua pele e a sua rotina.",
  },
} as const;

export type SiteContent = typeof siteContent;
