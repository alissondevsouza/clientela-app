---
feature: ghcr-image-deploy
module: infra
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: Deploy por imagens via GHCR (INF-05)

## O Que

O pipeline passa a **buildar as imagens no runner** e publicá-las no **GHCR** (`ghcr.io/<owner>/clientela-{web,api,migrate}`); a VPS deixa de receber código-fonte e de buildar — só faz `pull` + migração + `up`. No servidor ficam apenas arquivos de infra: `docker-compose.yml`, `Caddyfile`, `.env` (+ o template). Substitui o modelo rsync-do-repo do ADR-0010 (novo ADR-0011).

## Por Que

Pedido do humano: "no servidor teríamos realmente só arquivos de infra". Ganhos: VPS sem código-fonte e sem custo de build (KVM 2 é o hardware mais fraco do fluxo), imagens versionadas por commit (rollback = redeploy de tag anterior), deploy mais rápido a partir do 2º.

## Requisitos

- **RF-01** — `docker-compose.yml`: serviços `web`/`api`/`migrate` ganham `image: ghcr.io/${GHCR_OWNER}/clientela-{web,api,migrate}:${IMAGE_TAG:-latest}` **mantendo** os `build:` existentes (compose usa `build` quando se pede `build` — smoke local do LP-11 continua funcionando — e `pull` quando se pede `pull`). `GHCR_OWNER` entra no `.env` (`${GHCR_OWNER:?}`).
- **RF-02** — `deploy.yml`: novo job `build-push` (needs `ci`, guard main): `permissions: { contents: read, packages: write }` (permissions de job SUBSTITUEM as do topo — sem contents:read o checkout falha); **step inicial fail-fast** se `vars.SITE_URL`/`vars.WHATSAPP_PHONE` vazias (mensagem aponta a seção 5.6 do guia); owner normalizado para **lowercase** (`tr`); login GHCR com `GITHUB_TOKEN`; builda os 3 alvos com build args de Variables (`API_URL` fixo `http://api:3001`); publica `:latest` (informativa — o deploy nunca a usa) e `:sha-<curto>`.
- **RF-03** — Job `deploy` (needs `build-push`): `permissions: { contents: read, packages: read }` (sem packages:read o pull das imagens privadas é `denied`); SSH como hoje; processo: sincronizar **somente infra** (`docker-compose.yml`, `Caddyfile`, `.env.production.example`) — **nunca** `--delete`, nunca tocar arquivos remote-only (`.env`, `.image-tag`, volumes); **transição do layout antigo**: passo idempotente de limpeza que remove os diretórios de código-fonte deixados pelo modelo rsync (`apps/`, `packages/`, `scripts/`, `specs/`, `project-memory/`, `docs/`, `.claude/`, arquivos soltos do repo) preservando a infra e os remote-only — sem isso o objetivo "servidor só com infra" não acontece; login GHCR **na VPS** com o `GITHUB_TOKEN` do run (stdin; `docker logout ghcr.io` garantido com `if: always()`); **`docker compose --profile tools pull`** (o profile do migrate fica FORA de pull/build sem a flag — mesma classe do defeito corrigido no LP-11) na tag `sha-…` exata; migração `docker compose run --rm migrate` (sem `--build`); `up -d`; **`docker image prune -af`** pós-up (prune simples não remove tags sha antigas — disco cresceria sem teto no KVM 2); curl. Grava `IMAGE_TAG` em `/opt/clientela/.image-tag` para operação **manual** posterior (`up` manual usa `IMAGE_TAG=$(cat .image-tag)`; pós-reboot os containers voltam por restart policy, sem compose).
- **RF-04** — `scripts/deploy.sh` reescrito para o novo processo (é o que o runner executa; continua sendo a única fonte do processo): modos claros, sem rsync do repo inteiro; o fallback manual local vira "build local + push exige login próprio" — documentado como limitado (requer PAT `write:packages`) ou usar o Run workflow. O que não fizer sentido manter no script, remover — sem código morto.
- **RF-05** — `docs/deploy-vps.md` atualizado: seção 3 (layout do servidor = SÓ infra), seção 5 ganha 5.6 "Variables de build" (Settings → Secrets and variables → Actions → **Variables**: `SITE_URL`, `WHATSAPP_PHONE`, `WHATSAPP_DEFAULT_MESSAGE` opcional — com aviso de que NÃO são secrets e por quê), seção 6 (pipeline: CI → build+push GHCR → pull+up na VPS; rollback = Run workflow com tag anterior se implementado, senão documentar redeploy de commit), problemas comuns (+ pull `denied`/pacote privado). `.env.production.example`: + `GHCR_OWNER`, nota sobre `IMAGE_TAG`; as envs de build do web saem do exemplo da VPS? NÃO — `SITE_URL`/`WHATSAPP_PHONE` continuam lá (runtime da server action as valida) com nota "precisam BATER com as Variables do GitHub".
- **RF-06** — ADR-0011 (+ índice): substitui o mecanismo de entrega do ADR-0010 (CI/gate/secrets SSH seguem valendo) **e o item 3 do ADR-0008** (`--build` do migrate — sem sentido no modelo pull); registra: por que GHCR e não registry auto-hospedado; duplicação consciente Variables × `.env`; **trade-off de disponibilidade honesto** (o fallback "GitHub fora do ar" do ADR-0010 deixa de existir — sem GHCR não há pull e sem fonte na VPS não há build; resta o que já roda); `:latest` como tag informativa; `up` manual com `.image-tag`.
- **RF-07** — Validação executável sem remote: actionlint limpo; `docker compose config` válido com `GHCR_OWNER`/`IMAGE_TAG` de exemplo; **smoke local adaptado**: build local via compose (tags ghcr locais), migração e up com as imagens locais (prova que compose com `image:`+`build:` funciona nos dois modos); `bash -n` do script; gates raiz verdes; nomes de secrets/vars coerentes YAML↔doc.

## Critérios de Aceite

- [ ] (RF-01/07) `docker compose config` ok; smoke local: `docker compose build` + migrate + `up` + landing 200 via caddy + teardown — sem regressão do fluxo do LP-11.
- [ ] (RF-02) actionlint limpo; `packages: write` só no job build-push; 2 tags publicadas por imagem (verificável no YAML); build args de Variables.
- [ ] (RF-03) YAML: login GHCR na VPS via stdin + logout garantido (`always()`/trap); pull por tag exata; migração sem `--build`; tag persistida p/ reboot.
- [ ] (RF-04) Script sem resíduo do modelo antigo (grep: sem rsync de `apps/`); `bash -n` ok; dry-run coerente.
- [ ] (RF-05/06) Doc e ADR coerentes com o implementado; nomes de vars idênticos YAML↔doc.
- [ ] (RF-07) lint/typecheck/test raiz verdes.

## Fora de Escopo

- Registry auto-hospedado na VPS (rejeitado — ADR-0011 explica).
- Rollback automatizado por UI além do redeploy de commit (`Run workflow` em commit anterior já cobre; melhorias futuras).
- Multi-arch/cache remoto de build (runner e VPS são amd64).
- Execução real do primeiro run (pós-push do humano — pendência mantida).

## Restrições Conhecidas

- Imagens em repo privado ⇒ pacotes GHCR privados; o pull na VPS usa o token efêmero do run (nada persistido além da tag). Pós-reboot não faz pull (imagens já locais).
- Build args do web NÃO são segredo (já documentado) — por isso podem ser Variables.
- ADR-0006: repo/push/Variables são do humano; agente entrega arquivos e guia.
