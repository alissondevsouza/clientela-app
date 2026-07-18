---
feature: leads-capture-api
module: api, shared
phase: validate
status: done
round: 3
created: 2026-07-16
updated: 2026-07-17
depends_on: [spec.md, plan.md, tasks.md]
---

# Validate: leads-capture-api (rodada 3 — final)

Revalidação neutra e adversarial do zero após a correção do CRÍTICO da rodada 2 (bypass do rate limit via `/leads/`). Nada presumido; tudo re-executado. Docker disponível.

## Comandos executados

| Ferramenta | Comando | Status | Nota |
|---|---|---|---|
| Lint | `bun run lint` | OK | `Checked 42 files. No fixes applied.` |
| Typecheck | `bun run typecheck` | OK | shared, web, api — todos exit 0 |
| Testes | `bun run test` | OK | 8 arquivos, **52 passed** (52), 7.1s — 2 testes novos vs r2 (trailing slash + query string no rate limit) |
| Integração (verbose) | `bunx vitest run …leads.integration.test.ts --reporter=verbose` | OK | 9/9 com Postgres real (Testcontainers), incluindo os 2 casos adversariais de roteamento novos |
| RF-09 sem Docker | `DOCKER_HOST=tcp://127.0.0.1:1 bunx vitest run …leads.integration.test.ts` | OK | Falha com "Não foi possível iniciar o Postgres de teste via Testcontainers. Verifique se o Docker está instalado e em execução…" (sem stack cru) |

Não há step de build separado no monorepo (API roda via Bun; typecheck é o gate de compilação) — API subiu de verdade no runtime abaixo, o que prova a montagem.

## Runtime real (compose dev :5433 + `db:migrate` + API :3001 + curl `--path-as-is`)

Subida: `docker compose -f docker-compose.dev.yml up -d --wait` → Healthy · `bun run db:migrate` → "migrations applied successfully!" · `/health` → `{"status":"ok"}`.

### Foco da rodada: variantes de path contra o guard do rate limit (7 tentativas por variante, IP próprio por variante, contagem no banco após cada uma)

| Variante | Resultado (7 req) | Linhas novas no banco | Veredito |
|---|---|---|---|
| `/leads/` (CRÍTICO da r2) | `201×5 429 429` + envelope RATE_LIMITED pt-BR | 5 | **CORRIGIDO** — sem bypass |
| `/leads//` | `404×5 429 429` | 0 | OK — Elysia não roteia; guard ainda conta (fail-closed) |
| `/leads/?x=1` | `201×5 429 429` | 5 | OK |
| `/leads?x=1` | `201×5 429 429` | 5 | OK |
| `/leads%2F` (`--path-as-is`) | `404×7` | 0 | OK — Elysia não decodifica `%2F` para rotear; handler nunca roda |
| `/lead%73` (s percent-encoded) | `404×7` | 0 | OK — sem decode no roteador; sem bypass |
| `//leads` | `404×7` | 0 | OK — não roteia |
| `/leads/../leads` (`--path-as-is`) | `201×5 429 429` | 5 | OK — normalizado e limitado |
| `/LEADS` | `404×7` | 0 | OK — roteador case-sensitive; guard não conta (não casa) |
| `/leadsX` | `404×7` (nenhum 429) | 0 | OK — guard NÃO limita path que não é `/leads` |
| `GET /health` com IP de janela estourada | `200` | — | OK — health não é limitado |
| `GET /leads` | `404` envelope NOT_FOUND | 0 | OK |

### Fixes das rodadas 1–2 (reverificados)

| Cenário | Resultado | Veredito |
|---|---|---|
| POST sem `name` | 422 `VALIDATION_ERROR` "Informe seu nome completo" | OK — pt-BR |
| POST sem `consent` | 422 "É necessário aceitar o uso dos seus dados para contato" | OK — pt-BR |
| JSON malformado | 400 `INVALID_BODY` "Corpo da requisição inválido."; log da API limpo | OK — PARSE→400 |
| Spoof no início do XFF (`spoof-N, 198.51.100.3` variando N) 6x | `201×5 429` | OK — último valor é a chave |
| 5× payload inválido + 1 válido, mesmo IP | `422×5` depois `429` | OK — 422 consome a janela |
| Happy path (`website:""`, `interest:""`) | 201 `{id}` uuid **v7**; banco: `name`, whatsapp `21912345678` (só dígitos), `interest IS NULL`, `status=new`, `source=landing`, `consent_at` não-nulo | OK |
| Honeypot (`website` não-vazio) | 201 `{id}` (v4), **0 linhas** persistidas | OK |
| Log da API ao fim de todos os cenários | Apenas `API rodando em http://localhost:3001` — sem PII, sem "erro inesperado" | OK — LGPD |

Teardown: processo da API encerrado (porta 3001 fechada, verificado) + `docker compose down` (container e rede removidos). Ambiente limpo.

## Pendências

- E2E (Playwright) do fluxo de captura: infra ainda não existe — pendência explícita já registrada no fluxo (spec-format.md); não afeta este veredito.
- Nenhum CRÍTICO/ALERTA em aberto. Sugestões residuais no `review.md`.

## Resumo

Lint/typecheck limpos, suíte 52/52 verde (incluindo integração com Postgres real), RF-09 provado sem Docker, e runtime adversarial sem nenhum bypass de rate limit em 10 variantes de path. Fixes das rodadas 1–2 continuam de pé. Veredito: **APROVADO** (detalhe no `review.md`).
