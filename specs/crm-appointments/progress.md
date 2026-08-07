---
feature: Agenda de compromissos
module: appointments
phase: handoff
status: completed
updated: 2026-08-06
---

# Progress: Agenda de compromissos

**Status:** completed
**Current Phase:** handoff
**Current Task:** — (aguardando revisão e commit do humano)

> Spec **APROVADA** na rodada 3 de revisão neutra de spec (rodadas 1 e 2 reprovaram; 4 CRÍTICOs corrigidos).
> Implementação **APROVADA** na rodada 3 de QA neutra (rodadas 1 e 2 reprovaram; 2 CRÍTICOs corrigidos).
> Estado final: **1119 testes verdes**, lint/typecheck/build limpos, runtime validado em build de produção.

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-08-05 | intake | Antecipar a agenda: MKT-03 (Fase 4) vira **REL-06** (Fase 3), antes do REL-05 | A central "com quem falar hoje" precisa agregar os compromissos do dia; e a isca da landing (análise de pele grátis) já promete um encontro que hoje não tem onde ser registrado. Aprovado pelo humano |
| 2026-08-05 | spec | Compromisso aceita **lead** além de cliente (`lead_id`) | Pedido explícito do humano. Fecha o funil landing → lead → sessão → conversão; sem isso a isca não tem registro no CRM |
| 2026-08-05 | spec | Vínculo com **venda** (`sale_id`) entra na v1 | Pedido explícito do humano. É a única métrica de retorno da agenda ("essa sessão virou venda?") |
| 2026-08-05 | spec | **Sem** CHECK de exclusividade cliente×lead no banco; regra fica no contrato Zod | A conversão de lead (RF-12) produz legitimamente o estado com as duas FKs preenchidas; um CHECK impediria a propagação. Leitura resolve por precedência (cliente > lead) |
| 2026-08-05 | spec | Sem snapshot de nome/WhatsApp; derivar por LEFT JOIN | ADR-0016 aplicado direto: compromisso não é registro financeiro, logo não há fundamento para reter dado pessoal após exclusão |
| 2026-08-05 | spec | ~~Fuso da aplicação = `America/Sao_Paulo`, com recorte de dia via `AT TIME ZONE` no SQL~~ — **substituída** pela decisão de 2026-08-05 (rev. 1) que move o recorte para TS; o fuso em si permanece | O recorte UTC do dashboard (ADR-0014) jogaria um compromisso das 20h para o dia seguinte. `CURRENT_DATE`/`date_trunc(now())` dependem do TZ da sessão Postgres, hoje indefinido (known-issue). Gera ADR-0018 |
| 2026-08-05 | spec | Dashboard **permanece** em mês UTC nesta entrega | Mudar o recorte alteraria números de uma feature já entregue; divergência assumida e registrada em known-issues |
| 2026-08-05 | spec | Conflito de horário **avisa e não bloqueia**, via `GET /appointments/conflicts` consultado antes de salvar | Decisão de design do agente (**não** foi pedido explícito do humano — corrigido na rev. 3), aprovada junto do escopo. Endpoint dedicado mantém o contrato de POST/PUT limpo e permite avisar antes do envio. **É o primeiro candidato a corte** se o teto de rodadas de QA for ameaçado |
| 2026-08-05 | spec | Intervalos semiabertos `[início, fim)` — encostar não é conflito | Dois atendimentos seguidos são o caso comum, não um erro |
| 2026-08-05 | spec | `DELETE` coexiste com `cancel` | Semânticas distintas: cancelar é fato do relacionamento; excluir é corrigir engano de digitação |
| 2026-08-05 | spec | Vínculo de venda em endpoint próprio (`PUT /:id/sale`), válido em `scheduled` e `done` | O `PUT` geral é bloqueado em status terminal (RF-07), mas o fluxo real de vincular venda acontece **depois** de concluir |
| 2026-08-05 | spec | Sem notificação própria: WhatsApp pré-preenchido + link do Google Agenda | O projeto não tem canal de push/e-mail/WhatsApp API (ideia estacionada em `03-features.md`); delegar ao celular é o que cabe no porte |
| 2026-08-05 | spec | Vista em **lista agrupada por dia**, não grade de mês | Mobile-first obrigatório (`web.md`): grade de mês é inutilizável a ~375px |
| 2026-08-05 | spec | E2E declarado como **pendência**, não simulado | Infra Playwright não existe (known-issue, REL-01); `spec-format.md` exige registrar sem fingir cobertura |
| 2026-08-05 | spec (rev. 1) | Validar **existência e posse** de `clientId`/`leadId` antes de persistir (422, mensagem única) | Achado CRÍTICO da revisão neutra: sem isso, uuid inexistente vira violação de FK ⇒ 500, e uuid de outra consultora seria gravado (vazamento de escopo). `orders`/`sales` já têm essa invariante (`InvalidOrderClientError`) |
| 2026-08-05 | spec (rev. 1) | `upcoming` passa a começar no **início do dia local** e nasce o recorte **`pending`** (vencido + `scheduled`) | Achado CRÍTICO: com `starts_at >= now()`, o encontro das 9h sumia da aba padrão às 9h01 — exatamente quando a consultora vai registrar o desfecho, que é o loop central da feature |
| 2026-08-05 | spec (rev. 1) | Helper `appLocalDateTimeToUtc` fecha o **caminho de escrita** do fuso | Achado CRÍTICO: o formulário é client component; `new Date("2026-08-05T20:00")` usa o fuso do dispositivo — gravaria o instante errado fora do BRT, sem nenhum teste de leitura detectar |
| 2026-08-05 | spec (rev. 1) | Recorte de dia calculado **em TS** (bounds `[startUtc, endUtc)` passados ao repository), não com `AT TIME ZONE` no SQL — **substitui** a decisão de fuso registrada acima | Evita segunda fonte de verdade do fuso e mantém a comparação sargável — `(starts_at AT TIME ZONE …)::date` descartaria o índice `(consultant_id, starts_at)` |
| 2026-08-05 | spec (rev. 1) | ~~Concorrência `done ‖ linkSale` aceita como história serial legal; `cancel ‖ linkSale` é serializada~~ — **incorreta, corrigida na rev. 2** | A afirmação de que `cancel ‖ linkSale` seria serializada só valia numa das ordens de lock (ver rev. 2) |
| 2026-08-05 | spec (rev. 2) | Concorrência resolvida pelo **desenho do estado**, não pelo lock: `cancel`/`no_show` limpam `sale_id`; `done` preserva o vínculo. Testes assertam **estado final**, não par de códigos HTTP (RF-08.1) | Achado CRÍTICO da rodada 2: se o `linkSale` (que não altera `status`) commitar primeiro, o `cancel` bloqueado reavalia e ainda vê `scheduled` — aplica também, e **as duas** requisições retornam 200 (EvalPlanQual, lesson 2026-07-20, na direção inversa da analisada). Assertar "exatamente uma 200" seria teste flaky ~50%; com a limpeza de `sale_id` na transição, qualquer ordem termina na invariante "encontro não realizado não tem venda" |
| 2026-08-05 | spec (rev. 2) | `PUT /:id` aceita **só `notes`** em status terminal | Registrar o que aconteceu é parte do desfecho prometido no "O Que"; travar o `PUT` inteiro deixava a observação sem caminho após concluir |
| 2026-08-05 | spec (rev. 2) | `done` sem `saleId` **preserva** vínculo anterior; `saleId: null` não é aceito nesse endpoint | Comportamento antes indefinido — o UPDATE da transição poderia apagar em silêncio um vínculo feito enquanto `scheduled` |
| 2026-08-05 | spec (rev. 2) | Técnica do fuso fixada no plan (duas passadas com `Intl`, regra de desempate para hora ambígua/inexistente) + teste com data de 2018 | Sem a técnica declarada, a implementação nasceria com offset fixo `-03:00` ou `new Date` local; os testes de 2026 não pegariam (Brasil teve DST até 2019 e o RF-04 permite registro retroativo) |
| 2026-08-05 | spec (rev. 2) | Aba "Próximos" filtra `status=scheduled`; conflitos ordenados por `starts_at` antes do corte de 20 | Compromisso futuro cancelado poluía a agenda; truncar sem ordenar podia omitir justamente o conflito mais próximo |
| 2026-08-05 | spec (rev. 3) | Recorte `past` **substituído** por `history` (`status != scheduled`, qualquer data); as três abas viram **partição** | Achado da rodada 3: com `past` = "dias anteriores", um compromisso de hoje concluído às 10h sumia das três abas até o dia seguinte — justamente o caso do `PUT /:id/sale` em `done` ("concluí de manhã, vendi à tarde") |
| 2026-08-05 | spec (rev. 3) | A compatibilidade cliente×venda do RF-10 é **invariante**, não validação de um endpoint: trocar `clientId` com venda de outra cliente ⇒ 422 | O `PUT` permitia chegar, sem concorrência alguma, ao estado que o 422 do RF-10 existe para impedir |
| 2026-08-05 | spec (rev. 3) | A conversão de lead (RF-12) **não** revalida `sale_id` pré-existente | Revalidar faria a conversão de lead falhar por causa de um vínculo antigo; preservar é a escolha menos destrutiva. Limitação declarada na spec |
| 2026-08-05 | spec (rev. 3) | Item de listagem **não** trafega WhatsApp; 4 índices em vez de 5; precedência cliente>lead em `resolveAppointmentPerson` (fonte única) | Minimização de dado pessoal (`security.md`); o índice composto já cobre o simples por prefixo (`database.md`); precedência estava prestes a ser reimplementada no card |
| 2026-08-06 | qa (rev. 1) | **Novo endpoint `GET /leads/:id`** (service + rota + `getLead` no web) — superfície além da spec | A pré-seleção de lead em `/crm/appointments/new` resolvia o nome com a 1ª página de `listLeads` (20 itens) e pré-selecionava id inexistente sem validar. Buscar por id é o caminho correto; o endpoint segue o padrão de `GET /clients/:id` (autenticado, 404 idêntico para inexistente e malformado). Validado pela QA da rodada 2 |
| 2026-08-06 | qa (rev. 2) | `defaultValues` do formulário carregam **só a pessoa vencedora** (`resolveAppointmentPerson`); o estado real das duas FKs vive em `initialPerson`, usado no diff do payload | Aplicar o `superRefine` de exclusividade sem projetar os defaults fez o resolver rejeitar o próprio estado inicial: `handleSubmit` abortava e a edição falhava **em silêncio**. A projeção resolve na origem e, de quebra, faz a troca de cliente preservar o `lead_id` |
| 2026-08-06 | qa (pós-aprovação) | Desvínculo total explícito envia `clientId: null` **e** `leadId: null`; o diff campo-a-campo vale só para os demais casos | Com `initialPerson` projetado, "Remover pessoa" num compromisso pós-conversão comparava `null === null` para o lead, omitia a chave e o `lead_id` sobrevivia — a pessoa reaparecia. Corrigido **após** o veredito APROVADO, com teste de unidade e suíte/build verdes, mas **sem** nova rodada completa de runtime |
| 2026-08-05 | spec (rev. 3) | Leitura cross-tabela no repositório de `appointments` (`findClientById`, `findLeadById`, `findLinkableSale`) segue o **precedente do codebase**, não o texto literal de `api.md` ("usa o service do outro módulo por injeção") | `orders` e `dashboard` já fazem assim (porta + query escopada). Divergência assumida e registrada aqui em vez de ficar implícita; se virar padrão, atualizar a rule |
| 2026-08-05 | spec (rev. 1) | `PUT /:id` **preserva** FKs de pessoa omitidas; `null` explícito desvincula | Sem isso, editar o local de um compromisso pós-conversão apagaria em silêncio o `lead_id` que o RF-12 preservou |
| 2026-08-05 | spec (rev. 1) | `GET /leads` ganha `?search` (RF-14) | O seletor de lead do formulário paginaria às cegas; `GET /clients` já tem o padrão. É a pessoa que a consultora mais agenda (isca da landing) |
| 2026-08-05 | spec (rev. 1) | Conflitos limitados a **20** itens | `api.md` proíbe listagem sem limite; paginar um aviso seria exagero |
| 2026-08-05 | spec (rev. 1) | Venda **sem cliente** é vinculável; compromisso sem cliente aceita qualquer venda `completed` | `sales.client_id` é nullable (ADR-0013) e a regra original só previa "cliente diferente" — caso indefinido viraria decisão do implementador |
| 2026-08-05 | spec (rev. 1) | ADR-0018 escrito no **Milestone 1**, não no fechamento | A decisão de fuso governa M1–M7 e diverge de consequência declarada do ADR-0014 aceito; registrar depois seria racionalizar o já feito |
| 2026-08-05 | spec (rev. 1) | Rótulo "Esta semana" → **"Próximos 7 dias"** | Em pt-BR "esta semana" sugere semana civil; numa quinta-feira o grupo mostraria dias da semana seguinte |
| 2026-08-05 | spec (rev. 1) | **Recusada** a sugestão de partir em REL-06a/REL-06b | O humano pediu explicitamente lead + WhatsApp/Google Agenda + vínculo de venda na v1; entregar a UI sem o vínculo devolveria meia feature. Mitigação é o fatiamento em 8 milestones com checkpoint, e escalar se o teto de QA for atingido |

| 2026-08-06 | incremento | Cadastro rápido de pessoa no formulário (cliente **ou** lead, escolha da consultora) + botão de conversão no compromisso | Teste manual do humano expôs a lacuna: só dava para vincular pessoa já existente. O formulário de pedidos (CRM-10) já resolvia isso — a agenda ficou inconsistente, e aqui o caso é mais forte (marcar a sessão durante a conversa) |
| 2026-08-06 | incremento | Lead criado pelo CRM grava `consent_at = agora` e `source = "crm_manual"` (ADR-0020) | `leads.consent_at` é NOT NULL e nasceu do checkbox da landing. Tornar nulável exigiria migração afrouxando constraint em tabela com dados de produção; `source` distinto mantém as duas origens auditáveis |
| 2026-08-06 | incremento | Caminho da rota vira **`POST /leads/manual`**, não `POST /leads` | Achado do implementer: dois plugins Elysia com o mesmo par (método, caminho) não dão erro — o último `.use()` vence para tudo. `POST /leads` no CRM apagaria em silêncio a captura pública da landing. Graduado para `lessons.md` |
| 2026-08-06 | incremento (QA) | **Proibido reexportar Server Action entre módulos** — declarar action próprio que delega | CRÍTICO da QA: `export { quickCreateClientAction } from "orders/actions"` apagava do server-reference-manifest **todas** as actions da agenda (8 ids em vez de 22), fazendo cada ação responder `404 Server action not found` **só no build de produção**. Lint, typecheck, 1119 testes e `next build` ficaram verdes; `next dev` mascarava. Graduado para `lessons.md`; gate mecânico virou INF-08 |

## Milestones
<!-- Espelho do tasks.md — checkbox lá é a fonte de verdade -->

- [x] Milestone 1: Decisão de fuso e contrato compartilhado
- [x] Milestone 2: Banco
- [x] Milestone 3: API — módulo `appointments`
- [x] Milestone 4: Módulo de leads (propagação na conversão — RF-12; busca textual — RF-14)
- [x] Milestone 5: Web — camada de dados e ações
- [x] Milestone 6: Web — telas da agenda
- [x] Milestone 7: Pontos de entrada em clientes e leads
- [x] Milestone 8: Memória e validação final
- [x] Milestone 9: Cadastro rápido de pessoa (incremento pós-QA)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-08-05 | 1 | intake | Roadmap saneado (7 itens `[R]` → `[x]`, verificados no git); MKT-03 movido para REL-06; branch `feature/crm-appointments` criada | Os itens da Fase 2 já estavam commitados em `59929fe`; os marcadores é que estavam desatualizados |
| 2026-08-05 | 1 | spec | Pesquisa read-only (API + Web), `spec.md` (19 RFs), `research.md`, `plan.md`, `tasks.md` escritos | Gap central descoberto: o projeto não tem **nenhuma** configuração de fuso — a agenda é a primeira feature em que a borda do dia importa |
| 2026-08-05 | 1 | spec | Rodada 1 de revisão neutra: REPROVADO com 3 CRÍTICOs (validação de posse de pessoa; compromisso vencido sem caminho de desfecho; caminho de escrita do fuso). Corrigido, RFs renumerados para 22 | Revisão também derrubou o `AT TIME ZONE` no SQL (segunda fonte de verdade + índice descartado) |
| 2026-08-05 | 1 | spec | Rodada 2 de revisão neutra (verifier novo): REPROVADO com 1 CRÍTICO — análise de concorrência `cancel ‖ linkSale` estava errada em uma das ordens de lock. Corrigido com RF-08.1 + invariante de limpeza de `sale_id` | As 5 afirmações de fato sobre o codebase foram verificadas pelo revisor e conferem. Primeira tentativa da rodada 2 morreu por limite de sessão e foi refeita |

## Session Log (continuação — implementação e QA)

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-08-05 | 1 | implement | M1 (fuso + contratos, ADR-0018) → M2 (schema + migração 0009) → M3 (módulo API completo, 69 testes de integração) → M4 (leads: propagação na conversão + busca) | Suíte saiu de 872 → 989 testes sem regressão |
| 2026-08-05 | 1 | implement | M5 (client tipado, helpers de WhatsApp/Google Agenda, Server Actions) → M6 (lista com 3 abas, formulário, detalhe, nav) → M7 (ficha da cliente + card de lead) | Nav mobile com 7 itens verificada a 375px: cabe sem overflow |
| 2026-08-05 | 1 | qa | Rodada 1: REPROVADO — CRÍTICO de edição pós-conversão (payload sempre enviava as duas FKs) + 3 ALERTAS. Corrigido | O CRÍTICO só apareceu em **runtime**; 1057 testes verdes não o pegaram |
| 2026-08-06 | 1 | qa | Rodada 2: REPROVADO — a correção da rodada 1 transformou o defeito em **falha silenciosa** (o `superRefine` rejeitava os próprios `defaultValues`, `handleSubmit` abortava sem erro visível). Corrigido projetando só a pessoa vencedora | Segunda vez que o mesmo caminho escapou: a lacuna é a fiação React sem teste (known-issue, REL-01) |
| 2026-08-06 | 1 | qa | Rodada 3: **APROVADO** — 1082 testes, runtime provado (edição pós-conversão persiste com as duas FKs preservadas). 3 ALERTAS residuais | Concorrência RF-08.1 rodada 3× sem flake |
| 2026-08-06 | 1 | qa | Pós-aprovação: corrigido o ALERTA de "Remover pessoa" não desvincular em compromisso pós-conversão (+2 testes) | 1084 testes; validado por unidade + suíte + build, **sem** nova rodada completa de runtime |
| 2026-08-06 | 1 | graduate | ADR-0018 (escrito no M1); `04-domain-model.md` (entidade + invariantes 7–9 + relações); `known-issues.md` (2 entradas); `lessons.md` (EvalPlanQual na ordem inversa); REL-06 → `[R]` | — |
| 2026-08-06 | 1 | implement | Incremento pós-QA (M9): `POST /leads/manual` autenticado, cadastro rápido cliente/lead no seletor, botão "Converter em cliente" no detalhe | Colisão de rota no Elysia pega pelo implementer antes de causar dano |
| 2026-08-06 | 1 | qa | Rodada 1 do incremento: REPROVADO — CRÍTICO do reexport de Server Action. Corrigido e provado em standalone (manifest 8 → 22 ids) | Nenhum gate automatizado pegava; só runtime no artefato de produção |
| 2026-08-06 | 1 | qa | Rodada 2 do incremento: **APROVADO** — 1119 testes, runtime reproduzido de forma independente (ações reais, efeitos conferidos no banco, captura pública da landing intacta) | Follow-ups: INF-08 (gate contra reexport) e REL-08 (duplicidade por WhatsApp) |
