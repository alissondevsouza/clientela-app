# ADR-0003 — Hospedagem em VPS única com Docker Compose

- **Status**: Aceito
- **Data**: 2026-07-16

## Contexto

O projeto precisa de hospedagem de baixo custo fixo e previsível para: app Next.js, API Bun e banco PostgreSQL. O volume de tráfego esperado é pequeno (uma consultora usando o CRM + visitantes da landing page).

## Decisão

Hospedar tudo em **uma única VPS Linux** (Hostinger ou provedor similar), com os serviços em containers orquestrados por **Docker Compose**:

- Proxy reverso (Caddy, com HTTPS automático via Let's Encrypt) na frente de tudo.
- Containers: `web` (Next.js), `api` (Bun), `db` (Postgres com volume persistente).
- Acesso à VPS somente por SSH com chave; portas expostas apenas 80/443 (e SSH).
- **Backup diário do Postgres com envio para fora da VPS** (destino a definir — novo ADR). Backup que mora só na VPS não protege contra perda da VPS.

## Alternativas consideradas

- **PaaS (Vercel + Supabase/Neon)** — deploy mais simples e tier gratuito no início; descartado pela preferência por controle total, custo previsível ao crescer e por concentrar tudo num único lugar. Aceitamos o custo de administrar a máquina.
- **Kubernetes / múltiplas VPS** — complexidade injustificável para o porte do projeto.
- **Traefik como proxy reverso** (discutido em 2026-07-17, decisão reafirmada pelo humano) — brilha com service discovery dinâmico via labels (muitos serviços subindo/descendo, previews por branch, Swarm/K8s), cenário que este projeto não tem: topologia fixa com um único serviço público. Para isso o Caddy entrega o mesmo HTTPS automático com um Caddyfile de 2 linhas e curva de aprendizado muito menor. Revisitar apenas se a VPS virar host de vários projetos com rotas dinâmicas.

## Consequências

- Custo fixo baixo e total controle do ambiente.
- Nós somos responsáveis por: atualizações de segurança do SO, renovação de certificados (automática via Caddy), monitoramento, backups e restauração. A VPS é um **ponto único de falha** — o backup externo é o que torna isso aceitável.
- Deploy inicial via script/SSH (`docker compose up -d`); automação com CI/CD (GitHub Actions) pode ser adicionada depois.
