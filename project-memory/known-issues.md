# Known Issues — dívidas e drifts conhecidos

Dívidas técnicas deliberadas e desvios ("drifts") entre o documentado e o real, descobertos durante o desenvolvimento. Alimentado principalmente pela Phase 5 (graduação) do `clientela-spec-driven` e pelo `clientela-fix`.

Formato:

```markdown
## <título curto>
- **O quê**: <a dívida/o drift>
- **Impacto**: <o que pode dar errado enquanto existir>
- **Registrado em**: YYYY-MM-DD (specs/{slug} ou contexto)
- **Plano**: <quando/como resolver, ou "aceito por ora">
```

---

## ~~Helper pg-container sem limpeza de estado nem tratamento de Docker ausente~~ (resolvido)
- **O quê**: `apps/api/test/helpers/pg-container.ts` não expunha `truncateAll()` nem tratava Docker ausente.
- **Resolvido em**: 2026-07-17 (specs/leads-capture-api, Task 3.1) — `truncateAll()` + erro amigável com `{ cause }` preservada; caminho sem Docker provado na QA.

## ~~Rate limit do endpoint público cobre qualquer método em `/leads`~~ (resolvido)
- **O quê**: o guard `onRequest` de `leads.routes.ts` limitava qualquer método/variante de path de `/leads`.
- **Resolvido em**: 2026-07-18 (specs/crm-leads, Task 1.3) — guard restrito a `POST /leads` exato (método + path normalizado), com teste de regressão red→green; provado em runtime na QA (15× GET autenticado sem 429; POST público 429 após o limite; trailing slash coberto).

## `updated_at` depende do runtime Drizzle ($onUpdate), não de trigger
- **O quê**: `updated_at` de `leads` só atualiza em UPDATEs feitos via Drizzle; SQL cru não passa pelo `$onUpdate`.
- **Impacto**: nenhum hoje (não há UPDATE fora do Drizzle); vira bug silencioso se surgir escrita fora do ORM.
- **Registrado em**: 2026-07-16 (specs/dev-db-drizzle-leads, QA rodada 2)
- **Plano**: promover a trigger no banco se/quando houver escrita fora do Drizzle.

## ~~Exclusão física de cliente e de produto × histórico de vendas~~ (resolvido)
- **O quê**: exclusões físicas × invariante "venda não se apaga".
- **Resolvido em**: 2026-07-18 (specs/crm-sales, ADR-0013) — snapshot (`client_name`, `product_name`, `unit_price_cents`) + FKs `ON DELETE SET NULL`; exclusões seguem permitidas e a venda permanece íntegra e legível. Provado por integração e runtime na QA.

## `default 0` de `sale_items.cost_cents` é rede de segurança da migração, não comportamento
- **O quê**: a coluna `cost_cents` nasceu `NOT NULL default 0` (migração 0006) para não quebrar linhas pré-existentes. O default permanece para qualquer INSERT futuro que esqueça de setar o custo.
- **Impacto**: nenhum hoje — `createSale` é o único caminho de insert e sempre grava o snapshot real (provado por integração). Vira lucro inflado silencioso se surgir outro caminho de insert em `sale_items` sem custo. Itens de vendas anteriores à migração têm cost 0 (lucro superestimado) — irrelevante sem produção.
- **Registrado em**: 2026-07-19 (specs/crm-dashboard, ADR-0014)
- **Plano**: aceito por ora; se surgir novo caminho de escrita em `sale_items`, exigir custo explícito (remover o default ou validar na fronteira).

## `toSafeInteger` replicado em três repositories
- **O quê**: a guarda `toSafeInteger` para agregados SQL (bigint → number seguro) está copiada em `products.repository.ts`, `sales.repository.ts` e agora `dashboard.repository.ts`.
- **Impacto**: baixo (função trivial e estável); risco só de divergência se alguém "melhorar" uma cópia. A convenção atual do projeto é não cruzar a fronteira de módulo com util.
- **Registrado em**: 2026-07-19 (specs/crm-dashboard)
- **Plano**: promover a um `apps/api/src/lib/` compartilhado quando surgir a 4ª cópia ou uma mudança que precise valer para todas.

## Dashboard: `date_trunc` usa TZ da sessão Postgres; label é UTC fixo
- **O quê**: as queries de vendas/lucro do mês usam `date_trunc('month', now())` (TZ da sessão do Postgres) e são statements separados (fora de transação, cada uma reavalia `now()`), enquanto `monthLabel` é formatado em UTC fixo no service.
- **Impacto**: na virada de mês, rótulo e números podem discordar se o Postgres de produção não estiver em UTC. A semântica UTC/borda de fuso já é aceita na spec (ADR-0014).
- **Registrado em**: 2026-07-19 (specs/crm-dashboard, review.md SUGESTÃO)
- **Plano**: garantir `TimeZone=UTC` no Postgres de produção; opcionalmente agregar o summary numa única transação.

## Seletor de cliente do pedido não pré-semeia a opção da cliente vinculada fora da 1ª página
- **O quê**: na edição de rascunho, se a cliente vinculada ao item está além da 1ª página (100) e não há busca digitada, o `<select>` fica sem opção visível correspondente (parece "Reposição") — o valor uuid é preservado no save, sem perda de dado.
- **Impacto**: confusão visual apenas; nenhum dado perdido (provado na QA do CRM-10).
- **Registrado em**: 2026-07-20 (specs/order-item-client-link, review.md SUGESTÃO)
- **Plano**: semear as opções com `{id, name}` do próprio item quando presente; resolver junto de qualquer retoque na tela de pedidos.

## Infra de E2E ainda não existe
- **O quê**: fluxos críticos de UI (login, venda, captura de lead) ainda não têm suíte E2E (Playwright); a decisão de cobertura em `plan.md` registra E2E como pendência.
- **Impacto**: regressões de UI só são pegas por teste manual até a infra existir. **Desde o LP-06 (2026-07-17) o fluxo crítico "captura de lead" existe e está sem E2E**; **desde o CRM-01 (2026-07-17), o fluxo "login" também** — o submit real do form no browser (Server Action → Set-Cookie → redirect) e o clique em "Sair" são cobertos só por unidade dos helpers + verificação de runtime da QA (curl/guards).
- **Registrado em**: 2026-07-16 (setup do harness); atualizado 2026-07-17 (specs/crm-auth); atualizado 2026-07-20 (specs/crm-orders: telas de Pedidos — RF-07/08 — com validação manual + build até o REL-01)
- **Plano**: criar infra Playwright no REL-01, nascendo com captura de lead + login cobertos (e venda quando existir).

## ~~Duração da sessão duplicada em constantes independentes (api + web)~~ (resolvido)
- **O quê**: os 30 dias da sessão viviam em constantes independentes na API e no web (maxAge do cookie).
- **Resolvido em**: 2026-07-17 (specs/crm-layout, RF-08) — o maxAge do cookie é **derivado do `expiresAt`** retornado pela API no login (`sessionCookieMaxAgeSeconds`, fail-safe 0); constante removida do web; provado fim-a-fim na QA (`Set-Cookie … Max-Age=2591999`).
