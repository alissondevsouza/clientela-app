---
feature: crm-clients
module: api, web, shared
phase: plan
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, research.md]
---

# Plan: crm-clients

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `clients.consultant_id` NOT NULL FK → consultants com índice; toda query do repository filtra por `consultantId` | Domínio multi-tenant-ready (04-domain-model: proibido atalho de consultora única); 404 uniforme para "não existe" e "não é seu" (não vaza existência) |
| Identidade da sessão: as rotas de clients extraem o Bearer e chamam `authService.validateSession(token)` para obter `consultant.id` (padrão do `/auth/me`), passando `consultantId` como parâmetro ao service de clients | Guard `onRequest` não injeta contexto tipado (decisão do CRM-01); mantém `clients.service` puro (não conhece HTTP/auth) |
| Paginação: `paginated(schema)` genérico em `packages/shared` → `{ data, page, perPage, total }`; query `page ≥ 1` default 1, `perPage` default 20 máx. 100 (clamp via schema `.max(100)` — valores acima são **rejeitados 422**, não clampados: explícito > silencioso) | `api.md` exige default e máximo; contrato reutilizável nos próximos CRUDs (produtos, vendas) |
| Busca: `?search=` aplica `ILIKE %term%` em `name` OR `whatsapp`, sem índice trigram | Escala de dezenas/centenas de clientes; revisitar com known-issue se crescer |
| `birthday` como coluna `date` (modo string do Drizzle) — contrato ISO `yyyy-mm-dd` opcional/nullable; formatação `dd/mm/aaaa` só no front | Aniversário não tem fuso/hora; string evita bugs de timezone do driver |
| Validação de whatsapp: reusar a regra/refinement do lead extraindo para módulo comum em shared (fonte única) — sem duplicar regex | `core.md`: nunca duplicar contrato |
| `updateClientSchema` = `createClientSchema.partial()` com `.refine` de "ao menos um campo" | PATCH parcial semanticamente correto; 422 para body vazio |
| DELETE físico com 204; confirmação de exclusão no web em dois passos (botão "Excluir" → confirmação explícita antes da action) | LGPD (exclusão a pedido); sem soft delete (database.md default) |
| Web: helper `crmApiFetch`-like **não genérico demais**: módulo `lib/clients-api.ts` com funções puras (`listClients`, `getClient`, `createClient`, `updateClient`, `deleteClient`) recebendo `{ fetchImpl, apiUrl, token }` | Padrão dos helpers existentes (submit-lead, auth); genérico prematuro vira framework |
| Server Actions (`(crm)/crm/clients/actions.ts`): create/update/delete leem token do cookie, chamam o helper, `revalidatePath("/crm/clients")`; erros retornam `{ ok: false, message }` pt-BR | Padrão do projeto; browser nunca fala com a API |
| Listagem RSC: page lê `searchParams` (`search`, `page`), busca via helper com token do cookie; token ausente já é barrado pelo layout guard | Server-first; sem fetch em useEffect |
| Botão WhatsApp da cliente: `toWaPhone(digits)` novo em `lib/whatsapp.ts` (10–11 dígitos ⇒ prefixo "55"; 12–13 iniciando "55" ⇒ direto) e `buildWhatsAppUrl({ phone: toWaPhone(...) })` sem mensagem | Revisão de spec (CRÍTICO): número BR local geraria `wa.me` morto; regra explícita + testes |
| Formatação de datas: `formatDateBr(isoDate)` **adicionada** ao `lib/format.ts` existente (preservando `formatBRL`) + testes | `web.md` (dd/mm/aaaa); arquivo já existe — modificar, não criar |
| `loading.tsx` com skeleton para `/crm/clients` e `/crm/clients/[id]` | `web.md` exige loading em toda tela de dados (CRÍTICO da revisão) |
| `searchParams` saneados com Zod na page (page/perPage/search) com fallback para defaults | Input externo de URL (core.md); `?page=abc` não pode virar error boundary |
| Busca: termo com dígitos também é comparado com a versão só-dígitos (casa com o armazenamento do whatsapp) | Sugestão da revisão; comportamento documentado + teste |
| `birthday` rejeita data futura (pt-BR) | Evita lixo para aniversariantes (REL-03) |
| RF-11 (retoques a11y do shell) entram como task própria | Compromisso registrado no Decisions Log do CRM-02 |

## Arquivos a Criar/Modificar

### Criar

| Arquivo | Propósito |
|---------|-----------|
| `packages/shared/src/pagination.ts` (+ teste) | `paginationQuerySchema` (page/perPage com defaults/máximo) + `paginated(itemSchema)` |
| `packages/shared/src/clients.ts` (+ teste) | `createClientSchema`, `updateClientSchema`, `clientSchema`, tipos |
| `packages/shared/src/whatsapp-validation.ts` (ou equivalente) | Regra única de whatsapp extraída do lead (reusada por leads e clients) |
| `apps/api/src/db/schema/clients.ts` | Tabela `clients` |
| `apps/api/drizzle/0002_*.sql` | Migração gerada |
| `apps/api/src/db/clients-table.integration.test.ts` | Integração da tabela |
| `apps/api/src/modules/clients/clients.errors.ts` | `ClientNotFoundError` |
| `apps/api/src/modules/clients/clients.repository.ts` | CRUD + list paginada com search, sempre por consultantId |
| `apps/api/src/modules/clients/clients.service.ts` (+ teste unidade) | Regras: not-found, montagem da paginação |
| `apps/api/src/modules/clients/clients.routes.ts` | 5 rotas com schemas shared + identidade da sessão |
| `apps/api/src/modules/clients/clients.integration.test.ts` | Fluxo completo + escopo por consultora + busca + paginação |
| `apps/web/src/lib/clients-api.ts` (+ teste) | Helpers puros do CRUD (Bearer, mapeamento de erro pt-BR) |
| `apps/web/src/app/(crm)/crm/clients/actions.ts` | Server Actions create/update/delete |
| `apps/web/src/app/(crm)/crm/clients/error.tsx` | Estado de erro com retry (boundary do App Router) |
| `apps/web/src/app/(crm)/crm/clients/loading.tsx` | Skeleton da listagem |
| `apps/web/src/app/(crm)/crm/clients/[id]/loading.tsx` | Skeleton do detalhe |
| `apps/web/src/app/(crm)/crm/clients/new/page.tsx` | Cadastro |
| `apps/web/src/app/(crm)/crm/clients/[id]/page.tsx` | Detalhe/edição/exclusão + botão WhatsApp |
| `apps/web/src/components/clients/client-form.tsx` | Form RHF compartilhado entre new/edit |
| `apps/web/src/components/clients/client-card.tsx` | Card da listagem (nome, whatsapp, link conversa) |
| `apps/web/src/components/clients/delete-client-button.tsx` | Exclusão com confirmação (client component mínimo) |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Reexports novos |
| `packages/shared/src/leads.ts` | Whatsapp passa a usar a regra extraída (sem mudança de comportamento — testes existentes provam) |
| `apps/api/src/db/schema/index.ts` | Reexport clients |
| `apps/api/src/plugins/error-handler.ts` | Branch `ClientNotFoundError` → 404 |
| `apps/api/src/app.ts` | Compor `createClientsRoutes({ service, authService })` |
| `apps/api/src/index.ts` | Instanciar repository/service de clients |
| `apps/web/src/components/crm/crm-nav.tsx` | RF-11: `role="list"` |
| `apps/web/src/components/crm/crm-header.tsx` | RF-11: alvo do "Sair" ≥ 44px no mobile |
| `apps/web/src/lib/format.ts` (+ teste) | Adicionar `formatDateBr` (preservar `formatBRL` existente) |
| `apps/web/src/lib/whatsapp.ts` (+ teste) | Adicionar `toWaPhone` (E.164 BR) |
| `apps/web/src/app/(crm)/crm/clients/page.tsx` | Substituir o placeholder do CRM-02 pela listagem real |

## Cobertura de Testes (decisão obrigatória)

| Nível | Obrigatório? | Justificativa |
|-------|--------------|---------------|
| Unidade | **Sim** | Schemas shared (incl. paginação), service (not-found, escopo), helpers web (URLs/Bearer/erros, formatDateBr) |
| Integração (Testcontainers) | **Sim** | Muda schema (tabela nova) + contrato (5 rotas novas + paginação) + invariante (escopo por consultora) |
| E2E | **Pendência (sem infra)** | CRUD de UI; checklist de runtime no QA; REL-01 |
| Regressão | n.a. | Não é bug |

## Checklist de QA de runtime (validate.md)

1. Login real → `/crm/clients` vazio mostra CTA de cadastro; `loading.tsx` existe para lista e detalhe (inspeção de arquivos + navegação client-side mostra skeleton).
2. Criar cliente (form) → aparece na lista; validação pt-BR com campos inválidos.
3. Busca: fragmento de nome (case-insensitive) filtra; busca sem resultado mostra estado vazio de busca; paginação anterior/próxima funciona (usar `?perPage` baixo) e **preserva `?search`** ao trocar de página.
4. Editar (PATCH parcial) reflete na lista/detalhe; datas dd/mm/aaaa.
5. Botão WhatsApp do detalhe: cliente cadastrada com número local de 11 dígitos gera `wa.me/55<número>` (E.164).
6. Excluir exige confirmação; após excluir, some da lista; GET direto do id → 404 → UI de erro adequada.
7. API sem token nas rotas `/clients` → 401 (guard).
8. RF-11: `role="list"` no DOM da nav; alvo do "Sair" ≥ 44px em ~375px.
9. Logs dos servidores sem nome/whatsapp (grep).

## Migração de Banco

Aditiva (tabela `clients`), gerada com `drizzle-kit generate`. Sem backfill; rollback = drop.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Coluna `date` (birthday) com surpresa de timezone/driver | média | Modo string do Drizzle + teste de integração com ida-e-volta do valor |
| Extração da regra de whatsapp regredir o lead | baixa | Testes existentes de leads continuam verdes (rodada completa no checkpoint) |
| Dupla validação de sessão por request (guard + rota) | baixa (custo) | Lookup indexado e barato; padrão já aceito no CRM-01 (registrado como sugestão futura) |

## Definition of Done

- [ ] Critérios de aceite do spec.md atendidos e testados
- [ ] `bun run lint`/`typecheck`/`test` verdes (incl. integração)
- [ ] Build web ok
- [ ] Conformidade com rules e ADRs
