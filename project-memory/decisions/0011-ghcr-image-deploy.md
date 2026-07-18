# ADR-0011 — Deploy por imagens via GHCR (modelo pull): a VPS só recebe infra

- **Status**: Aceito
- **Data**: 2026-07-17

## Contexto

O deploy da Fase 1 (ADR-0010, que já substituiu o rsync-local do ADR-0008 item 4) roda no GitHub Actions, mas mantém o mecanismo herdado: o runner **sincroniza o repositório inteiro** para a VPS (`apps/`, `packages/`, `scripts/`, `.git`…) e **builda as imagens na própria VPS** (`docker compose build`). Dois problemas:

1. A VPS (KVM 2 da Hostinger — 2 vCPU/8 GB, o hardware mais fraco do fluxo) gasta 5–15 min de CPU/rede a cada deploy buildando o web (baixa Google Fonts, roda `next build`).
2. O código-fonte inteiro fica residente no servidor de produção, sem necessidade.

Pedido do humano (2026-07-17): "no servidor teríamos realmente só arquivos de infra". A evolução já estava prevista como futura no próprio ADR-0010 ("Alternativas": build no runner + push para GHCR + pull na VPS).

## Decisão

**Mover o build para o runner e publicar as imagens no GitHub Container Registry (GHCR); a VPS apenas puxa.**

1. **Imagens no GHCR**: o job `build-push` (novo, `needs: ci`, guard main, `permissions: { contents: read, packages: write }`) builda os 3 alvos (`clientela-web`, `clientela-api`, `clientela-migrate`) no runner e publica em `ghcr.io/<owner>/clientela-*` com duas tags: `:sha-<curto>` (determinística, usada no deploy) e `:latest` (**informativa** — o deploy nunca a usa). Owner normalizado para minúsculas (GHCR exige). Build args do web vêm de **Variables** do repositório.

2. **A VPS só puxa** (job `deploy`, `needs: build-push`, `permissions: { contents: read, packages: read }` — sem `packages: read` o pull das imagens privadas vem `denied`): o `scripts/deploy.sh` sincroniza **somente a infra** (`docker-compose.yml`, `Caddyfile`, `.env.production.example` — sem `--delete`, sem tocar `.env`/`.image-tag`), loga no GHCR com o `GITHUB_TOKEN` efêmero do run (stdin; `docker logout` garantido por trap + step `if: always()`), faz `docker compose --profile tools pull` da tag exata, migra (`run --rm migrate`, **sem `--build`**), sobe, grava a tag em `.image-tag` e roda `docker image prune -af`.

3. **`docker-compose.yml`**: os 3 serviços ganham `image: ghcr.io/${GHCR_OWNER:?}/clientela-*:${IMAGE_TAG:-latest}` **mantendo** o `build:` — o compose usa `image` no `pull`/`up` e `build` quando se pede `build` (smoke local do LP-11 preservado). `GHCR_OWNER` vive no `.env` da VPS (`${...:?}` = falha explícita); `IMAGE_TAG` não fica no `.env` (é gravada em `.image-tag` pelo pipeline).

4. **Layout do servidor = só infra**: `.env`, `.image-tag`, `docker-compose.yml`, `Caddyfile`, `.env.production.example`. Um passo idempotente de transição no `deploy.sh` remove o código-fonte deixado pelo modelo antigo no primeiro deploy novo (preservando segredos e infra).

Esta decisão **substitui o mecanismo de entrega do ADR-0010** (rsync do repo + build na VPS) — o CI, o gate por `needs`, os 4 secrets SSH e o guard main do ADR-0010 seguem válidos. **Substitui também o item 3 do ADR-0008** (`docker compose run --rm --build migrate`): no modelo pull a imagem `migrate` chega pronta pelo `pull --profile tools`, então o `--build` deixa de existir (e não faria sentido — não há contexto de build na VPS).

## Alternativas consideradas

- **Registry auto-hospedado na VPS** — rejeitado: exigiria operar TLS, auth, storage e backup de um registry, mais uma porta a proteger, sem benefício. O GHCR é integrado ao repo e o `GITHUB_TOKEN` do run já autentica push (no runner) e pull (na VPS).
- **Manter o build na VPS** (ADR-0010) — é justamente o custo que esta decisão elimina; o KVM 2 é o elo mais fraco.
- **Só `:latest`, sem tag por commit** — rejeitado: `:latest` é mutável e não rastreável; a tag `sha-<curto>` torna cada deploy determinístico e o rollback = abrir o run do commit desejado na aba Actions e usar **Re-run all jobs** (o `Run workflow` só aceita branch/tag).
- **`IMAGE_TAG` no `.env`** — rejeitado: o `.env` é do humano (segredos) e o pipeline não deve editá-lo; arquivo separado `.image-tag` sobrevive a reboot e alimenta o `up` manual.
- **Multi-arch / cache remoto de buildx** — fora de escopo: runner e VPS são amd64; cache é otimização futura.

## Consequências

- VPS **sem código-fonte e sem custo de build**; deploy mais rápido a partir do 2º (só pull da camada mudada). Imagens versionadas por commit — rollback é redeploy de tag anterior.
- **Trade-off de disponibilidade honesto**: o fallback "GitHub fora do ar" do ADR-0010 (buildar na VPS a partir do rsync) **deixa de existir** — sem GHCR não há pull, e sem fonte na VPS não há build. Se o GitHub cair, resta apenas o que já roda (containers voltam por restart policy após reboot, sem `pull`). Publicar uma imagem nova manualmente exigiria build local + `docker login` com PAT `write:packages` (documentado como limitado no `deploy.sh`/guia).
- **Duplicação consciente Variables × `.env`**: `SITE_URL`/`WHATSAPP_PHONE` existem nas **Variables** do GitHub (alimentam o build/SSG no runner) e no `.env` da VPS (runtime da server action). Precisam bater — divergência = HTML com um valor e runtime com outro. Aceito: não são segredo (aparecem no HTML público), e a alternativa (injetar no runtime) não removeria a duplicação, só a moveria.
- Pacotes GHCR nascem **privados, ligados ao repo** na 1ª publicação do `build-push` — o token do run puxa sem PAT extra. O guia cobre o `denied`/pacote privado.
- **Primeiro run a observar**: só roda de verdade após o humano publicar o repo, cadastrar as Variables (5.6) e os secrets SSH (git é do humano — ADR-0006).

## Superseção — registro explícito

- **ADR-0010**: mecanismo de entrega (rsync do repo + build na VPS) **substituído**. CI, gate, secrets SSH e guard main permanecem.
- **ADR-0008, item 3**: `--build` da migração **substituído** (pull traz a imagem `migrate` pronta). Itens 1, 2 e 4 do ADR-0008 seguem como já estavam (item 4 já era do ADR-0010).
