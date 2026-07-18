---
feature: github-actions-ci-deploy
module: infra
phase: validate
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: github-actions-ci-deploy (rodada 1)

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | `biome check .` — 87 arquivos, limpo |
| Typecheck | `bun run typecheck` | ✅ | shared/web/api — exit 0 nos três workspaces |
| Testes | `bun run test` | ✅ (99 passed, 0 failed) | 15 arquivos; inclui integração Testcontainers com Postgres real (`leads-table.integration.test.ts`, `leads.integration.test.ts`) — verificado no reporter verbose |
| Integração | incluída em `bun run test` | ✅ | 15 testes de integração executados de fato (rate limit, honeypot, CHECK/NOT NULL, envelopes de erro) |
| Build | n.a. | n.a. | Não existe `build` na raiz; nenhum código de app mudou (plan). Build de produção acontece via Docker na VPS (fora do escopo — RF-06) |
| actionlint | `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint -verbose .github/workflows/ci.yml .github/workflows/deploy.yml` | ✅ | `Found 0 errors in 2 files` (rc=0) |
| YAML parse | `python3 -c "yaml.safe_load(...)"` nos dois workflows | ✅ | ambos parseiam |
| Shell | `bash -n scripts/deploy.sh` | ✅ | sintaxe OK |
| Runtime (simulação do caminho de deploy) | `./scripts/deploy.sh --dry-run` · `--frobnicate` · sem `DEPLOY_HOST` | ✅ | dry-run imprime o plano de 7 passos com `docker compose run --rm --build migrate`; flag desconhecida → exit 2; sem HOST → falha explícita pt-BR. Idêntico ao comportamento aprovado no QA do LP-11 (`specs/production-deploy/validate.md` rodada 2) |

## Verificações adicionais (RF-02/RF-03/RF-04)

```
# Pins por SHA conferidos na API do GitHub (refs/tags):
actions/checkout v4.2.2   → 11bd71901bbe5b1630ceea73d27597364c9af683  ✅ bate com o pin
oven-sh/setup-bun v2.2.0  → 0c5077e51419868618aeaa5fe8019c62421857d6  ✅ bate com o pin

# bun-version pinada (1.3.11) vs local:
$ bun --version → 1.3.11  ✅ ; `bun install --frozen-lockfile` presente no ci.yml

# Segurança (greps):
grep -rn "StrictHostKeyChecking" .github/ scripts/ docs/     → nenhuma ocorrência ✅
grep -nE "set -x|echo .*(SSH_KEY|KNOWN_HOSTS|secrets\.)" ... → nenhuma ocorrência ✅
  (segredos entram por env e vão a arquivo via printf — nunca na linha de comando)
permissions: contents: read presente nos DOIS workflows ✅

# Nomes de secrets YAML ↔ doc (sort -u dos dois lados):
DEPLOY_HOST / DEPLOY_KNOWN_HOSTS / DEPLOY_PATH / DEPLOY_SSH_KEY — idênticos ✅ (4 secrets)

# Escopo:
.gitignore NÃO exclui .github ✅ ; scripts/deploy.sh com bit de execução (rwxrwxr-x) ✅
ADR-0008 (arquivo) não foi editado — sem menção a 0010 no corpo ✅ (anotação só no índice)
```

## Pendências

1. **Execução real dos workflows** — impossível validar de verdade: o repositório ainda não tem remote nem commits (`git log` vazio). Validado o máximo executável localmente (actionlint, YAML, simulação do deploy.sh). **Observar o primeiro run real** após o humano publicar o repo e cadastrar os secrets (pendência já prevista no plan/DoD).
2. **Comparação byte-a-byte do `scripts/deploy.sh` com a versão aprovada no LP-11** — impossível por diff (repo sem histórico git). Verificado por comportamento: dry-run, códigos de saída e mensagens batem exatamente com `specs/production-deploy/validate.md`/`review.md` (rodada 2); único delta é o `cut -d, -f1` do curl multi-domínio, coerente com o ADR-0009 e citado como já aprovado no escopo desta revisão.
3. **Semântica de `concurrency` em workflow reutilizável** — a doc do GitHub é ambígua sobre a `concurrency` de nível de workflow do ci.yml quando chamado via `workflow_call`. Análise nos dois cenários: se aplica, `cancel-in-progress: false` na main protege o gate do deploy; se não aplica, não há o que cancelar. Sem furo em nenhum dos casos — confirmar observando runs reais.
4. **E2E (Playwright)** — pendência pré-existente e inalterada (infra não existe).
