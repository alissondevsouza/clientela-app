---
feature: crm-home-period-and-daily-hub
module: api, web, shared
phase: spec
status: approved
size: L
created: 2026-09-23
updated: 2026-09-24
---

# Spec: crm-home-period-and-daily-hub (CRM-14 ampliado — nova home do CRM)

## O Que

A home do CRM (`/crm`) deixa de ser um resumo fixo do mês corrente e passa a ter três blocos:

1. **Hoje** — a central do dia: com quem falar e o que resolver (cobranças vencidas e do dia, compromissos de hoje, vendas a entregar, leads novos, reposição de estoque, aniversariantes), cada item com o atalho certo (WhatsApp com mensagem pronta, link para o detalhe).
2. **Desempenho** — números de um **período escolhido** (mês isolado, mês passado, ano, todo o período ou intervalo de meses), comparados com um período equivalente, com gráfico dos últimos 12 meses, meta do mês com ritmo e os melhores produtos e clientes. Todo número leva à lista que o gerou.
3. **Posição agora** — saldos que não dependem do período (a receber, em atraso, estoque).

Para isso, a feature também: redefine o faturamento principal como **Vendido** (vendas não canceladas pela data da venda), cria a **meta por mês com histórico**, passa a borda de mês e o "atrasado" para o **fuso da aplicação** e adiciona filtros de período/entrega/atraso nas listagens de vendas e cobranças.

## Por Que

- Achado da revisão neutra do CRM-13 (2026-09-19): o histórico de vendas reinserido está correto, mas ilegível por período — o painel só agrega o mês corrente e a listagem de vendas não filtra por data.
- Análise crítica da home em 2026-09-23 (conversa com o humano): os números não levam a lugar nenhum; "Vendas do mês" ignora vendas parceladas até a quitação (a meta anda devagar para quem vende parcelado); "Previsto para receber" soma o total das vendas abertas, inclusive o que já foi pago, e se sobrepõe a "A receber"; a tela não diz o que fazer hoje, embora o sistema já tenha os dados; a virada de mês e o "atrasado" acontecem às 21h (UTC).
- Referências de mercado (Revendedores Boticário, Mary Kay myCustomers+, Shopify, Pipedrive, QuickBooks): o maior valor para a consultora está nas listas acionáveis do dia; nos números, o que importa é período escolhível, comparação justa e caminho até o detalhe.
- **Decisões do humano (2026-09-23)**: (1) "Vendido" vira o número principal e a base da meta; (2) a home vira a central do dia (absorve REL-05 e REL-03); (3) meta por mês com histórico; (4) borda de mês e "atrasado" no fuso da aplicação. Pedido explícito: tudo numa spec só.

## Glossário (termos usados nos requisitos)

- **Hoje / dia local**: a data em `APP_TIME_ZONE` (`America/Sao_Paulo`, ADR-0018) no instante do relógio injetado no service.
- **Mês local `yyyy-mm`**: mês do calendário em `APP_TIME_ZONE`. **Mês corrente** = mês local de hoje.
- **Escopo Vendido**: vendas da consultora com `status <> 'canceled'` (isto é, `open` ou `completed`) e `sold_at` dentro do período.
- **Cobrança pendente**: `receivables` com `paid_at IS NULL` e `voided_at IS NULL`.
- **Cobrança atrasada**: pendente, `due_kind = 'scheduled'` e `due_date < hoje` (dia local).

## Requisitos

### A. Período e fuso

- **RF-01 — Contrato de período.** `packages/shared` exporta `dashboardPeriodQuerySchema` com `period` ∈ `month | year | all | range` (default `month`) e os parâmetros: `month` (`yyyy-mm`, para `month`; default = mês corrente), `year` (`yyyy`, para `year`; default = ano corrente), `from` e `to` (`yyyy-mm`, ambos obrigatórios para `range`). Parâmetro que não pertence ao `period` escolhido é rejeitado. Mensagens pt-BR, inclusive para campo ausente.
- **RF-02 — Resolução do período.** Função pura em `packages/shared` resolve `(query, hojeLocal)` em: `kind`, `fromMonth`, `toMonth`, `startDate` (1º dia de `fromMonth`), `endDate` (inclusivo), `inProgress` e `comparison`. Regras:
  - `month` ⇒ `fromMonth = toMonth = month`; `year` ⇒ `yyyy-01` a `yyyy-12`, limitado ao mês corrente quando o ano é o corrente; `all` ⇒ `2015-01` (mês de `SOLD_ON_MIN_DATE`) até o mês corrente; `range` ⇒ `from` a `to`.
  - Se `toMonth` é o mês corrente, `endDate = hoje` e `inProgress = true`; senão `endDate` = último dia de `toMonth` e `inProgress = false`.
  - É inválido (erro pt-BR ⇒ 422 na API): mês/ano posterior ao corrente, mês anterior a `2015-01`, `from > to`. As regras que não dependem do relógio (formato, `from > to`, piso 2015-01) ficam no schema Zod; as que dependem de "hoje" (futuro) são verificadas pelo service, que lança o erro de domínio `InvalidDashboardPeriodError`, mapeado para 422 (`VALIDATION_ERROR`) no error-handler central — nunca um `Error` cru (500).
  - Chaves desconhecidas na query são ignoradas; parâmetro conhecido que não pertence ao `period` escolhido (ex.: `month` com `period=year`) é rejeitado.
- **RF-03 — Comparação justa.** O deslocamento depende do `kind` (e, em `range`, de `N` = número de meses de `fromMonth` a `toMonth`):
  - `month` ⇒ **1 mês** para trás;
  - `year` ⇒ **12 meses** para trás (o mesmo trecho do ano anterior — inclusive em janeiro, quando o ano corrente tem 1 mês);
  - `range` com `N = 1` ⇒ 1 mês; `2 ≤ N ≤ 12` ⇒ 12 meses (mesmos meses do ano anterior); `N > 12` ⇒ `comparison = null`;
  - `all` ⇒ `comparison = null`.
  Se `inProgress`, o fim da comparação é `hoje` deslocado pelo mesmo número de meses, com o dia limitado ao último dia do mês de destino (31/03 ⇒ 28 ou 29/02); senão, é o último dia do mês final deslocado. A comparação cobre o **mesmo trecho** do período atual (ex.: 1–23/09 × 1–23/08). Comparação que começa antes de 2015-01 é válida (resulta em zeros).
- **RF-04 — Fuso em todo recorte.** Todo recorte de período e de "hoje" desta feature é calculado em TypeScript no `APP_TIME_ZONE` e chega ao SQL como instantes UTC (para colunas `timestamptz`) ou datas locais (para `due_date`/`birthday`). Nenhuma query dos módulos `dashboard` e `sales` usa `CURRENT_DATE`, `now()`/`date_trunc(now())` ou `AT TIME ZONE` para decidir mês, dia ou atraso. Isso inclui o `overdue` de cobrança em **todas** as leituras do módulo `sales` (detalhe da venda, criação, baixa/estorno, listagem e resumo de cobranças), que passa a usar "hoje" do relógio injetado no service de vendas.

### B. Semântica dos números

- **RF-05 — Vendido, Lucro, Recebido.** Para um período:
  - **Vendido** (`soldCents`, `soldCount`) = Σ `total_cents` e contagem das vendas do escopo Vendido.
  - **Lucro estimado** (`profitCents`, com sinal) = Σ `(unit_price_cents − cost_cents) × qty` dos itens das vendas do escopo Vendido.
  - **Recebido** (`receivedCents`) = Σ `amount_cents` das cobranças das vendas da consultora com `paid_at` dentro do período (instante em que a baixa foi registrada; na venda criada como já recebida, é o instante da venda — ADR-0025) e `voided_at IS NULL`.
  - **Clientes atendidas** (`clientsCount`) = número de `client_id` distintos, não nulos, entre as vendas do escopo Vendido.
  - Venda cancelada não entra em Vendido nem em Lucro; venda excluída some de tudo (inclusive do Recebido, por cascata).
- **RF-06 — Derivados.** Funções puras em `packages/shared`, só sobre inteiros, sem float persistido:
  - ticket médio = `floor(soldCents / soldCount)`; `null` quando `soldCount = 0`;
  - margem % = `profitCents × 100 / soldCents` arredondado ao inteiro mais próximo, **meio para longe do zero** (12,5 ⇒ 13; −12,5 ⇒ −13); `null` quando `soldCents = 0`;
  - variação % = `(atual − anterior) × 100 / anterior`, mesmo arredondamento, quando `anterior > 0`; `null` quando `anterior ≤ 0`, e a UI diferencia "sem base de comparação" (atual ≠ 0) de "sem movimento" (ambos 0);
  - progresso da meta continua sendo `goalProgressPercent` (`floor`, sem teto — `apps/web/src/lib/goal-progress.ts`): nunca mostra 100% antes de a meta ser batida. É uma regra diferente de propósito, não uma segunda fórmula da mesma coisa.

### C. Meta por mês

- **RF-07 — Histórico de metas.** Tabela `monthly_goals` (consultora, mês, meta em centavos **nullable**), única por (consultora, mês). `goal_cents = NULL` significa "sem meta a partir deste mês" (remoção explícita). A **meta efetiva** de um mês M é o `goal_cents` da linha de maior mês ≤ M; sem linha ≤ M, não há meta. Uma meta definida em setembro vale para outubro enquanto outubro não tiver meta própria.
- **RF-08 — Migração da meta atual.** Migração aditiva cria a tabela; backfill copia `consultants.monthly_goal_cents` não nulo para uma linha no mês local em que a migração roda. A coluna antiga permanece (sem leitura nem escrita pelo código novo), para rollback seguro; a remoção vira known-issue.
- **RF-09 — Editar a meta.** `PUT /dashboard/goal` mantém o body `{ monthlyGoalCents: int > 0 ≤ MONEY_MAX_CENTS | null }` e passa a gravar (upsert) a meta do **mês corrente** (decidido pelo relógio do servidor, nunca pelo cliente); responde `{ month, monthlyGoalCents }`. Meses passados e futuros não são editáveis nesta feature.
- **RF-10 — Meta no Desempenho.** Só quando o período é um mês isolado: meta efetiva, de onde ela vem (`explicit` / herdada de `inheritedFromMonth` / sem meta), progresso sobre o **Vendido** do mês (percentual real, barra limitada a 100%) e, no mês corrente, o **ritmo**: dias restantes contando hoje, quanto falta e quanto por dia (`ceil(falta / diasRestantes)`); com a meta batida, mostra quanto passou. Mês passado mostra o resultado sem ritmo. Edição (definir/editar/remover) só no mês corrente.

### D. API do painel

- **RF-11 — `GET /dashboard/performance`.** Recebe o período (RF-01) e responde, numa única transação read-only `repeatable read`, escopado pela consultora da sessão:
  - `period`: o período resolvido (RF-02/RF-03) com `startDate`/`endDate` e a comparação;
  - `current` e `previous` (`null` sem comparação): `soldCents`, `soldCount`, `profitCents`, `receivedCents`, `clientsCount`;
  - `series`: exatamente 12 meses terminando em `toMonth`, do mais antigo ao mais recente, cada um com `month`, `soldCents`, `profitCents` (mês inteiro local; zeros onde não houve venda);
  - `topProducts` (até 5): agrupados por produto; itens de produto excluído (`product_id` nulo) agrupados pelo nome snapshot; ordem por quantidade desc, depois valor vendido desc, depois nome; cada um com `productId` (nullable), `name` (nome atual do produto quando ele existe, senão o snapshot), `qty`, `soldCents` (Σ `unit_price_cents × qty`);
  - `topClients` (até 5): só vendas com `client_id` não nulo, agrupadas por cliente; ordem por valor desc, depois nº de vendas desc, depois nome; cada um com `clientId`, `name` (nome atual), `salesCount`, `soldCents`;
  - `goal`: bloco do RF-10 (`null` quando `kind ≠ month`).
  - Período inválido ⇒ 422 pt-BR; sem sessão ⇒ 401.
- **RF-12 — `GET /dashboard/today`.** Responde, numa única transação read-only `repeatable read`, com `today` (data local) e:
  - `collections`: contagens e somas de parcelas pendentes `scheduled` — atrasadas (`due_date < hoje`), vencendo hoje (`= hoje`) e nos próximos 7 dias (`hoje < due_date ≤ hoje + 7`); e até 5 **grupos** de cobrança das parcelas atrasadas ou de hoje, um por cliente (`client_id`) ou, sem cliente, um por venda. Cada grupo tem `clientId`, `saleId` (só quando não há cliente), `name` (nome atual da cliente, senão o snapshot da venda), `whatsapp` (nullable), `amountCents`, `installmentsCount`, `oldestDueDate`, `overdue` (a mais antiga < hoje). Ordem: `oldestDueDate` asc, depois valor desc. Também `groupsTotal`.
  - `appointments`: compromissos `scheduled` cujo `starts_at` cai em hoje, em ordem de horário (até 5, com `total`), cada um com `id`, `kind`, `title`, `startsAt` e os campos de pessoa necessários à mensagem de confirmação (`clientId`, `clientName`, `clientWhatsapp`, `leadId`, `leadName`, `leadWhatsapp`).
  - `deliveries`: vendas `open` com `delivered_at IS NULL` — `total`, `totalCents` e até 5 (as mais antigas por `sold_at` primeiro) com `saleId`, `clientName` (snapshot), `totalCents`, `soldAt`.
  - `newLeads`: leads com status `new` — `total` e até 5 (mais recentes primeiro) com `id`, `name`, `whatsapp`, `interest`, `createdAt`.
  - `restock`: só **encomenda sem estoque** — produtos com disponível < 0 (disponível = estoque físico − reserva de vendas abertas não entregues, a mesma regra do módulo de produtos): `shortCount` e até 5 (menor disponível primeiro, depois nome) com `productId`, `name`, `availableQty` (negativo) e `missingQty` (= −disponível). O "estoque baixo" comum (disponível ≤ mínimo) **não** entra no Hoje: com o padrão `stock_qty = 0` / `low_stock_threshold = 1`, todo produto cadastrado sem estoque seria "baixo", e a seção nunca sumiria. Ele fica no bloco Posição (RF-25).
  - `birthdays`: clientes cujo aniversário (dia e mês) cai de hoje até hoje + 7, com `clientId`, `name`, `whatsapp`, `birthday`, `nextOn` (a data dentro da janela), ordenados por `nextOn` e nome (até 20). Quem nasceu em 29/02 é lembrada em 28/02 em ano não bissexto. A janela atravessa a virada do ano.
  - Sem sessão ⇒ 401.
- **RF-13 — Remoção do resumo antigo.** `GET /dashboard/summary`, `dashboardSummarySchema`, o helper web `getDashboardSummary` e o card "Previsto para receber" deixam de existir. Nenhum outro consumidor existe hoje (verificado em research).

### E. Listagens para o drill-down

- **RF-14 — Filtros da listagem de vendas.** `GET /sales` aceita, além dos atuais: `soldFrom` e `soldTo` (`yyyy-mm-dd`, dias locais, **inclusivos**, independentes entre si; `soldFrom > soldTo` ⇒ 422 pt-BR); `status=sold` (open ∪ completed — exatamente o escopo Vendido); `delivery` ∈ `pending | delivered`. Invariante: para qualquer período, a soma de `totalCents` e a contagem de `GET /sales?status=sold&soldFrom=<startDate>&soldTo=<endDate>` (todas as páginas) são iguais a `soldCents` e `soldCount` de `/dashboard/performance` para o mesmo período.
- **RF-15 — Filtros da listagem de cobranças.** `GET /receivables` aceita: `overdue=true` (só com `pending=true`; retorna apenas as atrasadas); `paidFrom` e `paidTo` (`yyyy-mm-dd`, inclusivos, **independentes entre si**; só com `pending=false`; quando pelo menos um está presente, retorna apenas as pagas com `paid_at` no intervalo, ordenadas por `paid_at` desc, depois `id` desc). Combinação inválida ou `paidFrom > paidTo` ⇒ 422 pt-BR. Invariante análoga ao RF-14 para `receivedCents`.
- **RF-16 — Tela de vendas.** `/crm/sales` ganha:
  - aba **"Vendidas"** (`status=sold`) junto das atuais;
  - filtro de período com dois campos de data (De/Até) enviados por GET; se a pessoa digitar De > Até, a web **troca as datas** antes de chamar a API (nunca cai no 422);
  - parâmetro `clientId` (já aceito pela API) repassado da URL;
  - indicação removível de cada filtro ativo (período, "A entregar", "Filtrado por cliente" — sem nome na URL, só o id);
  - com qualquer filtro ativo, a contagem total do resultado ("N vendas", do `total` do envelope);
  - vazio de filtro: "Nenhuma venda com estes filtros" + link "Limpar filtros" (o vazio atual "Nenhuma venda registrada ainda" fica só para a tela sem filtro);
  - paginação e abas preservando todos os filtros. Parâmetros inválidos caem no default sem erro (padrão `.catch`).
- **RF-17 — Tela de cobranças.** `/crm/sales/receivables` ganha as visões **"A receber"** (padrão atual), **"Atrasadas"** (`overdue=true`) e **"Recebidas no período"** (quando `paidFrom`/`paidTo` estão presentes — cada linha mostra valor, cliente, data da baixa e link para a venda, sem ação de baixa; De > Até é trocado pela web). Cada visão mostra a contagem total ("N cobranças" / "N recebimentos") e tem vazio próprio com link para a visão padrão ("Nenhuma cobrança atrasada", "Nenhum recebimento neste período"). O botão de WhatsApp de cobrança passa a abrir com a mensagem pronta do RF-19.

### F. Web — a nova home

- **RF-18 — Estrutura e isolamento.** `/crm` renderiza, nesta ordem: título + **ações rápidas** (Nova venda, Registrar pagamento → cobranças, Novo compromisso, Nova cliente); bloco **Desempenho**; bloco **Hoje**; bloco **Posição agora**. Cada bloco é um Server Component assíncrono dentro do seu próprio `Suspense` (skeleton próprio) que chama helpers que nunca lançam; falha de um bloco mostra o erro **só nesse bloco**, com "Tentar novamente", e os demais continuam funcionando. As chamadas dos três blocos saem em paralelo (sem waterfall). Mobile-first (375px) sem rolagem horizontal da página.
- **RF-19 — Mensagens de WhatsApp.** Construtores puros; `{nome}` = primeiro nome (primeiro termo do nome, sem espaços; nome vazio ⇒ sem saudação nominal: "Olá!"), `{valor}` = `formatBRL`, `{data}` = `dd/mm`. Textos exatos:
  - Cobrança, atrasada, 1 parcela: `Olá, {nome}! Tudo bem? Passando para lembrar da parcela de {valor} que venceu em {data}. Consegue me dizer quando pode acertar? Obrigada!`
  - Cobrança, atrasada, N parcelas: `Olá, {nome}! Tudo bem? Passando para lembrar das {N} parcelas em aberto, no total de {valor}. A mais antiga venceu em {data}. Consegue me dizer quando pode acertar? Obrigada!`
  - Cobrança, vence hoje, 1 parcela: `Olá, {nome}! Tudo bem? Passando para lembrar que a parcela de {valor} vence hoje. Qualquer dúvida, estou à disposição!`
  - Cobrança, vence hoje, N parcelas: `Olá, {nome}! Tudo bem? Passando para lembrar que {N} parcelas, no total de {valor}, vencem hoje. Qualquer dúvida, estou à disposição!`
  - Aniversário: `Feliz aniversário, {nome}! Desejo um dia lindo e um novo ano cheio de coisas boas. Um beijo!`
  - Lead novo com interesse: `Olá, {nome}! Tudo bem? Recebi seu cadastro no meu site, com interesse em {interesse}. Posso te ajudar a escolher o produto ideal?`
  - Lead novo sem interesse: `Olá, {nome}! Tudo bem? Recebi seu cadastro no meu site. Posso te ajudar a escolher o produto ideal?`
  - A mesma mensagem de cobrança (1 parcela) é usada no botão da tela de cobranças (RF-17), com a variante atrasada/vence hoje/a vencer — a vencer: `Olá, {nome}! Tudo bem? Passando para lembrar da parcela de {valor} com vencimento em {data}. Qualquer dúvida, estou à disposição!`; cobrança sem data (`on_delivery`/`unknown`) usa o link sem mensagem, como hoje.
  - Número ausente ou inválido ⇒ sem botão (nunca erro de renderização). A confirmação de compromisso reusa `buildConfirmationWhatsAppUrl`.
- **RF-20a — Bloco Hoje compacto na home (emenda de 2026-09-24, pedido do humano após validação local).** Na home, o bloco Hoje é uma **grade de cartões-resumo** (2 colunas em 375px, 3 a partir de `sm`), um por tipo visível do RF-12, na mesma ordem. Cada cartão mostra só: título, o número principal e **uma** linha de resumo, e é inteiramente um link para a seção correspondente da página `/crm/today` (RF-28). Resumos: Cobranças — valor em atraso (ou valor que vence hoje, ou dos próximos 7 dias) e "N atrasadas · N hoje"; Agenda — "N compromissos" e o próximo horário com a pessoa, considerando só compromissos ainda por vir a partir do instante atual (`startsAt >= agora`); se nenhum dos até 5 listados ainda está por vir, o resumo cai para "N para hoje", sem indicar um "próximo" que já passou; A entregar — "N vendas" e o valor; Leads novos — "N leads" e o nome do mais recente; Encomendas sem estoque — "N produtos" e o total de unidades que faltam; Aniversariantes — "N nesta semana" e quem faz hoje (ou o próximo). Atraso comunicado em texto (cor só reforço). Cartão de tipo vazio não aparece; tudo vazio ⇒ o estado único "Tudo em dia por hoje" (mantido). Nenhuma lista nem botão de WhatsApp no bloco da home.
- **RF-28 — Página `/crm/today` ("Hoje").** Página autenticada, server-first, com o conteúdo detalhado que antes ficava na home: as seções do RF-20 (listas de até 5/20 itens, contagens, botões de WhatsApp, "Ver todos"), cada uma com `id` estável para âncora (`cobrancas`, `agenda`, `entregas`, `leads`, `estoque`, `aniversariantes`), mesmo carregamento/erro isolado (skeleton + `SectionError`) e link de volta para o Início. Não entra na navegação principal (é alcançada pelos cartões da home).
- **RF-20 — Seções do Hoje (conteúdo detalhado, hoje na página `/crm/today` — RF-28).** Uma seção por tipo do RF-12, cada uma com contagem, até 5 itens e link "Ver todos" para a lista filtrada. Datas de **instante** (`createdAt` do lead, `soldAt`, `startsAt`) são exibidas com `formatLocalDateBr`/`appLocalTimeHm` (dia/hora no `APP_TIME_ZONE`), nunca fatiando o ISO; datas de **dia** (`dueDate`, `nextOn`) a partir da string `yyyy-mm-dd`, sem conversão de fuso — no bloco Hoje em formato curto `dd/mm` (sem ano, o mesmo da mensagem de WhatsApp), nas demais telas com `formatDateBr`.
  - Cobranças: aparece quando há grupos (atrasadas ou de hoje) **ou** parcelas nos próximos 7 dias (neste caso, só o resumo). Resumo (atrasadas, hoje, próximos 7 dias) com link para `/crm/sales/receivables`; grupos com "Cobrar no WhatsApp". Grupo **com** cliente leva às vendas em aberto dela (`/crm/sales?status=open&clientId={id}`); grupo **sem** cliente leva à venda (`/crm/sales/{saleId}`). "Ver todas" → `/crm/sales/receivables?overdue=true` quando há atrasadas, senão `/crm/sales/receivables`.
  - Agenda de hoje: horário, tipo e pessoa, com "Confirmar no WhatsApp" e link para o compromisso; "Ver agenda" → `/crm/appointments`.
  - A entregar: cliente, valor e data da venda, link para a venda; "Ver todas" → `/crm/sales?status=open&delivery=pending`.
  - Leads novos: nome, interesse e data de chegada, com WhatsApp de primeiro contato; "Ver todos" → `/crm/leads?status=new`.
  - Encomendas sem estoque: produto e quantidade que falta, com "Criar pedido de reposição" → `/crm/orders/new` e "Ver produtos" → `/crm/products?lowStock=true`.
  - Aniversariantes: nome e dia ("hoje" ou data), com "Dar parabéns no WhatsApp" e link para a cliente.
  - Seção sem itens não aparece; se todas estiverem vazias, o bloco mostra um único estado "Tudo em dia por hoje" com atalho "Registrar venda".
- **RF-21 — Seletor de período.** Atalhos **Este mês**, **Mês passado**, **Este ano**, **Tudo** e **Personalizado** (dois campos de mês De/Até enviados por GET; De > Até é trocado pela web). Setas ‹ › só em `month` (mês anterior/seguinte) e `year` (ano anterior/seguinte); "seguinte" desabilitada no mês/ano corrente e "anterior" desabilitada em 2015-01/2015; `range` e `all` não têm setas. O período vive na URL (`/crm?period=…`); parâmetros inválidos caem no mês corrente e mês/ano futuro é limitado ao corrente, sem erro. O rótulo do período e da comparação aparecem por extenso (ex.: "setembro de 2026 (até dia 23)", "comparado com 1–23 de agosto").
- **RF-22 — Cartões do Desempenho.** Vendido (com nº de vendas), Recebido, Lucro estimado (com margem %) e Ticket médio (com clientes atendidas), cada um com a variação (RF-06) contra a comparação e **clicável**: Vendido, Lucro e Ticket → `/crm/sales?status=sold&soldFrom=<startDate>&soldTo=<endDate>`; Recebido → `/crm/sales/receivables?pending=false&paidFrom=<startDate>&paidTo=<endDate>`. A variação é comunicada em texto ("▲ 12% vs agosto"); cor é só reforço. Lucro negativo aparece com sinal. Período sem movimento: cartões mostram R$ 0,00, ticket/margem "—" e um atalho "Registrar venda".
- **RF-23 — Gráfico de 12 meses.** Barras do Vendido por mês (série do RF-11), com o Lucro indicado em cada barra, os meses do período selecionado destacados e cada barra como link para aquele mês (`?period=month&month=yyyy-mm`; barras de meses anteriores a 2015-01 não são link). Acessível: cada barra tem rótulo com mês, Vendido e Lucro por extenso. Série toda zerada ⇒ o gráfico dá lugar ao texto "Nenhuma venda nos últimos 12 meses". Sem nova dependência de biblioteca de gráficos.
- **RF-24 — Meta e rankings.** Cartão de meta conforme o RF-10 (edição pela Server Action existente, adaptada ao novo retorno); listas "Mais vendidos" e "Melhores clientes" do período (RF-11), cada item com link para o produto/cliente quando existir. Ranking vazio ⇒ "Nenhuma venda neste período".
- **Números sem drill-down (explícito)**: "clientes atendidas" (não há lista de clientes por período) e a margem % (derivada do Lucro e do Vendido, que já têm destino). Todos os demais números da home têm destino definido neste RF-20..RF-25.
- **RF-25 — Bloco Posição agora.** A receber (total pendente) com "em atraso" (valor e nº de parcelas) e Estoque (capital parado a custo, valor de venda e nº de produtos com estoque baixo), reusando `GET /receivables/summary` e `GET /products/summary`, com links para `/crm/sales/receivables`, `?overdue=true`, `/crm/products` e `/crm/products?lowStock=true`.

### G. Transversais

- **RF-26 — Segurança e LGPD.** Todas as rotas novas autenticadas pelo guard default-deny (nenhuma rota pública nova); `consultantId` sempre do token. WhatsApp e nomes só trafegam API → servidor web e viram link `wa.me`; nenhum dado pessoal em log. Leads seguem sem escopo por consultora (drift aceito do `04-domain-model.md`).
- **RF-27 — Limites e desempenho.** Todas as listas do painel têm limite fixo (5; aniversariantes 20); nenhuma consulta do painel sem limite; nenhum N+1. Índice `(consultant_id, sold_at)` em `sales` para os recortes por período.

## Critérios de Aceite

### Período e fuso
- [ ] (RF-01) Unidade (shared): cada `period` aceita seus parâmetros e rejeita os alheios; `from`/`to` obrigatórios em `range`; mês fora do formato rejeitado; mensagens pt-BR inclusive `{}`/campo ausente.
- [ ] (RF-02) Unidade: mês corrente ⇒ `inProgress` com `endDate = hoje`; mês passado ⇒ último dia do mês; `year` corrente limitado ao mês corrente; `all` começa em 2015-01; mês futuro, anterior a 2015-01 e `from > to` ⇒ erro.
- [ ] (RF-03) Unidade: 1 mês em andamento (23/09 ⇒ 1–23/08); 1 mês fechado; 31/03 ⇒ comparação 1–28/02 (e 29/02 em ano bissexto); ano corrente até hoje ⇒ mesmo trecho do ano anterior, **inclusive em janeiro** (15/01 ⇒ 1–15/01 do ano anterior, não dezembro); `range` de 1 mês ⇒ mês anterior; intervalo de 3 meses ⇒ os mesmos 3 meses do ano anterior; intervalo de 13 meses e `all` ⇒ sem comparação.
- [ ] (RF-04) Integração com relógio fixo: venda com `sold_at = 2026-08-31T23:30-03:00` conta em **agosto**, não em setembro; parcela com vencimento hoje **não** está atrasada às 22h locais (`01:00Z` do dia seguinte) — tanto no painel quanto em `GET /receivables/summary`, na listagem de cobranças e no detalhe da venda; no dia seguinte está atrasada. Revisão confirma ausência de `CURRENT_DATE`/`now()`/`date_trunc`/`AT TIME ZONE` nos repositórios `dashboard` e `sales` para esses recortes.

### Semântica
- [ ] (RF-05) Integração: venda aberta não entregue, venda aberta entregue com parcela pendente e venda concluída entram em Vendido e Lucro; cancelada não entra; excluída não entra; Recebido soma só cobranças com `paid_at` no período (inclui parcela paga de venda aberta e exclui baixa fora do período); `clientsCount` conta clientes distintas e ignora venda sem cliente; lucro negativo serializa; escopo por consultora (dados de outra consultora ausentes).
- [ ] (RF-06) Unidade: ticket e margem com zero; variação com anterior 0, ambos 0, anterior negativo, queda e alta; arredondamentos conforme o RF.

### Meta
- [ ] (RF-07) Integração: meta de setembro vale em outubro sem linha própria; linha `null` em novembro remove a partir de novembro; mês anterior à primeira linha ⇒ sem meta; unicidade (consultora, mês) garantida pelo banco.
- [ ] (RF-08) Integração de migração: consultora com `monthly_goal_cents` preenchido antes da migração ganha uma linha no mês local da execução (mês esperado calculado pelo `now()` do **mesmo** container, não pelo relógio do JS — evita falso negativo na virada do mês); consultora sem meta não ganha linha; as migrações aplicam em sequência sobre dados no formato anterior.
- [ ] (RF-09) Integração: `PUT` grava o mês corrente pelo relógio do servidor (virada de mês às 23h locais continua no mês local); segundo `PUT` no mesmo mês atualiza (não duplica); `null` remove; teto/zero/negativo ⇒ 422 pt-BR; 401 sem sessão.
- [ ] (RF-10) Unidade do ritmo: faltando valor, meta batida (mostra excedente), último dia do mês (1 dia restante), meta ausente; integração: `goal` presente só em `kind = month`, com `explicit`/herdada/sem meta corretos.

### API
- [ ] (RF-11) Integração com dados conhecidos: `current` e `previous` exatos; mês futuro ⇒ 422 `VALIDATION_ERROR` via `InvalidDashboardPeriodError` (nunca 500); `series` com 12 meses em ordem e zeros nos vazios; top produtos com agrupamento por produto, produto excluído agrupado pelo snapshot, limite 5 e desempates; top clientes sem venda anônima, limite 5 e desempates; 422 para período inválido; 401.
- [ ] (RF-12) Integração com relógio fixo: grupos de cobrança por cliente (duas parcelas da mesma cliente ⇒ 1 grupo), venda sem cliente ⇒ grupo por venda sem WhatsApp, contagens de atrasadas/hoje/7 dias, cobrança `on_delivery` fora; compromissos de hoje só `scheduled` e dentro do dia local, com WhatsApp da cliente ou do lead; entregas pendentes excluem entregues e canceladas; leads só `new`; encomendas sem estoque só com disponível negativo por reserva (produto com estoque 0 sem reserva **não** aparece), com `missingQty` correto; aniversariantes na janela de 8 dias, atravessando o ano (27/12 ⇒ 03/01) e 29/02 em ano não bissexto ⇒ 28/02; todos os limites respeitados.
- [ ] (RF-13) Busca no código: nenhuma referência a `/dashboard/summary`, `dashboardSummarySchema`, `getDashboardSummary`, `openSalesCents` ou "Previsto para receber".

### Listagens
- [ ] (RF-14) Integração: `soldFrom`/`soldTo` inclusivos nas bordas do dia local; cada um isolado; `status=sold` exclui canceladas; `delivery=pending` exclui entregues; `soldFrom > soldTo` ⇒ 422; **invariante** soma/contagem da listagem = `soldCents`/`soldCount` do painel para o mesmo período.
- [ ] (RF-15) Integração: `overdue=true` só atrasadas (fuso local); `paidFrom`/`paidTo` só pagas no intervalo, em `paid_at` desc; combinações inválidas ⇒ 422; **invariante** soma = `receivedCents`.
- [ ] (RF-16/RF-17) Unidade dos helpers web de URL e de estado (abas e paginação preservam filtros; parâmetros inválidos caem no default; De > Até trocado; contagem exibida só com filtro ativo; vazio de filtro × vazio sem filtro) + QA de runtime nas duas telas.

### Web
- [ ] (RF-18) Revisão: três `Suspense` independentes, helpers que nunca lançam, erro por bloco com retry, chamadas em paralelo. QA de runtime em build de produção: a home carrega com dados reais criados pela UI e em 375px sem rolagem horizontal.
- [ ] (RF-19) Unidade: cada variante de mensagem igual ao texto exato do RF-19 (incluindo nome vazio ⇒ "Olá!" e cobrança sem data ⇒ sem mensagem); número inválido ⇒ `null`.
- [ ] (RF-20a) Unidade de um helper puro que monta os cartões-resumo a partir do `DashboardToday` (número, linha de resumo, href com âncora, tom de atraso, cartões vazios omitidos, estado "Tudo em dia"); QA de runtime em 375px: cartões em 2 colunas, sem listas, sem rolagem horizontal, Desempenho acima do Hoje.
- [ ] (RF-28) QA de runtime: `/crm/today` exibe as seções completas com WhatsApp; cada cartão da home leva à âncora certa; erro isolado por seção.
- [ ] (RF-20) Unidade dos helpers que decidem seções visíveis (inclui Cobranças só com "próximos 7 dias"), estado "Tudo em dia" e hrefs ("Ver todos", grupo com cliente ⇒ vendas em aberto da cliente, grupo sem cliente ⇒ venda); QA de runtime com pelo menos um item de cada seção.
- [ ] (RF-21) Unidade: parsing dos `searchParams` (inválido ⇒ mês corrente; futuro limitado ao corrente; De > Até trocado), hrefs dos atalhos e das setas (seguinte desabilitada no corrente, anterior desabilitada em 2015-01/2015, sem setas em `range`/`all`), rótulos por extenso do período e da comparação.
- [ ] (RF-22) Unidade: hrefs de drill-down a partir do período resolvido; texto da variação (alta, queda, sem base, sem movimento). QA de runtime: clicar em Vendido leva à lista cuja contagem bate com o cartão.
- [ ] (RF-23) Unidade: altura relativa das barras (máximo = 100%, zero sem barra), rótulo acessível por barra, destaque dos meses do período, barra antes de 2015-01 sem link e série zerada ⇒ estado vazio; QA visual em 375px.
- [ ] (RF-24) QA de runtime: definir, editar e remover a meta no mês corrente; mês passado sem botão de edição; ranking com links.
- [ ] (RF-25) QA de runtime: valores do bloco batem com `/crm/sales` e `/crm/products`.
- [ ] (RF-26) Revisão: nenhuma rota pública nova; nenhum dado pessoal em log.
- [ ] (RF-27) Revisão: limites presentes em todas as queries do painel; índice criado na migração.

## Fora de Escopo

- Lembretes de recompra (REL-02) e leads parados (REL-04) — entram no bloco Hoje quando existirem; marcar lead como contatado ou dar baixa de pagamento **dentro** da home (a home leva à tela que já faz isso).
- Editar meta de mês passado ou futuro; meta de intervalo de meses; comissão/nível Mary Kay (MKT-04).
- Datar a baixa de pagamento pela usuária (o Recebido usa o instante em que a baixa foi registrada — ADR-0025 já adiou isso).
- Remover a coluna `consultants.monthly_goal_cents` (contração futura — known-issue).
- Relatórios completos (lucro por produto, listas sem limite, exportação) — MKT-02.
- Personalizar/reordenar blocos, notificações push, checklist com conclusão ("My 6 Things"), gestos de deslizar.
- Chave Pix na mensagem de cobrança (não existe o dado).
- Escopo de leads por consultora (drift do multi-tenant).
- Soma em R$ exibida na listagem de vendas filtrada (a lista mostra a contagem — RF-16; a soma está no cartão).
- Lista de aniversariantes do **mês inteiro** (o Hoje cobre a janela de hoje a hoje + 7; o restante do REL-03 fica no roadmap).
- Lista de clientes atendidas por período (o número aparece sem drill-down).
- E2E (REL-01) — pendência explícita no handoff.

## Restrições Conhecidas

- **Números mudam no deploy**: o antigo "Vendas do mês" (só concluídas) vira Vendido (inclui abertas); a meta passa a medir o Vendido; o "atrasado" deixa de virar às 21h. O humano decidiu isso em 2026-09-23 — registrar no ADR novo e no handoff.
- O Vendido de um mês passado **diminui** se uma venda for cancelada ou excluída depois; deixa de aumentar quando uma venda antiga é quitada (efeito colateral do ADR-0025 que desaparece).
- Recebido depende de quando a baixa foi registrada no sistema; baixa atrasada no app desloca o recebimento de mês.
- Há dados reais em produção: as migrações são aditivas (tabela + índice + backfill); sem backup externo (LP-13), o `pg_dump` pré-deploy do INF-07 é a rede de segurança.
- Sem jsdom: critério de UI vira helper puro testável + QA de runtime em build de produção (lessons).
