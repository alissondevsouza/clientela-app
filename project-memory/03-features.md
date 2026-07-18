# 03 — Funcionalidades

> Este documento descreve o **escopo conceitual** por fase. O acompanhamento de execução (itens, status, dependências) vive em [`specs/ROADMAP.md`](../specs/ROADMAP.md) — é lá que os agentes olham para saber o que fazer.

Escopo dividido em fases. A regra é entregar cada fase **usável de ponta a ponta** antes de começar a próxima — o feedback real da consultora redireciona as prioridades seguintes.

## Fase 1 — Landing page (primeira entrega)

Página profissional pública, com intenção de venda e captação.

- [ ] **Apresentação da consultora** — foto, história, forma de atendimento.
- [ ] **CTA principal: botão WhatsApp** — link `wa.me` com mensagem pré-preenchida. A venda fecha no WhatsApp; o site direciona.
- [ ] **Catálogo de destaque** — cards de produto (foto, nome, preço) com botão "Pedir pelo WhatsApp" que pré-preenche a mensagem com o nome do produto (rastreia qual produto gerou o contato).
- [ ] **Captura de leads** — formulário (nome, WhatsApp, interesse) com **isca de conversão** (ex.: análise de pele gratuita, desconto na primeira compra, catálogo do mês). Consentimento LGPD.
- [ ] **Prova social** — depoimentos de clientes.
- [ ] SEO básico, mobile-first, página rápida.
- [ ] Leads gravados no banco → aparecerão no CRM na Fase 2.

## Fase 2 — CRM MVP

O mínimo que substitui o caderno/planilha.

- [ ] **Autenticação** — login da consultora (usuária única).
- [ ] **Clientes** — cadastro e listagem: nome, WhatsApp, aniversário, tom de pele, produtos que usa, observações, histórico de compras. Botão de abrir conversa no WhatsApp.
- [ ] **Leads** — lista dos cadastros vindos da landing, com status (novo → contatado → virou cliente / descartado).
- [ ] **Produtos & estoque** — catálogo dela: preço de custo, preço de venda, quantidade em mãos. Alerta de estoque baixo. Visão de capital parado em produto.
- [ ] **Vendas** — registrar venda: cliente, itens, valor, forma de pagamento. Suporte a **fiado/parcelado** com controle de "quem me deve" e baixa de pagamento. Venda dá baixa no estoque.
- [ ] **Dashboard** — vendas do mês, lucro estimado (venda − custo), a receber, meta mensal.

## Fase 3 — Relacionamento (a funcionalidade matadora)

O que gera recompra: lembrar de falar com a cliente certa na hora certa.

- [ ] **Lembretes de recompra** — produto consumível comprado há X dias ⇒ sugerir follow-up ("a base da Maria deve estar acabando").
- [ ] **Aniversariantes** — lista da semana/mês com mensagem pronta.
- [ ] **Follow-up de leads** — lead sem contato há N dias aparece em destaque.
- [ ] **Central de tarefas do dia** — tela única "com quem falar hoje", cada item com botão que abre o WhatsApp com mensagem modelo preenchida.

## Fase 4 — Marketing e extras (conforme necessidade)

- [ ] Mini-campanhas: filtrar clientes (ex.: compraram skincare, não compram há 60 dias) + mensagem modelo para copiar/enviar.
- [ ] Relatórios: produtos mais vendidos, melhores clientes, lucro por produto.
- [ ] Agenda de sessões de demonstração/análise de pele.
- [ ] Metas e acompanhamento de comissão/nível na Mary Kay.

## Ideias estacionadas (não fazer agora)

Registrar aqui o que surgir de ideia para não perder — e para não virar escopo antes da hora.

- Multi-tenant (SaaS para outras consultoras de venda direta).
- Integração oficial com WhatsApp Business API (envio automático).
- Pedidos online com checkout.
