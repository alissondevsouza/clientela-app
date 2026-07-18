# syntax=docker/dockerfile:1
#
# Imagem do web (Next.js App Router, output "standalone"). Dois stages:
#   - builder : oven/bun instala o monorepo e roda `next build`. O build faz SSG
#               e valida o schema de env no import (layout/metadata) — por isso as
#               envs de build entram por ARG.
#   - runtime : node:22-alpine roda `node apps/web/server.js` do standalone. O
#               server.js do Next é testado sobre Node (não Bun); daí o runtime Node.
#
# Contexto de build = raiz do monorepo (ver docker-compose.yml).
#
# ATENÇÃO (security.md): build args ficam registrados em `docker history` da
# imagem — são configuração pública, NUNCA segredo. As envs de BUILD abaixo
# (SITE_URL, API_URL, WHATSAPP_PHONE, WHATSAPP_DEFAULT_MESSAGE) não são segredo.
# As envs de RUNTIME (server action) vêm do `environment:` do compose — este
# Dockerfile NÃO faz bake de ENV de runtime na imagem final.

# ---- builder: instala o monorepo e gera o standalone ----
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Manifests primeiro (cache de instalação).
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

# tsconfig base do monorepo (apps/web/tsconfig.json faz extends dele).
COPY tsconfig.base.json ./
# Código necessário ao build do web (o pacote shared é transpilado pelo Next).
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Envs de BUILD (não-segredo — ver aviso no topo). WHATSAPP_DEFAULT_MESSAGE é
# opcional: quando ausente, o schema (loadWebEnv) aplica o default pt-BR.
ARG SITE_URL
ARG API_URL
ARG WHATSAPP_PHONE
ARG WHATSAPP_DEFAULT_MESSAGE
ENV SITE_URL=$SITE_URL \
    API_URL=$API_URL \
    WHATSAPP_PHONE=$WHATSAPP_PHONE

WORKDIR /app/apps/web
# Remove a env vazia quando o arg opcional não é passado, para que o `.default()`
# do schema seja aplicado (string vazia seria aceita e sobrescreveria o default).
RUN if [ -z "$WHATSAPP_DEFAULT_MESSAGE" ]; then unset WHATSAPP_DEFAULT_MESSAGE; fi; \
    bun run build

# ---- runtime: standalone servido por Node, não-root ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# HOSTNAME=0.0.0.0 garante bind em todas as interfaces (acessível na rede do compose).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Estrutura do standalone no monorepo (validada no LP-07): o server.js fica em
# apps/web/server.js; static e public são copiados para dentro do standalone.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

# `node` é usuário não-root já presente na imagem oficial.
USER node
EXPOSE 3000

# wget do busybox (presente no alpine): sem dependência extra no runtime.
# 127.0.0.1 (não localhost): o server bind em 0.0.0.0 (IPv4); localhost resolve
# ::1 primeiro no busybox e recusaria a conexão.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
