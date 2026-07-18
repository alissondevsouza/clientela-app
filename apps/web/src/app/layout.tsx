import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { siteContent } from "@/content/site";
import { loadWebEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

// Metadata estática montada a partir de content/site.ts + SITE_URL da env.
// Avaliada no import (build): sem SITE_URL o build falha citando a variável.
// A imagem OG vem exclusivamente da convenção app/opengraph-image.tsx (tem
// precedência) — por isso openGraph/twitter não declaram `images` aqui.
const { SITE_URL } = loadWebEnv();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: siteContent.name,
    template: `%s | ${siteContent.name}`,
  },
  description: siteContent.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: siteContent.name,
    title: siteContent.og.title,
    description: siteContent.og.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
