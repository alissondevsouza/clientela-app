---
feature: Pedidos de reposição (orders)
module: orders
phase: spec
status: draft
size: L
created: 2026-07-20
updated: 2026-07-20
---

# Spec: Pedidos de reposição (orders)

## O Que

Módulo **Pedidos** no CRM: controle do que a consultora precisa pedir à Mary Kay para repor o estoque. Um pedido tem um ciclo de vida com status (**rascunho → pedido → entregue**, com **cancelamento** enquanto não entregue), itens vinculados aos produtos do catálogo (quantidade + custo unitário em centavos) e integração com o estoque: **marcar como entregue dá entrada atômica no estoque** dos produtos do pedido. A tela de montagem sugere os produtos com **estoque baixo** (integração com CRM-05).

## Por Quê

Hoje a consultora controla "o que preciso pedir" fora do sistema (caderno/planilha), mesmo já tendo o catálogo e o alerta de estoque baixo no CRM. O módulo fecha o ciclo do estoque: a **saída** já é automática (venda, CRM-06); falta a **entrada** rastreável (pedido → entrega). Item **CRM-09** do roadmap (Fase 2 — substituir caderno/planilha).

## Vocabulário de status

| Status | Label pt-BR | Significado |
|---|---|---|
| `draft` | Rascunho | Lista em montagem — "o que preciso pedir". Itens editáveis. |
| `placed` | Pedido | Pedido efetivamente feito à Mary Kay. Itens congelados; aguardando entrega. |
| `delivered` | Entregue | Produtos recebidos; estoque creditado. **Terminal.** |
| `canceled` | Cancelado | Desistência antes da entrega (a partir de `draft` ou `placed`). **Terminal.** Sem efeito no estoque. |

Transições válidas: `draft → placed`, `draft → canceled`, `placed → delivered`, `placed → canceled`. Qualquer outra é rejeitada.

## Requisitos

- **RF-01** — Criar pedido: `POST /orders` autenticado cria um pedido em `draft` para a consultora, com itens opcionais (pode nascer vazio). Cada item referencia um produto **do catálogo da consultora** (produto inexistente ou de outra consultora ⇒ 422), com `qty` inteiro ≥ 1 e `unitCostCents` inteiro ≥ 0 opcional — ausente ⇒ usa o `costCents` atual do produto. O `totalCents` do pedido é **sempre calculado no servidor** (Σ `qty × unitCostCents`).
- **RF-02** — Editar rascunho: `PUT /orders/:id/items` autenticado **substitui** a lista de itens de um pedido, permitido **somente** em `draft` (outros status ⇒ 409, erro em pt-BR). Substituir por lista **vazia é permitido** (esvaziar o rascunho; o bloqueio de pedido sem itens acontece no `place`). Mesmas validações e recálculo de total do RF-01.
- **RF-03** — Transições de status: endpoints autenticados `POST /orders/:id/place`, `POST /orders/:id/deliver`, `POST /orders/:id/cancel` aplicam a matriz de transições do vocabulário. Transição inválida ⇒ 409 com mensagem pt-BR acionável; pedido inexistente/de outra consultora ⇒ 404. `place` de pedido **sem itens** ⇒ 409 (não faz sentido pedir nada). As transições registram `placedAt`/`deliveredAt`/`canceledAt`. Guardas de estado **dentro de transação** (UPDATE condicional). Sob concorrência, o resultado é sempre uma história serial legal da matriz: nenhum efeito é aplicado duas vezes e nenhuma transição fora da matriz ocorre; exclusividade estrita (exatamente uma vence) é garantida onde há efeito colateral (`deliver`). Pares sem efeito colateral podem resolver como sequência válida (ex.: `place` vence e o `cancel` concorrente cancela o pedido já feito — equivalente a `draft → placed → canceled`).
- **RF-04** — Entrada de estoque na entrega: `deliver` credita `products.stock_qty += qty` de cada item **na mesma transação** da mudança de status (atômico: ou tudo, ou nada). Itens cujo produto foi excluído (`product_id` null) **não** creditam estoque, mas permanecem no histórico do pedido. `cancel` **não** tem efeito de estoque.
- **RF-05** — Snapshot do item (consistente com ADR-0013): cada item grava `product_name` e `unit_cost_cents` no momento da inclusão; `product_id` é FK `ON DELETE SET NULL`. A exclusão de um produto não quebra nem apaga pedidos existentes.
- **RF-06** — Listagem e detalhe: `GET /orders` autenticado, paginado (padrão do projeto), filtro opcional `?status=`, ordenado do mais recente para o mais antigo; itens não vêm na listagem. `GET /orders/:id` retorna o pedido completo (cabeçalho + itens). Tudo escopado por consultora.
- **RF-07** — Tela "Pedidos" no CRM (`/crm/orders`): entrada na navegação do grupo `(crm)`, mobile-first (~375px primeiro). Lista com status (badge com label pt-BR), total formatado (`R$`, centavos → exibição) e data; detalhe/edição de rascunho com adição de itens a partir do catálogo; botões de transição conforme o status atual. Estados obrigatórios: loading (skeleton), vazio (com call-to-action), erro (com retry).
- **RF-08** — Sugestão de reposição (integração CRM-05): na montagem do pedido, a tela oferece os produtos com estoque baixo (`stock_qty <= low_stock_threshold`, dado já exposto pela API de produtos) para inclusão com um toque. Sem endpoint novo.
- **RF-09** — Segurança: todas as rotas de `/orders` autenticadas pelo guard default-deny (ADR-0012); nenhuma entra na lista de exceções públicas. Toda query escopada por `consultant_id`.

## Critérios de Aceite

- [ ] (RF-01) `POST /orders` sem itens cria pedido `draft` com `totalCents = 0`; com itens, calcula `totalCents` no servidor ignorando qualquer total enviado pelo cliente (campo nem existe no contrato).
- [ ] (RF-01) Item com `productId` inexistente ou de outra consultora ⇒ 422 e nada é persistido.
- [ ] (RF-01) Item sem `unitCostCents` usa o `costCents` atual do produto; com `unitCostCents`, o override prevalece.
- [ ] (RF-02) `PUT /orders/:id/items` em `draft` substitui os itens e recalcula o total; em `placed`/`delivered`/`canceled` ⇒ 409 sem alterar nada.
- [ ] (RF-03) Cada transição válida da matriz funciona e grava o timestamp correspondente; cada transição inválida (ex.: `deliver` de `draft`, `cancel` de `delivered`, repetir `place`) ⇒ 409 e estado inalterado.
- [ ] (RF-03) `place` de pedido sem itens ⇒ 409.
- [ ] (RF-03/RF-04) Duas chamadas concorrentes de `deliver` no mesmo pedido: exatamente uma vence; o estoque é creditado **uma única vez** (teste de concorrência).
- [ ] (RF-03) Corrida `place` × `cancel` no mesmo rascunho resolve para uma **história serial legal**: ou exatamente uma vence (a outra 409), ou ambas aplicam em ordem equivalente à sequência válida `draft → placed → canceled` (estado final `canceled`, `placedAt` e `canceledAt` não-nulos e consistentes). Nunca há efeito de estoque nem transição fora da matriz. Exclusividade estrita ("exatamente uma vence") é exigida apenas onde há efeito colateral — `deliver` (teste de concorrência para ambos os cenários).
- [ ] (RF-04) `deliver` credita o estoque de todos os itens com produto vivo na mesma transação; item com produto excluído não credita e não falha a entrega.
- [ ] (RF-04) `cancel` (de `draft` ou `placed`) não altera estoque.
- [ ] (RF-05) Excluir um produto usado em pedido: item permanece com `productName` legível e `productId` null.
- [ ] (RF-06) `GET /orders` pagina, filtra por status e nunca retorna pedidos de outra consultora; `GET /orders/:id` de pedido alheio ⇒ 404.
- [ ] (RF-07) `/crm/orders` renderiza lista (badge de status + total em `R$` + data `dd/mm/aaaa`), detalhe com itens e ações de transição válidas para o status; estados loading/vazio/erro presentes; funcional em ~375px.
- [ ] (RF-08) Na montagem do rascunho, produtos com estoque baixo aparecem como sugestão e podem ser adicionados ao pedido.
- [ ] (RF-09) Qualquer rota de `/orders` sem sessão válida ⇒ 401.

## Fora de Escopo

- **Atualizar o custo do produto** (`products.cost_cents`) a partir do custo do pedido na entrega — o custo do catálogo segue gerido no CRUD de produtos (CRM-05).
- **Entrega parcial** (receber só parte dos itens) — pedido é entregue por inteiro.
- **Estorno de entrega** (`delivered` é terminal; erro de operação se resolve com ajuste manual de estoque no CRUD de produtos).
- Exclusão física de pedido (cancela-se; histórico preservado — invariante 5 do domínio, por analogia).
- Fornecedores múltiplos, número de pedido Mary Kay, anexos/nota fiscal, frete/custos extras.
- Lembrete/automação de "hora de pedir" (Fase 3 — relacionamento/notificações).
- E2E Playwright (infra ainda não existe — REL-01; registrar pendência no handoff).

## Restrições Conhecidas

- Multi-tenant-ready: `orders.consultant_id` obrigatório; nenhuma query assume consultora única (nota do `04-domain-model.md`).
- Dinheiro sempre inteiro em centavos (`integer`); formatação `R$` só no front.
- Rotas seguem o monólito modular (routes → service → repository) e o guard default-deny existente; contratos Zod em `packages/shared` reusados pelo web.
- Migração de banco: 2 tabelas novas (`orders`, `order_items`) via `drizzle-kit generate` — sem mudança destrutiva.
