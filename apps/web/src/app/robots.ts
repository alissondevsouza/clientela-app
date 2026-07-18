import type { MetadataRoute } from "next";
import { loadWebEnv } from "@/lib/env";

// robots.txt estático (LP-07): libera todo o site e referencia o sitemap
// absoluto via SITE_URL. Sem regras de disallow — a landing é pública.
export default function robots(): MetadataRoute.Robots {
  const { SITE_URL } = loadWebEnv();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
