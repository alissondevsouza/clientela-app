---
feature: ghcr-image-deploy
module: infra
phase: validate
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: ghcr-image-deploy (rodada 1)

<!-- Escrito pelo revisor QA neutro. Tudo abaixo foi DE FATO executado nesta sessão. -->

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 87 arquivos, limpo |
| Typecheck | `bun run typecheck` | ✅ | shared/web/api exit 0 |
| Testes | `bun run test` | ✅ (99 passed, 0 failed) | 15 arquivos, Vitest |
| actionlint | `docker run rhysd/actionlint` sobre o repo | ✅ | exit 0, zero achados (ci.yml + deploy.yml) |
| YAML parse | `python3 yaml.safe_load` nos 2 workflows | ✅ | |
| Shell (sintaxe) | `bash -n scripts/deploy.sh` | ✅ | |
| Shell (dry-run) | `./scripts/deploy.sh --dry-run` | ✅ | Plano coerente com o processo real (rsync infra → transição → login stdin → pull `--profile tools` → migrate sem `--build` → up → `.image-tag` → prune -af → curl → logout via trap) |
| shellcheck | `docker run koalaman/shellcheck:stable` | ✅ | Apenas SC2029 (info) — expansão client-side é intencional no desenho |
| Compose config (com envs) | `docker compose --profile tools config --quiet` com `GHCR_OWNER=alissondevsouza IMAGE_TAG=sha-1a2b3c4` + envs de exemplo | ✅ | Imagens resolvem para `ghcr.io/alissondevsouza/clientela-{web,api,migrate}:sha-1a2b3c4` |
| Compose config (sem GHCR_OWNER) | idem sem `GHCR_OWNER` | ✅ (falha esperada) | `error while interpolating services.web.image: required variable GHCR_OWNER is missing a value: defina GHCR_OWNER no .env` — exit 1, mensagem clara |
| Simulação da transição | Dir fake com layout antigo completo (apps/, packages/, node_modules, dotfiles, nomes hostis: `-f`, `--delete`, `arquivo com espaço.txt`, `$(touch PWNED).txt`, `.envX`, `.env.d/`) + `.env`/`.image-tag`/infra; comando `find` reproduzido byte a byte do script; 2 passadas | ⚠️ | Whitelist preservada (conteúdo de `.env`/`.image-tag` intacto), idempotente (2ª passada no-op), SEM injeção de comando, nomes hostis removidos com segurança. **PORÉM: `backup-2026-07-17.sql` (arquivo do operador) foi apagado** — ver CRÍTICO #1 no review.md |
| Smoke build | `docker compose -p clientela-qa --profile tools build` (GHCR_OWNER=qalocal, IMAGE_TAG=qa-smoke) | ✅ | 3 imagens buildadas VIA compose: web 227MB, api 151MB, migrate 987MB — prova `image:`+`build:` no modo build |
| Smoke migrate | `docker compose -p clientela-qa run --rm migrate` (sem `--build`, sem `--profile`) | ✅ | `migrations applied successfully` — `run <serviço>` ativa o profile implicitamente |
| Smoke up + curl | `docker compose -p clientela-qa up -d` (CADDY_HTTP_PORT=8080) → `curl http://localhost:8080/` | ✅ | caddy/web/api/postgres Up (healthy); landing **HTTP 200** via Caddy, `<title>Consultoria de Beleza Mary Kay</title>`; migrate NÃO sobe no `up` (profile) |
| Teardown | `docker compose -p clientela-qa --profile tools down -v` + `docker rmi` das 3 imagens qa | ✅ | Volumes/rede/imagens removidos; volume dev pré-existente do usuário intacto |
| Greps de segurança | token ecoado / `set -x` em deploy.sh e deploy.yml | ✅ | Nenhum echo de segredo (deploy.sh:116 imprime apenas `<definido>`); sem xtrace; login sempre via `--password-stdin` |

## Saída Relevante

```
bun run test  → Test Files 15 passed (15) · Tests 99 passed (99) · Duration 11.97s
actionlint    → exit 0
compose (sem GHCR_OWNER) → error while interpolating services.web.image: required
                variable GHCR_OWNER is missing a value: defina GHCR_OWNER no .env
smoke         → clientela-qa-{api,web,postgres} Up (healthy); caddy Up
                curl :8080 → HTTP 200, title "Consultoria de Beleza Mary Kay"
transição (dir fake, 1ª passada) → sobram: Caddyfile docker-compose.yml .env
                .env.production.example .image-tag  (2ª passada idêntica; sem PWNED)
                ⚠️ backup-2026-07-17.sql do operador foi APAGADO (CRÍTICO #1)
```

## Pendências

- **Primeiro run real do pipeline** — depende do humano publicar o repo, cadastrar Variables e secrets (ADR-0006); já registrado como fora de escopo no spec.
- **E2E (Playwright)** — infra inexistente (pendência pré-existente do projeto, não deste ciclo).
- Sem baseline no controle de versão (repo sem histórico): a condição "ci.yml e Dockerfiles não mudaram" foi verificada por leitura (nenhuma referência a GHCR/mudança de escopo encontrada), não por diff.

---

# Validate: ghcr-image-deploy (rodada 2 — pós-fix)

<!-- Revisor QA neutro, rodada focada nos fixes da r1. Tudo abaixo foi DE FATO re-executado nesta sessão, sem confiar na r1. -->

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 87 arquivos, limpo |
| Typecheck | `bun run typecheck` | ✅ | shared/web/api exit 0 |
| Testes | `bun run test` | ✅ (99 passed, 0 failed) | 15 arquivos, Vitest |
| actionlint | `docker run rhysd/actionlint` | ✅ | exit 0 (ci.yml + deploy.yml) |
| Shell (sintaxe) | `bash -n scripts/deploy.sh` | ✅ | |
| shellcheck | `docker run koalaman/shellcheck:stable` | ✅ | Só SC2029 (info) — expansão client-side intencional, como na r1 |
| Shell (dry-run) | `./scripts/deploy.sh --dry-run` | ✅ | 10 passos alinhados à execução real; `IMAGE_TAG=<obrigatória no deploy real>`; blacklist impressa no plano; NÃO exige IMAGE_TAG (fix da SUGESTÃO r1 #6: numeração alinhada) |
| `--help` | `./scripts/deploy.sh --help` | ✅ | 1ª linha limpa (sem shebang mutilado — `tail -n +2` aplicado) |
| Execução real sem IMAGE_TAG | `DEPLOY_HOST=fake DEPLOY_PATH=/opt/clientela GHCR_TOKEN=tok ./scripts/deploy.sh` | ✅ (falha esperada, exit 1) | "IMAGE_TAG não definido — o deploy real exige a tag EXATA … nunca usa :latest (ADR-0011)". Falha ANTES de qualquer rsync/ssh (fix da SUGESTÃO r1 #4). deploy.yml:165 passa a sha exata de `build-push.outputs.image_tag` |
| Guarda de DEPLOY_PATH | `DEPLOY_PATH=/`, `opt/clientela` (relativo), `/opt` (sem subdir), vazio | ✅ (todas recusadas, exit 1) | `assert_safe_deploy_path` (deploy.sh:100-105) recusa antes de rsync/limpeza — fix do ALERTA r1 #3 |
| Simulação transição — A: layout antigo + operador | Dir fake independente com resíduo completo (apps/, packages/, scripts/, specs/, project-memory/, docs/, .claude/, .github/, .git/, node_modules/, manifests, dotfiles do repo) + `.env`, `.image-tag`, `backup-2026-07-17.sql`, `dump.sql`, `backups/`, "anotacoes do operador.txt"; função `run_transition` extraída byte a byte (sed por intervalo) com ssh mockado | ✅ | **Só a blacklist saiu**; TODOS os arquivos do operador preservados (conteúdo conferido); `.layout-v2` gravado com timestamp; **2ª passada = no-op** ("Transição já aplicada") — fix do CRÍTICO r1 #1 comprovado |
| Simulação — B: sem resíduo | Só infra + `.env` + backup | ✅ | "Nenhum resíduo … nada a remover"; nada tocado; marcador gravado (limpeza nunca mais roda) |
| Simulação — C: sem docker-compose.yml | Dir com resíduo mas sem compose | ✅ (aborta, exit 1) | "ERRO: docker-compose.yml ausente no destino — abortando"; NADA removido, marcador NÃO gravado; com `set -euo pipefail` o deploy inteiro aborta |
| Simulação — D: marcador + resíduo | `.layout-v2` presente e `apps/` presente | ✅ | One-shot respeitado: pula limpeza, `apps/` intocado |
| Simulação — E: resíduo parcial | `scripts/` + `package.json` SEM `apps`/`packages` | ✅ (por desenho) | Gatilho não dispara, resíduo fica, marcador gravado — coerente com a doc ("só age se detectar resíduo real"); ver SUGESTÃO r2 #3 |
| Compose config (com envs) | `--profile tools config --quiet` com `GHCR_OWNER` + `IMAGE_TAG=sha-…` | ✅ | Compose inalterado vs r1 (`image:` ghcr + `build:` mantidos) |
| Compose config (sem GHCR_OWNER) | idem, demais envs presentes | ✅ (falha esperada, exit 1) | "required variable GHCR_OWNER is missing a value: defina GHCR_OWNER no .env" |
| Doc | grep backup/rollback em `docs/deploy-vps.md` | ✅ | Seção 8: `pg_dump` → `~/backups/` + "copie para fora da VPS" + aviso LP-13; rollback (l.329): "Run workflow só aceita branch/tag … caminho real: Re-run all jobs do run do commit desejado" — fixes r1 #1(c)/#2 |
| ADRs | leitura 0008/0010/0011 | ✅ | Nota de superseção parcial no corpo do 0008 (itens 3 e 4) e do 0010 (mecanismo de entrega), ambas apontando o ADR-0011 — fix da SUGESTÃO r1 #5 |

## Saída Relevante

```
transição A (1ª passada) → removeu exatamente os 20 nomes da blacklist;
  sobraram: anotacoes do operador.txt backup-2026-07-17.sql backups/ Caddyfile
  docker-compose.yml dump.sql .env .env.production.example .image-tag .layout-v2
transição A (2ª passada) → "Transição já aplicada (.layout-v2 presente) — pulando limpeza."
sem IMAGE_TAG → [erro] IMAGE_TAG não definido — o deploy real exige a tag EXATA… (exit 1)
DEPLOY_PATH=/ → [erro] DEPLOY_PATH inseguro: '/'… (exit 1)
bun run test → Test Files 15 passed (15) · Tests 99 passed (99)
```

## Pendências

- Primeiro run real do pipeline (humano: publicar repo, Variables, secrets — ADR-0006) — inalterada.
- E2E (Playwright) — pendência pré-existente do projeto, não deste ciclo.
- Smoke docker completo (build+migrate+up+curl) não repetido na r2: compose/Dockerfiles/workflow sem mudança funcional desde a r1 (fixes tocaram deploy.sh, doc e ADRs); resultado da r1 (landing 200 via Caddy) segue válido.
