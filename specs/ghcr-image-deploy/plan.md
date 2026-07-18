---
feature: ghcr-image-deploy
module: infra
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Plan: Deploy por imagens via GHCR

> `research.md` dispensado (registrado no Decisions Log): alvo pequeno e inteiramente mapeado nos ciclos LP-11/INF-04 (compose, Dockerfiles, deploy.sh, workflows, doc).

## Decisões Técnicas

| Decisão | Justificativa |
|---|---|
| GHCR, não registry na VPS | Registry próprio = TLS/auth/storage/backup a operar + porta a proteger, sem benefício; GHCR é integrado ao repo e o `GITHUB_TOKEN` do run autentica push e pull |
| `image:` + `build:` coexistem no compose | Modo pull (prod) e modo build (smoke local/fallback) com um único arquivo; compose resolve pelo comando usado |
| Tags `:latest` + `:sha-<curto>`; deploy sempre por `sha-` exata | Rastreável e determinística; rollback = redeploy do commit anterior (Run workflow) |
| `IMAGE_TAG` persistida na VPS em arquivo `/opt/clientela/.image-tag` (lido pelo script; `.env` não é tocado pelo pipeline) | `.env` é do humano (segredos); arquivo separado evita edição automatizada do `.env` e sobrevive a reboot (`up` usa a última tag puxada) |
| Login GHCR na VPS: `printf token \| ssh docker login --password-stdin`; `docker logout ghcr.io` em step com `if: always()` | Token efêmero do run, nada persistido; logout garantido mesmo em falha |
| Build no runner com `docker build` simples (sem buildx/cache remoto) | 1º ganho é tirar o build da VPS; cache remoto é otimização futura |
| Build args de **Variables** (`vars.*`), não secrets | Não são segredo (aparecem no HTML SSG); Variables são visíveis/editáveis — menos fricção |
| `deploy.sh` reescrito com dois subcomandos: `remote` (o que o runner roda: sync infra + login/pull/migrate/up) e `--dry-run`; sem modo build local no script | O smoke local usa compose direto (documentado); script foca no caminho real do pipeline — sem código morto |
| `GHCR_OWNER` no `.env` da VPS via `${GHCR_OWNER:?}` no compose | Owner não é derivável na VPS; falha explícita se ausente |

## Arquivos a Criar/Modificar

| Arquivo | Mudança |
|---|---|
| `docker-compose.yml` | + `image:` nos 3 serviços com `${GHCR_OWNER:?}`/`${IMAGE_TAG:-latest}` |
| `.github/workflows/deploy.yml` | + job `build-push` (login GHCR, build 3 alvos com args de vars, push 2 tags); job `deploy` reescrito (sync infra, login VPS, pull tag exata, migrate sem --build, up, logout always) |
| `scripts/deploy.sh` | Reescrito para o novo processo (RF-04) |
| `.env.production.example` | + `GHCR_OWNER`; nota Variables×runtime |
| `docs/deploy-vps.md` | Seções 3/5(+5.6)/6/9 conforme RF-05 |
| `project-memory/decisions/0010-github-actions-deploy.md` → intocado; **novo** `0011-ghcr-image-deploy.md` + índice | ADRs imutáveis |

## Cobertura

| Nível | Obrigatório? | Justificativa |
|---|---|---|
| Unidade/Integração | n.a. | Nenhum código de app muda |
| Validação executável | **sim — gate** | actionlint + compose config + smoke local (build/migrate/up/curl/teardown) + bash -n + gates raiz |
| Primeiro run real | pendência | Pós-push do humano |

## Riscos

| Risco | P | Mitigação |
|---|---|---|
| Compose `build`+`image` divergirem de nome no smoke | média | Smoke builda VIA compose (tags locais idênticas às do pull) |
| Token do run sem acesso ao pacote na 1ª publicação | baixa | 1ª publicação é feita pelo próprio job (pacote nasce ligado ao repo); doc cobre `denied` |
| `up` pós-reboot sem `.image-tag` | baixa | Script grava o arquivo a cada deploy; fallback `latest` documentado |
| Migração rodar de imagem velha se pull falhar parcial | baixa | `pull` das 3 imagens antes de migrate; `set -euo pipefail` aborta |

## Definition of Done
- [ ] RF-01..07 atendidos (evidências no relatório)
- [ ] Smoke local completo verde; gates raiz verdes
- [ ] Doc/ADR coerentes; sem resíduo do modelo antigo
