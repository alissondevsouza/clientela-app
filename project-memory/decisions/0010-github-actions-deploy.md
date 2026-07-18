# ADR-0010 — CI + deploy contínuo via GitHub Actions

- **Status**: Aceito
- **Data**: 2026-07-17

> **Nota (superseção parcial):** o **mecanismo de entrega** (rsync do working tree + build na VPS no job `deploy`) foi **substituído pelo [ADR-0011](./0011-ghcr-image-deploy.md)** (build no runner + push no GHCR; a VPS só faz pull da imagem). A decisão de CI + deploy contínuo via GitHub Actions em si continua vigente.

## Contexto

O deploy da Fase 1 (ADR-0008, item 4) parte do **working tree da máquina local**: o humano roda `scripts/deploy.sh` (rsync + SSH). Isso acopla a publicação a uma máquina específica e não tem gate automático — nada garante que lint/typecheck/testes passaram antes de publicar. O INF-01 ("CI quando houver remote") estava pendente justamente por não haver repositório remoto.

Decisão do humano (2026-07-17): publicar o repositório no GitHub e mover o deploy para o **GitHub Actions**, disparado por push na `main`. Com isso, INF-01 (CI) e INF-04 (deploy contínuo) são resolvidos juntos.

## Decisão

1. **CI reutilizável** (`.github/workflows/ci.yml`): dispara em `push` (qualquer branch **exceto `main`**) e `pull_request`, e expõe `workflow_call`. Job único em `ubuntu-latest` (timeout 20 min): `bun install --frozen-lockfile` → `bun run lint` → `bun run typecheck` → `bun run test`. Os runners do GitHub têm Docker, então a suíte de **integração com Testcontainers (Postgres real) roda de verdade**. `permissions: contents: read`; `concurrency` por ref cancela runs obsoletos, **exceto na `main`** (onde o CI só existe via reuso pelo deploy — cancelá-lo tiraria o gate de um deploy em andamento).

2. **Deploy** (`.github/workflows/deploy.yml`): dispara em `push` na `main` e `workflow_dispatch` (botão "Run workflow"). Job `ci` reusa o `ci.yml` (`uses: ./.github/workflows/ci.yml`) — a `main` não dispara o `ci.yml` diretamente, então é aqui que a CI da `main` roda. Job `deploy` tem `needs: ci` (só publica com CI verde do mesmo commit), guard `if: github.ref == 'refs/heads/main'` (dispatch de outra ref roda CI mas nunca publica) e `concurrency: { group: deploy-production, cancel-in-progress: false }` (deploys enfileiram; nunca dois rsync/compose em paralelo). Configura SSH a partir dos secrets e executa o **mesmo `scripts/deploy.sh`** — o runner assume o papel da máquina local.

3. **Segredos**: 4 secrets de repositório — `DEPLOY_SSH_KEY` (chave privada **dedicada** ao deploy, sem passphrase), `DEPLOY_KNOWN_HOSTS` (host key da VPS fixada — **sem** `StrictHostKeyChecking no`, evita MitM), `DEPLOY_HOST` (`deploy@IP`), `DEPLOY_PATH` (`/opt/clientela`). Lidos por variável de ambiente e escritos com `printf` (nunca ecoados no log); `permissions: contents: read` nos dois workflows.

4. **Actions pinadas por SHA** (`actions/checkout` e `oven-sh/setup-bun`) com a tag em comentário, e `bun-version` fixa (1.3.11, a mesma do dev local) — builds reprodutíveis e imunes a tag mutável.

Esta decisão **substitui o item 4 do ADR-0008** (deploy por rsync local como caminho primário). O restante do ADR-0008 permanece válido (imagens, API interna, job de migração).

## Alternativas consideradas

- **Manter só o script local** — rejeitado como primário: acopla o deploy a uma máquina e não tem gate de qualidade. **Mantido como fallback** documentado (o `scripts/deploy.sh` continua funcionando da máquina local — emergência ou GitHub fora do ar).
- **`workflow_run` para encadear CI → deploy** — rejeitado: assíncrono e frágil (dispara por evento separado, difícil garantir "mesmo commit"). O reuso via `workflow_call` num único run resolve o encadeamento de forma síncrona e sem race.
- **Duplicar os steps de CI dentro do deploy.yml** — rejeitado: violaria DRY e deixaria os dois pipelines divergirem com o tempo.
- **Build de imagens em registry (GHCR) e `pull` na VPS** — não adotado agora (o build acontece na VPS via `deploy.sh`). Registrado como **evolução futura**: se o build na VPS pesar (KVM 2), migrar para build no runner + push para GHCR + pull na VPS, tirando carga de CPU/rede da VPS.

## Consequências

- **Repositório no GitHub vira pré-requisito** do deploy — o guia (`docs/deploy-vps.md`, seção 5) cobre repo privado, chave dedicada, keyscan e os 4 secrets.
- Deploy **auditável por commit**, com gates verdes obrigatórios antes de publicar; segredos centralizados no GitHub (fora da máquina do humano).
- O CI puxa `postgres:18-alpine` no runner a cada run (Testcontainers) — mais lento que local, dentro do timeout de 20 min.
- **Primeiro run a observar**: o pipeline só roda de verdade após o humano publicar o repo e cadastrar os secrets (git é do humano — ADR-0006). Falha típica no primeiro run é secret errado (guia tem a linha de "Problemas comuns").
- A `main` fica **sem CI** se o `deploy.yml` for desabilitado (o `ci.yml` ignora a `main` de propósito) — comentário cruzado nos dois YAMLs alerta sobre o acoplamento.
