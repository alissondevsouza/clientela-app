---
feature: ghcr-image-deploy
module: infra
phase: review
status: done
round: 2
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: ghcr-image-deploy (rodada 1)

<!-- Revisor QA neutro/adversarial. Evidências executadas em validate.md. -->

## Resumo

INF-05 move o build das imagens para o runner e publica no GHCR; a VPS só faz pull+migrate+up. A implementação é sólida no núcleo: permissions por job corretas, token nunca ecoado (stdin + trap + step `always()`), `--profile tools` em pull/build, migrate sem `--build`, `prune -af`, `.image-tag` documentada, fail-fast de Variables, owner lowercase, nomes YAML↔doc idênticos, smoke local completo verde (build via compose → migrate → up → landing 200 via Caddy → teardown). **Porém a limpeza de transição roda a CADA deploy com whitelist de apenas 5 nomes e apaga silenciosamente qualquer arquivo do operador em `/opt/clientela` — inclusive o backup `pg_dump` que a própria seção 8 do guia manda criar ali.** Comprovado em simulação. Um CRÍTICO ⇒ REPROVADO.

## Arquivos Revisados

`docker-compose.yml` · `scripts/deploy.sh` · `.github/workflows/deploy.yml` · `.env.production.example` · `docs/deploy-vps.md` · `project-memory/decisions/0011-ghcr-image-deploy.md` · `project-memory/decisions/README.md` (índice) · sanidade: `ci.yml`, `apps/web/Dockerfile`, `apps/api/Dockerfile`, `.dockerignore` (sem mudança de escopo detectável — sem baseline de diff, verificação por leitura).

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md (exceto interação destrutiva do CRÍTICO #1)
- [x] Edge cases exercitados de fato: transição idempotente, nomes hostis (`-f`, `--delete`, espaço, `$(...)`), `.envX`/`.env.d` não confundidos com `.env`, compose sem `GHCR_OWNER` falha claro, `DOMAIN` em lista usa 1º endereço
- [x] Tratamento de erro: `set -euo pipefail`, fail-fast de `.env` remoto/params, mensagens acionáveis em pt-BR

### Workflow e script (RF-02/03/04)
- [x] `permissions` por job: topo `contents: read`; `build-push` = `contents: read + packages: write`; `deploy` = `contents: read + packages: read` (sem herança implícita — comentado no YAML)
- [x] Token nunca ecoado: login por `--password-stdin` no runner E na VPS; sem `set -x`; deploy.sh:116 imprime só `<definido>`
- [x] Logout garantido: trap `EXIT` no script (deploy.sh:151-152) + step `if: always()` no job (cinto e suspensório)
- [x] `--profile tools` no pull (deploy.sh:160) e no build do smoke; migrate via `run --rm` sem `--build` (deploy.sh:163)
- [x] `docker image prune -af` presente (deploy.sh:174); `.image-tag` gravada (deploy.sh:169) e documentada p/ `up` manual (doc seção 8)
- [x] Fail-fast de `vars.SITE_URL`/`vars.WHATSAPP_PHONE` antes de qualquer build, apontando a seção 5.6; owner lowercase via `tr` com env intermediária (sem injeção)
- [x] rsync SÓ de 3 arquivos de infra, sem `--delete`; sem resíduo do modelo antigo (grep: nenhum rsync de `apps/`)
- [x] 2 tags por imagem (`:latest` + `:sha-<curto>`), push `--all-tags`; deploy sempre pela sha exata via output de job
- [ ] Transição do layout antigo segura para arquivos do operador — **NÃO** (CRÍTICO #1)

### Segurança (security.md)
- [x] Sem segredo em código/log; segredos só via secrets→env→stdin/printf; known_hosts fixado (sem desligar verificação)
- [x] Sem PII em log; guard main nos dois jobs; concurrency serializa deploys
- [x] Compose: só Caddy publica portas; Postgres/API internos (inalterado)

### Docs e ADR (RF-05/06)
- [x] Nomes idênticos YAML↔doc: secrets `DEPLOY_SSH_KEY`/`DEPLOY_KNOWN_HOSTS`/`DEPLOY_HOST`/`DEPLOY_PATH` (5.5) e Variables `SITE_URL`/`WHATSAPP_PHONE`/`WHATSAPP_DEFAULT_MESSAGE` (5.6); `GHCR_OWNER` no exemplo/compose/doc
- [x] ADR-0011: superseções corretas (mecanismo do 0010; item 3 do 0008 — itens 1/2/4 preservados), fallback "provedor fora do ar" honesto, `:latest` informativa, duplicação Variables×`.env` consciente; índice atualizado nas 3 linhas
- [ ] Doc 100% coerente com o implementado — rollback "Run workflow apontando para o commit anterior" é impreciso (ALERTA #2); seção 8 contradiz a transição (CRÍTICO #1)

### Testes (testing.md / spec-format.md)
- [x] Nenhum código de app mudou ⇒ unidade/integração n.a. (justificado no plan.md); suíte existente 99/99 verde
- [x] Validação executável do spec cumprida e re-executada de forma independente (derivada do spec, não do diff): actionlint, compose config ±GHCR_OWNER, dry-run, simulação de transição, smoke completo
- [x] Nenhum teste relaxado/skipado

### Escopo
- [x] Todas as tasks do tasks.md implementadas
- [x] Nada além do escopo detectado (ci.yml/Dockerfiles sem alteração aparente; ROADMAP INF-05 em `[>]` — atualizar para `[R]` no handoff)

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | **CRÍTICO** | A "transição do layout antigo" roda em **TODO deploy** e faz `rm -rf` de tudo em `$DEPLOY_PATH` que não esteja numa whitelist de 5 nomes (`.env`, `.image-tag`, `docker-compose.yml`, `Caddyfile`, `.env.production.example`). A seção 8 do guia instrui o operador a gerar o backup do banco com `pg_dump ... > backup-$(date +%F).sql` **dentro de `/opt/clientela`** (os comandos da tabela assumem `cd /opt/clientela`) — o deploy seguinte **apaga silenciosamente o backup** (comprovado em simulação: `backup-2026-07-17.sql` removido). Como o backup externo (LP-13) ainda não existe, esse arquivo pode ser o ÚNICO backup dos leads. O spec (RF-03) pedia remoção dos **resíduos do modelo rsync** ("diretórios de código-fonte… arquivos soltos do repo"), não de qualquer arquivo do operador, para sempre. | `scripts/deploy.sh:138-143` × `docs/deploy-vps.md:403` | Opções (qualquer uma resolve): (a) trocar whitelist por **blacklist explícita** dos resíduos conhecidos do layout antigo (`apps`, `packages`, `scripts`, `specs`, `project-memory`, `docs`, `.claude`, `node_modules`, dotfiles do repo, manifests soltos) — idempotente e sem efeito sobre arquivos do operador; (b) manter whitelist mas tornar o passo **one-shot** (marcador tipo `.layout-v2`, pular se presente) e/ou preservar `backup-*`; (c) no mínimo, mudar a seção 8 para gravar o dump fora de `/opt/clientela` (ex.: `~/backups/`) E logar o que a transição removeu. Recomendo (a) ou (b)+(c). |
| 2 | ALERTA | Rollback na doc: "rode **Run workflow** apontando para o **commit anterior** (na UI do Actions…)" — `workflow_dispatch` só aceita **branch/tag**, não commit arbitrário; a única via realmente disponível é o "Re-run all jobs" do run daquele commit (que a doc também cita). Operador seguindo a primeira instrução não encontra a opção. | `docs/deploy-vps.md:329` | Reescrever: rollback = **Re-run all jobs** do run do commit desejado (ou reverter o commit e publicar); remover a menção a "Run workflow apontando para o commit anterior". |
| 3 | ALERTA | O `find … -exec rm -rf` roda sob `cd '$DEPLOY_PATH'` com única guarda "existe `.env`". Um `DEPLOY_PATH` mal configurado que aponte para um diretório com `.env` (ex.: home de outro app) seria devastado até a whitelist. Probabilidade baixa (secret configurado uma vez), dano alto. | `scripts/deploy.sh:138-143` | Antes da limpeza, exigir marcador de sanidade mais forte: `test -f docker-compose.yml` no destino (o rsync do passo 1 garante) **e** recusar caminhos suspeitos (`/`, `$HOME` puro, caminho relativo). |
| 4 | SUGESTÃO | Execução real sem `IMAGE_TAG` cai em `latest` (deploy.sh:39), contradizendo o contrato "o deploy nunca usa `:latest`" (ADR-0011); um fallback manual esquecendo a env publicaria a tag mutável. | `scripts/deploy.sh:39` | Fora do dry-run, exigir `IMAGE_TAG` explícita (fail como HOST/PATH/token) ou ao menos `warn` ruidoso ao usar `latest`. |
| 5 | SUGESTÃO | ADR-0010 e ADR-0008 não receberam nota de superseção parcial no **próprio arquivo** (só no índice). O README de decisions pede "marque o antigo como substituído". Segue a convenção anterior do projeto (0008 também não foi anotado quando o 0010 o substituiu em parte), mas leitura direta do 0010 hoje induz a erro. | `project-memory/decisions/0010-*.md`, `0008-*.md` | Uma linha no Status do ADR antigo ("mecanismo substituído pelo ADR-0011") — decisão de convenção para o humano. |
| 6 | SUGESTÃO | `--help` imprime o shebang mutilado (`!/usr/bin/env bash`) como 1ª linha (grep `^#` pega a linha 1); e o dry-run numera 11 passos enquanto a execução real numera 1/10–10/10. Cosmético. | `scripts/deploy.sh:68,98-111` | `tail -n +2` antes do grep; alinhar numeração. |

## Conformidade

- **api.md/web.md/database.md/core.md**: n.a. — nenhum código de app alterado; nenhum arquivo TS tocado.
- **security.md**: atendido no que foi implementado (segredos via env/stdin, logout garantido, superfície pública inalterada, sem PII em log). O CRÍTICO #1 é risco de **perda de dado** operacional, não vazamento.
- **spec-format.md (cobertura)**: decisão de cobertura do plan.md respeitada; validação executável reproduzida integralmente por este QA.

## Veredito

**REPROVADO** — 1 CRÍTICO em aberto (interação destrutiva transição×backup documentado). Os demais gates (lint/typecheck/testes/actionlint/smoke) estão verdes; a correção do CRÍTICO é localizada (`deploy.sh` e/ou seção 8 da doc) e não invalida o desenho geral.

---

# Review: ghcr-image-deploy (rodada 2 — pós-fix)

## Resumo

Rodada focada nos fixes da r1, revalidada do zero (script relido inteiro; transição re-simulada em diretórios fake independentes com a função extraída byte a byte; gates re-executados). **Todos os 6 achados da r1 foram resolvidos** — em especial o CRÍTICO #1: a limpeza de transição virou **one-shot** (marcador `.layout-v2`), **cirúrgica** (blacklist explícita de 20 nomes do repo antigo, nunca glob), **condicionada a resíduo real** (`apps/` ou `packages/`) e **guardada** (`assert_safe_deploy_path` + exige `docker-compose.yml` no destino). Comprovado em simulação: backups, dumps e arquivos soltos do operador intocados; 2ª passada no-op; destino sem compose aborta sem remover nada. `IMAGE_TAG` agora é obrigatória no deploy real (falha clara antes de qualquer ação remota). Doc manda o `pg_dump` para `~/backups/` e o rollback foi corrigido para "Re-run all jobs". ADR-0008/0010 ganharam nota de superseção no próprio corpo. Nenhum CRÍTICO novo ⇒ APROVADO.

## Status dos achados da rodada 1

| # r1 | Era | Status r2 | Evidência |
|---|---|---|---|
| 1 | CRÍTICO — transição apagava arquivos do operador a cada deploy | **RESOLVIDO** | `deploy.sh:51-62,115-142`; simulações A–D (validate.md r2): blacklist explícita, `backup-*.sql`/`dump.sql`/`backups/`/`.env`/`.image-tag` preservados; one-shot via `.layout-v2`; doc §8 agora usa `~/backups/` |
| 2 | ALERTA — rollback "Run workflow no commit anterior" (inexistente) | **RESOLVIDO** | `docs/deploy-vps.md:329` explica que Run workflow só aceita branch/tag e indica **Re-run all jobs** do run do commit desejado (ou `git revert`) |
| 3 | ALERTA — limpeza sem guarda de caminho | **RESOLVIDO** | `assert_safe_deploy_path` (deploy.sh:100-105, chamada antes do rsync) recusa `/`, relativo, `/opt` e vazio (testado); transição adicionalmente exige `docker-compose.yml` no destino (cenário C: aborta sem remover) |
| 4 | SUGESTÃO — execução real sem IMAGE_TAG caía em `:latest` | **RESOLVIDO** | `deploy.sh:175` falha com mensagem acionável; testado com host/path/token definidos; dry-run não a exige; `deploy.yml:165` injeta a sha exata |
| 5 | SUGESTÃO — ADRs antigos sem nota de superseção no corpo | **RESOLVIDO** | Nota no topo de `0008-production-deploy-pattern.md` (itens 3 e 4) e `0010-github-actions-deploy.md` (mecanismo de entrega), ambas → ADR-0011 |
| 6 | SUGESTÃO — `--help` com shebang mutilado; numeração dry-run ≠ real | **RESOLVIDO** | `tail -n +2` (deploy.sh:80); dry-run e execução real ambos 1/10–10/10 + logout como passo extra não numerado |

## Problemas Encontrados (rodada 2)

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | ADR-0011 (seção Alternativas) ainda diz "rollback = redeploy do commit anterior (`Run workflow`)" — a imprecisão que a doc corrigiu (Run workflow não aceita commit arbitrário). O guia operacional (que o operador segue) está certo; só o texto de racional ficou defasado. | `project-memory/decisions/0011-ghcr-image-deploy.md` (linha ~33) | Trocar por "(Re-run all jobs do run correspondente)" numa linha. |
| 2 | SUGESTÃO | `DEPLOY_PATH` é interpolado dentro de aspas simples no comando remoto; um valor contendo `'` quebraria/injetaria no script remoto, e caminhos exóticos como `/../..` (≡ `/`) passam no padrão `/*/?*`. Valor vem de secret configurado uma única vez pelo humano e a guarda do `docker-compose.yml` limita o dano — risco teórico. | `scripts/deploy.sh:100-105,117-141` | Se quiser blindar: rejeitar `'` e `..` no `assert_safe_deploy_path`. |
| 3 | SUGESTÃO | Cenário E (simulado): se o destino tiver resíduo parcial SEM `apps/`/`packages/` (ex.: operador removeu esses dois à mão), o gatilho não dispara, o marcador é gravado e o resíduo restante fica para sempre. Comportamento coerente com a doc e sem risco de perda — só possível sobra cosmética num cenário improvável. | `scripts/deploy.sh:128` | Nada a fazer agora; se ocorrer, remoção manual (a doc já descreve o layout esperado). |

## Conformidade

- **security.md**: mantido — token só via stdin, logout por trap + step `always()`, sem echo de segredo (verificado por grep na r1 e releitura na r2), superfície pública inalterada. O risco de perda de dado do CRÍTICO r1 foi eliminado (blacklist + one-shot + `~/backups/` fora do alcance do deploy).
- **core.md/api.md/web.md/database.md**: n.a. — nenhum código de app alterado nesta rodada (gates raiz re-executados: verdes).
- **spec-format.md**: critérios de aceite RF-01–RF-07 atendidos (RF-04: `bash -n` ok, dry-run coerente, sem resíduo do modelo antigo — grep sem rsync de `apps/`, sem `find` destrutivo; RF-05/06: doc↔ADR coerentes, ressalva SUGESTÃO #1).

## Veredito

**APROVADO** — CRÍTICO da r1 corrigido e comprovado por simulação independente; demais achados r1 resolvidos; 3 sugestões novas (nenhuma bloqueante); lint/typecheck/testes/actionlint/compose config verdes. Pendência mantida: primeiro run real do pipeline é do humano (ADR-0006).
