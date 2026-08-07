---
feature: Agenda de compromissos
module: appointments
phase: tasks
status: draft
created: 2026-08-05
updated: 2026-08-05
depends_on: [plan.md]
---

# Tasks: Agenda de compromissos

> Rodada 1 de revisão neutra aplicada em 2026-08-05.

## Milestone 1: Decisão de fuso e contrato compartilhado

- [x] **Task 1.1** — ADR do fuso de referência da aplicação
  - Arquivos: `project-memory/decisions/0018-app-time-zone.md`, `project-memory/decisions/README.md`
  - Conteúdo: contexto (agenda é a 1ª feature em que a borda do dia importa; `CURRENT_DATE`/`date_trunc(now())` dependem do TZ da sessão Postgres — known-issue aberta); decisão (`APP_TIME_ZONE = America/Sao_Paulo`, constante única no shared, recorte calculado em TS e passado como bounds UTC ao SQL, escrita composta pelo mesmo fuso); alternativas (fixar `TimeZone=UTC` no Postgres; `AT TIME ZONE` no SQL; fuso por consultora); consequências — incluindo a **divergência assumida com o ADR-0014** (dashboard segue em mês UTC) e o que seria preciso para unificar depois
  - Dependências: nenhuma
  - Paralelizável: não (todo o resto depende da decisão)
  - Verificação: ADR indexado no README da pasta; nenhuma afirmação contradiz o código existente
  - Implementado por: —
- [x] **Task 1.2** — Helpers puros de fuso, data e agrupamento
  - Arquivos: `packages/shared/src/time.ts`, `packages/shared/src/time.test.ts`
  - Conteúdo: `APP_TIME_ZONE`; `appLocalDateIso(isoInstant)` → `yyyy-mm-dd`; `appLocalTimeHm(isoInstant)` → `HH:mm`; **`appLocalDateTimeToUtc(dateIso, timeHm)` → instante ISO UTC** pela técnica de **duas passadas** fixada no `plan.md` (offset lido de `Intl.DateTimeFormat` com `APP_TIME_ZONE` no instante candidato, corrigido e reconferido; hora ambígua ⇒ primeiro offset; hora inexistente ⇒ desloca para frente). Nunca `new Date("yyyy-mm-ddTHH:mm")` (fuso do dispositivo) nem offset fixo `-03:00`; `appLocalDayRangeUtc(dateIso)` → `{ startUtc, endUtc }`; `appointmentDayBucket(localDate, todayLocalDate)` → `"past" | "today" | "next7" | "later"` (`next7` = de amanhã até o 7º dia)
  - Dependências: Task 1.1
  - Paralelizável: sim (arquivo disjunto da 1.3/1.4)
  - Verificação: `bun run test` cobre 20:30 BRT (`2026-08-05T23:30:00Z` ⇒ `2026-08-05`), 23:00 BRT (`2026-08-06T02:00:00Z` ⇒ `2026-08-05`), meia-noite local, ida e volta compor→ler, virada do 7º dia, **uma data de janeiro/2018** (Brasil ainda com horário de verão, offset `-02:00` — prova que o offset não é fixo), e o **teste força `TZ` do processo diferente de BRT** (ex.: `UTC` e `Asia/Tokyo`) provando que o resultado não muda. Data de referência sempre por parâmetro (sem `Date.now()` implícito)
- [x] **Task 1.3** — Contrato Zod do módulo
  - Arquivos: `packages/shared/src/appointments.ts`, `packages/shared/src/appointments.test.ts`
  - Conteúdo: `appointmentKindValues`/`appointmentStatusValues` (`as const`) + `APPOINTMENT_KIND_LABELS`/`APPOINTMENT_STATUS_LABELS` pt-BR; `createAppointmentSchema` (`superRefine` proibindo `clientId` + `leadId` juntos; `durationMinutes` 1..1440; `title` ≤ 120; `location` ≤ 160; `notes` ≤ 1000; `startsAt` datetime ISO); `updateAppointmentSchema` (campos de pessoa **opcionais**, com `null` explícito distinguível de ausente); `completeAppointmentSchema` (`{ saleId?: uuid }`); `linkAppointmentSaleSchema` (`{ saleId: uuid | null }`); `appointmentSchema` (com `clientName`, `clientWhatsapp`, `leadName`, `leadWhatsapp`, `saleId`, `saleTotalCents` nuláveis); `appointmentListItemSchema = appointmentSchema.omit({ notes: true, clientWhatsapp: true, leadWhatsapp: true })` (minimização — RF-01); `resolveAppointmentPerson(appointment)` — **única** implementação da precedência cliente>lead, devolvendo `{ name, kind: "client"|"lead"|"none" }`; `appointmentsListQuerySchema` (paginação + `range` `upcoming`|`pending`|`history`|`day`|`all` + `date`/`status`/`kind`/`clientId`/`leadId`, refine `date` ⇔ `range=day`); `appointmentConflictsQuerySchema`; `appointmentConflictsResponseSchema` com **limite de 20**
  - Dependências: Task 1.1
  - Paralelizável: sim
  - Verificação: testes provam mensagens pt-BR para campo **ausente** e presente-inválido (lesson Zod v4); rejeição de cliente+lead juntos; `date` sem `range=day` e vice-versa; `perPage` > 100; distinção entre campo ausente e `null` no update
- [x] **Task 1.4** — `search` no contrato de leads (RF-14)
  - Arquivos: `packages/shared/src/leads.ts`, `packages/shared/src/leads.test.ts`
  - Conteúdo: `search` opcional em `leadsListQuerySchema`, espelhando o de `clientsListQuerySchema` (mesmo tamanho máximo e mesma semântica de trim/vazio)
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: teste cobre presente, ausente, vazio e acima do limite; chamadas existentes sem o parâmetro continuam válidas
- [x] **Task 1.5** — Exportar no barrel do shared
  - Arquivos: `packages/shared/src/index.ts`
  - Dependências: Tasks 1.2, 1.3, 1.4
  - Paralelizável: não
  - Verificação: `bun run typecheck` limpo; import de `@clientela/shared` resolve os novos símbolos

## Milestone 2: Banco

- [x] **Task 2.1** — Tabela `appointments` no schema Drizzle
  - Arquivos: `apps/api/src/db/schema/appointments.ts`, `apps/api/src/db/schema/index.ts`
  - Conteúdo: colunas do RF-01; CHECK de `duration_minutes` (1..1440), de `kind` e de `status` derivados dos valores do shared com `sql.raw` (lesson 2026-07-16); FKs `consultant_id` cascade, `client_id`/`lead_id`/`sale_id` SET NULL; **quatro** índices: `(consultant_id, starts_at)`, `client_id`, `lead_id`, `sale_id` (o composto cobre o escopo por consultora por prefixo). **Sem** CHECK de exclusividade cliente×lead
  - Dependências: Task 1.3
  - Paralelizável: não
  - Verificação: `bun run typecheck` limpo; tabela exportada no barrel
- [x] **Task 2.2** — Gerar a migração
  - Arquivos: `apps/api/drizzle/0009_*.sql`, `apps/api/drizzle/meta/*`
  - Comando: `bun run db:generate` na `apps/api` (nunca editar SQL à mão, nunca `push`)
  - Dependências: Task 2.1
  - Paralelizável: não
  - Verificação: exatamente **uma** entrada nova em `_journal.json`; SQL contém CHECKs com literais (não `$1`), `ON DELETE` corretos e os 4 índices
- [x] **Task 2.3** — Teste de invariantes do schema
  - Arquivos: `apps/api/src/db/appointments-table.integration.test.ts`
  - Conteúdo: `id` casa `UUID_V7_REGEX`; CHECK recusa `duration_minutes` 0, -1 e 1441; CHECK recusa `kind`/`status` inválidos; deletar consultora ⇒ compromisso some; deletar cliente/lead/venda ⇒ compromisso permanece com a FK nula; defaults de `created_at`/`updated_at`
  - Dependências: Task 2.2
  - Paralelizável: não
  - Verificação: `bun run test` verde (Postgres real, migrações reais)

## Milestone 3: API — módulo `appointments`

- [x] **Task 3.1** — Erros de domínio
  - Arquivos: `apps/api/src/modules/appointments/appointments.errors.ts`
  - Conteúdo: `AppointmentNotFoundError` (404), `AppointmentStateError` (409), `InvalidAppointmentPersonError` (422 — **mesma mensagem** para inexistente e de outra consultora), `InvalidAppointmentSaleError` (422). Mensagens pt-BR em constantes; cabeçalho documentando o mapeamento HTTP
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `lint`/`typecheck` limpos
- [x] **Task 3.2** — Repository
  - Arquivos: `apps/api/src/modules/appointments/appointments.repository.ts`
  - Conteúdo: `create`; `list` (filtros do RF-05 recebendo **bounds `[startUtc, endUtc)` prontos** do service — sem `AT TIME ZONE`/`CURRENT_DATE` no SQL —, ordenação por `range`, `count` com o mesmo `where`); `getById` (LEFT JOINs de cliente, lead e venda; precedência de cliente resolvida no mapper); `findClientById`/`findLeadById` escopados (RF-03, padrão `findClientsByIds` de orders); `findLinkableSale` (escopada, `completed`); `update` (guard `status='scheduled'` para o payload completo; em status terminal aceita **só `notes`** — RF-07 —, preservando FKs de pessoa omitidas; troca de `clientId` revalida a compatibilidade com `sale_id` vinculado ⇒ `InvalidAppointmentSaleError`); `transition` (UPDATE condicional + fallback 404/409; `saleId` validado **na mesma transação** no caso `done`; `done` **preserva** `sale_id` quando o corpo não traz `saleId`; `cancel`/`no_show` **setam `sale_id = NULL`** no mesmo UPDATE — invariante do RF-08); `remove` (**sem** guard de status — RF-09); `linkSale` (guard `status IN ('scheduled','done')`); `findConflicts` (intervalos semiabertos, só `scheduled`, `excludeId`, ordem ascendente por `starts_at` com desempate por `id`, `limit` 20); mapper com `toISOString()`
  - Dependências: Task 2.1
  - Paralelizável: não
  - Verificação: `typecheck` limpo; **nenhuma** query sem `consultantId` no `where`; nenhum `CURRENT_DATE`/`now()` usado para recorte de dia; comparação de `starts_at` sargável (sem função sobre a coluna)
- [x] **Task 3.3** — Service + testes de unidade
  - Arquivos: `apps/api/src/modules/appointments/appointments.service.ts`, `appointments.service.test.ts`
  - Conteúdo: porta `AppointmentsRepositoryPort`; `clock` injetado; conversão `range`/`date` → bounds via `appLocalDayRangeUtc`; validação de pessoa (RF-03) e de venda (RF-10) antes de persistir; `undefined` → `AppointmentNotFoundError`; paginação (`Paginated<T>`); `done` com `saleId` delegando a validação para dentro da transação
  - Dependências: Tasks 3.1, 3.2
  - Paralelizável: não
  - Verificação: testes com **fake explícito** da porta (sem `vi.mock`), clock fixo, cobrindo happy path + erro de cada regra + cada `range` (bounds calculados corretos para `upcoming`, `pending`, `past`, `day`, `all`)
- [x] **Task 3.4** — Rotas
  - Arquivos: `apps/api/src/modules/appointments/appointments.routes.ts`
  - Conteúdo: `POST /appointments`; `GET /appointments`; **`GET /appointments/conflicts` registrada antes de `GET /appointments/:id`**; `GET /appointments/:id`; `PUT /appointments/:id`; `DELETE /appointments/:id` (204 via `new Response(null, { status: 204 })` — lesson Elysia 1.4); `POST /appointments/:id/{done,no-show,cancel}`; `PUT /appointments/:id/sale`. `consultantId` sempre do token; id malformado ⇒ 404
  - Dependências: Task 3.3
  - Paralelizável: não
  - Verificação: `typecheck` limpo; toda rota com schema Zod em `body`/`query`
- [x] **Task 3.5** — Wiring (composition root, error-handler e suítes existentes)
  - Arquivos: `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/plugins/error-handler.ts`, todos os `*.integration.test.ts` que montam `buildApp()`
  - Conteúdo: `AppDeps.appointmentsService`; instanciação com `clock: () => new Date()`; `ERROR_CODE` novos (`APPOINTMENT_NOT_FOUND`, `APPOINTMENT_STATE`, `INVALID_APPOINTMENT_PERSON`, `INVALID_APPOINTMENT_SALE`) + `instanceof`; **nada** adicionado a `DEFAULT_PUBLIC_ROUTES`
  - Dependências: Task 3.4
  - Paralelizável: não
  - Verificação: `bun run test` — **todas** as suítes de integração existentes continuam verdes
- [x] **Task 3.6** — Testes de integração do módulo
  - Arquivos: `apps/api/src/modules/appointments/appointments.integration.test.ts`
  - Conteúdo: um `describe` por RF (RF-03 a RF-11, RF-13, RF-15), incluindo bordas de fuso, os cinco recortes de `range` (com o caso "compromisso de hoje às 9h consultado às 15h"), matriz de transições, efeito das transições sobre `sale_id` (RF-08), e a bateria de concorrência do **RF-08.1** com `Promise.all` repetido: `done ‖ cancel` (exclusividade estrita: exatamente uma 200), e `done ‖ linkSale`, `cancel ‖ linkSale`, `no_show ‖ linkSale`, `PUT ‖ cancel` assertando o **estado final** e a invariante (nunca o par de códigos HTTP). Mais: `DELETE ‖ cancel` (a linha some ⇒ o fallback deve devolver **404**, nunca 409), escopo por consultora, 401 por rota, `DELETE` em status terminal, partição dos recortes (nenhum compromisso invisível nas três abas) e todos os casos de conflito do critério do RF-11. Respostas parseadas pelos schemas do shared
  - Dependências: Task 3.5
  - Paralelizável: não
  - Verificação: `bun run test` verde; cada critério de aceite da API tem teste nomeado referenciando o RF

## Milestone 4: Módulo de leads

- [x] **Task 4.1** — Conversão de lead propaga a agenda (RF-12)
  - Arquivos: `apps/api/src/modules/leads/leads.repository.ts` (e `leads.service.ts` se a porta mudar), `apps/api/src/modules/leads/leads.integration.test.ts`
  - Conteúdo: dentro da transação de conversão, `UPDATE appointments SET client_id = :novoClienteId WHERE lead_id = :leadId AND client_id IS NULL AND consultant_id = :consultantId`; `lead_id` preservado
  - Dependências: Task 3.6
  - Paralelizável: não
  - Verificação: teste cobrindo o critério do RF-12 (propaga; não sobrescreve compromisso que já tinha cliente; escopo por consultora)
- [x] **Task 4.2** — Busca textual em `GET /leads` (RF-14)
  - Arquivos: `apps/api/src/modules/leads/leads.repository.ts`, `leads.routes.ts`/`leads.service.ts` conforme a porta, `leads.integration.test.ts`
  - Conteúdo: filtro `search` por nome **ou** WhatsApp, parcial e case-insensitive, no mesmo padrão de `clients.repository.ts`; combinável com `status` e paginação
  - Dependências: Task 4.1
  - Paralelizável: não
  - Verificação: teste cobrindo o critério do RF-14, incluindo que a listagem sem `search` não muda de comportamento

## Milestone 5: Web — camada de dados e ações

- [x] **Task 5.1** — Client tipado da API de compromissos
  - Arquivos: `apps/web/src/lib/appointments-api.ts`, `appointments-api.test.ts`
  - Conteúdo: `listAppointments`, `getAppointment`, `createAppointment`, `updateAppointment`, `deleteAppointment`, `transitionAppointment`, `linkAppointmentSale`, `getAppointmentConflicts` — deps injetadas, nunca lançam, resposta validada pelo schema do shared, id sempre `encodeURIComponent`
  - Dependências: Task 1.5
  - Paralelizável: sim
  - Verificação: testes com `fetchImpl` falso cobrindo sucesso, querystring montada, 404/409/422, corpo malformado e rede caindo
- [x] **Task 5.2** — Helpers puros de WhatsApp e Google Agenda
  - Arquivos: `apps/web/src/lib/google-calendar.ts` + `.test.ts`, `apps/web/src/lib/appointment-message.ts` + `.test.ts`
  - Conteúdo: `buildGoogleCalendarUrl({ title, details, location, startsAt, durationMinutes })` com `dates=YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ`; `buildConfirmationWhatsAppUrl(appointment)` devolvendo `string | null` — `null` quando não há pessoa ou o número é inválido (nunca deixar `buildWhatsAppUrl` lançar); mensagem pt-BR com nome, `dd/mm` e `HH:mm` no `APP_TIME_ZONE`
  - Dependências: Task 1.2
  - Paralelizável: sim
  - Verificação: testes de percent-encoding, cálculo do fim pela duração, ausência de pessoa, número inválido e número válido
- [x] **Task 5.3** — `search` no client de leads (RF-14)
  - Arquivos: `apps/web/src/lib/leads-api.ts`, `leads-api.test.ts`
  - Conteúdo: `search` em `ListLeadsParams`, propagado na querystring
  - Dependências: Task 1.5
  - Paralelizável: sim
  - Verificação: teste da querystring com e sem o parâmetro
- [x] **Task 5.4** — Server Actions
  - Arquivos: `apps/web/src/app/(crm)/crm/appointments/actions.ts`
  - Conteúdo: `requireToken`; revalidação de `/crm/appointments` (+ `/crm/clients` e `/crm/leads` quando o vínculo muda); `createAppointmentAction`, `updateAppointmentAction`, `deleteAppointmentAction`, `completeAppointmentAction`/`noShowAppointmentAction`/`cancelAppointmentAction`, `linkAppointmentSaleAction`, `searchClientsAction`, `searchLeadsAction`, `listLinkableSalesAction`, `checkConflictsAction`. Toda entrada revalidada com `safeParse` na fronteira; retorno `{ ok: true } | { ok: false, message }`
  - Dependências: Tasks 5.1, 5.3
  - Paralelizável: não
  - Verificação: `typecheck`/`lint` limpos; nenhuma action devolve dado pessoal além do necessário

## Milestone 6: Web — telas da agenda

- [x] **Task 6.1** — Badge e card
  - Arquivos: `apps/web/src/components/appointments/appointment-status-badge.tsx`, `appointment-card.tsx`
  - Conteúdo: badge no padrão do projeto (pílula + `Record<Status, string>`, rótulo textual sempre visível); card com hora, tipo, pessoa via **`resolveAppointmentPerson` do shared** (nunca reimplementar a precedência; **sem pessoa ⇒ título, ou label do tipo**), local, indicador de venda vinculada e sinalização de compromisso vencido sem desfecho
  - Dependências: Task 1.5
  - Paralelizável: sim
  - Verificação: `typecheck` limpo; alvos de toque `h-11 md:h-9`; nenhum dado pessoal em log
- [x] **Task 6.2** — Página de lista com abas e agrupamento
  - Arquivos: `apps/web/src/app/(crm)/crm/appointments/{page,loading,error}.tsx`
  - Conteúdo: `searchParamsSchema` com `.catch`; abas Próximos (`upcoming`+`scheduled`) / Pendentes (`pending`) / Histórico (`history`) por querystring; agrupamento Hoje/Próximos 7 dias/Depois via `appointmentDayBucket`; skeleton, vazio com CTA, erro com retry; paginação no padrão do projeto
  - Dependências: Tasks 5.1, 6.1
  - Paralelizável: não
  - Verificação: `next build` ok; render manual a 375px na QA
- [x] **Task 6.3** — Seletor de pessoa (cliente **ou** lead)
  - Arquivos: `apps/web/src/components/appointments/person-select.tsx`
  - Conteúdo: alternância cliente/lead mutuamente exclusiva; busca debounced (300ms) via Server Actions recebidas como **referência direta** (lesson 2026-07-19); opção "sem pessoa"; padrão visual de `client-select.tsx`
  - Dependências: Task 5.4
  - Paralelizável: não
  - Verificação: `next build` ok; selecionar um limpa o outro
- [x] **Task 6.4** — Formulário de compromisso
  - Arquivos: `apps/web/src/components/appointments/appointment-form.tsx`
  - Conteúdo: RHF + zodResolver derivado do contrato compartilhado; `<input type="date">` + `<input type="time">` compondo `startsAt` **via `appLocalDateTimeToUtc`** (nunca `new Date` sem fuso); duração; `person-select`; aviso de conflito **não bloqueante** com debounce; aviso de data no passado
  - Dependências: Task 6.3
  - Paralelizável: não
  - Verificação: `next build` ok; envio com conflito conclui normalmente; a conversão local→UTC é coberta pelo teste do helper (Task 1.2)
- [x] **Task 6.5** — Página de criação
  - Arquivos: `apps/web/src/app/(crm)/crm/appointments/new/page.tsx`
  - Conteúdo: pré-seleção por `?clientId=` / `?leadId=` (validados com `z.uuid().catch`), listas iniciais carregadas no servidor
  - Dependências: Task 6.4
  - Paralelizável: não
  - Verificação: `next build` ok; criação real exercitada na QA
- [x] **Task 6.6** — Página de detalhe, ações e vínculo de venda
  - Arquivos: `apps/web/src/app/(crm)/crm/appointments/[id]/{page,loading,error,not-found}.tsx`, `apps/web/src/components/appointments/appointment-actions.tsx`, `sale-link-form.tsx`
  - Conteúdo: detalhe com pessoa, venda e status; transições só quando `scheduled`; edição embutida enquanto `scheduled` (padrão `products/[id]`); exclusão; botões WhatsApp (só com número válido) e Google Agenda; vínculo de venda com origem conforme RF-19
  - Dependências: Tasks 5.2, 5.4, 6.1
  - Paralelizável: não
  - Verificação: `next build` ok; 404 real para id inexistente; ações exercitadas na QA
- [x] **Task 6.7** — Item de navegação
  - Arquivos: `apps/web/src/components/crm/nav-items.ts`, `nav-items.test.ts`
  - Conteúdo: entrada "Agenda" (`/crm/appointments`, ícone `CalendarDays`)
  - Dependências: Task 6.2
  - Paralelizável: não
  - Verificação: teste do array e da ativação de rota verde; **checar legibilidade da barra inferior com 7 itens a 375px** — se não couber, parar e escalar ao humano

## Milestone 7: Pontos de entrada em clientes e leads

- [x] **Task 7.1** — Ficha da cliente
  - Arquivos: `apps/web/src/app/(crm)/crm/clients/[id]/page.tsx`
  - Conteúdo: botão "Agendar" (`/crm/appointments/new?clientId=…`) e bloco "Próximo compromisso" via `listAppointments({ clientId, range: "upcoming", status: "scheduled", perPage: 1 })`, buscado em paralelo com os dados existentes (`Promise.all`, sem waterfall)
  - Dependências: Task 6.5
  - Paralelizável: sim
  - Verificação: `next build` ok; cliente sem compromisso não quebra nem exibe bloco vazio
- [x] **Task 7.2** — Card de lead
  - Arquivos: `apps/web/src/components/leads/lead-card.tsx`
  - Conteúdo: botão "Agendar" → `/crm/appointments/new?leadId=…`
  - Dependências: Task 6.5
  - Paralelizável: sim
  - Verificação: `next build` ok; ação disponível apenas para leads não descartados

## Milestone 8: Memória e validação final

- [x] **Task 8.1** — Graduação da memória e roadmap
  - Arquivos: `project-memory/04-domain-model.md`, `project-memory/known-issues.md`, `specs/ROADMAP.md`
  - Conteúdo: entidade `Appointment` + invariantes + relações no modelo de domínio; known-issues (divergência de fuso agenda×dashboard; ausência de `apps/api/test/factories/`; E2E da agenda sem cobertura); REL-06 marcado `[R]` no handoff. (O ADR-0018 já foi escrito na Task 1.1)
  - Dependências: Task 7.2
  - Paralelizável: não
  - Verificação: nenhum documento numerado contradiz o código; índice de ADRs consistente
- [x] **Task 8.2** — Validação completa
  - Arquivos: —
  - Conteúdo: `bun run lint`, `bun run typecheck`, `bun run test` (com integração) e `next build` do web
  - Dependências: Task 8.1
  - Paralelizável: não
  - Verificação: os quatro verdes, com saídas registradas em `validate.md` pela QA

## Ordem de Execução

`M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8`, com a API completa e verde (fim do M4) antes de qualquer tela.

Paralelizáveis dentro do milestone: **1.2 ‖ 1.3 ‖ 1.4** (após 1.1); **3.1** independente; **5.1 ‖ 5.2 ‖ 5.3**; **6.1** junto de 5.x; **7.1 ‖ 7.2**. Todo o resto é sequencial por dependência de arquivo.

Checkpoint ao fim de cada milestone: `bun run lint` + `bun run typecheck` + `bun run test` do escopo — sem commit (git é do humano, ADR-0006).

## Definition of Done (agregado)
- [ ] Todos os critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint` e `bun run typecheck` limpos nos módulos afetados
- [ ] `bun run test` (com integração) verdes
- [ ] `next build` do web ok
- [ ] Conformidade com `.claude/rules/*` e ADRs de `project-memory/decisions/`
- [ ] ADR-0018 escrito e indexado; memória do projeto atualizada; REL-06 em `[R]`
- [ ] Pendência de E2E declarada no handoff

## Milestone 9: Cadastro rápido de pessoa (incremento pós-QA)

- [x] **Task 9.1** — `POST /leads` autenticado no CRM (RF-24)
  - Arquivos: `packages/shared/src/leads.ts` (+ teste), `apps/api/src/modules/leads/{leads.service.ts,leads-crm.routes.ts}` (+ testes), `apps/api/src/modules/leads/leads-crm.integration.test.ts`
  - Conteúdo: schema de criação pelo CRM (nome + WhatsApp, sem honeypot); **caminho `POST /leads/manual`** (nunca `POST /leads` — colisão silenciosa com a rota pública, ver lessons 2026-08-06); método no service gravando `source = "crm_manual"`, `consent_at = agora` (clock injetado) e `status = "new"`, reusando `repository.insert`; rota autenticada. **NÃO** tocar na rota pública nem em `DEFAULT_PUBLIC_ROUTES`
  - Verificação: 201 autenticado; 401 sem token; `source`/`consent_at`/`status` corretos; **teste de regressão provando que a captura pública não mudou**
- [x] **Task 9.2** — Cadastro rápido no seletor de pessoa (RF-23)
  - Arquivos: `apps/web/src/lib/leads-api.ts` (+ teste), `apps/web/src/app/(crm)/crm/appointments/actions.ts`, `apps/web/src/components/appointments/person-select.tsx`
  - Conteúdo: `createLead` no client tipado apontando para `POST /leads/manual`; `quickCreateLeadAction` e reuso da `quickCreateClientAction` existente; no seletor, quando a busca não acha ninguém, oferecer criar como **cliente** ou como **lead** (nome + WhatsApp), vinculando o criado ao compromisso
  - Verificação: `next build` ok; validação de WhatsApp inválido não cria nada
- [x] **Task 9.3** — Converter lead em cliente no detalhe (RF-25)
  - Arquivos: `apps/web/src/app/(crm)/crm/appointments/{actions.ts,[id]/page.tsx}`, `apps/web/src/components/appointments/appointment-actions.tsx`
  - Conteúdo: reusar a conversão do CRM-04; botão só quando a pessoa é lead `new`/`contacted`; revalidar agenda, leads e clientes
  - Verificação: `next build` ok; após converter, o compromisso exibe a cliente (RF-12 já re-aponta o `client_id`)
