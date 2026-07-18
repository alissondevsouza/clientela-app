# ADR-0004 — Toolchain TypeScript: Elysia, Drizzle, Zod, Vitest, Biome, shadcn/ui

- **Status**: Aceito
- **Data**: 2026-07-16

## Contexto

O ADR-0002 deixou em aberto framework HTTP, ORM, validação, testes, lint e UI. As skills de referência adicionadas ao harness (`elysia`, `drizzle-*`, `zod`, `vitest`, `shadcn-ui`, `tailwindcss`) materializam a escolha do time — este ADR a formaliza.

## Decisão

| Área | Escolha |
|---|---|
| Framework HTTP (API Bun) | **Elysia** |
| ORM + migrações | **Drizzle** (`drizzle-kit generate`, migrações SQL versionadas) |
| Validação/contratos | **Zod v4** em `packages/shared`, usado no front (react-hook-form) e na API (Standard Schema do Elysia) |
| Testes | **Vitest** + **Testcontainers** (Postgres real na integração); Playwright para E2E futuro |
| Lint/format | **Biome** (config única na raiz) |
| UI | **shadcn/ui + Tailwind CSS** |

## Alternativas consideradas

- **Hono** (vs Elysia) — mais portável entre runtimes; Elysia escolhido por ser Bun-first, com melhor DX de tipos end-to-end e validação integrada.
- **Prisma** (vs Drizzle) — mais maduro, porém runtime mais pesado e SQL menos transparente; Drizzle é leve, SQL-first e ótimo com Bun.
- **ESLint + Prettier** (vs Biome) — padrão histórico; Biome escolhido por ser uma ferramenta só, rápida e com preset consistente.
- **bun:test** (vs Vitest) — embutido, porém ecossistema (Testcontainers, coverage, IDE) e paridade com o front pesaram para Vitest.

## Consequências

- Um único schema Zod por contrato serve front e API — divergência de validação vira erro de tipo.
- Elysia amarra a API ao Bun (aceito — já era decisão do ADR-0002).
- As skills `.claude/skills/{elysia,drizzle-postgres,drizzle-orm,drizzle-safe-migrations,zod,vitest,shadcn-ui,tailwindcss,react,typescript-advanced}` são a referência de uso idiomático dessas libs.
- Regras operacionais derivadas vivem em `.claude/rules/typescript/*`.
