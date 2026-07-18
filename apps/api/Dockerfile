# syntax=docker/dockerfile:1
#
# Imagem da API (Bun + Elysia). Três alvos a partir de um mesmo Dockerfile:
#   - deps    : instala TODAS as deps do monorepo (inclui devDeps: drizzle-kit)
#               a partir do bun.lock — usada como base do stage de migração.
#   - migrate : aplica as migrações versionadas via `drizzle-kit migrate`,
#               parametrizado SOMENTE por DATABASE_URL do environment (RF-03).
#   - runtime : imagem final, só deps de produção + src, usuário não-root (RF-02).
#
# Contexto de build = raiz do monorepo (ver docker-compose.yml). Nenhum segredo
# entra na imagem: DATABASE_URL chega por environment em runtime/migração.

# ---- deps: instalação completa do monorepo (com devDeps) ----
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Manifests primeiro para aproveitar cache de camada de instalação.
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile

# ---- migrate: job de migração (herda node_modules com drizzle-kit do stage deps) ----
FROM deps AS migrate
WORKDIR /app/apps/api

# drizzle-kit migrate só precisa da config e das migrações SQL versionadas; a
# fonte de verdade é o script db:migrate:prod (drizzle-kit migrate, sem --env-file).
COPY apps/api/drizzle.config.ts ./drizzle.config.ts
COPY apps/api/drizzle ./drizzle
COPY apps/api/src/db/schema ./src/db/schema

# Job efêmero não precisa de root: drizzle-kit migrate só lê config/migrações e
# fala com o Postgres pela DATABASE_URL (os arquivos ficam world-readable).
USER bun

# DATABASE_URL vem do environment (compose). Nenhum default embutido.
CMD ["bun", "run", "db:migrate:prod"]

# ---- runtime: imagem final enxuta, sem devDeps, não-root ----
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# --production omite devDeps (drizzle-kit, testcontainers, biome, vitest…) e
# --filter @clientela/api instala SÓ as deps do workspace da API — sem a árvore
# de produção do web (next, react, sharp…). Os manifests do monorepo seguem
# copiados para validar o --frozen-lockfile.
# O `typescript` só entra como peerDependency da elysia (">= 5.0.0"), é usado
# apenas em tempo de tipos e NUNCA carregado em runtime — removido para não
# carregar ~23MB de superfície morta. `--omit=peer` seria destrutivo demais
# (removeria @sinclair/typebox, file-type etc. que a elysia usa em runtime).
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile --production --filter @clientela/api \
  && rm -rf node_modules/.bun/typescript@* \
  && find node_modules -name typescript -prune -exec rm -rf {} +

# Código da API + o pacote compartilhado (resolvido por symlink do workspace).
COPY packages/shared/src ./packages/shared/src
COPY apps/api/src ./apps/api/src
# Scripts operacionais (ex.: seed da usuária única) executáveis em produção
# via `docker compose run --rm api bun scripts/seed-consultant.ts` (RF-02).
COPY apps/api/scripts ./apps/api/scripts

WORKDIR /app/apps/api
# `bun` é usuário não-root já presente na imagem oficial (superfície mínima).
USER bun
EXPOSE 3001

# Sem curl garantido na imagem: healthcheck via runtime do próprio Bun.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD ["bun", "-e", "const r = await fetch('http://localhost:3001/health'); if (!r.ok) process.exit(1)"]

CMD ["bun", "run", "src/index.ts"]
