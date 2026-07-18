---
feature: crm-auth
phase: validate
status: done
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: crm-auth

Executado pelo QA adversarial neutro em 2026-07-17. Todos os comandos rodados de fato (nada presumido).

## Ferramentas (raiz do monorepo)

| Ferramenta | Comando | Resultado |
|---|---|---|
| Lint | `bun run lint` | ✅ Biome: 110 arquivos, 0 problemas |
| Typecheck | `bun run typecheck` | ✅ shared/web/api — exit 0 nos 3 workspaces |
| Testes | `bun run test` | ✅ **177 testes / 21 arquivos, 0 falhas** (Vitest 4.1.10; inclui integração Testcontainers com Postgres 18 real + migrações reais) — 12.1s |
| Build web | `bun run --filter '@clientela/web' build` | ✅ Next 16.2.10, exit 0. `/login` e `/crm` como rotas dinâmicas (ƒ); landing segue estática (○) |

Saída resumida dos testes:

```
 Test Files  21 passed (21)
      Tests  177 passed (177)
```

## Verificação de runtime (superfície real)

Ambiente: Postgres dev (`clientela_pg_dev`, porta 5433, migrações 0000+0001 aplicadas), API real via `bun --env-file=../../.env src/index.ts` (porta 3001), web via `bun run dev` (porta 3000, `API_URL=http://localhost:3001`).

### Seed (RF-02) — sob Bun (argon2id de produção exercitado)

```
SEED_CONSULTANT_* bun run seed:consultant   # 2 execuções, mesmo e-mail
→ "Seed da consultora concluído. id=019f7252-…" (mesmo id nas duas execuções)
```
- ✅ 2 execuções ⇒ **1 linha** em `consultants` (upsert por e-mail; `name` atualizado na 2ª, `updated_at` refrescado)
- ✅ hash começa com `$argon2id$` (m=65536, t=2)
- ✅ log contém apenas status + id — sem nome/e-mail/senha/hash

### API via curl

| Cenário | Esperado | Observado |
|---|---|---|
| `POST /auth/login` credenciais do seed | 200 `{token, expiresAt, consultant}` | ✅ 200; `expiresAt` = +30 dias ISO |
| Senha errada | 401 | ✅ 401 `INVALID_CREDENTIALS` "E-mail ou senha incorretos." |
| E-mail inexistente | 401 body **idêntico** | ✅ byte a byte igual ao de senha errada |
| Token em claro no banco | ausente | ✅ `sessions.token_hash` ≠ token (0 linhas com o token em claro; 1 sessão com SHA-256) |
| `GET /auth/me` sem Bearer | 401 envelope padrão | ✅ 401 "Sessão inválida ou expirada." |
| `GET /auth/me` com Bearer | 200 dados públicos | ✅ 200 `{id,name,email}` — sem password_hash, sem envelope |
| `GET /auth/me/` (trailing slash, sem token) | 401 | ✅ 401 |
| `GET /auth/me?x=1` (sem token) | 401 | ✅ 401 |
| Rota inexistente `GET /clients` sem token | 401 (não 404) | ✅ 401 — guard não vaza existência de rota |
| `POST /auth/logout` com Bearer | 200 `{ok:true}` | ✅ 200; sessão removida do banco |
| Reuso do token pós-logout | 401 | ✅ 401 |
| Rate limit: 6ª tentativa mesmo IP (XFF) em 1 min | 429 | ✅ 401×5 → **429** `RATE_LIMITED` com mensagem própria; IP diferente segue respondendo 401 (bucket por IP) |
| `GET /health` sem token | 200 | ✅ 200 `{status:"ok"}` |
| `POST /leads` sem token | 201 | ✅ 201 (público preservado) |
| `GET /leads` sem token | 401 | ✅ 401 (método importa na allowlist) |
| Body `{}` no login | 422 pt-BR | ✅ 422 "Informe um e-mail válido" |

### Web via curl

| Cenário | Esperado | Observado |
|---|---|---|
| `GET /crm` sem cookie | redirect `/login` | ✅ 307 → `/login` |
| `GET /crm` com cookie forjado | redirect `/login` | ✅ 307 → `/login` |
| `GET /crm` com cookie de sessão válida | 200 renderiza | ✅ 200 — "em construção", "autenticada", botão "Sair" |
| `GET /login` sem cookie | 200 com form | ✅ 200 — labels E-mail/Senha, `type="password"`, marca "Lais Barbosa" |
| `GET /login` com sessão válida | redirect `/crm` | ✅ 307 → `/crm` |

### Logs dos servidores

- ✅ grep por token/senha/e-mail/nome nos stdout da API e do web durante toda a sessão de QA: **nenhuma ocorrência** (RF-11).

### Limpeza pós-QA

- ✅ Servidores API e web derrubados (portas 3001/3000 fechadas — curl exit 7).
- ✅ `DELETE FROM consultants WHERE email='qa-review@example.com'` (sessões removidas por FK cascade) + lead de teste removido. Estado final: consultants=0, sessions=0.

## Pendências

- **E2E (Playwright) inexistente** (known-issue, REL-01): o **submit do form de login via browser** (Server Action real → `Set-Cookie` com flags → redirect) e o clique em "Sair" **não foram exercitados** — cobertos por unidade dos helpers (`buildSessionCookieOptions`, `login` com XFF) + os curls acima. Pendência explícita do handoff, prevista no próprio spec (Restrições).
- `Bun.password`/argon2id não roda na suíte Vitest (workers Node) — a integração injeta scrypt na porta `PasswordHasher`; o argon2id de produção foi provado pelo seed + login reais sob Bun nesta QA (tabela acima).
- `security.md` ainda não lista `POST /auth/login` na allowlist pública documentada — o spec delega isso à fase de graduação.

## Status final

**Tudo verde.** lint ✅ · typecheck ✅ · testes 177/177 ✅ · build web ✅ · runtime API ✅ · runtime web ✅ · limpeza ✅
