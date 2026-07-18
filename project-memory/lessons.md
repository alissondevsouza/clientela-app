# Lessons — gotchas e aprendizados duráveis

Aprendizados não-óbvios descobertos em investigações e implementações (comportamentos surpreendentes de lib, armadilhas do ambiente, causas raízes recorrentes). Consultar **antes** de investigar um bug — pode já estar mapeado. Append-only; entradas mais novas no topo.

Formato:

```markdown
## YYYY-MM-DD — <título curto>
<o gotcha: o que parecia, o que era de fato, e como evitar/detectar da próxima vez>
```

---

## 2026-07-18 — Elysia 1.4: handler que retorna `undefined` (ex.: 204) lança TypeError na serialização

`set.status = 204` + retorno implícito `undefined` derruba o request com `TypeError` no serializador (vira 500 via error-handler). Para respostas sem corpo, retornar `new Response(null, { status: 204 })` explícita. Detectar: teste de integração do DELETE (o bug passou por typecheck/lint e só caiu no teste derivado do spec — o unit do service não cobre a rota).

## 2026-07-17 — Elysia 1.4: hook global é `.onRequest(fn).as("global")` — a forma de 2 argumentos quebra a composição

Para propagar um hook `onRequest` de um plugin às rotas compostas DEPOIS dele (ex.: auth-guard global), a API correta no Elysia 1.4.29 é `.onRequest(fn).as("global")`. A forma de dois argumentos `onRequest({ as: "global" }, fn)` — que funciona em outros hooks — estoura `TypeError: reading 'constructor'` (em `isAsync`) na compilação dos handlers. Comprovado por repro isolado no CRM-01. Detectar: crash no boot/teste ao compor o plugin, não em runtime do request.

## 2026-07-17 — `Bun.password` não existe sob Vitest: injete o hasher como porta

Os workers do Vitest rodam sob Node — o global `Bun` não existe, então `Bun.password.hash/verify` lança `ReferenceError` em qualquer teste (unidade ou integração); `--pool=threads` não resolve e `bun --bun x vitest` quebra a resolução de módulos do Zod. Solução do projeto: `hasher` é porta injetada no service; testes de integração injetam KDF real do Node (`node:crypto` scrypt) mantendo o round-trip hash/verify verdadeiro; o argon2id de produção é provado por execução real sob Bun (seed + login via curl na QA de runtime). Detectar: `ReferenceError: Bun is not defined` na suíte.

## 2026-07-17 — zodResolver entrega o OUTPUT do parse: chaves fora do schema somem

No react-hook-form com `zodResolver`, os valores submetidos são o resultado do parse Zod — qualquer chave que não esteja no schema do form é **stripada silenciosamente**. Gotcha do LP-06: derivar o schema do form de uma variante SEM o honeypot (`createLeadSchema`) faria `website` sumir antes do POST e todo bot seria persistido como lead. Regra: o schema do form deriva do schema do CONTRATO COMPLETO (`leadCaptureRequestSchema`), e um teste unitário prova que o campo sobrevive ao parse. Relacionado: repasse de IP em server action → extrair o ÚLTIMO valor do XFF (o 1º é forjável; Caddy dá append).

## 2026-07-17 — Next.js lê `.env*` do diretório do app, não da raiz do monorepo

Atualizar só o `.env.example` da raiz não alimenta o build do web: o Next carrega `.env*` de `apps/web/`. Convenção do projeto desde o LP-04: env do web vive em `apps/web/.env.local` (gitignored) com exemplo versionado `apps/web/.env.example`; a raiz documenta só API/banco e aponta para lá. Página SSG lê env em **build time** — trocar valor exige rebuild.

## 2026-07-17 — shadcn CLI 4.x se auto-adiciona como dep e o tema importa CSS do próprio pacote

O `shadcn init` (style base-nova) adiciona o pacote `shadcn` às dependencies E gera `@import "shadcn/tailwind.css"` no globals.css — ou seja, o pacote NÃO é só CLI: é a fonte dos estilos base em build time. Remover a dep "espúria" sem remover o import cria **dependência fantasma** (build passa pelo resíduo em node_modules e quebra em instalação limpa). Correto: manter como **devDependency** (CSS consumido só no build; provado com node_modules zerado). Detectar: validação com instalação limpa (rm node_modules preservando lockfile). Nota: 1º bug de phantom dependency do projeto — o gatilho do INF-02 (`linker: "isolated"`) dispara no 2º.

## 2026-07-17 — Elysia: ordem do lifecycle e roteamento non-strict têm armadilhas de segurança

Três gotchas comprovados empiricamente no Elysia 1.4 durante o LP-02: (1) `beforeHandle` roda **depois** da validação do body — rate limit ali deixa flood de payloads inválidos sem 429; para rodar antes do parse é preciso `onRequest`. (2) `onRequest` é global e dispara **antes do roteamento** — guard de rota precisa filtrar por path manualmente, senão vaza para `/health` etc. (3) O roteador non-strict (default) casa `/leads/` (trailing slash) no mesmo handler, mas o pathname cru não é normalizado — comparação por igualdade exata no guard abre bypass; normalizar (strip de `/+$`) antes de comparar. Detectar: testes adversariais de roteamento (trailing slash, query string) em qualquer guard baseado em path.

## 2026-07-17 — Zod v4: mensagem custom de validação não cobre campo ausente por default

`z.string().min(2, "msg")` responde em pt-BR para valor presente-inválido, mas campo **ausente** cai no `invalid_type` com mensagem default em inglês ("Invalid input: expected string, received undefined"). Para cobrir ausência, passar `error` no nível do tipo (`z.string({ error: "msg" })`) ou configurar locale global (`z.config(z.locale.pt())`). Detectar: teste que envia `{}` e asserta a mensagem exata — assert relaxado (`length > 0`) mascara.

## 2026-07-16 — Imagens postgres:18+ mudaram o mount do volume

Parecia bastar o clássico `volume:/var/lib/postgresql/data`, e `docker compose config` validava sem reclamar — mas o container `postgres:18-alpine` **aborta no primeiro `up`** com volume limpo: as imagens 18+ exigem mount em `/var/lib/postgresql` (docker-library/postgres PR #1259). Detectar: exit 1 + health `unhealthy` logo no primeiro boot. Cuidado extra: Testcontainers não monta volume, então a suíte de integração verde **não** prova que o compose funciona.

## 2026-07-16 — `sql.join` vira placeholders no drizzle-kit generate

Ao derivar a constraint CHECK de um array de literais com `sql.join(values.map(v => sql\`${v}\`))`, o `drizzle-kit generate` emite `IN ($1, $2, ...)` no SQL — gerando migração espúria que difere da anterior. Para SQL de DDL determinístico, usar `sql.raw` com os literais escapados (mantendo a fonte única no array TS).
