---
feature: Encomendas de clientes no pedido (order item ↔ client)
module: orders
phase: review
status: done
round: 1
created: 2026-07-20
updated: 2026-07-20
depends_on: [spec.md, plan.md, validate.md]
---

# Review: Encomendas de clientes no pedido (rodada 1)

Revisão adversarial e neutra do delta desta feature (CRM-10). Working tree
contém trabalho de ciclos anteriores; revisado SOMENTE o delta de
order-item-client-link.

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite (validação escopada, join derivado, total no servidor)
- [x] Edge cases: item sem cliente (null), mistura com/sem cliente, clientIds duplicados deduplicados, lista vazia, cliente inexistente/outra consultora, SET NULL na exclusão
- [x] Erro de domínio certo (`InvalidOrderClientError` → 422 `INVALID_ORDER_CLIENT`), mapeado na fronteira; sem catch engolido

### Arquitetura
- [x] Camadas routes → service → repository respeitadas; validação de cliente no service via porta `findClientsByIds` (simétrica a produtos); DI por construtor
- [x] Zod na fronteira; `clientId` no `orderItemInputSchema` de `packages/shared`, reusado pelo form via `orderItemFieldsSchema`
- [x] Web: RSC busca `listClients` inicial em `Promise.all`; `"use client"` só nos componentes interativos (client-select, quick-client-form); mobile-first (h-11 md:h-9); role="alert" nos erros
- [x] Dinheiro em centavos; sem coluna monetária nova; sem transação nova necessária (vínculo é só `client_id`)

### Banco
- [x] Migração `0008_volatile_joseph.sql` aditiva: ADD COLUMN client_id + FK ON DELETE SET NULL + índice `order_items_client_id_idx`. `0007` intocada. Aplica limpo (migrate real na suíte)
- [x] FK indexada; `loadOrder` usa LEFT JOIN (2 queries fixas — sem N+1); listagens paginadas (inalteradas)

### Segurança e LGPD
- [x] Rotas de orders 401 sem sessão (provado no runtime); nenhuma rota pública nova
- [x] Validação de `clientId` sempre escopada por `consultant_id`; 422 com mensagem única (não vaza existência) — provado no runtime e por integração (cliente de outra consultora ⇒ mesma mensagem)
- [x] Sem PII em log; **decisão deliberada de NÃO estender snapshot do ADR-0013**: `clientName` derivado por join, exclusão da cliente apaga o vínculo (SET NULL) — direito ao apagamento cumprido; provado no runtime (DELETE ⇒ clientId/clientName null)
- [x] `OrderFormClient` expõe só `id`/`name` ao client (nunca WhatsApp/PII no seletor)

### Tipos e qualidade
- [x] Sem `any`/`as`/`!` injustificados; `OrderItemData.clientId` tipado `string | null`; guarda explícita `productId === null` no restock
- [x] Named exports; constantes nomeadas (sem magic strings); early returns

### Testes
- [x] Cada critério de aceite tem teste executável derivado do spec: RF-01 (com/sem cliente, resposta com nulls), rename reflete (join), RF-02 (422 criação e replace, nada persistido), RF-03 (SET NULL apaga vínculo; pedido íntegro), RF-04 (deliver com cliente preserva; suíte CRM-09 verde), RF-08 (escopo cross-tenant)
- [x] Integração com Testcontainers (Postgres real); unidade com fakes por construtor (sem vi.mock)
- [x] Nenhum teste relaxado/skipado

### Escopo
- [x] Todas as tasks (1.1, 2.1, 2.2, 2.3, 3.1) implementadas
- [x] Nenhum arquivo fora do escopo modificado no delta

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | Na EDIÇÃO de rascunho, o `ClientSelect` recebe `value=clientId` mas as `<option>` vêm só da 1ª página de clientes (100) + busca. Se a cliente vinculada estiver além da 1ª página e a usuária não digitar a busca, o `<select>` renderiza sem opção selecionada visível (parece "Reposição (sem cliente)"). O valor RHF permanece o uuid e é preservado no save (sem perda de dado — vínculo NÃO se perde), mas a exibição confunde. | `apps/web/src/components/orders/client-select.tsx`; `apps/web/src/app/(crm)/crm/orders/[id]/page.tsx:142` | Semear as `options` iniciais com a cliente já vinculada do item (mesmo que fora da 1ª página), ex.: incluir `{id: item.clientId, name: item.clientName}` do próprio pedido como opção default. Não bloqueante. |
| 2 | SUGESTÃO | RF-07 pede exibir o nome da cliente "em todos os status incluindo draft". Em `draft` o detalhe mostra o form de edição (cliente via `<select>` selecionado), não o texto "para {clientName}". Cumpre o requisito de forma funcional (nome visível no seletor), mas a leitura "para X" só aparece em placed/delivered/canceled. Coerente com a natureza editável do draft. | `apps/web/src/app/(crm)/crm/orders/[id]/page.tsx:196-247` | Aceitável como está; se quiser paridade visual, exibir também um resumo read-only "para X" acima do seletor. Não bloqueante. |

Nenhum CRÍTICO. Nenhum ALERTA.

## Conformidade com ADRs
- **ADR-0012** (default-deny auth): rotas de orders seguem autenticadas; 401 provado no runtime.
- **ADR-0013** (snapshot em venda / SET NULL): não-extensão deliberada e correta — pedido não é registro financeiro; `clientName` por join, sem snapshot. Justificativa documentada no schema e no plan.
- **ADR-0015** (ciclo de vida/concorrência de orders): intocado — vínculo é informativo, não altera transições nem estoque; suíte de ciclo de vida verde.

## Veredito

APROVADO — lint/typecheck limpos, suíte 807/807 verde (integração com Postgres
real inclusa), build web ok, runtime provou o fluxo ponta-a-ponta (401, vínculo,
join, rename reflete, 422 sem vazar existência, SET NULL apaga vínculo). Todos os
critérios de aceite atendidos. Dois achados SUGESTÃO (não bloqueantes). Zero
CRÍTICO.
