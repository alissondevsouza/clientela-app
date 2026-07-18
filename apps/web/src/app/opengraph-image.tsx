import { ImageResponse } from "next/og";
import { siteContent } from "@/content/site";

// Imagem Open Graph gerada em build (rota estática) via next/og. Sem fetch
// externo nem fonte custom: usa a fonte default do ImageResponse para não
// depender de rede no build (restrição do spec e do LP-11/Docker). Cores da
// paleta rosa/mauve dos placeholders da landing.
export const alt = `${siteContent.name} — ${siteContent.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR_BG_FROM = "#f6e8ee";
const COLOR_BG_TO = "#e6cdd8";
const COLOR_ACCENT = "#cc94ab";
const COLOR_INK = "#6f4c5c";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        padding: "80px",
        background: `linear-gradient(135deg, ${COLOR_BG_FROM} 0%, ${COLOR_BG_TO} 100%)`,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: COLOR_ACCENT,
        }}
      >
        Mary Kay
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 68,
          fontWeight: 700,
          lineHeight: 1.1,
          color: COLOR_INK,
        }}
      >
        {siteContent.name}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontSize: 36,
          lineHeight: 1.3,
          color: COLOR_INK,
          opacity: 0.85,
        }}
      >
        {siteContent.tagline}
      </div>
    </div>,
    size,
  );
}
