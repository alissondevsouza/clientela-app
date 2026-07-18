# ADR-0009 — Domínio: consultoralaisbarbosa.com.br (sem subdomínios públicos)

- **Status**: Aceito
- **Data**: 2026-07-17

## Contexto

O LP-10 previa registrar o domínio e decidir subdomínios. O humano registrou **`consultoralaisbarbosa.com.br`** (Hostinger, junto da VPS KVM 2) para publicar a landing page e, depois, o CRM.

## Decisão

1. **Domínio canônico**: `https://consultoralaisbarbosa.com.br` (usado em `SITE_URL` — canonical, Open Graph, sitemap).
2. **`www.` atendido sem redirect dedicado**: o `.env` de produção define `DOMAIN=consultoralaisbarbosa.com.br, www.consultoralaisbarbosa.com.br` — o Caddy serve os dois endereços no mesmo bloco com certificados automáticos para ambos (config validada com `caddy validate`); a canonicalização de SEO fica por conta da tag canonical apontando para o domínio raiz. DNS: registros A para `@` e `www`.
3. **Nenhum subdomínio público adicional**: a API não é exposta (ADR-0008) e o CRM da Fase 2 viverá no mesmo domínio sob o route group `(crm)` — sem `api.` nem `app.` por ora. Se o CRM um dia exigir subdomínio próprio, novo ADR.

## Alternativas consideradas

- **Bloco de redirect `www.` → raiz no Caddyfile** — funciona, mas quebraria o smoke local (`www.http://localhost` é endereço inválido) ou exigiria env adicional; a lista de endereços no `DOMAIN` resolve sem tocar em código.
- **Subdomínio `api.`** — descartado no ADR-0008 (sem consumidor público).

## Consequências

- `SITE_URL=https://consultoralaisbarbosa.com.br` e `DOMAIN` com os dois endereços entram no `.env` da VPS; ambos exigem os registros A no DNS **antes** do primeiro `up` (senão o ACME falha e fica em retry).
- Visitas via `www.` funcionam e são canonicalizadas por metadata (não por redirect 301) — aceitável para o porte; se SEO exigir 301 no futuro, adicionar bloco de redirect com env própria.
