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

## Rate limit do endpoint público cobre qualquer método em `/leads`
- **O quê**: o guard `onRequest` de `leads.routes.ts` limita qualquer método/variante de path de `/leads` (fail-closed) — hoje só existe POST público.
- **Impacto**: nenhum agora; quando o CRM-04 criar rotas autenticadas de leads (GET/PATCH), elas cairiam no mesmo limite se compartilharem o path.
- **Registrado em**: 2026-07-17 (specs/leads-capture-api, QA rodada 3)
- **Plano**: revisitar o escopo do guard no CRM-04 (restringir a POST público ou separar paths).

## `updated_at` depende do runtime Drizzle ($onUpdate), não de trigger
- **O quê**: `updated_at` de `leads` só atualiza em UPDATEs feitos via Drizzle; SQL cru não passa pelo `$onUpdate`.
- **Impacto**: nenhum hoje (não há UPDATE fora do Drizzle); vira bug silencioso se surgir escrita fora do ORM.
- **Registrado em**: 2026-07-16 (specs/dev-db-drizzle-leads, QA rodada 2)
- **Plano**: promover a trigger no banco se/quando houver escrita fora do Drizzle.

## Exclusão física de cliente × histórico de vendas (decidir no CRM-06)
- **O quê**: `DELETE /clients/:id` é exclusão física (LGPD — exclusão a pedido). Quando o CRM-06 criar `sales.client_id`, o delete vai conflitar com a invariante "venda não se apaga" (04-domain-model).
- **Impacto**: nenhum hoje (não existem vendas); no CRM-06 a FK forçará a decisão.
- **Registrado em**: 2026-07-17 (specs/crm-clients, revisão de spec)
- **Plano**: CRM-06 decide: anonimização da cliente (mantém venda) vs bloqueio de exclusão com vendas + orientação na UI.

## Infra de E2E ainda não existe
- **O quê**: fluxos críticos de UI (login, venda, captura de lead) ainda não têm suíte E2E (Playwright); a decisão de cobertura em `plan.md` registra E2E como pendência.
- **Impacto**: regressões de UI só são pegas por teste manual até a infra existir. **Desde o LP-06 (2026-07-17) o fluxo crítico "captura de lead" existe e está sem E2E**; **desde o CRM-01 (2026-07-17), o fluxo "login" também** — o submit real do form no browser (Server Action → Set-Cookie → redirect) e o clique em "Sair" são cobertos só por unidade dos helpers + verificação de runtime da QA (curl/guards).
- **Registrado em**: 2026-07-16 (setup do harness); atualizado 2026-07-17 (specs/crm-auth)
- **Plano**: criar infra Playwright no REL-01, nascendo com captura de lead + login cobertos (e venda quando existir).

## ~~Duração da sessão duplicada em constantes independentes (api + web)~~ (resolvido)
- **O quê**: os 30 dias da sessão viviam em constantes independentes na API e no web (maxAge do cookie).
- **Resolvido em**: 2026-07-17 (specs/crm-layout, RF-08) — o maxAge do cookie é **derivado do `expiresAt`** retornado pela API no login (`sessionCookieMaxAgeSeconds`, fail-safe 0); constante removida do web; provado fim-a-fim na QA (`Set-Cookie … Max-Age=2591999`).
