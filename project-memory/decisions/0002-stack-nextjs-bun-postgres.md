# ADR-0002 — Stack: Next.js (web) + Bun (API) + PostgreSQL

- **Status**: Aceito
- **Data**: 2026-07-16

## Contexto

O projeto tem duas frentes (landing page pública e CRM autenticado) e precisa de uma stack produtiva para um desenvolvedor solo, com baixo custo de operação e boa disponibilidade de ecossistema/documentação.

## Decisão

- **Next.js (App Router, TypeScript)** para todo o front-end: landing page e telas do CRM num único app.
- **Bun** como runtime da API (serviço HTTP separado do Next.js), concentrando regras de negócio e acesso ao banco. Outros microserviços em Bun só quando houver necessidade concreta — começa como um único serviço (monólito modular).
- **PostgreSQL** como banco de dados único.
- Monorepo com workspaces (`apps/web`, `apps/api`, `packages/shared`), compartilhando tipos e validações entre front e API.

## Alternativas consideradas

- **Tudo dentro do Next.js (API routes/server actions, sem serviço separado)** — menos peças para operar e seria suficiente para o MVP; descartado porque queremos a API independente do front (permite evoluir para outros clientes/serviços e mantém regras de negócio fora do framework de UI). Aceitamos o custo extra de operar dois serviços conscientemente.
- **Node.js no lugar de Bun** — ecossistema mais maduro; Bun escolhido pela velocidade, DX (TypeScript nativo, test runner e package manager embutidos) e interesse do time em usá-lo. Risco de incompatibilidade pontual de pacotes é aceito.
- **Supabase/BaaS gerenciado** — reduziria operação, mas conflita com a decisão de hospedar tudo em VPS própria (ADR-0003) e cria dependência de fornecedor.

## Consequências

- Front nunca acessa o banco diretamente; todo dado passa pela API — um contrato claro, mas exige manter esse contrato versionado/tipado (mitigado pelo `packages/shared`).
- Dois serviços para buildar, deployar e monitorar em vez de um.
- Ficam pendentes (novos ADRs): framework HTTP da API (Hono vs Elysia), ORM/migrações, autenticação, biblioteca de UI.
