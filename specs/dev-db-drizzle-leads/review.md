---
feature: dev-db-drizzle-leads
module: api, infra
phase: review
status: done
round: 2
created: 2026-07-16
updated: 2026-07-16
depends_on: [spec.md, plan.md, validate.md]
---

# Review: dev-db-drizzle-leads (rodada 2)

> **Contexto**: a rodada 1 REPROVOU por 1 CRÍTICO (mount do volume em `/var/lib/postgresql/data`, que quebra em `postgres:18+`) e 1 ALERTA (conflito de porta 5432 com Postgres nativo do host). Esta rodada revalidou tudo do zero, sem confiar na rodada anterior.

Arquivos revisados: `docker-compose.dev.yml`, `.env.example`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/drizzle.config.ts`, `apps/api/src/env.ts`, `apps/api/src/env.test.ts`, `apps/api/src/index.ts`, `apps/api/src/db/client.ts`, `apps/api/src/db/schema/{leads.ts,index.ts}`, `apps/api/drizzle/0000_new_gideon.sql` + `meta/*`, `apps/api/test/helpers/pg-container.ts`, `apps/api/src/db/leads-table.integration.test.ts`.

## Resolução dos achados da rodada 1

| # (r1) | Severidade | Status na rodada 2 |
|--------|-----------|--------------------|
| 1 | CRÍTICO | **RESOLVIDO** — `docker-compose.dev.yml:17` monta `clientela_pg_dev:/var/lib/postgresql` (com comentário citando docker-library/postgres PR #1259). Provado empiricamente: volume limpo → `healthy`; dados sobrevivem a `down`+`up`; `uuidv7()` funciona |
| 2 | ALERTA | **RESOLVIDO** — porta do host configurável `127.0.0.1:${CLIENTELA_PG_PORT:-5433}:5432`; `.env.example` coerente (`localhost:5433`). Nesta máquina (Postgres nativo em 5432) o `up` funcionou sem conflito |
| 3 | SUGESTÃO | **RESOLVIDO** — CHECK derivado de `leadStatusValues` (`statusCheckLiterals` com escape defensivo); `db:generate` sem drift |
| 4 | SUGESTÃO | **RESOLVIDO** — `env.ts` restringe esquema com refine (`postgres://`/`postgresql://`); testado em runtime com `http://` → rejeita sem vazar valor; testes unitários novos cobrem o caso |
| 5 | SUGESTÃO | **RESOLVIDO (parcial por natureza)** — `updatedAt` ganhou `.$onUpdate(() => new Date())`. Nota: é mecanismo do Drizzle em runtime, não trigger no banco — UPDATE feito fora do Drizzle não atualiza a coluna (aceitável; registrar no handoff) |
| 6 | SUGESTÃO | **NÃO IMPLEMENTADO** — helper segue sem utilitário de limpeza entre testes (reaparece abaixo como #2) |

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md — RF-01..RF-07 todos verificados (ver validate.md); RF-01, que reprovou na rodada 1, agora passa empiricamente
- [x] Edge cases: env ausente/malformada/esquema errado/coerção de PORT; insert sem `name`, sem `consent_at`, `interest` null, `status` fora do domínio
- [x] Tratamento de erro: boot falha explícito (exit 1) com mensagem clara; sem catch engolido; `drizzle.config.ts` falha claro sem `DATABASE_URL`

### Arquitetura (api.md)
- [x] `createDb(databaseUrl)` é a única fonte de conexão (grep: só `client.ts` e o helper de teste, que usa `createDb`); injeção explícita, sem singleton
- [x] Zod na fronteira de env (`loadEnv`); sem rota nova nesta entrega (fronteira HTTP é LP-02)
- [x] Nenhum import de `db/` fora de `apps/api`; web não tocada
- [x] Dinheiro n.a.; transação n.a. (sem operação multi-passo)

### Banco (database.md)
- [x] Migração gerada por `drizzle-kit generate`, versionada; `db:generate` → "No schema changes"; `apps/api/drizzle/` contém APENAS `0000_new_gideon.sql` + meta consistente (journal com 1 entrada apontando para o snapshot 0000)
- [x] snake_case no banco / camelCase no TS; NOT NULL por padrão (`interest` nullable é decisão registrada no plan); uuid v7 default **no banco** (`uuidv7()`, PG 18.4); `timestamptz`; CHECK real no SQL confirmado via `pg_get_constraintdef`; FKs n.a.
- [x] `db:migrate` aplicou a migração real no banco do compose

### Segurança e LGPD (security.md)
- [x] Sem segredo em código (credenciais do compose são de dev, exposto só em 127.0.0.1, declaradas não-segredo no RF-01); `.env` gitignorado; `.env.example` sem valor real
- [x] Erro de env lista só NOMES de variáveis — provado em runtime: senha injetada em `DATABASE_URL` http:// não aparece na saída
- [x] `consent_at` NOT NULL protegido por teste de integração (LGPD)

### Tipos e qualidade (core.md)
- [x] Sem `any`/`as`/`!`; named exports; kebab-case; constantes nomeadas; union type + `as const` em vez de enum; `sql.raw` no CHECK é justificado em comentário (literais constantes de domínio, com escape)

### Testes (testing.md)
- [x] Integração com Testcontainers (obrigatória: muda schema) real — container `postgres:18-alpine` observado via `docker ps` durante a execução; migrações versionadas aplicadas; sem mock de banco
- [x] Testes derivam do spec (RF-02, RF-06): defaults, NOT NULLs, CHECK, uuid v7 (regex valida dígito de versão), não-vazamento de valores
- [x] Nenhum teste skipado/relaxado; 17/17 verdes
- [x] Cobertura de RF-01 (manual por natureza): compose validado empiricamente nesta rodada — healthy, persistência, uuidv7, limpeza com `down -v`

### Escopo
- [x] Todas as tasks do tasks.md implementadas; nada fora do escopo; branch de trabalho `feature/phase-1-landing-page` (sem git de escrita)

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | `CLIENTELA_PG_PORT` (nova nesta rodada) não está documentada no `.env.example` — quem mudar a porta do compose precisa lembrar de mudar `DATABASE_URL` junto; `security.md` pede `.env.example` sempre atualizado | `.env.example` | Adicionar linha comentada `# CLIENTELA_PG_PORT=5433` com nota de que deve casar com a porta do `DATABASE_URL` |
| 2 | SUGESTÃO | (herdado da r1 #6) Testes de integração compartilham o container sem limpeza entre testes. Hoje são order-independent (cada um asserta só a própria linha), mas `testing.md` pede estado preparado/limpo por teste e o LP-02 reutilizará o helper | `apps/api/test/helpers/pg-container.ts` | Expor utilitário de limpeza (ex.: `truncateAll()`) para uso em `beforeEach` no LP-02 |
| 3 | SUGESTÃO | `startPgContainer` não tem try/catch: se `migrate` falhar, `sql.end()`/`container.stop()` não rodam (o reaper ryuk limpa órfãos, então impacto prático baixo); e falha de Docker ausente propaga o erro cru do Testcontainers — o spec pede "mensagem compreensível quando Docker não está disponível" (a mensagem nativa é razoável, mas não foi customizada) | `apps/api/test/helpers/pg-container.ts:19-23` | Envolver o start em try/catch que encerra recursos e reempacota erro de runtime indisponível com dica ("Docker está rodando?") |
| 4 | SUGESTÃO | (herdado da r1 #5, residual) `$onUpdate` só cobre UPDATEs feitos via Drizzle — UPDATE por SQL cru não toca `updated_at`. Sem efeito hoje | `apps/api/src/db/schema/leads.ts:38` | Se o projeto um dia fizer UPDATE fora do Drizzle, promover a trigger no banco |

## Veredito

**APROVADO** — lint, typecheck e suíte (17/17, com Testcontainers real) verdes; boot com/sem env validado em runtime sem vazamento de valores; compose sobe healthy em volume limpo, persiste dados após `down`+`up` e expõe `uuidv7()` (PG 18.4); `db:generate` sem drift e `apps/api/drizzle/` contém só a migração 0000 + meta; todos os critérios de aceite RF-01..RF-07 atendidos; o CRÍTICO e o ALERTA da rodada 1 comprovadamente resolvidos; zero achados CRÍTICO/ALERTA nesta rodada (4 sugestões, nenhuma bloqueante).
