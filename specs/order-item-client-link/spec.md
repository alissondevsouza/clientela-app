---
feature: Encomendas de clientes no pedido (order item ↔ client)
module: orders
phase: spec
status: approved
size: L
created: 2026-07-20
updated: 2026-07-20
---

# Spec: Encomendas de clientes no pedido

## O Que

Cada **item** de um pedido de reposição (CRM-09) pode, opcionalmente, ser vinculado a uma **cliente** — "esse batom é encomenda da Maria". No form do pedido, a consultora escolhe a cliente (com busca digitada) ou faz **cadastro rápido** (nome + WhatsApp) sem sair da tela — quem encomenda vira cliente. O detalhe do pedido mostra para quem é cada item, em qualquer status.

## Por Quê

Boa parte do que a consultora pede à Mary Kay é encomenda de cliente específica, não reposição de prateleira. Registrar o vínculo no item (1) evita o caderno paralelo de "quem pediu o quê", (2) transforma encomenda em cadastro de cliente (mesma filosofia da conversão lead → cliente), e (3) prepara a Fase 3 ("chegou o produto da Maria"). Item **CRM-10** do roadmap.

## Requisitos

- **RF-01** — Contrato: o item de criação/substituição (`createOrderSchema` / `replaceOrderItemsSchema`) ganha `clientId` **uuid opcional/nullable** (ausente/null = item de reposição). A resposta (`orderItemSchema`) ganha `clientId` (uuid nullable) e `clientName` (string nullable) — **derivado por join com `clients` na leitura**, não armazenado (nome atual da cliente; ambos null quando o item não tem cliente ou a cliente foi excluída).
- **RF-02** — Validação: `clientId` informado deve referenciar cliente **da consultora** — inexistente ou de outra consultora ⇒ 422 (mesma mensagem, sem vazar existência), validado no service contra o banco (simétrico à validação de produto do CRM-09), nada persistido em caso de erro.
- **RF-03** — Persistência e LGPD: `order_items` ganha apenas `client_id` (uuid nullable, FK → clients `ON DELETE SET NULL`, **com índice**). **Sem snapshot de nome**: pedido de reposição não é registro financeiro — a justificativa do ADR-0013 (guarda de registro de venda) não se aplica; excluir a cliente (direito ao apagamento, `security.md`) remove o vínculo por completo e o item passa a aparecer como reposição. Migração aditiva, sem backfill.
- **RF-04** — Sem mudança de comportamento do ciclo de vida: transições, total, entrada de estoque e invariantes do CRM-09/ADR-0015 permanecem idênticas — o vínculo é informativo, não altera estoque nem gera venda.
- **RF-05** — Form (web): cada linha de item ganha seletor opcional de cliente (default "Reposição (sem cliente)"), com **busca digitada** — a lista inicial vem do servidor (primeira página) e a busca usa o filtro `search` já existente da API de clientes via server action (a base de clientes cresce sem limite; lista fixa de 100 seria teto estrutural). Disponível na criação e na edição de rascunho. Item cuja cliente foi excluída aparece na edição como "Reposição (sem cliente)" (o vínculo já não existe).
- **RF-06** — Cadastro rápido: ação "Nova cliente" no form abre cadastro mínimo (nome + WhatsApp, `createClientSchema` existente) **sem `<form>` aninhado** (HTML inválido — inputs controlados + botão com server action). Ao salvar: cliente criada via módulo de clientes existente (sem endpoint novo), entra selecionada no item, `/crm/clients` revalidada. Erros pt-BR em `role="alert"` sem criar nada.
- **RF-07** — Visão "para quem é": o detalhe do pedido exibe o nome da cliente por item em todos os status (nome atual, via join). Cliente excluída ⇒ item sem marcação de cliente (consequência aceita do RF-03).
- **RF-08** — Segurança: nada novo público; validação de `clientId` sempre escopada por `consultant_id`; sem dado pessoal em log.

## Critérios de Aceite

- [ ] (RF-01) POST /orders e PUT /orders/:id/items aceitam item com e sem `clientId`; resposta traz `clientId`/`clientName` (null quando sem cliente).
- [ ] (RF-01) Renomear a cliente reflete no GET do pedido (nome derivado, não snapshot).
- [ ] (RF-02) `clientId` inexistente ou de outra consultora ⇒ 422 e nada persistido (criação e replace).
- [ ] (RF-03) Excluir a cliente após criar o pedido ⇒ GET retorna o item com `clientId` e `clientName` null (vínculo apagado); pedido íntegro nos demais campos.
- [ ] (RF-03) Migração aplica limpo; itens pré-existentes seguem válidos (null).
- [ ] (RF-04) Suíte do CRM-09 permanece verde sem alteração de asserts de ciclo de vida/estoque.
- [ ] (RF-05) Form salva item com cliente e com default "sem cliente"; edição de rascunho preserva a seleção; busca digitada encontra cliente fora da primeira página (teste de comportamento da action de busca; UI manual até REL-01).
- [ ] (RF-06) Cadastro rápido cria a cliente e a deixa selecionada no item; WhatsApp inválido ⇒ erro no form, nada criado; `/crm/clients` mostra a nova cliente.
- [ ] (RF-07) Detalhe exibe o nome da cliente por item em `draft`/`placed`/`delivered`/`canceled`.
- [ ] (RF-08) Rotas seguem 401 sem sessão; teste de escopo cobre cliente de outra consultora.

## Fora de Escopo

- Atalho "registrar venda para a cliente" a partir do item entregue (futuro, com REL-05).
- Notificação "produto da cliente chegou" (Fase 3).
- Vínculo por pedido inteiro (é por item, por decisão).
- Deduplicação de clientes no cadastro rápido (CRUD atual já permite duplicata; a busca no seletor mitiga).
- Alterar vínculo em pedido não-`draft` (itens congelados fora do rascunho, como no CRM-09).

## Restrições Conhecidas

- `whatsapp` NOT NULL em clients — cadastro rápido exige nome + WhatsApp.
- Módulos não importam internals: a checagem escopada de clientes em orders acessa a tabela `clients` no repository de orders (precedente: sales); leitura do nome via LEFT JOIN no `loadOrder`.
- Migração aditiva nova — proibido editar a `0007` aplicada.
