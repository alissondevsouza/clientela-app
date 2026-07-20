# Lessons — gotchas e aprendizados duráveis

Aprendizados não-óbvios descobertos em investigações e implementações (comportamentos surpreendentes de lib, armadilhas do ambiente, causas raízes recorrentes). Consultar **antes** de investigar um bug — pode já estar mapeado. Append-only; entradas mais novas no topo.

Formato:

```markdown
## YYYY-MM-DD — <título curto>
<o gotcha: o que parecia, o que era de fato, e como evitar/detectar da próxima vez>
```

---

## 2026-07-20 — UPDATE condicional não serializa a corrida quando o guard é superconjunto do estado-alvo do rival (EvalPlanQual)

O padrão "UPDATE condicional de status como primeira escrita da transação" (usado em sales e orders) parece garantir que, entre duas transições concorrentes, só uma vence. Não garante: sob `READ COMMITTED`, a transação que perde o lock **reavalia o WHERE contra a linha já commitada** (EvalPlanQual) — se o guard dela ainda casar com o novo estado, ela também aplica. Foi o caso de `cancel` (guard `status IN ('draft','placed')`) × `place` (alvo `placed`): o cancel bloqueado reavalia, `placed` está no conjunto, e ambos retornam 200. Só há exclusividade real quando o guard do perdedor exige um estado que o vencedor invalida (ex.: `deliver` exige `placed`, que outro `deliver` remove). Regra prática: ao desenhar matriz de transições concorrentes, verifique se algum guard é **superconjunto** do estado-alvo de outra transição — se for e houver efeito colateral, precisa de lock/versão; se não houver efeito, pode ser aceito como história serial legal (documentar — ADR-0015). Detectar: teste de integração com `Promise.all` das duas transições, rodado múltiplas vezes.

## 2026-07-19 — Prop de função para Client Component só aceita a referência DIRETA da Server Action, não um closure

Ao passar uma Server Action como prop para um Client Component, só a **própria referência** exportada com `"use server"` é serializável através da fronteira RSC→client. Envolvê-la num closure adaptador no Server Component (ex.: `onUpdateGoal={(cents) => updateGoalAction({ monthlyGoalCents: cents })}` para ajustar o shape) quebra: um closure comum criado no RSC não é uma referência de action serializável. Correção (CRM-07): passar `updateGoalAction` direto e mover a adaptação de shape para DENTRO do client component — exatamente o padrão de `product-form.tsx` (recebe `createProductAction`/`updateProductAction` direto). Detectar: o `next build` de produção acusa (foi onde caiu no CRM-07); a lesson de RSC×client abaixo cobre o caso irmão (chamar export de módulo client no servidor).

## 2026-07-18 — Chamar no servidor uma função exportada de módulo "use client" só quebra em RUNTIME

Um RSC pode importar de um módulo `"use client"` sem erro de typecheck, lint ou `next build` — mas CHAMAR qualquer função exportada de lá no servidor lança em runtime ("Attempted to call X() from the server but X is on the client"), derrubando a página inteira no error boundary. Pego só pela QA de runtime do CRM-05 (474 testes verdes não acusaram). Regra prática: helper puro compartilhado entre RSC e client component vive em `lib/` (módulo sem diretiva), nunca exportado de um componente client. Detectar: exercitar cada page RSC nova com servidor real (build de produção) antes do handoff.

## 2026-07-18 — Server Action só é exercitável por HTTP cru no build de produção

Para provar uma Server Action fim-a-fim sem browser (curl com header `next-action: <id>`), use `next build` + `next start`: no dev/Turbopack os ids do manifest de actions divergem entre requests e o POST cru falha. No build de produção os ids são estáveis (extraíveis do HTML/manifest). Usado na QA do CRM-04 para provar conversão (303 + `x-action-redirect`) e ações de status.

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
