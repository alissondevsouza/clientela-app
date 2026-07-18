---
feature: dev-db-drizzle-leads
module: api, infra
phase: spec
status: draft
size: M
created: 2026-07-16
updated: 2026-07-16
---

# Spec: Banco local de desenvolvimento + Drizzle + migração inicial `leads`

## O Que

Infraestrutura de persistência do projeto: um Postgres local de desenvolvimento via `docker-compose.dev.yml`, o setup completo do Drizzle na API (`drizzle-kit`, client injetável, validação de env) e a migração inicial versionada criando a tabela `leads` (com `consent_at`), pronta para o módulo `leads` da API (LP-02).

## Por Que

Item **LP-01** do `specs/ROADMAP.md` (Fase 1 — Landing page). A landing captura leads que precisam ser persistidos (LGPD exige registro de consentimento — `consent_at`). Tudo da Fase 1 que toca banco (LP-02, LP-06) e o CRM (Fase 2) dependem deste alicerce: banco reproduzível em dev, migrações versionadas e client tipado.

## Requisitos

- **RF-01** — `docker-compose.dev.yml` na raiz sobe um Postgres 18 local com volume nomeado persistente, healthcheck e porta exposta apenas em localhost; credenciais de dev definidas no próprio arquivo (não são segredo) e coerentes com o `DATABASE_URL` do `.env.example`.
- **RF-02** — A API valida env no boot com schema Zod (`DATABASE_URL` obrigatória, `PORT` opcional com default): app não sobe com config inválida/ausente (mensagem de erro clara, sem vazar valores).
- **RF-03** — Client Drizzle criado por factory injetável (`createDb(databaseUrl)`) em `apps/api/src/db/`, usando driver compatível com Bun (runtime) e Node (Vitest/Testcontainers); nenhum outro lugar da API instancia conexão.
- **RF-04** — Schema Drizzle da tabela `leads` em `apps/api/src/db/schema/leads.ts` seguindo `database.md` e o modelo de domínio: `id` uuid v7 com default no banco, `name`, `whatsapp`, `interest` (nullable), `source` (text NOT NULL, default `'landing'`), `status` (enum de domínio via constraint CHECK real no SQL, default `new`), `consent_at` (NOT NULL), `created_at`, `updated_at` — snake_case no banco, camelCase no TS.
- **RF-05** — Migração inicial gerada com `drizzle-kit generate`, versionada em `apps/api/drizzle/`, com scripts `db:generate` e `db:migrate` no `package.json` da API.
- **RF-06** — Teste de integração com Testcontainers: sobe Postgres real, executa as migrações reais e prova que a tabela `leads` aceita inserção válida aplicando os defaults (`id` v7 gerado, `status = 'new'`, timestamps) e rejeita violações de NOT NULL.
- **RF-07** — `.env.example` atualizado com `DATABASE_URL` ativa (valor de dev, sem segredo real).

## Critérios de Aceite

- [ ] (RF-01) `docker compose -f docker-compose.dev.yml up -d` sobe o Postgres saudável (healthcheck `pg_isready` passa) e os dados sobrevivem a `down` + `up` (volume nomeado).
- [ ] (RF-02) API com `DATABASE_URL` ausente/malformada falha no boot com erro claro; com env válida, sobe normalmente.
- [ ] (RF-03) `createDb` é a única fonte de conexão; typecheck limpo; nenhum import de `db/` fora de `apps/api`.
- [ ] (RF-04) Schema confere com `database.md`: dinheiro n.a., FKs n.a., NOT NULL por padrão (`interest` nullable é decisão consciente — campo opcional do formulário), enum de status via CHECK.
- [ ] (RF-05) `bun run db:generate` não gera diff novo (schema e migração em sincronia); SQL versionado em `apps/api/drizzle/`.
- [ ] (RF-06) Teste de integração verde localmente com Docker disponível: migração aplicada em container limpo, insert válido retorna defaults corretos, insert sem `name` falha.
- [ ] (RF-07) `.env.example` documenta `DATABASE_URL` compatível com o compose de dev.

## Fora de Escopo

- Módulo HTTP `leads` (rotas, rate limit, honeypot) — é o **LP-02**.
- Execução automática de migrações no boot da API ou no deploy — tratado no **LP-11**.
- Compose de produção, Caddy, backups — **LP-11**/**LP-13**.
- Tabelas de outras entidades do domínio (clients, products, sales…) — Fase 2.
- `consultant_id` em `leads` (relação `Lead N—1 Consultant` do modelo de domínio): adiado até existir a tabela `consultants` (CRM-01) — será migração aditiva na Fase 2; exclusão consciente, não omissão.
- Seed de dados de desenvolvimento.

## Restrições Conhecidas

- `bun run test` roda sob Vitest (Node), não Bun → o driver Postgres precisa funcionar nos dois runtimes (exclui `bun:sql` por ora).
- Teste de integração exige Docker no host; deve falhar com mensagem compreensível quando Docker não está disponível.
- `database.md`: id uuid **v7** com default **no banco** → exige Postgres 18 (`uuidv7()` nativo).
- ADR-0006: nenhum git de escrita; migração fica no working tree para o humano commitar.
