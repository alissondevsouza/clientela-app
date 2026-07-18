// Conteúdo placeholder da landing page (LP-03). O conteúdo real (fotos, história,
// depoimentos) é responsabilidade do humano no LP-08 — trocar aqui, sem tocar componentes.
// Depoimentos são rotulados como "(exemplo)" propositalmente: prova social fictícia
// não pode parecer real.

export const landingContent = {
  // Navegação por âncoras do header (LP-07). Sem JS: cada link salta para o id
  // da seção correspondente. A marca é curta para caber em uma linha a 375px.
  nav: {
    brand: "Lais Barbosa",
    ariaLabel: "Seções da página",
    skipToContent: "Pular para o conteúdo",
    links: [
      { href: "#produtos", label: "Produtos" },
      { href: "#sobre", label: "Sobre" },
      { href: "#depoimentos", label: "Depoimentos" },
      { href: "#contato", label: "Contato" },
    ],
  },
  hero: {
    headline: "Sua beleza no centro de tudo, com consultoria Mary Kay",
    subtitle:
      "Atendimento próximo e personalizado para você encontrar os produtos certos para a sua pele e a sua rotina — com acompanhamento de verdade.",
    ctaLabel: "Chamar no WhatsApp",
    image: {
      src: "/images/lais-barbosa-portrait.png",
      alt: "Lais Barbosa, consultora de beleza Mary Kay, sorrindo em ambiente decorado com flores.",
      width: 1122,
      height: 1402,
    },
  },
  about: {
    heading: "Sobre a consultora",
    paragraphs: [
      "Sou consultora de beleza Mary Kay e ajudo mulheres a cuidarem da pele com orientação individual, sem fórmulas prontas. Cada rotina é montada a partir do que você precisa no dia a dia.",
      "O atendimento acontece de forma prática: conversamos pelo WhatsApp, monto uma recomendação sob medida e acompanho os resultados de perto. Entregas combinadas conforme a sua região.",
    ],
    image: {
      src: "/images/lais-barbosa-standing.png",
      alt: "Lais Barbosa, consultora de beleza Mary Kay, em pé em ambiente claro.",
      width: 1086,
      height: 1448,
    },
  },
  testimonials: {
    heading: "O que as clientes dizem",
    note: "Depoimentos ilustrativos — conteúdo real será publicado em breve.",
    items: [
      {
        id: "example-1",
        name: "Ana (exemplo)",
        context: "Cliente há 1 ano (exemplo)",
        text: "O atendimento foi atencioso do começo ao fim. Recebi indicações que combinaram com a minha pele e senti diferença nas primeiras semanas.",
        avatar: {
          src: "/placeholders/testimonial-avatar-1.svg",
          alt: "Avatar ilustrativo de cliente (imagem de exemplo)",
          width: 160,
          height: 160,
        },
      },
      {
        id: "example-2",
        name: "Beatriz (exemplo)",
        context: "Cliente há 6 meses (exemplo)",
        text: "Gostei de poder tirar dúvidas pelo WhatsApp com calma. A recomendação foi bem explicada e a entrega chegou no combinado.",
        avatar: {
          src: "/placeholders/testimonial-avatar-2.svg",
          alt: "Avatar ilustrativo de cliente (imagem de exemplo)",
          width: 160,
          height: 160,
        },
      },
      {
        id: "example-3",
        name: "Carla (exemplo)",
        context: "Cliente há 3 meses (exemplo)",
        text: "Um cuidado que faltava na minha rotina. Me senti acompanhada e não apenas mais uma venda. Recomendo para quem quer atenção de verdade.",
        avatar: {
          src: "/placeholders/testimonial-avatar-3.svg",
          alt: "Avatar ilustrativo de cliente (imagem de exemplo)",
          width: 160,
          height: 160,
        },
      },
    ],
  },
  leadSection: {
    heading: "Fale comigo",
    // Isca de conversão placeholder e honesta (LP-08 troca pelo texto real).
    lead: "Análise de pele gratuita e sem compromisso (conteúdo de exemplo): deixe seu contato e eu retorno pelo WhatsApp com uma recomendação inicial para a sua rotina.",
    highlights: [
      "Recomendação inicial sob medida para a sua pele",
      "Atendimento próximo pelo WhatsApp, no seu tempo",
      "Sem compromisso e sem custo para começar",
    ],
    image: {
      src: "/images/lais-barbosa-wide.png",
      alt: "Lais Barbosa, consultora de beleza Mary Kay, pronta para atender pelo WhatsApp.",
      width: 1672,
      height: 941,
    },
    form: {
      nameLabel: "Nome completo",
      namePlaceholder: "Como você gostaria de ser chamada?",
      whatsappLabel: "WhatsApp (com DDD)",
      whatsappPlaceholder: "(11) 91234-5678",
      interestLabel: "Seu interesse (opcional)",
      interestPlaceholder:
        "Ex.: cuidados com a pele, maquiagem, presente para alguém…",
      // Consentimento LGPD: finalidade declarada, checkbox NÃO pré-marcado.
      consentLabel:
        "Autorizo o uso dos meus dados (nome e WhatsApp) para contato sobre produtos e atendimento Mary Kay.",
      // Honeypot: rótulo plausível para bots; some para leitores de tela.
      honeypotLabel: "Deixe este campo em branco",
      submitLabel: "Quero ser contatada",
      submittingLabel: "Enviando…",
      retryLabel: "Tentar de novo",
    },
    success: {
      title: "Recebi seu contato!",
      description:
        "Obrigada pelo interesse. Em breve eu retorno pelo WhatsApp para conversarmos.",
    },
  },
} as const;

export type LandingContent = typeof landingContent;
export type LeadSectionContent = LandingContent["leadSection"];
export type LeadFormContent = LeadSectionContent["form"];
export type LeadSuccessContent = LeadSectionContent["success"];
