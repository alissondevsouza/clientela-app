---
feature: github-actions-ci-deploy
module: infra
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: CI + deploy contínuo via GitHub Actions (INF-01 + INF-04)

## O Que

Workflows do GitHub Actions: **CI** (lint + typecheck + testes, incluindo integração com Testcontainers) em todo push/PR, e **deploy** automático na VPS (SSH) quando a `main` recebe push e o CI passa — reutilizando o `scripts/deploy.sh` já validado (o runner assume o papel da máquina local). Atualização do guia `docs/deploy-vps.md` com os passos do GitHub (repo, deploy key, secrets) substituindo o deploy manual. ADR-0010 registra a mudança.

## Por Que

Decisão do humano (2026-07-17): deploy não deve depender da máquina local. O gatilho do INF-01 ("CI quando houver remote") dispara junto — o humano publicará o repo no GitHub. Benefícios: deploy auditável por commit, gates verdes obrigatórios antes de publicar, segredos centralizados.

## Requisitos

- **RF-01** — `.github/workflows/ci.yml`: dispara em `push` (qualquer branch **exceto `main`**, coberta pelo job `ci` do deploy.yml) e `pull_request`, com `concurrency` por ref (`cancel-in-progress: true` — evita runs duplicados/obsoletos); roda em `ubuntu-latest` com Bun (`oven-sh/setup-bun`): `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test` (runners do GitHub têm Docker — a integração Testcontainers roda de verdade). Timeout explícito no job (≤ 20 min) e cache do Bun quando trivial.
- **RF-02** — `.github/workflows/deploy.yml`: dispara em `push` na `main` **e** `workflow_dispatch` (deploy manual pelo botão) com **guard `if: github.ref == 'refs/heads/main'` no job de deploy** (dispatch a partir de outra ref roda CI mas NUNCA publica); job único que (a) espera/exige CI verde do mesmo commit (via `needs` no mesmo workflow OU `workflow_run`/reuso do ci.yml como workflow reutilizável — decidir no plan e justificar), (b) configura SSH com `DEPLOY_SSH_KEY` + `DEPLOY_KNOWN_HOSTS` (host key fixada — **sem** `StrictHostKeyChecking no`), (c) executa `scripts/deploy.sh` com `DEPLOY_HOST`/`DEPLOY_PATH` dos secrets. `concurrency` cancela/enfileira deploys simultâneos (nunca dois rsync/up em paralelo).
- **RF-03** — Segurança: nenhum segredo em log (deploy.sh não ecoa envs; conferir); secrets usados: `DEPLOY_SSH_KEY` (chave privada dedicada só para deploy), `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_PATH`; `permissions:` mínimos nos workflows (`contents: read`).
- **RF-04** — `docs/deploy-vps.md` atualizado: seção 0 ganha pré-requisito GitHub; nova seção "Publicar no GitHub e configurar os Secrets" (criar repo privado, commits/push — lembrando que git é do humano —, gerar **chave SSH dedicada de deploy** na própria máquina, instalar a pública no usuário `deploy` da VPS, `ssh-keyscan` para o known_hosts, cadastrar os 4 secrets); seção 5 vira "O deploy (automático)" — push na main = publicar; `workflow_dispatch` para re-deploy sem mudança; o `scripts/deploy.sh` local vira **fallback documentado** (continua funcionando).
- **RF-05** — ADR-0010: deploy contínuo via GitHub Actions substitui o deploy manual local do ADR-0008 (que fica como fallback); registra também que o CI roda a suíte completa com Testcontainers.
- **RF-06** — Validação executável sem Actions real (repo ainda sem remote): YAML válido e **actionlint limpo** (via Docker `rhysd/actionlint`); simulação local do caminho do deploy: os comandos que o job executa (`deploy.sh` com env) já são os validados no LP-11 — verificar que o script funciona a partir de um diretório de checkout limpo (sem `.git` sujo não aplicável — runner tem checkout limpo).

## Critérios de Aceite

- [ ] (RF-01/02) `docker run rhysd/actionlint` limpo nos dois workflows; YAML parseável; `concurrency` presente no deploy; CI cobre lint+typecheck+test.
- [ ] (RF-02) Deploy só acontece com CI verde do commit (mecanismo explícito e explicado em comentário no YAML); `workflow_dispatch` disponível.
- [ ] (RF-03) Nenhum `StrictHostKeyChecking no`; `permissions: contents: read`; grep sem echo de secrets.
- [ ] (RF-04) Guia atualizado: passos GitHub completos e executáveis por quem nunca configurou secret; script local documentado como fallback.
- [ ] (RF-05) ADR-0010 escrito + índice; ADR-0008 não é editado (imutável) — o 0010 declara o que substitui.
- [ ] (RF-06) lint/typecheck/test da raiz continuam verdes (nada de app mudou).

## Fora de Escopo

- Build em registry (GHCR) com pull na VPS — evolução futura se o build na VPS pesar (registrado no ADR-0010 como alternativa).
- Criação do repo/push/secrets em si — ações do humano (git é dele; ADR-0006).
- Ambientes de staging/preview; notificações de deploy.
- Rodar o primeiro deploy real (depende do push do humano — LP-12).

## Restrições Conhecidas

- ADR-0006: agente não cria repo, não faz push, não configura secrets — só entrega os arquivos e o guia.
- O job de CI leva minutos (Testcontainers puxa postgres:18-alpine no runner a cada run — aceitável; cache de imagem Docker em runner é possível mas fora do escopo mínimo).
- `deploy.sh` exige `rsync` no runner (`ubuntu-latest` já tem) e a chave sem passphrase (chave dedicada de deploy — orientar no guia).
