---
feature: crm-home-period-and-daily-hub
module: api, web, shared
phase: validate
status: done
round: 3
created: 2026-09-23
updated: 2026-09-24
depends_on: [tasks.md]
---

# Validate: crm-home-period-and-daily-hub (rodada 3)

QA neutro da rodada 3, a última permitida pelo fluxo (`MAX_IMPL_ROUNDS = 3`). Revisor novo, revalidação do zero na branch `feature/crm-home-period-and-daily-hub`. Base: working tree sem commit (`git diff main` com 55 arquivos alterados, mais os não rastreados). Execução em 24/09/2026, entre 03:16 e 03:33 no horário de São Paulo (TZ do host = `America/Sao_Paulo`). Nenhum código nem teste foi editado; nenhum git de escrita.

**Histórico.**
- **Rodada 1**: REPROVADO. CRÍTICO: o gráfico cortava o mês selecionado em 375px. Mais 6 ALERTAS, entre eles o limite dos aniversariantes aplicado antes da ordem, a falta de contagens no Hoje e testes faltando. 1769 testes.
- **Rodada 2**: REPROVADO. CRÍTICO novo: a tabela `sr-only` do gráfico alargava a home para 396px quando havia mês de prejuízo (regressão da correção S3). Mais 3 ALERTAS: colisão de rótulos no gráfico, rótulo enganoso de `range` em andamento e `9999-12-31` devolvendo 500. 1789 testes.
- **Fixer da rodada 2**: 1814 testes. A tabela passou a ficar dentro de `div.sr-only`, o gráfico ficou com um único rótulo de valor, os rótulos de `range` foram refeitos e as datas de filtro ganharam piso 2015-01-01 e teto 2099-12-31.

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | OK | `Checked 391 files in 264ms. No fixes applied.` (`LINT_EXIT=0`) |
| Typecheck | `bun run typecheck` | OK | shared, web e api: `Exited with code 0` |
| Testes | `bun run test` | OK (1814 passed, 0 failed) | 93 arquivos em 39.26s, com a integração Testcontainers; nenhum `.skip`/`.only`/`.todo`/`skipIf`/`expect(true)` no repositório |
| Build | `bun run build` (web, Next 16.2.10, `output: standalone`) | OK | `Compiled successfully in 9.1s`; `/crm`, `/crm/sales`, `/crm/sales/receivables` dinâmicas; `BUILD_EXIT=0`; sem warnings |
| Migração (gerada) | `drizzle-kit generate` com config temporária apontando para uma **cópia** de `apps/api/drizzle/` | OK | `No schema changes, nothing to migrate`; `diff -rq` sem diferença; repositório intocado |
| Migração (aplicada) | `drizzle-kit migrate` num Postgres 18 descartável próprio (`qa3-crm-home-pg`, 127.0.0.1:55453, `TimeZone = UTC`) | OK | 17 migrações (0000→0016); `monthly_goals` com colunas, UNIQUE, CHECKs e FK; índice `sales_consultant_sold_at_idx` presente |
| Runtime | API (`bun run src/index.ts`, porta 3431, `env -i`) + web standalone (`node server.js`, `NODE_ENV=production`, porta 3430) + Chrome 151 headless via CDP (WebSocket nativo do Bun, sem dependência nova) | OK | Detalhes abaixo. Única anomalia visual: tooltip do gráfico sob foco de teclado (review.md S1) |

## Saída Relevante

### Suíte e build
```
 Test Files  93 passed (93)
      Tests  1814 passed (1814)
   Duration  39.26s (transform 3.10s, setup 0ms, import 45.36s, tests 182.55s, environment 13ms)
TEST_EXIT=0
...
@clientela/web build: ✓ Compiled successfully in 9.1s
@clientela/web build: ├ ƒ /crm
BUILD_EXIT=0
```

### Banco descartável (o banco de desenvolvimento do humano, em 127.0.0.1:5432, não foi tocado)
```
docker run --rm -d --name qa3-crm-home-pg ... -p 127.0.0.1:55453:5432 postgres:18-alpine   (show timezone → UTC)
drizzle-kit migrate → [✓] migrations applied successfully!   (drizzle.__drizzle_migrations = 17)
```
- Duas consultoras foram criadas pelo script real `apps/api/scripts/seed-consultant.ts`.
- Login pela rota `/auth/login` e pelo formulário real de `/login` no Chrome. Cookie `clientela_session` com `httpOnly: true`, `secure: true` e `sameSite: Lax`.

### Dados criados pelas rotas da API (script em scratchpad, hoje = 24/09/2026)
- **Produtos**: 5. Um deles custa R$ 50.000,00, um é vendido abaixo do custo, um tem estoque 0 e reserva de 2, e outro tem estoque 0 sem reserva.
- **Clientes**: 5, com aniversários em 24/09, 28/09, 01/10 e 02/10 e uma sem data.
- **Vendas**: 19.
  - Uma de 2019, de R$ 700.000,00.
  - Quatro meses de prejuízo na janela de 12 meses: nov/2025, fev, abr e jun/2026.
  - **Empate exato no topo** com 6 dígitos em reais: mar e jul/2026, R$ 150.000,00 cada.
  - Setembro com R$ 101.248,10.
  - Parceladas: atrasadas, vencendo hoje e nos próximos 7 dias.
  - Uma anônima atrasada, duas a entregar e uma "receber na entrega".
  - Uma **cancelada** e uma **excluída** pela rota real.
- **Baixa**: 1, feita hoje.
- **Leads**: 7 (5 manuais e 2 públicos, com e sem interesse).
- **Compromissos**: 9. Seis agendados hoje (um às 23:30 locais), um às 00:00 de amanhã, um amanhã e um cancelado.

### Números da API conferidos à mão

| Verificação | Esperado | Obtido |
|---|---|---|
| `current` set (1–24) | sold 10.124.810 / 5 vendas; lucro 6.072.810; recebido 10.064.870; 4 clientes | idem |
| `previous` (1–24/08; a venda de 28/08 fica fora) | 24.950 / 1; lucro 14.950; recebido 0; 1 cliente | idem |
| Série 2025-10 → 2026-09 | 0; 10.000/−20.000; 99.800/59.800; 4.990/2.990; 20.000/−40.000; 15.000.000/9.000.000; 10.000/−20.000; 0; 59.940/−42.060; 15.000.000/9.000.000; 34.930/20.930; 10.124.810/6.072.810 | idem |
| Top produtos set | Batom 17 un. 84.830 · Kit 2 un. 10.000.000 · Perfume 2 un. 39.980 (desempate por valor com qty igual) | idem |
| Top clientes set | Ana 10.049.900 · Daniela 39.980 · Beatriz 19.960 · Carla 4.990 (anônima fora) | idem |
| Cobranças do Hoje | 3 atrasadas 24.950; 1 hoje 12.475; 1 em 7 dias 9.980. Grupos na ordem: Ana (2 parcelas, 19.960, 10/08), anônima (4.990, 23/09, sem WhatsApp), Zélia (12.475, hoje) | idem |
| Agenda / entregas / leads | total 6, 5 itens até 17:00 (o de 23:30 fica fora pelo limite; 00:00 de amanhã e o cancelado, fora) / 2 · 44.970, mais antiga primeiro / 7, os 5 mais recentes | idem |
| Encomendas / aniversários | só o Perfume, faltam 2 (Base com estoque 0 sem reserva fica fora) / Ana (hoje), Beatriz 28/09, Carla 01/10 (Zélia 02/10 fora) | idem |
| Posição | a receber 114.830; atraso 24.950/3; estoque custo 159.090.000, venda 391.678.500, baixo 2 | idem; bate com a soma da lista de `/crm/sales/receivables` (9 cobranças = R$ 1.148,30) |

**Invariantes RF-14/RF-15**, com soma de todas as páginas (`perPage=5`) de `/sales?status=sold&soldFrom&soldTo` e de `/receivables?pending=false&paidFrom&paidTo` contra o cartão, em 8 períodos: mês corrente, ago, jul, `year`, `year=2025`, `all`, `range` 2025-10..2026-09 e `range` 2026-07..2026-09. Resultado: **8/8 OK** em soma e contagem, e a lista de recebimentos em `paid_at desc` em todos.

### Fronteiras e erros da API
- **422 com mensagem pt-BR**: mês, ano e intervalo futuros (via `InvalidDashboardPeriodError`), `from > to`, mês < 2015-01, parâmetro alheio ao `period`, `to` ausente, `period` inválido, mês 13, `soldTo`/`soldFrom`/`paidTo=9999-12-31`, `soldFrom=2014-12-31`, `soldFrom > soldTo`, status e entrega inválidos, `2026-02-30`, `overdue` com `pending=false`, `paidFrom` sem `pending=false`, `paidFrom > paidTo` e `overdue=maybe`.
- **Aceitos**: `soldTo=2099-12-31` → 200. Chave desconhecida → 200.
- **Exceção**: `month` repetido (`?month=2026-09&month=2026-08`) → 422 com a mensagem **em inglês** `Invalid input: expected string, received array` (review.md S2).
- **Meta**: 0, negativo, acima do teto, 12,5, `{}` e string → 422 pt-BR. O teto exato e `null` → 200 `{ month: "2026-09", ... }`, e a linha fica `2026-09-01 | NULL`, sem duplicar.
- **Autenticação**: sem token → 401 em performance, today, goal e summary. `/dashboard/summary` com token → 404.
- **Log da API**: só `[uuid] erro inesperado code=UNKNOWN path=/dashboard/... error=Error`. O grep por nomes, telefones, e-mail e senha no log da API e da web deu **0**.

### Web em produção (Chrome headless)
- **Overflow horizontal**: medido com `document.documentElement.scrollWidth`, `document.body.scrollWidth`, `innerWidth` e `visualViewport.width` em 375×812. A emulação mobile (dpr 2) e a desktop (barra de rolagem de 15px) dão o mesmo resultado; em desktop, `scrollTo(500, y)` deixa `scrollX = 0`.

| Cenário de estresse | mobile (doc/body/innerWidth/visualViewport) | desktop 375 (doc/body) | Resultado |
|---|---|---|---|
| `/crm`: set em andamento, 4 meses de prejuízo, 6 dígitos | 375/375/375/375 | 360/360 | OK |
| `?period=month&month=2026-07` (empate no topo selecionado) | 375/375/375/375 | 360/360 | OK |
| `?period=month&month=2026-08`, `?period=year`, `?period=year&year=2025` | 375/375/375/375 | 360/360 | OK |
| `?period=all` (cartões com R$ 1.103.644,70) | 375/375/375/375 | 360/360 | OK |
| `?period=range&from=2026-07&to=2026-09` (em andamento), `range` de 1 mês, `range` de 13 meses | 375/375/375/375 | 360/360 | OK |
| `/crm/sales` (10 variações) e `/crm/sales/receivables` (6 variações) | 375 | — | OK |
| **Foco de teclado na 11ª barra** do gráfico (tooltip) | — | **384** | **Transitório** (S1) |

- **Rótulo de valor do gráfico**: sempre um só.
  - Em "Este mês", fica no mês selecionado (R$ 101.248,10), ancorado à direita.
  - Em `year`, `all` e `range`, fica no maior mês destacado; no empate mar = jul, vai para o mais recente (jul).
  - A folga `pt-5` impede a invasão da legenda. Não há colisão (`crop-375-*-chart.png`).
- **Tooltip** (`group-focus-visible`), com foco real por Tab:
  - Colunas 1 e 12: ancoradas e dentro da tela (correção S4 da rodada 2).
  - Coluna 2: sai 24px pela esquerda (`left = −24`) e o início do texto fica cortado.
  - Coluna 11: vai até x=384 e o documento passa a 384px enquanto o foco estiver ali. O hover do mouse não pôde ser emulado.
- **Drill-down por clique real**:
  - O cartão Vendido ("R$ 101.248,10 | 5 vendas") leva a `/crm/sales?status=sold&soldFrom=2026-09-01&soldTo=2026-09-24`, com aba "Vendidas", chip "Período: 01/09/2026 – 24/09/2026" e **"5 vendas"**; a soma das linhas é **R$ 101.248,10**.
  - Recebido leva a "Recebidas no período" com **"3 recebimentos"** (R$ 99,80 + R$ 49,90 + R$ 100.499,00 = **R$ 100.648,70**, igual ao cartão), em ordem de baixa desc.
  - Lucro e Ticket levam ao mesmo destino do Vendido.
- **Vendas**:
  - Aba Vendidas: "17 vendas", exclui a cancelada.
  - De > Até trocado, tanto pela URL quanto pelo formulário GET real (chip 01–24/09, sem 422).
  - `?soldTo=9999-12-31` cai no padrão **sem erro** (A3 da rodada 2 resolvido); parâmetros inválidos também caem no padrão.
  - Chips: só `soldFrom` mostra "A partir de 01/09/2026"; "A entregar" mostra 2; "Filtrado por cliente" usa só o id na URL.
  - Vazio de filtro "Nenhuma venda com estes filtros." com "Limpar filtros".
  - As abas preservam período, entrega e cliente, e voltam para a página 1.
  - Contagem só com filtro ativo.
- **Cobranças**:
  - "A receber": 9 cobranças. "Atrasadas": 3 cobranças.
  - "Recebidas no período": 3 recebimentos, com De > Até trocado. Só `paidTo` mostra "Recebidas até 31/08/2026" (10).
  - Vazio "Nenhum recebimento neste período" com link para a visão padrão.
  - `paidTo=9999-12-31` cai no padrão sem erro.
- **WhatsApp** (texto decodificado do `wa.me`), idêntico ao RF-19 em todos os casos:
  - cobrança atrasada com N parcelas e com 1 parcela;
  - cobrança que vence hoje com 1 parcela;
  - cobrança a vencer;
  - aniversário;
  - lead com e sem interesse.
  - Casos sem mensagem: `on_delivery` gera link sem mensagem; venda anônima fica sem botão; a confirmação de compromisso reusa `buildConfirmationWhatsAppUrl`.
  - Nomes acessíveis começam pelo texto visível: "Cobrar …", "Confirmar com …", "Chamar …", "Parabéns para …" (WCAG 2.5.3 ok).
- **Hoje**:
  - Ordem Início → Hoje → Desempenho → Posição agora; as 4 ações rápidas com hrefs certos.
  - Títulos com contagem: "Agenda de hoje · 6", "Leads novos · 7", "Encomendas sem estoque · 1", "Aniversariantes · 3".
  - Resumos "3 atrasadas · R$ 249,50 · 1 vencendo hoje · … · 1 nos próximos 7 dias · R$ 99,80" e "2 vendas · R$ 449,70".
  - Hrefs conforme o RF-20: grupo com cliente → `/crm/sales?status=open&clientId=…`; grupo sem cliente → `/crm/sales/{id}`; "Ver todas" → `?overdue=true`; `/crm/sales?status=open&delivery=pending`; `/crm/leads?status=new`; `/crm/orders/new`; `/crm/products?lowStock=true`.
- **Período (RF-21)**:
  - Rótulos: "setembro de 2026 (até dia 24)" com "comparado com 1–24 de agosto"; "2026 (até 24 de setembro)" com "comparado com 1º de janeiro a 24 de setembro de 2025"; "jul/2026 – set/2026 (até dia 24)" com "comparado com jul/2025 – set/2025 (até 24 de setembro)".
  - `range` 09–09 é rotulado como mês ("setembro de 2026 (até dia 24)"); `range` de 13 meses fica sem comparação.
  - Clamps: `month=2031-05` → set/2026; `month=2014-06` → jan/2015 (anterior desabilitada); `year=2031` → 2026; `year=2015` → anterior desabilitada.
  - Entradas inválidas: `period=week` e `range` incompleto → mês corrente; `range` com De > Até é trocado.
  - Setas: "seguinte" desabilitada no mês e no ano corrente; `range` e `all` sem setas.
- **Meta pela Server Action real** (cliques no Chrome):
  - valor 0 → "A meta deve ser maior que zero";
  - R$ 150.000,00 → "67% da meta · Faltam R$ 48.751,90 em 7 dias — R$ 6.964,56 por dia" (ceil conferido);
  - R$ 100.000,00 → "101% da meta · Meta batida! R$ 1.248,10 acima";
  - remover → "Você ainda não definiu uma meta para este mês." (banco `2026-09-01|NULL`);
  - agosto → "Sem meta neste mês." sem botões; `year` → sem cartão de meta;
  - com uma linha de julho inserida só como fixture: jul "Definida para julho de 2026 · 300%" sem botões; ago "Mesma meta de julho de 2026" (API `source: inherited`, `editable: false`); set continua `none`.
  - Amostras a cada 120ms durante salvar e remover não mostraram estado intermediário enganoso (S1 da rodada 2 resolvido).
- **Isolamento (RF-18)**, com tabela renomeada temporariamente no banco descartável:
  - `leads` quebrada: só "Hoje" mostra "Ocorreu um erro inesperado… | Tentar novamente"; Desempenho e Posição renderizam e o `error.tsx` da rota não entra.
  - `monthly_goals` quebrada: só "Desempenho" falha.
  - Depois de restaurar, o clique em "Tentar novamente" recupera o bloco nos dois casos.
- **Estados vazios** (2ª consultora):
  - Cartões: R$ 0,00, "margem —", ticket "—", "sem movimento", "Sem vendas neste período." com "Registrar venda".
  - Gráfico: "Nenhuma venda nos últimos 12 meses". Rankings: "Nenhuma venda neste período". Posição zerada.
  - Com os 7 leads marcados como contatados pela rota real: "Tudo em dia por hoje." com "Registrar venda" → `/crm/sales/new`.
  - Os leads da 1ª consultora aparecem para a 2ª (drift aceito, RF-26).
- **1280px**: sem overflow (`scrollWidth 1265 = clientWidth`) e sem colisão.

### Screenshots (`specs/crm-home-period-and-daily-hub/qa/round-3/`, 60 arquivos)
| Arquivo | Conteúdo |
|---|---|
| `home-375-{default,last-month,month-tie,year,year-2025,all,range-in-progress,range-single,range-13m}.png` | home completa em 375px, emulação mobile, nos cenários de estresse (a barra de navegação fixa aparece no meio por causa da captura além da viewport) |
| `crop-375-{default,month-tie,year,all,range-in-progress}-{performance-top,kpis,chart}.png` | seletor e rótulos, cartões (inclusive R$ 1.103.644,70) e gráfico com rótulo único |
| `crop-375-today-*.png`, `crop-375-position.png`, `crop-375-quick-actions.png` | seções do Hoje, Posição e ações rápidas |
| `crop-375-tooltip-focus-last-bar.png` | tooltip da última barra sob foco de teclado (ancorado, dentro da tela) |
| `drilldown-{vendido,recebido}-375.png` | destinos do drill-down |
| `goal-{defined,reached,inherited-past-month}-375.png` | meta pela Server Action e herança |
| `isolation-{leads,monthly_goals}-375.png` | falha isolada de um bloco |
| `home-375-empty-{consultant-b,all-caught-up}.png` | estados vazios |
| `sales-375-*.png`, `receivables-375-*.png` | listagens e filtros (incluindo `soldTo`/`paidTo=9999-12-31`) |
| `home-1280-{default,year,all}.png`, `crop-1280-default-chart.png` | desktop |

### Encerramento
- API, web e Chrome encerrados por PID. Um `pkill -f` inicial casou com a própria linha de comando do shell e foi refeito por PID.
- Container `qa3-crm-home-pg` parado; como foi criado com `--rm`, foi removido.
- `ss -ltnp` sem 3430, 3431, 9343 e 55453.
- **`apps/web/.next` apagado.**
- `git diff main --stat` idêntico ao do início (55 arquivos); os não rastreados fora de `specs/crm-home-period-and-daily-hub/` também (65).

## Pendências
- **E2E (REL-01)**: não há infraestrutura Playwright. Render, clique e Server Action foram validados por runtime manual (CDP) e precisam entrar no handoff.
- **Borda real das 22h locais**: esta QA rodou de madrugada, quando o dia UTC coincide com o local. A borda está coberta pelos testes de integração com relógio fixo (`sales-filters.integration`, `dashboard-today.integration`, `dashboard-performance.integration`), e o Postgres descartável estava em `TimeZone = UTC`.
- **Hover do mouse** sobre as barras não foi reproduzível na emulação; só o foco de teclado foi medido.

---

# Emenda M8 (2026-09-24)

QA neutra da emenda de 24/09/2026: Task 8.1, RF-18 (nova ordem), RF-20a, RF-20 e RF-28. O revisor é novo e revalidou do zero no working tree da branch `feature/crm-home-period-and-daily-hub`, ainda fora do histórico. A execução foi em 24/09/2026, entre 14:30 e 14:50 no horário de São Paulo. Nenhum código nem teste foi editado, e nenhuma operação de escrita de versionamento foi feita.

O humano estava validando localmente (`next dev` :3000, API :3001, `clientela_pg_dev`), e nada disso foi tocado:
- `bun run lint` e `bun run typecheck` rodaram no repositório, e são só leitura.
- A suíte, o build e o runtime rodaram numa **cópia isolada**: `rsync -a --exclude node_modules --exclude apps/web/.next --exclude .git` para o scratchpad, seguido de `bun install`.
- O `apps/web/.next` do repositório **não** foi apagado.

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|---|---|---|---|
| Lint | `bun run lint` (repo) | OK | `Checked 490 files in 778ms. No fixes applied.` (`LINT_EXIT=0`) |
| Typecheck | `bun run typecheck` (repo) | OK | shared, api e web: `Exited with code 0` |
| Testes | `bun run test` (cópia) | OK (1845 passed, 0 failed) | `Test Files 94 passed (94)`, `Tests 1845 passed (1845)` em 72.73s, com a integração Testcontainers. Nenhum `.skip`/`.only`/`.todo`/`skipIf`/`expect(true)` |
| Build | `bun run build` (cópia; Next 16.2.10, standalone) | OK | `✓ Compiled successfully in 19.5s`; `ƒ /crm/today` na lista de rotas; `BUILD_EXIT=0` |
| Migração | `drizzle-kit migrate` em Postgres 18 descartável (`qa-m8-crm-home-pg`, 127.0.0.1:55488) | OK | `migrations applied successfully` |
| Runtime | API da cópia (`bun run src/index.ts`, :3401, `env -i`, `TZ=America/Sao_Paulo`) + web standalone (`node server.js`, `NODE_ENV=production`, :3400) + Chrome 151 headless via CDP (:9348) | **FALHOU em 2 pontos** | Detalhes abaixo |

## Dados (criados pelas rotas reais, hoje = 24/09/2026, ~14:40 locais)

- **Consultoras**: duas (A e B), criadas pelo `scripts/seed-consultant.ts` real. Login feito pelo formulário `/login` no Chrome.
- **Clientes de A**: Ana (aniversário hoje), Beatriz (28/09), Carla (sem aniversário) e Zélia (01/10).
- **Encomendas sem estoque**: **7 produtos** com estoque 0 e reserva de 3, 4, 5, 6, 7, 8 e 9 un., por venda aberta não entregue. Total real: **42 un.**
  - Também há um produto com estoque 0 sem reserva, que corretamente fica fora.
- **Cobranças**:
  - Ana tem duas parcelas somando R$ 124.755,57: uma atrasada (24/08) e uma vencendo hoje.
  - Há uma venda anônima com parcela que vence hoje e uma parcela de Beatriz em 27/09.
- **Compromissos de hoje**: Ana às **09:00** (já passado no momento do teste) e Zélia às 18:00.
- **Leads**: 2 novos, um público com interesse e um manual.
- **Consultora B**: só uma parcela nos próximos 7 dias.
  - Depois, a venda foi excluída pela rota `DELETE /sales/:id` e os leads marcados como `contacted` pela rota `PATCH /leads/:id/status`, para chegar ao "Tudo em dia".
- **`GET /dashboard/today` (A)**:
  - `restock.shortCount = 7`, com `items.missingQty = [9, 8, 7, 6, 5]` (soma 35);
  - `collections`: 1 atrasada, R$ 62.377,79; 2 vencendo hoje; 1 nos próximos 7 dias;
  - `appointments.items[0].startsAt = 12:00Z` (09:00 local).

## Saída Relevante (runtime)

### Home `/crm` (375×812 com emulação mobile, e 1280×900)
- **Ordem dos `h1`/`h2`**: `Início, Desempenho, Hoje, Posição agora` — **OK** (RF-18).
- **Grade**:
  - 375px: `gridTemplateColumns = "165.5px 165.5px"` (2 colunas);
  - 1280px: `"237.328px 237.328px 237.328px"` (3 colunas).
  - Nenhum texto cortado nos cartões (`scrollWidth > clientWidth` em nenhum `p/span`).
  - "R$ 62.377,79 em atraso" quebra em 2 linhas legíveis.
- **Overflow horizontal**:
  - 375: `doc 375 / body 375 / innerWidth 375 / visualViewport 375`, sem offenders;
  - 1280: `1265 / 1265`.
  - Resultado: **OK**.
- **Bloco Hoje sem lista e sem WhatsApp**: `li = 0`, `wa.me = 0`, `button = 0`. **OK**.
- **"Ver tudo"** → `/crm/today`. **OK**.
- **Cartões obtidos (A)**:
  - `Cobranças | R$ 62.377,79 em atraso | 1 atrasada · 2 vencem hoje`, com a linha em `text-destructive` (reforço; o texto já diz "em atraso") → `#cobrancas`;
  - `Agenda | 2 compromissos | próximo às 09:00 · Ana` → `#agenda`. **Às 14:40 o "próximo" é um compromisso já passado.**
  - `A entregar | 7 vendas | R$ 420,00` → `#entregas`;
  - `Leads novos | 2 leads | mais recente: Fernanda` → `#leads`;
  - `Encomendas sem estoque | 7 produtos | faltam 35 un.` → `#estoque`. **O total real é 42 un.**
  - `Aniversariantes | 3 nesta semana | Ana faz hoje` → `#aniversariantes`.
- **B com só "próximos 7 dias"**: `Cobranças | R$ 24,95 | 1 nos próximos 7 dias`, em tom default. **OK**.
- **B com tudo vazio**: `Hoje | Ver tudo | Tudo em dia por hoje. | Registrar venda` (→ `/crm/sales/new`). **OK**.
- **Cartão de tipo vazio omitido**: depois que os leads foram contatados, a home de A mostra 5 cartões, sem "Leads novos" (`home-375-viewport-today-tiles.png`). **OK**.

### Página `/crm/today`
- **Página**: `document.title = "Hoje | Consultoria de Beleza Mary Kay"`; `h1 = "Hoje"`; "← Início" → `/crm`.
- **Âncoras**: `section[id]` = `cobrancas, agenda, entregas, leads, estoque, aniversariantes`, com `scroll-margin-top: 80px` (o header sticky mede 69px em 375). Os `id` batem com os hrefs dos cartões.
- **Seções completas**:
  - WhatsApp de cobrança, confirmação, lead e aniversário com os textos do RF-19;
  - "Ver cobranças", "Ver todas" (`?overdue=true`), "Ver agenda", "Ver todas" (`?status=open&delivery=pending`), "Ver todos" (`/crm/leads?status=new`), "Criar pedido de reposição" e "Ver produtos".
  - Resultado: **OK**.
- **Overflow**: 375 = `375/375/375/375`; 1280 = `1265/1265`. **OK**.
- **Hierarquia de títulos**: `H1:Hoje` e depois `H3` em cada seção, sem `h2` (S1).
- **Skeleton**: com um `LOCK TABLE leads IN ACCESS EXCLUSIVE MODE` de 10s no banco descartável, a página mostra `h1 "Hoje"`, 9 `.animate-pulse` e `sr-only "Carregando…"`, com 0 seções. Depois do lock, 6 seções. **OK** (`today-375-skeleton.png`).
- **Erro isolado**, com `leads` renomeada no banco descartável:
  - Na home, só o bloco Hoje mostra `Hoje | Ocorreu um erro inesperado. Tente novamente em instantes. | Tentar novamente`; Desempenho e Posição continuam renderizando.
  - Em `/crm/today`, aparece o mesmo `SectionError`, com "← Início" e o `h1` preservados, e o `error.tsx` da rota não entra.
  - Depois de restaurar a tabela, o clique em "Tentar novamente" recupera as 6 seções.
  - Resultado: **OK**.
- **Log**: a API registrou só `[uuid] erro inesperado code=UNKNOWN path=/dashboard/today error=Error`. O grep por nomes e telefones nos logs de API e web deu **0**.

### Clique no cartão → âncora (RF-28) — **FALHOU**
O clique foi real (CDP `Input.dispatchMouseEvent`) no cartão da home, com navegação client-side do `next/link`. A medição foi feita 2s depois de a seção existir no DOM, em 3 rodadas × 6 cartões mais 3 cargas diretas (hard load) com hash. Viewport de 375×812.

```
r1 click /crm/today#cobrancas        top=177  scrollY=0      (não rolou; seção por acaso visível)
r1 click /crm/today#agenda           top=545  scrollY=0      (não rolou)
r1 click /crm/today#entregas         top=829  scrollY=0      (NÃO rolou; seção abaixo da dobra)
r1 click /crm/today#leads            top=80   scrollY=1285   (rolou)
r1 click /crm/today#estoque          top=1653 scrollY=0      (NÃO rolou)
r1 click /crm/today#aniversariantes  top=2157 scrollY=0      (NÃO rolou)
r2 ... entregas OK · leads top=1365 scrollY=0 (NÃO) · estoque OK · aniversariantes top=2157 scrollY=0 (NÃO)
r3 ... entregas top=829 scrollY=0 (NÃO) · leads top=1365 scrollY=0 (NÃO) · estoque OK · aniversariantes OK
hard /crm/today#agenda OK · hard /crm/today#estoque top=1653 scrollY=0 (NÃO) · hard #aniversariantes OK
```
- A URL e o hash estão sempre certos, e o `id` existe. Porém, das 12 tentativas por clique em seções abaixo da dobra, só **5** rolaram até a seção; nas outras a usuária cai no topo da página.
- **Evidência**: `today-375-anchor-estoque.png` mostra a URL `#estoque` com a viewport no topo ("← Início", "Cobranças").
- **Causa provável**: o conteúdo de `/crm/today` chega por streaming (`loading.tsx` + `Suspense` interno), e a rolagem para o hash acontece antes de o `id` existir no DOM.

### Screenshots (`specs/crm-home-period-and-daily-hub/qa/m8/`, 16 arquivos)
| Arquivo | Conteúdo |
|---|---|
| `home-375.png`, `home-1280.png` | home completa (captura além da viewport: o header sticky e a barra inferior aparecem sobrepostos no meio) |
| `crop-375-home-today-tiles.png` | recorte dos 6 cartões em 375 (parcialmente coberto pelo header sticky, efeito da captura além da viewport) |
| `home-375-viewport-today-tiles.png` | viewport limpa de 375 com os cartões (5 — os leads já tinham sido contatados) |
| `crop-1280-home-today-tiles.png` | os 6 cartões em 3 colunas |
| `crop-375-home-today-only-next7.png`, `crop-375-home-today-all-caught-up.png` | consultora B: só os próximos 7 dias e "Tudo em dia" |
| `today-375.png`, `today-1280.png`, `today-375-viewport-estoque.png`, `crop-375-today-estoque.png` | página `/crm/today` |
| `today-375-anchor-estoque.png` | **falha da âncora**: URL `#estoque`, viewport no topo |
| `today-375-skeleton.png`, `today-375-error.png`, `home-375-today-error.png`, `today-375-all-caught-up.png` | skeleton, erro isolado e vazio |

### Encerramento
- Encerrei **só** o que subi: API :3401, web :3400 e Chrome :9348, por PID.
- Container `qa-m8-crm-home-pg` parado (`--rm`, logo removido). Cópia temporária removida.
- `next dev` :3000, API :3001 e `clientela_pg_dev` do humano intactos; `apps/web/.next` do repositório intocado.

## Pendências
- **Âncoras (RF-28)** e **total de unidades (RF-20a)**: reprovados; ver `review.md` → Emenda M8.
- **E2E (REL-01)**: continua sem infraestrutura. A falha de âncora é exatamente o tipo de regressão que um E2E pegaria.
- `apps/web/next-env.d.ts` aparece modificado no diff contra a `main` (`.next/types` → `.next/dev/types`), efeito do `next dev`. Deve ficar de fora da entrega.
