# Decisões (ADRs)

Registro de toda decisão importante do projeto — técnica ou de produto — no formato **ADR** (Architecture Decision Record): um arquivo por decisão, numerado, imutável depois de aceito. Se uma decisão mudar, não edite o ADR antigo: crie um novo que o **substitui** e marque o antigo como substituído.

## Quando escrever um ADR

Sempre que uma escolha for cara de reverter ou alguém no futuro puder perguntar "por que isso é assim?": escolha de tecnologia/biblioteca, padrão de código ou de dados, mudança de escopo, estratégia de deploy, etc.

## Índice

| # | Decisão | Status |
|---|---|---|
| [0001](./0001-documentation-as-persistent-memory.md) | Documentação versionada como memória persistente do projeto | Aceito |
| [0002](./0002-stack-nextjs-bun-postgres.md) | Stack: Next.js (web) + Bun (API) + PostgreSQL | Aceito |
| [0003](./0003-vps-docker-hosting.md) | Hospedagem em VPS única com Docker Compose | Aceito |
| [0004](./0004-typescript-toolchain.md) | Toolchain: Elysia, Drizzle, Zod, Vitest, Biome, shadcn/ui | Aceito |
| [0005](./0005-spec-driven-harness.md) | Harness spec-driven com revisão neutra adversarial | Aceito |
| [0006](./0006-git-human-only.md) | Operações git de escrita exclusivas do humano (GPG) | Aceito |
| [0007](./0007-postgres-18-postgresjs-driver.md) | Postgres 18 (uuidv7 nativo) + driver postgres.js | Aceito |
| [0008](./0008-production-deploy-pattern.md) | Deploy: Compose de produção com Caddy; API sem exposição pública | Aceito (item 4 substituído pelo ADR-0010; item 3 pelo ADR-0011) |
| [0009](./0009-domain-consultoralaisbarbosa.md) | Domínio consultoralaisbarbosa.com.br (raiz + www, sem subdomínios) | Aceito |
| [0010](./0010-github-actions-deploy.md) | CI + deploy contínuo via GitHub Actions (substitui o deploy manual do ADR-0008) | Aceito (mecanismo de entrega substituído pelo ADR-0011) |
| [0011](./0011-ghcr-image-deploy.md) | Deploy por imagens via GHCR (modelo pull; VPS só recebe infra) | Aceito |
| [0012](./0012-session-auth-strategy.md) | Autenticação do CRM: sessão própria DB-backed com token opaco | Aceito |

## Template

```markdown
# ADR-NNNN — Título curto da decisão

- **Status**: Proposto | Aceito | Substituído por ADR-XXXX
- **Data**: AAAA-MM-DD

## Contexto

Qual problema ou situação exigiu uma decisão. O que estava em jogo.

## Decisão

O que foi decidido, de forma direta.

## Alternativas consideradas

O que mais foi avaliado e por que não foi escolhido.

## Consequências

O que essa decisão implica — o que ganhamos, o que aceitamos perder,
o que ela facilita ou dificulta daqui pra frente.
```
