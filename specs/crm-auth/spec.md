---
feature: crm-auth
module: api, web, shared
phase: spec
status: draft
size: L
created: 2026-07-17
updated: 2026-07-17
---

# Spec: crm-auth (CRM-01 — Autenticação da consultora)

## O Que

Autenticação de usuária única para o CRM: login com e-mail + senha, sessão persistida em banco com expiração, guard **default-deny** nas rotas da API (toda rota exige sessão válida, exceto allowlist pública explícita) e guard server-side do grupo `(crm)` no web. Inclui as tabelas `consultants` e `sessions`, seed idempotente da usuária única e contratos compartilhados em `packages/shared`.

## Por Que

CRM-02..CRM-08 (Fase 2) dependem de área autenticada. `security.md` exige "todas as rotas autenticadas por padrão" — hoje a API não tem guard nenhum. Item CRM-01 do `specs/ROADMAP.md`; decisão de estratégia de auth está em aberto em `project-memory/02-architecture.md` (gera ADR).

## Requisitos

- **RF-01** — Tabelas `consultants` (name, email único, password_hash, whatsapp) e `sessions` (consultant_id FK indexada, token_hash único, expires_at) criadas via migração Drizzle versionada, seguindo `database.md` (uuid v7, timestamptz, NOT NULL por padrão).
- **RF-02** — Seed idempotente da usuária única via script Bun (não roda no boot da API): cria/atualiza a consultora por e-mail com senha hasheada com `Bun.password` (argon2id). Senha nunca aparece em log nem fica em arquivo versionado. O script é executável em produção: entra na imagem runtime da API (`COPY apps/api/scripts`) e roda via `docker compose run --rm api bun scripts/seed-consultant.ts` com as `SEED_CONSULTANT_*` no ambiente.
- **RF-03** — `POST /auth/login` (público, com rate limit por IP mais restrito que o de leads): valida body com schema de `packages/shared`; credenciais corretas ⇒ cria sessão com expiração e responde token opaco + expiração + dados públicos da consultora (id, name, email); credenciais incorretas ⇒ 401 com mensagem genérica pt-BR **idêntica** para e-mail inexistente e senha errada.
- **RF-04** — Guard de autenticação da API **default-deny**: toda rota exige `Authorization: Bearer <token>` de sessão válida e não expirada; exceções públicas explícitas e listadas: `GET /health`, `POST /leads`, `POST /auth/login`. Sem token / token inválido / sessão expirada ⇒ 401 no envelope padrão `{ error: { code, message } }`, sem vazar internals. Guard imune a bypass por trailing slash/query string (lesson Elysia 2026-07-17).
- **RF-05** — `GET /auth/me` responde os dados públicos da consultora da sessão; `POST /auth/logout` invalida (remove) a sessão no banco.
- **RF-06** — Sessão expira em prazo **fixo** (constante nomeada, 30 dias); sessão expirada é rejeitada pelo guard. Login remove as sessões expiradas da consultora (limpeza oportunista). Renovação deslizante foi descartada (Decisions Log: RSC do Next não pode renovar cookie — a renovação no banco não se realizaria fim-a-fim).
- **RF-07** — Token de sessão é opaco (aleatório, ≥ 256 bits); o banco armazena **apenas o hash** do token (SHA-256) — nunca o token em claro.
- **RF-08** — Web: página `/login` mobile-first (react-hook-form + schema compartilhado, estados loading/erro em pt-BR) que via Server Action chama `POST /auth/login` e grava o token em cookie `httpOnly` + `secure` (produção) + `sameSite=lax` + `path=/` com `maxAge` igual à duração fixa da sessão. A Server Action repassa o IP do cliente à API via `x-forwarded-for` (último valor do XFF — lesson 2026-07-17, padrão do LP-06), para o rate limit por IP do login funcionar de fato. O browser nunca fala com a API (ADR-0008).
- **RF-09** — Web: grupo `(crm)` com guard server-side no layout — valida a sessão contra a API (`GET /auth/me`); sem sessão válida ⇒ `redirect('/login')`. Página protegida mínima (placeholder do CRM em `/crm`) com botão de logout (Server Action: invalida na API + limpa cookie + redirect). `/login` com sessão válida redireciona para `/crm`.
- **RF-10** — Contratos de auth (login request/response, consultora pública) em `packages/shared`, com mensagens de validação pt-BR cobrindo também campo **ausente** (lesson Zod v4 2026-07-17).
- **RF-11** — Nenhum dado pessoal, senha, hash ou token em logs da aplicação (logar apenas IDs); erros para o cliente nunca expõem stack/internals.

## Critérios de Aceite

- [ ] (RF-01) Migração nova em `apps/api/drizzle/` cria `consultants` e `sessions`; teste de integração (Testcontainers, migrações reais) prova colunas, unicidade de `email` e `token_hash`, FK indexada e defaults.
- [ ] (RF-02) Rodar o seed duas vezes com o mesmo e-mail resulta em **uma** consultora (upsert); login funciona com a senha do seed; hash gerado é argon2id; o stage runtime do `apps/api/Dockerfile` copia `apps/api/scripts`.
- [ ] (RF-03) Integração: login com credenciais corretas ⇒ 200 com `{ token, expiresAt, consultant }`; senha errada e e-mail inexistente ⇒ ambos 401 com o **mesmo** body; body inválido/ausente ⇒ 422 com mensagem pt-BR; estouro do rate limit ⇒ 429.
- [ ] (RF-04) Integração: rota autenticada sem header ⇒ 401; com token forjado ⇒ 401; com sessão expirada ⇒ 401; variantes de path (trailing slash, query) não bypassam o guard; `GET /health`, `POST /leads` e `POST /auth/login` seguem acessíveis sem token.
- [ ] (RF-05) Integração: `GET /auth/me` com sessão válida ⇒ 200 com dados públicos (sem password_hash); após `POST /auth/logout`, o mesmo token ⇒ 401.
- [ ] (RF-06) Unidade (clock injetado): sessão dentro do prazo é aceita; sessão expirada é rejeitada; login remove sessões expiradas da consultora.
- [ ] (RF-07) Teste prova que a linha de `sessions` não contém o token em claro (armazenado = SHA-256 do token retornado).
- [ ] (RF-08) Unidade (web): submit válido chama a API com o header `x-forwarded-for` repassado; o cookie resultante tem `httpOnly`, `sameSite=lax`, `path=/` e `maxAge` da duração da sessão; erro da API renderiza mensagem pt-BR sem quebrar o form.
- [ ] (RF-09) Guard do layout `(crm)` sem cookie redireciona para `/login`; com sessão válida renderiza; logout limpa cookie e invalida sessão na API (coberto por unidade dos helpers + verificação manual de runtime na QA; E2E é pendência — ver Restrições).
- [ ] (RF-10) Unidade (shared): schemas de auth aceitam entrada válida, rejeitam inválida e respondem pt-BR também para campo ausente (`{}`).
- [ ] (RF-11) Revisão de QA confirma ausência de senha/token/dados pessoais em `console.*`/logs no diff.

## Fora de Escopo

- Registro de usuária, recuperação/troca de senha, múltiplas usuárias, papéis/permissões, 2FA, "lembrar-me" configurável.
- Navegação/shell do CRM (CRM-02) — aqui só uma página protegida placeholder para provar o guard.
- Listas/telas do CRM (CRM-03+); revisão do escopo do rate limit de leads (known-issue, tratar no CRM-04).
- `middleware.ts` do Next (otimização de UX; o guard real é server-side no layout — middleware sozinho é bypassável).
- Migração de dados (não há dados de auth pré-existentes).

## Restrições Conhecidas

- **E2E (Playwright) não existe** (known-issue): login é fluxo crítico de UI e fica como **pendência explícita** no handoff, coberto por REL-01. Cobertura desta entrega: unidade + integração da API + verificação de runtime manual na QA.
- ADR-0008: API sem exposição pública; único cliente é o web (Server Actions na rede interna) — o rate limit de login confia no `x-forwarded-for` repassado pelo web (mesma decisão do LP-06).
- ADR-0006: nenhum git de escrita; repo ainda **sem commits** — trabalho fica no working tree de `feature/phase-1-landing-page`.
- `security.md` lista as exceções públicas — precisa ser atualizado para incluir `POST /auth/login` (fase de graduação).
