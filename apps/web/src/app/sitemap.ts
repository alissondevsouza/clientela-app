import type { MetadataRoute } from "next";
import { loadWebEnv } from "@/lib/env";

// Sitemap estático (LP-07): apenas a home por enquanto. Base absoluta vem de
// SITE_URL (mesma env do metadataBase) — trocar para o domínio real no LP-10/12.
export default function sitemap(): MetadataRoute.Sitemap {
  const { SITE_URL } = loadWebEnv();

  return [
    {
      url: new URL("/", SITE_URL).toString(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
