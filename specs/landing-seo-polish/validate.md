---
feature: landing-seo-polish
module: web
phase: validate
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: landing-seo-polish (rodada 1)

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 88 arquivos, limpo |
| Typecheck | `bun run typecheck` | ✅ | shared/web/api: exit 0 |
| Testes | `bun run test` | ✅ (99 passed, 0 failed) | 15 arquivos de teste |
| Integração | n.a. | n.a. | Sem banco/API no escopo (plan.md) |
| Build | `cd apps/web && bun run build` | ✅ | `/`, `/opengraph-image`, `/robots.txt`, `/sitemap.xml` todos `○ (Static)` |
| Runtime (standalone) | `PORT=3999 node .next/standalone/apps/web/server.js` (com `.next/static` e `public` copiados) | ✅ | Todos os critérios RF-02..06 exercitados via curl (abaixo) |
| Build negativo (RF-01) | build sem `SITE_URL` (`.env.local` temporariamente renomeada; restaurada em seguida) | ✅ | Falha com exit 1 |

## Saída Relevante

```
# Testes
Test Files  15 passed (15) · Tests  99 passed (99)

# Build
┌ ○ /
├ ○ /_not-found
├ ○ /opengraph-image
├ ○ /robots.txt
└ ○ /sitemap.xml
○  (Static)  prerendered as static content

# RF-01 — build sem SITE_URL falha citando a variável (valor nunca ecoado):
[cause]: Error: Configuração de ambiente do web inválida. Verifique: SITE_URL

# RF-02 — head de GET / (servidor standalone):
<title>Consultoria de Beleza Mary Kay</title>
<meta name="description" content="Consultoria de beleza Mary Kay com atendimento..."/>
<link rel="canonical" href="http://localhost:3000"/>
<meta property="og:title" .../> <meta property="og:description" .../>
<meta property="og:url" content="http://localhost:3000"/>
<meta property="og:locale" content="pt_BR"/>
<meta property="og:image" content="http://localhost:3000/opengraph-image?6649057d1d37f403"/>
<meta property="og:image:width" content="1200"/> <meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="http://localhost:3000/opengraph-image?..."/>  ← fallback do og:image (sem arquivo twitter-image)
# og:image aparece UMA única vez (só da convenção de arquivo — sem duplicata do objeto metadata)

# RF-03 — GET /opengraph-image:
HTTP/1.1 200 OK · content-type: image/png
file: PNG image data, 1200 x 630, 8-bit/color RGBA

# RF-04 — GET /sitemap.xml (200 application/xml):
<loc>http://localhost:3000/</loc>
# GET /robots.txt (200 text/plain):
User-Agent: * / Allow: / / Sitemap: http://localhost:3000/sitemap.xml

# RF-05 — HTML: <header> + <nav aria-label="Seções da página"> com 4 âncoras
# (#produtos, #sobre, #depoimentos, #contato); ids únicos no documento (1 cada),
# todos com scroll-mt-8; h1 único (hero); marca em <span> no header.

# RF-06 — primeiro focável do <body> é <a href="#conteudo"> (só um <div hidden>
# não-focável antes); id="conteudo" no <main>. Imagens: hero é a ÚNICA sem
# loading="lazy" e a única com <link rel="preload" as="image"> (exatamente 1
# preload de imagem); as outras 10 imagens são lazy.
```

Observação (RF-06): o Next 16 com `unoptimized` não emite o atributo `fetchpriority="high"` no `<img>` do hero — o `priority` se materializa como preload + eager loading. O critério ("só a imagem do hero tem priority") está atendido: nenhuma outra imagem tem tratamento prioritário.

Servidor standalone derrubado ao final; `.env.local` restaurada e build final verde refeito.

## Pendências

- Lighthouse/auditoria em browser real (sem browser no ambiente) — já prevista no spec como pendência de handoff.
- Verificação visual da nav a 375px feita apenas por análise de classes (junto da pendência acima).
- E2E Playwright: infra inexistente (pendência global já registrada).
- `next/font/google` exige rede em build time — nota para LP-11 (Docker).
