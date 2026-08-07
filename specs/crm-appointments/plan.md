---
feature: Agenda de compromissos
module: appointments
phase: plan
status: draft
created: 2026-08-05
updated: 2026-08-05
depends_on: [spec.md, research.md]
---

# Plan: Agenda de compromissos

> Rodada 1 de revisão neutra aplicada em 2026-08-05.

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| **Fuso de referência da aplicação = `America/Sao_Paulo`**, em constante única `APP_TIME_ZONE` em `packages/shared` (**ADR-0018**, escrito no Milestone 1) | A agenda é a primeira feature em que a borda do dia é semanticamente relevante: às 20h BRT o compromisso ainda é "hoje". O precedente do dashboard (mês UTC, ADR-0014) produziria "amanhã" a partir das 21h BRT. O ADR nasce **antes** da implementação porque M1–M7 dependem dele e ele diverge de uma consequência declarada de um ADR aceito |
| **Uma única implementação do recorte de dia, em TypeScript**: o service converte `range`/`date` em `[startUtc, endUtc)` com `appLocalDayRangeUtc` e passa os **bounds** ao repository, que compara `starts_at` com instantes | Evita a segunda fonte de verdade que um `(starts_at AT TIME ZONE …)::date` no SQL criaria, e mantém a comparação **sargável** — usa o índice `(consultant_id, starts_at)`, que um `::date` sobre a coluna descartaria. Também elimina a dependência do `TimeZone` da sessão Postgres (known-issue aberta) |
| **Instante em `timestamptz` (UTC); contrato em ISO 8601 UTC**; fuso só na apresentação e nos recortes | Mantém o padrão de todas as tabelas do projeto. Formatação pt-BR fica no web (`Intl` com `timeZone: APP_TIME_ZONE`) |
| **Helper de escrita `appLocalDateTimeToUtc(dateIso, timeHm)`** no shared, usado pelo formulário | `new Date("2026-08-05T20:00")` usa o fuso do **dispositivo**: num celular fora do BRT o compromisso seria gravado no instante errado, e nenhum teste de leitura pegaria. O helper fecha o caminho de escrita com a mesma constante do de leitura |
| **`upcoming` começa no início do dia local**, e existe o recorte **`pending`** (`starts_at < hoje` **e** `status=scheduled`) | Com `starts_at >= now()`, o encontro das 9h sumiria da aba padrão às 9h01 — justamente quando a consultora vai registrar o desfecho, que é o loop central da feature. `pending` dá caminho para o que passou sem fechamento, sem inventar mudança automática de status |
| **`duration_minutes` em vez de `ends_at`** | Um campo derivável a menos; impossível gravar fim antes do início. Fim é calculado onde precisa (conflito, Google Agenda) |
| **Sem CHECK de exclusividade cliente×lead no banco; a regra vive no contrato Zod** | A conversão de lead (RF-12) precisa exatamente do estado "os dois preenchidos"; um CHECK impediria a propagação. A ambiguidade de leitura é resolvida por regra explícita: cliente tem precedência. O contrato expõe os campos crus (`clientName`/`leadName`) e a precedência vive **uma única vez** em `resolveAppointmentPerson`, função pura do shared consumida pelo web — nunca reimplementada por componente |
| **Campos de pessoa no `PUT` são opcionais e preservados quando omitidos** (`null` explícito desvincula) | Sem isso, editar o local de um compromisso pós-conversão apagaria silenciosamente o `lead_id` que o RF-12 acabou de preservar |
| **Validar existência e posse de `clientId`/`leadId` antes de persistir**, com erro de domínio → 422 | É a invariante que `orders.service.ts` e `sales.service.ts` já estabeleceram (`InvalidOrderClientError`/`InvalidSaleClientError`): sem ela, uuid inexistente vira violação de FK ⇒ 500 genérico, e uuid de outra consultora seria gravado — vazamento de escopo que o ADR-0012 e `api.md` proíbem. Mensagem única para inexistente e alheio, para não revelar existência |
| **Sem snapshot de nome/WhatsApp** — derivar por LEFT JOIN | ADR-0016 direto: compromisso não é registro financeiro; não há fundamento para reter dado pessoal após exclusão |
| **Transições por endpoints explícitos** (`/done`, `/no-show`, `/cancel`) com UPDATE condicional `status='scheduled'` | Padrão ADR-0015. Entre as três há exclusividade real sob concorrência (todas exigem `scheduled`, todas o consomem), então a armadilha do EvalPlanQual (lesson 2026-07-20) não se aplica — e o teste de concorrência prova |
| **Concorrência entre guards diferentes — análise por ordem de lock** (RF-08.1). O `linkSale` guarda `status IN ('scheduled','done')` e **não altera** `status`; as transições guardam `status='scheduled'`. Sob `READ COMMITTED`, quem perde o lock **reavalia** o predicado contra a linha commitada (EvalPlanQual), então o resultado depende da ordem: se o `linkSale` commita primeiro, o `cancel` bloqueado ainda vê `scheduled` e **também** aplica — as duas requisições retornam 200. Portanto **não** há exclusividade nesses pares, e o contrato passa a ser "história serial legal + invariante preservada", não "exatamente uma vence" | A garantia é obtida pelo **desenho do estado**, não pelo lock: `cancel`/`no_show` **limpam `sale_id`** na mesma transação, então qualquer ordem termina em terminal-sem-venda; `done` **preserva** o vínculo, então qualquer ordem termina em `done`-com-venda. O estado ilegal ("não realizado com venda") deixa de ser alcançável sem precisar de `SELECT … FOR UPDATE`. Mesmo espírito do ADR-0015 §3: exclusividade estrita só onde há efeito colateral. Todos os pares (`cancel‖linkSale`, `no_show‖linkSale`, `done‖linkSale`, `PUT‖transição`) entram no teste, assertando **estado final** |
| **`notes` continua editável em status terminal** (`PUT` com qualquer outro campo ⇒ 409) | Registrar o que aconteceu ("gostou da base, retorno em 30 dias") é parte do desfecho que a feature promete; travar o `PUT` inteiro deixaria a observação sem caminho depois de concluir |
| **Técnica do fuso, fixada aqui para não virar improviso**: `appLocalDateTimeToUtc` resolve o offset em **duas passadas** — monta o instante candidato assumindo UTC, lê o offset real daquele instante em `APP_TIME_ZONE` via `Intl.DateTimeFormat` com `timeZoneName`/partes, corrige, e **reconfere** (segunda passada cobre a virada de offset). Hora local ambígua (repetida no fim do DST) resolve para o **primeiro** offset; hora inexistente (pulada no início do DST) desloca para frente o tamanho do salto | Sem definir a técnica, a implementação nasce como `new Date("...T...")` (fuso do dispositivo) ou como offset fixo `-03:00` — ambos errados, e os testes propostos (2026, pós-DST) não pegariam. O Brasil teve DST até 2019 e o RF-04 permite registro retroativo, então a regra de desempate precisa ser explícita e testada |
| **`DELETE` coexiste com `cancel`** | Semânticas distintas: `cancel` é fato do relacionamento (desmarcou); `DELETE` é correção de erro de digitação. Compromisso não é registro financeiro, então apagar é permitido (e é o que a LGPD favorece) |
| **Vínculo de venda em endpoint próprio `PUT /:id/sale`**, aceito em `scheduled` e `done`; `POST /:id/done` aceita `saleId` opcional aplicando a **mesma** validação dentro da transação da transição | O fluxo real é "concluí e vendi" (um passo) mas também "vinculei/corrigi depois" (o compromisso já está `done`, e o `PUT` geral está bloqueado em terminal). Validação dentro da transação garante que `saleId` inválido não deixe o compromisso `done` sem venda |
| **Conflito consultado por endpoint dedicado, com `limit` fixo de 20** | Mantém o contrato de `POST`/`PUT` limpo e permite avisar **antes** de salvar ("avisa, não bloqueia"). O limite atende `api.md` ("nunca retornar tabela inteira sem limite") sem inventar paginação para um aviso. Registrar a rota literal **antes** da paramétrica (precedente `sales.routes.ts:95`) |
| **Sobreposição usa intervalos semiabertos** `[início, fim)` | `fim == início` (compromissos colados) não é conflito — é o caso comum de dois atendimentos seguidos |
| **`GET /leads` ganha `?search`** (RF-14), espelhando `GET /clients` | Sem isso o seletor de lead do formulário só paginaria às cegas — e o lead é justamente a pessoa que a consultora agenda a partir da isca da landing. Mudança pequena e com precedente direto |
| **RF-12 implementado dentro da transação de conversão do lead**, por UPDATE direto na tabela `appointments` a partir do repositório de leads | É a convenção real do codebase para cross-tabela (orders→products no `deliver`). Fora da transação, uma falha deixaria a agenda órfã |
| **Agrupamento Hoje / Próximos 7 dias / Depois é função pura no shared** | Testável sem browser (o web só coleta `*.test.ts` em node); mantém a página RSC burra. O rótulo "Próximos 7 dias" evita a ambiguidade de "esta semana" (que em pt-BR sugere semana civil) |
| **Google Agenda e mensagem de WhatsApp são funções puras em `apps/web/src/lib/`**, e a de WhatsApp devolve `null` quando não há número válido | Mesma razão: é onde o projeto consegue testar. `lib/` também é obrigatório para helper compartilhado entre RSC e client component (lesson 2026-07-18). O `null` impede que `buildWhatsAppUrl` lance e derrube a página |
| **`GET /appointments?clientId=…&range=upcoming&perPage=1`** alimenta o "próximo compromisso" da ficha da cliente | Reusa o filtro do RF-05; nenhum endpoint novo |
| **Dashboard permanece em UTC** nesta entrega | Mudar o recorte altera números de uma feature já entregue e validada; fora do escopo declarado. Divergência vira known-issue com plano |
| **Não dividir em REL-06a/REL-06b** | A revisão sugeriu partir a entrega. O humano pediu explicitamente lead, WhatsApp/Google Agenda **e** vínculo de venda na v1; entregar a UI sem o vínculo devolveria uma feature pela metade. Mitigação real é o fatiamento em 8 milestones com checkpoint próprio — e, se o teto de rodadas de QA for atingido, escalar em vez de forçar |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `project-memory/decisions/0018-app-time-zone.md` | ADR do fuso de referência da aplicação (escrito no M1) |
| `packages/shared/src/time.ts` | `APP_TIME_ZONE`, `appLocalDateIso`, `appLocalTimeHm`, `appLocalDateTimeToUtc`, `appLocalDayRangeUtc`, `appointmentDayBucket` |
| `packages/shared/src/time.test.ts` | Bordas de fuso (20:30/23:00 BRT), ida e volta de composição, virada de dia e do 7º dia, `TZ` do processo forçado |
| `packages/shared/src/appointments.ts` | Enums, labels pt-BR, schemas de entrada/saída/query |
| `packages/shared/src/appointments.test.ts` | Validações do contrato (cliente×lead, duração, `date`×`range`, mensagens pt-BR) |
| `apps/api/src/db/schema/appointments.ts` | Tabela `appointments` (FKs, CHECKs, índices) |
| `apps/api/drizzle/0009_*.sql` (+ snapshot/journal) | Migração gerada por `bun run db:generate` |
| `apps/api/src/db/appointments-table.integration.test.ts` | Invariantes de schema contra Postgres real |
| `apps/api/src/modules/appointments/appointments.errors.ts` | `AppointmentNotFoundError`, `AppointmentStateError`, `InvalidAppointmentPersonError`, `InvalidAppointmentSaleError` |
| `apps/api/src/modules/appointments/appointments.repository.ts` | Queries por bounds de instante, joins, transições, conflitos, checagens escopadas de pessoa/venda |
| `apps/api/src/modules/appointments/appointments.service.ts` | Porta do repositório, recortes de `range` → bounds, regras, paginação, clock injetado |
| `apps/api/src/modules/appointments/appointments.routes.ts` | Rotas Elysia + Zod na fronteira |
| `apps/api/src/modules/appointments/appointments.service.test.ts` | Unidade com fake explícito da porta |
| `apps/api/src/modules/appointments/appointments.integration.test.ts` | Rotas + Postgres real |
| `apps/web/src/lib/appointments-api.ts` + `.test.ts` | Client tipado |
| `apps/web/src/lib/google-calendar.ts` + `.test.ts` | URL `action=TEMPLATE` |
| `apps/web/src/lib/appointment-message.ts` + `.test.ts` | Mensagem pt-BR de confirmação (devolve `null` sem WhatsApp válido) |
| `apps/web/src/app/(crm)/crm/appointments/{page,loading,error}.tsx` | Lista com 3 abas e os 3 estados |
| `apps/web/src/app/(crm)/crm/appointments/actions.ts` | Server Actions |
| `apps/web/src/app/(crm)/crm/appointments/new/page.tsx` | Criação |
| `apps/web/src/app/(crm)/crm/appointments/[id]/{page,loading,error,not-found}.tsx` | Detalhe + ações + edição |
| `apps/web/src/components/appointments/appointment-form.tsx` | RHF + zodResolver, aviso de conflito |
| `apps/web/src/components/appointments/appointment-card.tsx` | Card da lista |
| `apps/web/src/components/appointments/appointment-status-badge.tsx` | Badge de status |
| `apps/web/src/components/appointments/appointment-actions.tsx` | Transições + WhatsApp + Google Agenda |
| `apps/web/src/components/appointments/person-select.tsx` | Seletor cliente **ou** lead com busca |
| `apps/web/src/components/appointments/sale-link-form.tsx` | Vincular/desvincular venda |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Exportar `appointments.ts` e `time.ts` |
| `packages/shared/src/leads.ts` (+ teste) | `search` em `leadsListQuerySchema` (RF-14) |
| `apps/api/src/db/schema/index.ts` | Exportar `appointments` (sem isso a migração não é gerada) |
| `apps/api/src/plugins/error-handler.ts` | Novos `ERROR_CODE` + `instanceof` → 404/409/422 |
| `apps/api/src/app.ts` | `AppDeps.appointmentsService` + `.use(createAppointmentsRoutes(...))` |
| `apps/api/src/index.ts` | Instanciar repository/service com `clock` injetado |
| `apps/api/src/modules/leads/leads.repository.ts` (+ service/rotas conforme a porta) | RF-12 (propagação na conversão) e RF-14 (`search` na listagem) |
| `apps/api/src/modules/leads/leads.integration.test.ts` | Cobertura de RF-12 e RF-14 |
| `apps/api/src/modules/{clients,products,sales,orders,leads,dashboard,auth}/*.integration.test.ts` | Somar `appointmentsService` ao `buildApp()` de cada suíte |
| `apps/web/src/lib/leads-api.ts` (+ teste) | `search` em `ListLeadsParams` |
| `apps/web/src/components/crm/nav-items.ts` + `nav-items.test.ts` | Item "Agenda" (ícone `CalendarDays`) |
| `apps/web/src/app/(crm)/crm/clients/[id]/page.tsx` | Próximo compromisso + botão "Agendar" |
| `apps/web/src/components/leads/lead-card.tsx` | Botão "Agendar" |
| `project-memory/decisions/README.md` | Índice do ADR-0018 |
| `project-memory/04-domain-model.md` | Entidade `Appointment`, invariantes e relações |
| `project-memory/known-issues.md` | Divergência de fuso agenda×dashboard; drift de `test/factories/`; E2E da agenda |
| `specs/ROADMAP.md` | REL-06 → `[R]` no handoff |

## Cobertura de Testes (decisão obrigatória — critérios em `.claude/rules/workflow/spec-format.md`)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **sim** | Regras novas: exclusividade e validação de pessoa, matriz de transições, vínculo de venda, cálculo de conflito, recortes de `range` → bounds, composição local→UTC, bucket de agrupamento. Service com fake explícito da porta (sem `vi.mock`); helpers como funções puras. Clock **injetado** — proibido depender do relógio real |
| Integração (Testcontainers) | **sim** | Cria schema **e** contrato de API **e** toca invariante de outro módulo (conversão de lead). Cobre CHECKs/FKs reais, recortes de dia na borda de fuso (container em UTC prova a independência do `TimeZone` da sessão), matriz de transições, concorrência com `Promise.all` (incluindo `done ‖ linkSale` e `cancel ‖ linkSale`), escopo por consultora e 401 por rota |
| E2E | **pendência (sem infra)** | A agenda não é um dos três fluxos críticos já listados (login, venda, captura de lead), mas formulário e ações de status são UI relevante sem cobertura automatizada. Registrar no handoff e em `known-issues.md`; a infra nasce no REL-01. **Não simular cobertura** |
| Regressão (se BUG-NNN) | n.a. | Feature nova, não veio de `bugs-backlog.md` |

Complemento obrigatório: **validação de runtime** na QA (build de produção + exercício das páginas novas), pelo precedente do CRM-05 — RSC que chama export de módulo `"use client"` só quebra em runtime.

## Migração de Banco

Aditiva e **não destrutiva**: `CREATE TABLE appointments` + FKs + CHECKs + índices, gerada por `bun run db:generate` (nunca escrita à mão, nunca `push`). Nenhuma coluna existente é alterada; nenhuma linha precisa de backfill.

- Rollback: `DROP TABLE appointments` — sem perda de dado de outra tabela (as FKs saem com ela).
- O RF-12 **não** faz backfill: leads já convertidos antes desta migração não têm compromissos (a tabela nasce vazia).
- O RF-14 (`?search` em leads) não altera schema — é só query.
- Conferir que o `_journal.json` ganhou exatamente **uma** entrada.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Recorte de dia errado na borda do fuso (o bug clássico de agenda) | **alta** | Fonte única em TS (`appLocalDayRangeUtc`), testes com instantes na borda (23:30Z e 02:00Z) e integração contra Postgres em UTC |
| Gravação no instante errado a partir de dispositivo fora do BRT | **alta** | `appLocalDateTimeToUtc` com técnica de duas passadas fixada acima e teste que força `TZ` diferente no processo; proibido `new Date("...T...")` sem fuso no formulário |
| Offset resolvido de forma ingênua (`-03:00` fixo) quebrar data pré-2019 (Brasil tinha DST) | média | Regra de desempate declarada no plan; teste com data de janeiro de 2018 (offset `-02:00`) na Task 1.2 |
| Teste de concorrência não-determinístico ("exatamente uma 200") virar flaky e ser relaxado | **alta** | RF-08.1 define asserção por **estado final**; a exclusividade estrita só é assertada entre as três transições |
| `buildWhatsAppUrl` lança e derruba a página | média | Helper novo devolve `null`; botão só renderiza com número válido; teste cobre número inválido |
| Suítes de integração existentes quebram ao mudar `createApp` | **alta** (certo se esquecer) | Task própria para atualizar todos os `buildApp()`; checkpoint de milestone roda a suíte inteira |
| Barra de navegação mobile com 7 itens ilegível em ~375px | média | Verificação visual obrigatória na QA; se não couber, **escalar ao humano** em vez de improvisar |
| Escopo grande (22 RFs) estourar o teto de rodadas de QA | média | Milestones pequenos com checkpoint próprio; API completa e verde antes de qualquer tela; teto estourado ⇒ escalar |
| Vazamento de escopo cross-tenant via `clientId` do corpo | média | RF-03 valida posse antes de persistir, com teste dedicado |
| Divergência de fuso agenda×dashboard confundir no futuro | baixa | ADR-0018 explícito (escrito antes da implementação) + known-issue com plano |

## Definition of Done
- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos workspaces afetados
- [ ] `bun run test` (com integração) verdes
- [ ] Build ok (`next build` do web incluído — é onde erros de RSC×client aparecem)
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
- [ ] ADR-0018 escrito e indexado; `04-domain-model.md` e `known-issues.md` atualizados; REL-06 marcado `[R]`
- [ ] Pendência de E2E declarada no handoff (sem fingir cobertura)
