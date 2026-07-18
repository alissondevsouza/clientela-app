---
feature: github-actions-ci-deploy
module: infra
phase: review
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: github-actions-ci-deploy (rodada 1)

Revisor QA neutro e adversarial. Arquivos revisados na íntegra: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `docs/deploy-vps.md` (documento inteiro, com conferência de numeração e referências cruzadas), `README.md` (seção Deploy), `project-memory/decisions/0010-github-actions-deploy.md`, `project-memory/decisions/README.md` (índice), `scripts/deploy.sh` (conferência de não-mudança). Evidências em `validate.md` (rodada 1).

## Análise adversarial do gate de deploy (RF-02)

Tentativas de furar o gate — todas bloqueadas:

| Vetor | Resultado |
|---|---|
| Push direto na main sem CI | Bloqueado: deploy.yml dispara na main, job `ci` (reuso do ci.yml via `workflow_call`) roda os gates DESTE commit; `needs: ci` + `if` sem função de status ⇒ GitHub prepõe `success()` implícito — deploy só roda com CI verde |
| `workflow_dispatch` de branch ≠ main | Bloqueado: CI roda, deploy é skipped pelo guard `if: github.ref == 'refs/heads/main'` (dispatch de tag idem: `refs/tags/*` ≠ `refs/heads/main`) |
| PR de fork acessando secrets | Bloqueado: ci.yml não usa nenhum secret; deploy.yml não dispara em `pull_request`; `permissions: contents: read` nos dois |
| CI do deploy cancelada pelo `cancel-in-progress` do ci.yml | Bloqueado: `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` — na main é `false`. (Se a concurrency do callee nem se aplicar via `workflow_call`, também não há cancelamento — seguro nos dois cenários) |
| Dois pushes seguidos na main | Serializado: `concurrency: deploy-production` com `cancel-in-progress: false` enfileira deploys (nunca dois rsync/compose em paralelo). Com 3+ pushes rápidos, o run intermediário *pendente* é cancelado pelo GitHub (comportamento de fila da concurrency) — o último commit deploya; "latest wins", VPS nunca fica em commit intermediário sem deploy final |
| Secrets vazios no primeiro run | Falha limpa: `printf` escreve arquivos vazios sem erro, mas `deploy.sh` falha cedo com "DEPLOY_HOST não definido" (pt-BR, sem vazar nada) |
| `main` sem CI se deploy.yml for desabilitado | Risco real e conhecido — mitigado por comentário cruzado explícito nos dois YAMLs (linha 10–14 do ci.yml) |

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md (RF-01..06 — ver tabela acima e validate.md)
- [x] Edge cases do gate: dispatch fora da main, fork PR, pushes concorrentes, secrets vazios, tag push — analisados
- [x] Tratamento de erro: deploy.sh falha cedo com mensagem clara; curl final não derruba o deploy (`|| warn`)

### Arquitetura / Banco / Tipos
- [x] n.a. — nenhum código de app, schema ou contrato mudou (só workflows + docs + ADR); confirmado por inspeção do escopo

### Segurança (security.md / RF-03)
- [x] Sem `StrictHostKeyChecking no` em lugar nenhum; host key FIXADA via `DEPLOY_KNOWN_HOSTS` (verificação estrita efetiva: runner não-interativo falha se a key não bater)
- [x] Nenhum segredo em código/log: env + `printf` para arquivo (nunca na linha de comando); sem `set -x`; deploy.sh não ecoa envs de segredo
- [x] `permissions: contents: read` nos dois workflows; actions pinadas por SHA **verificado contra a API do GitHub** (checkout v4.2.2 e setup-bun v2.2.0 — ambos batem)
- [x] Guia: chave dedicada sem passphrase, avisos TOFU (conferir fingerprint pelo console do hPanel) e host-literal (mesmo IP no keyscan e no DEPLOY_HOST) presentes — seção 5.4

### Testes (testing.md)
- [x] Suíte completa verde (99/99), integração Testcontainers com Postgres real executada de fato
- [x] Validação executável do escopo (actionlint, YAML, dry-run) conforme Decisão de Cobertura do plan — nenhum teste novo exigido (sem código de app)
- [x] Nenhum teste relaxado/skipado

### Escopo
- [x] Tasks 1.1, 1.2, 2.1, 2.2 implementadas; nada além do escopo
- [x] `scripts/deploy.sh` NÃO mudou funcionalmente vs LP-11 (comportamento idêntico ao aprovado; delta = curl multi-domínio do ADR-0009, já aprovado). Limitação: sem histórico git, comparação foi comportamental, não byte-a-byte (ver validate.md pendência 2)
- [x] ADR-0008 (arquivo) intocado; ADR-0010 no índice; `.gitignore` não engole `.github/`

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | ALERTA | Referência interna desatualizada: "antes de você rodar o deploy (passo 5)" — com a renumeração, o deploy é a **seção 6** (a 5 é a configuração do GitHub). Única referência quebrada do documento (todas as demais — 1.3, 3, 4, 5.3, 5.4, 5.5, 7 — conferem) | `docs/deploy-vps.md:50` | Trocar "(passo 5)" por "(seção 6)" |
| 2 | SUGESTÃO | Ordem 5.1 (push) antes de 5.2–5.5 (chave/secrets) faz o PRIMEIRO push disparar um run de Deploy que falha no job `deploy` (secrets ainda não existem) — falha limpa e recuperável via "Run workflow" (documentado na seção 6), mas pode assustar quem nunca usou Actions | `docs/deploy-vps.md:227` | Uma linha em 5.1: "esse primeiro push vai disparar um run de Deploy que falha por falta dos secrets — é esperado; após o 5.5, use o botão Run workflow" (ou inverter: criar repo → secrets → push) |
| 3 | SUGESTÃO | Push de branch com PR aberto gera 2 runs de CI (eventos `push` e `pull_request` em grupos de concurrency distintos) — desperdício de runner, sem risco funcional | `.github/workflows/ci.yml:15-18` | Se incomodar: restringir `push` ou consolidar grupo; aceitável como está (RF-01 pede os dois triggers) |

## Veredito

**APROVADO** — lint/typecheck/testes verdes (99/99, integração real), actionlint limpo nos dois workflows, pins por SHA verificados contra o GitHub, gate de deploy sem furo identificado em nenhum vetor testado, secrets coerentes YAML↔doc, zero CRÍTICO. Achado #1 (ALERTA) é referência de texto em doc — não bloqueia execução do guia; corrigir junto do handoff. Pendência central: **observar o primeiro run real** após publicação do repo (validate.md, pendência 1).
