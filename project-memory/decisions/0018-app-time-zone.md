# ADR-0018 — Fuso de referência da aplicação (`APP_TIME_ZONE`)

- **Status**: Aceito
- **Data**: 2026-08-05
- **Emendado por**: [ADR-0026](./0026-sold-revenue-and-daily-hub-home.md) — a "divergência assumida" com o dashboard deixou de existir: painel e "atrasado" de cobranças passaram a recortar em `APP_TIME_ZONE`. Exceção registrada: o literal do fuso aparece nas migrações SQL `0012` e `0016` (migração não importa TypeScript)

## Contexto

A agenda de compromissos (REL-06) é a **primeira feature do projeto em que a borda do dia é semanticamente relevante**: um compromisso marcado para "hoje às 20h" precisa continuar em "hoje" mesmo depois das 21h UTC (quando já é amanhã em UTC), e a listagem padrão (`GET /appointments?range=upcoming`) recorta "o que falta hoje e depois" a partir do início do dia local da consultora — não do dia UTC.

O projeto já tem um precedente de recorte de dia dependente de fuso: o dashboard (ADR-0014) usa `date_trunc('month', now())` e `CURRENT_DATE` — ambos dependentes do `TimeZone` da **sessão Postgres**, que hoje é **indefinido** no `docker-compose` (não há `TZ`/`PGTZ` fixado no serviço `postgres`, ver `known-issues.md` — "Dashboard: `date_trunc` usa TZ da sessão Postgres"). Isso funciona "por acaso" hoje porque a imagem `postgres:18-alpine` sobe em UTC por padrão, mas é uma dependência implícita e não testada explicitamente — reusar o mesmo padrão para uma feature onde a borda do dia é o requisito central (RF-05, RF-15, RF-16) multiplicaria o risco: qualquer desvio do `TimeZone` da sessão (troca de imagem, variável de ambiente do container, `SET TIME ZONE` de uma extensão) mudaria silenciosamente que dia um compromisso pertence.

Além disso, a escrita (formulário "05/08 às 20:00") precisa compor um instante UTC a partir de data+hora local **sem depender do fuso do dispositivo** de quem preenche o formulário — `new Date("2026-08-05T20:00")` usa o fuso do navegador/celular, o que gravaria instantes diferentes conforme a configuração de cada aparelho.

## Decisão

1. **`APP_TIME_ZONE = "America/Sao_Paulo"`** é uma constante única, exportada de `packages/shared` (`packages/shared/src/time.ts`). É o único lugar do código onde o literal do fuso aparece — nenhum outro módulo (API, web) escreve `"America/Sao_Paulo"` diretamente.
2. **O recorte de dia é calculado em TypeScript, nunca em SQL.** O service converte `range`/`date` em bounds de instante `[startUtc, endUtc)` (`appLocalDayRangeUtc`) usando `APP_TIME_ZONE`, e passa esses bounds já resolvidos ao repository. O repository compara `starts_at` (coluna `timestamptz`) contra os bounds — nunca `AT TIME ZONE`, `CURRENT_DATE` ou `date_trunc(now())` no SQL. Isso mantém a comparação **sargável** (usa o índice `(consultant_id, starts_at)` por igualdade/intervalo direto na coluna, sem função aplicada a ela) e elimina qualquer dependência do `TimeZone` da sessão Postgres.
3. **A escrita usa a mesma constante**: `appLocalDateTimeToUtc(dateIso, timeHm)` compõe data local + hora local em instante UTC resolvendo o offset de `APP_TIME_ZONE` via `Intl.DateTimeFormat` (técnica de duas passadas — ver `plan.md` de `specs/crm-appointments`), independentemente do fuso do processo/dispositivo que chama a função.
4. Instantes continuam armazenados em `timestamptz` (UTC) e trafegando como ISO 8601 UTC no contrato — o fuso só entra na apresentação (formatação pt-BR no web) e nos recortes (cálculo dos bounds no service).

## Alternativas consideradas

- **Fixar `TimeZone=UTC` na configuração do Postgres** (imagem/`docker-compose`) e continuar usando `CURRENT_DATE`/`date_trunc(now())` no SQL, agora com `AT TIME ZONE 'America/Sao_Paulo'` explícito na query. Descartada: ainda deixaria a correção do recorte de dia dependente de configuração de infraestrutura (a mesma classe de risco que gerou o known-issue do dashboard), aplicaria uma função sobre `starts_at` na comparação (perde o índice sargável) e duplicaria a fonte de verdade do fuso entre SQL e o formulário web.
- **`AT TIME ZONE` só no SQL, sem bounds calculados em TS**: mesma objeção de sargabilidade — `(starts_at AT TIME ZONE 'America/Sao_Paulo')::date = :data` força um scan que ignora o índice composto, algo que `database.md` já orienta a evitar ("proibido N+1" e índice deve ser usado por query real).
- **Fuso por consultora** (coluna `time_zone` em `consultants`, configurável): descartada por escopo — o projeto tem consultora única hoje (drift já documentado em `04-domain-model.md`); introduzir fuso configurável seria estado extra sem uso real, adiável para quando houver mais de uma consultora.

## Consequências

- Toda leitura que depende de "que dia é hoje" para a consultora (RF-05: `upcoming`/`pending`/`history`/`day`) fica correta e testável independentemente da configuração do Postgres — provado por integração contra um container **em UTC** (Testcontainers), justamente o cenário que expõe o bug se o cálculo dependesse do SQL.
- **Divergência assumida com o ADR-0014**: o dashboard continua agregando "mês corrente" em UTC (`date_trunc('month', now())`) nesta entrega — não foi migrado para `APP_TIME_ZONE`. Isso significa que, por algumas horas na virada de mês/dia (entre 21h e 24h BRT), a agenda já considera "amanhã" enquanto o dashboard ainda soma no "mês de hoje" em UTC. A inconsistência é deliberada e documentada (ver `known-issues.md`); migrar o dashboard exigiria trocar as agregações SQL (`date_trunc`/`CURRENT_DATE`) por bounds calculados em TS com `appLocalDayRangeUtc`/equivalente mensal, o que está fora do escopo desta feature (ver "Fora de Escopo" em `specs/crm-appointments/spec.md`).
- Precedente reusável: qualquer feature futura que precise de recorte de dia/mês local (ex.: migração do dashboard) tem em `packages/shared/src/time.ts` os helpers prontos (`appLocalDateIso`, `appLocalDayRangeUtc`, `appLocalDateTimeToUtc`) — não precisa reinventar a técnica de duas passadas.
- Custo aceito: todo `service` que faz recorte de dia precisa receber/injetar um `clock` (não pode depender implicitamente de `Date.now()`), para permanecer testável — já é o padrão de outros services do projeto (ex.: sessão de auth).
