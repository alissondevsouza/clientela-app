# ADR-0027 — Meta mensal com histórico e herança

- **Status**: Aceito
- **Data**: 2026-09-23
- **Substitui**: decisão 3 do [ADR-0014](./0014-cost-snapshot-estimated-profit.md) (meta como atributo escalar da consultora)

## Contexto

A meta mensal era um único valor em `consultants.monthly_goal_cents` (ADR-0014). Enquanto a home só mostrava o mês corrente, isso bastava. Com a leitura de meses passados (ADR-0026), o escalar faria março aparecer com a meta de hoje: trocar a meta reescreveria o passado. O humano decidiu em 2026-09-23 guardar a meta de cada mês.

## Decisão

**1. Tabela `monthly_goals`** (`consultant_id` FK cascade, `month_start date` com CHECK de dia 1, `goal_cents integer` **nullable** com CHECK `> 0 AND <= MONEY_MAX_CENTS`, UNIQUE `(consultant_id, month_start)` — o índice único cobre a FK).

**2. Herança.** A meta efetiva de um mês M é a da linha de maior `month_start <= M`. Sem linha até M, não há meta. Uma meta definida em setembro vale para outubro enquanto outubro não tiver a sua — o comportamento de "a meta continua valendo" que a consultora já tinha.

**3. `goal_cents = NULL` é remoção explícita** a partir daquele mês ("Remover meta"). Meta efetiva nula é sempre reportada como `source: "none"`, exista linha ou não.

**4. Só o mês corrente é editável.** `PUT /dashboard/goal` mantém o body `{ monthlyGoalCents }` e grava (upsert por `ON CONFLICT`) o mês corrente decidido pelo relógio do servidor em `APP_TIME_ZONE` — nunca pelo cliente. Resposta: `{ month, monthlyGoalCents }`.

**5. Migração expand-only.** `0015` cria a tabela; `0016` (custom) copia a meta atual para uma linha no mês local em que a migração roda, com `ON CONFLICT DO NOTHING`. A coluna `consultants.monthly_goal_cents` **fica** e é ignorada pelo código novo: rollback de imagem volta a funcionar sem mexer no banco. O literal `'America/Sao_Paulo'` na `0016` é a mesma exceção já aberta na `0012` ao "literal do fuso só em `time.ts`" (ADR-0018): migração SQL não importa TypeScript.

## Alternativas consideradas

- **Manter o escalar e mostrar a meta só no mês corrente**: rejeitada — o mês passado apareceria sem meta ou com a meta errada, justamente onde a consultora quer comparar.
- **Uma linha obrigatória por mês (sem herança)**: rejeitada — exigiria redefinir a meta todo mês ou materializar meses por job; a herança dá o mesmo resultado sem estado a mais.
- **Permitir editar meses passados e futuros**: adiada — escopo sem uso pedido; a regra de herança já comporta isso se vier.
- **Remover a coluna antiga na mesma entrega**: rejeitada — migração destrutiva com dado real em produção e sem backup externo (LP-13); fica como contração futura (known-issue).

## Consequências

- Meses anteriores à primeira linha (isto é, anteriores ao deploy) aparecem sem meta — não há como saber a meta que valia antes.
- Metas editadas depois do deploy se perdem num rollback de imagem (o código antigo lê a coluna, que ficou com o valor pré-deploy). Aceito.
- A remoção de `consultants.monthly_goal_cents` fica registrada em `known-issues.md`.
- Meta de intervalo de meses e acompanhamento de comissão/nível Mary Kay (MKT-04) partem desta tabela.
