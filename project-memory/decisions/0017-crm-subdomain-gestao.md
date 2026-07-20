# ADR-0017 — CRM em subdomínio próprio: gestao.consultoralaisbarbosa.com.br

- **Status**: Aceito (substitui parcialmente o ADR-0009 — item "sem subdomínios")
- **Data**: 2026-07-20

## Contexto

Com a Fase 2 pronta (CRM completo), o humano decidiu colocar a primeira versão em produção com separação de endereços: o domínio raiz (`consultoralaisbarbosa.com.br` + `www`) continua sendo a landing pública, e o CRM passa a ser acessado por **`gestao.consultoralaisbarbosa.com.br`**. O ADR-0009 havia decidido "raiz + www, sem subdomínios" — numa época em que só a landing existia.

## Decisão

1. **`gestao.consultoralaisbarbosa.com.br` é o endereço do CRM** (decisão do humano, 2026-07-20). O split é feito **no Caddy, por host** — o app web continua um só (mesma imagem, mesmos paths internos `/crm/*` e `/login`):
   - Bloco `{$DOMAIN}` (raiz + www): proxy direto (landing).
   - Bloco `{$CRM_DOMAIN}`: `redir / /crm` (temporário) + header `X-Robots-Tag: noindex, nofollow` + proxy.
2. Nova env de runtime **`CRM_DOMAIN`** (compose exige com `:?`); DNS ganha o registro A `gestao` → IP da VPS; o Caddy emite certificado para os 3 hosts.
3. O cookie de sessão fica **escopado por host** (emitido em `gestao.*`) — o CRM não "vaza" sessão para o domínio raiz.
4. O CRM continua alcançável por `raiz/crm` (mesmo app; rotas autenticadas e noindex via metadata) — endereço não divulgado; redirect canônico raiz→gestao é melhoria futura de uma linha no Caddyfile, não requisito.

## Alternativas consideradas

- **CRM em `raiz/crm` apenas (manter ADR-0009)**: rejeitada — decisão de produto do humano; endereço dedicado é mais simples de comunicar e favorece separação futura (ex.: políticas de cache/CDN só na landing).
- **Rewrite de path no Caddy (`gestao/x` → `web//crm/x`)**: rejeitada — quebra a consistência de links/asset paths do Next e cria classe de bug nova; o redirect da raiz do subdomínio entrega o mesmo resultado sem reescrever nada.
- **Apps/imagens separados por domínio**: rejeitada — um app só (route groups) é a arquitetura vigente; separar imagem duplicaria build e deploy sem ganho.

## Consequências

- DNS: um registro A novo (`gestao`); certificado extra automático via Let's Encrypt.
- `CRM_DOMAIN` precisa existir no `.env` da VPS (o compose falha explícito sem ela) — guia de deploy atualizado.
- Smoke local usa hosts distintos na mesma porta (`http://localhost` + `http://crm.localhost`).
- Se um dia o CRM for servido na raiz do subdomínio (basePath/host-rewrite no Next), o redirect temporário (302) não deixa cache preso.
