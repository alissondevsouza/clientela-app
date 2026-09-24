# Lessons — gotchas e aprendizados duráveis

Aprendizados não-óbvios descobertos em investigações e implementações (comportamentos surpreendentes de lib, armadilhas do ambiente, causas raízes recorrentes). Consultar **antes** de investigar um bug — pode já estar mapeado. Append-only; entradas mais novas no topo.

Formato:

```markdown
## YYYY-MM-DD — <título curto>
<o gotcha: o que parecia, o que era de fato, e como evitar/detectar da próxima vez>
```

---

## 2026-08-06 — Reexportar uma Server Action de outro módulo apaga o manifest inteiro do módulo que reexporta (só no build de produção)

O `server-reference-manifest` de cada rota do Next é montado a partir dos ids **registrados pelos módulos `"use server"` importados diretamente por ela** — não por todo id alcançável por reexport. Em `appointments/actions.ts`, `export { quickCreateClientAction } from "orders/actions.ts"` (comentário afirmava, ERRADO, que reexportar a MESMA referência era o que "garantia" a Server Action válida — isso é sobre a lesson de 2026-07-19, que trata de closure em PROP para client component, não de reexport de módulo) fazia o manifest das páginas da agenda conter **só** os ids de `orders/actions.ts` (+ logout): os demais actions do próprio módulo (`createAppointmentAction`, `searchClientsAction` etc.) sumiam do manifest embora continuassem compilados no bundle client, e qualquer chamada respondia `404 Server action not found`. `next dev` nunca acusa (monta o manifest sob demanda); lint, typecheck e 1106 testes passam verdes. Correção: nunca reexportar Server Action entre módulos — declarar um action PRÓPRIO no módulo que delega para a implementação de outro módulo (`export const quickCreateClientAction = async (values) => quickCreateClientActionBase(values)`), com o tipo de retorno declarado localmente. Detectar: `next build` + servir o **standalone** e disparar uma ação real em cada página nova — comparar a contagem de ids do manifest antes/depois é o teste mais direto (aqui: 8 → 22).

## 2026-08-06 — Elysia: dois plugins com o MESMO (método, caminho) não dão erro — o último composto vence, para tudo

Ao tentar criar `POST /leads` autenticado no CRM (já existia o `POST /leads` público da landing), a suposição era que o guard resolveria qual handler serve cada request. Não resolve: o roteador do Elysia é uma tabela estática por par `(método, caminho)` e, quando dois plugins registram o mesmo par, **o último `.use()` sobrescreve o anterior para todas as requisições** — sem erro em lint, typecheck, build ou boot. Comprovado com repro isolado (invertendo a ordem dos `.use()`, a resposta troca). Combinado com o `DEFAULT_PUBLIC_ROUTES` do auth-guard — que casa por par `(método, caminho)` e não sabe qual handler está por trás —, o efeito seria devastador e silencioso: a captura pública de leads da landing continuaria na allowlist, mas cairia no handler do CRM, que exige token, quebrando 100% da captação sem nenhum sinal. Regra prática: antes de criar rota nova, **grepar o método+caminho em todos os `*.routes.ts`**; se colidir, escolher outro caminho (aqui: `POST /leads/manual`). Detectar: teste de integração que exercita a rota pública **sem token** continua sendo a única rede — foi o teste de regressão exigido na spec que teria pego.

## 2026-08-06 — `next dev` depois de um `next build` com `output: "standalone"` responde 404 em TODAS as rotas

Com `output: "standalone"` no `next.config.ts`, o `.next` deixado por um `bun run build` faz o `next dev` seguinte servir **404 em todas as rotas** — inclusive `/` — sem erro no log (só `GET / 404`). Parece rota quebrada ou middleware, mas é artefato de build de produção sendo reaproveitado pelo dev server. Correção: `rm -rf apps/web/.next` e reiniciar o `next dev`. Regra prática: sempre que rodar a validação de build antes de subir o app local, limpe o `.next` antes de voltar ao dev. Sintoma irmão observado na QA do REL-06: servir o standalone com `next start` sem copiar `.next/static` dá 404 nos chunks e a página não hidrata (nenhuma Server Action dispara), o que se parece muito com "sessão instável".

## 2026-08-05 — EvalPlanQual também morde na ordem INVERSA: analise os DOIS sentidos, e prefira resolver pelo desenho do estado

Complemento à lesson de 2026-07-20. Ao analisar `cancel` (guard `status='scheduled'`) × `linkSale` (guard `status IN ('scheduled','done')`, que **não altera** `status`), a conclusão intuitiva — "`canceled` não está no guard do `linkSale`, logo o `linkSale` perde e recebe 409" — está certa em **apenas uma** das ordens de lock. Se o `linkSale` commitar primeiro, o `cancel` bloqueado reavalia o predicado contra a linha nova, ainda encontra `status='scheduled'` (o `linkSale` não mexeu no status) e **também** aplica: as duas requisições retornam 200. Regra prática: para cada par concorrente, percorra **as duas** ordens de commit, e lembre que uma escrita que não toca a coluna do guard nunca invalida o rival. Consequência para testes: assertar "exatamente uma 200 e uma 409" nesses pares é **flaky ~50%** — asserte o **estado final**. E a correção mais robusta costuma não ser lock: em REL-06, fazer `cancel`/`no_show` limparem `sale_id` no mesmo UPDATE tornou o estado final idêntico em qualquer ordem, eliminando a anomalia sem `SELECT … FOR UPDATE`. Detectar: escreva a matriz de pares (endpoint × endpoint) e marque quais guards são superconjunto do alvo do outro — nos dois sentidos.

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

## 2026-09-23 — Postgres não tem `MAX(uuid)`; e array JS no template `sql` do Drizzle vira lista de parâmetros
- **Sintoma**: `function max(uuid) does not exist` ao agregar grupos por `COALESCE(client_id, sale_id)` e escolher um id representativo; e uma série de meses passada como array ao `sql` gerava `($1, $2, …)` em vez de um array Postgres.
- **Correção**: `MAX(coluna::text)` (e voltar a uuid na leitura) quando o agregado é só um representante; para tabelas derivadas de parâmetros, montar `(VALUES (…), …) AS t(…)` com `sql.join` e cast explícito (`::timestamptz`) em cada valor.
- **Onde**: `apps/api/src/modules/dashboard/dashboard-*.repository.ts` (`specs/crm-home-period-and-daily-hub`).

## 2026-09-23 — `LIMIT` sobre uma ordem diferente da pedida esconde itens em silêncio
- **Sintoma**: aniversariantes ordenados por nome no SQL e reordenados por data no service; com mais de 20 na janela, os de **hoje** sumiam (o corte acontecia antes da ordem certa). Testes com poucos itens nunca pegam isso.
- **Regra**: a ordenação que decide *quais* itens entram tem de estar no SQL, antes do `LIMIT`; reordenar depois só é seguro sem limite. Todo limite de lista precisa de um teste com mais itens que o limite.
- **Onde**: QA rodada 1 de `specs/crm-home-period-and-daily-hub` (`dashboard-today.repository.ts`).

## 2026-09-19 — Um CHECK do Postgres não pode barrar data futura

Constraint não chama `now()`: qualquer invariante que dependa do "agora" precisa viver no service. No CRM-13 a spec chegou a prometer "data futura rejeitada como invariante no banco" — falso, porque uma linha com `sold_at` e `updated_at` **ambos** no futuro satisfaz `sold_at <= updated_at`. O que o CHECK entrega é coerência entre colunas, não relação com o presente. Detectar: qualquer requisito de "não pode ser no futuro/passado" atribuído ao banco.

## 2026-09-19 — Sem jsdom no projeto, critério de aceite de UI precisa virar helper puro

`vitest.config.ts` roda em `environment: "node"` e coleta só `apps/**/*.test.ts` — não há jsdom, `@testing-library` nem um único `.test.tsx`. Prescrever "teste do formulário" é prometer cobertura inexistente (proibido por `spec-format.md`). O padrão que funciona, já estabelecido em `sale-lifecycle.ts`/`sale-total.ts`/`appointment-form-payload.ts`: extrair a **decisão** para módulo `.ts` puro em `apps/web/src/lib/` e testar lá; o que sobra de render e clique vira pendência declarada de E2E. Efeito colateral bom: a lógica sai do componente. Detectar: critério de aceite de UI sem arquivo `.test.ts` possível.

## 2026-09-19 — Reverter o fix é a única prova de que o teste de regressão não é vácuo

Na implementação do RF-15 o agente reverteu temporariamente `monthSalesScope` para `completed_at`, rodou o arquivo e confirmou que **só** o caso novo falhava — depois restaurou. Sem esse passo, um teste de regressão pode estar passando por motivo errado (setup que nunca alcança o estado pretendido). Aconteceu de fato no mesmo ciclo: o caso "entregue → cancelada → excluída" usava venda à vista, cujo `cancel` responde 409 por cobrança paga — o teste nunca chegava ao estado que pretendia sondar.
