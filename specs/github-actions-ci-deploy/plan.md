---
feature: github-actions-ci-deploy
module: infra
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Plan: CI + deploy via GitHub Actions

## Decisões Técnicas

| Decisão | Justificativa |
|---|---|
| CI como **workflow reutilizável** (`ci.yml` com `workflow_call` além de push/PR) e `deploy.yml` chamando-o via `uses:` num job `ci` + job `deploy` com `needs: ci` | Único mecanismo que garante "CI verde DESTE commit antes do deploy" sem race: `workflow_run` é assíncrono e frágil; duplicar os steps de CI no deploy violaria DRY. Push na main roda o CI duas vezes? Não — `ci.yml` em `push` ignora `main` (`branches-ignore: [main]`); na main o CI roda como job do deploy |
| Reusar `scripts/deploy.sh` no runner (não reimplementar em YAML) | Script já validado em QA (LP-11 rodadas 1–2); o workflow só provê SSH + env. Uma fonte de verdade para o processo de deploy |
| SSH: chave privada de secret escrita em `~/.ssh/id_ed25519` (600) + `~/.ssh/known_hosts` do secret `DEPLOY_KNOWN_HOSTS` | Host key fixada = sem TOFU/MitM; sem `StrictHostKeyChecking no` (RF-03) |
| `concurrency: { group: deploy-production, cancel-in-progress: false }` no job de deploy | Deploys enfileiram (nunca dois rsync/compose em paralelo); cancelar no meio poderia deixar a VPS em estado parcial |
| `permissions: contents: read` nos dois workflows | Mínimo necessário (checkout) |
| Bun via `oven-sh/setup-bun@v2` com `bun-version-file` ausente → latest estável; cache do store do Bun via `actions/cache` **omitido** na v1 | Instalação do Bun é rápida; cache adiciona complexidade sem gargalo comprovado — otimizar depois se o CI passar de ~10 min |
| Guia: seção GitHub entra ANTES da seção de deploy; script local vira apêndice "fallback manual" | Ordem de execução real do humano |
| ADR-0010 substitui apenas o item 4 do ADR-0008 (deploy por rsync local → Actions); resto do 0008 permanece | ADRs imutáveis: novo ADR declara a substituição parcial |

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Propósito |
|---|---|
| `.github/workflows/ci.yml` | lint + typecheck + test (push não-main, PR, e `workflow_call`) |
| `.github/workflows/deploy.yml` | push na main + dispatch → job ci (reuso) → job deploy (SSH + deploy.sh) |
| `project-memory/decisions/0010-github-actions-deploy.md` | ADR da mudança |

### Modificar
| Arquivo | Mudança |
|---|---|
| `docs/deploy-vps.md` | Seções 0/5/7 + nova seção GitHub (repo, deploy key, keyscan, secrets); script como fallback |
| `project-memory/decisions/README.md` | Índice + ADR-0010 |
| `README.md` | Nota curta: deploy via Actions; guia continua o mesmo |

## Cobertura de Testes

| Nível | Obrigatório? | Justificativa |
|---|---|---|
| Unidade/Integração | n.a. | Nenhum código de app muda |
| Validação executável | **sim — gate** | actionlint via Docker + YAML parse + gates da raiz verdes; execução real do workflow só após o push do humano (registrar como pendência de handoff com instrução de observar o primeiro run) |
| E2E | pendência (inalterada) | — |

## Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Primeiro run real falhar por secret ausente/errado | média | Guia lista os 4 secrets com o comando exato que gera cada valor; deploy.sh falha cedo com mensagem clara |
| Testcontainers no runner mais lento que local | alta | Aceito; timeout 20 min com folga (suite local: ~1 min + pull) |
| Chave com passphrase travaria o job | média | Guia manda gerar chave DEDICADA sem passphrase, restrita ao usuário deploy |
| `branches-ignore: [main]` no ci.yml deixar main sem CI se alguém desabilitar deploy.yml | baixa | Comentário cruzado nos dois YAMLs explicando o acoplamento |

## Definition of Done
- [ ] RF-01..06 atendidos (actionlint limpo; gates raiz verdes)
- [ ] Guia executável de ponta a ponta por quem nunca usou Actions
- [ ] ADR-0010 + índice; roadmap INF-01/INF-04 atualizados
- [ ] Pendência registrada: observar o primeiro run real após o push do humano
