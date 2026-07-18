---
feature: crm-clients
module: api, web, shared
phase: spec
status: draft
size: L
created: 2026-07-17
updated: 2026-07-17
---

# Spec: crm-clients (CRM-03 — Clientes)

## O Que

CRUD de clientes no CRM: tabela `clients` (pendurada em `consultants` — domínio multi-tenant-ready), módulo `clients` na API (rotas autenticadas com paginação e busca), contratos em `packages/shared` e telas mobile-first no web: listagem com busca e estados obrigatórios, cadastro, detalhe/edição com exclusão (LGPD) e botão WhatsApp que abre conversa com a cliente.

## Por Que

Substituir o caderno: CRM-03 do `specs/ROADMAP.md`; base para vendas (CRM-06) e relacionamento (Fase 3). Campos do domínio em `project-memory/04-domain-model.md` (name, whatsapp, birthday, skin_tone, notes).

## Requisitos

- **RF-01** — Tabela `clients` via migração Drizzle: `consultant_id` uuid NOT NULL FK → `consultants` **com índice** (relação do domínio; proibido atalho de consultora única), `name` text NOT NULL, `whatsapp` text NOT NULL, `birthday` `date` nullable (ausência = não informado), `skin_tone` text nullable, `notes` text nullable, convenções de `database.md` (uuid v7, timestamptz, NOT NULL por padrão).
- **RF-02** — Contratos em `packages/shared`: schema de criação (name obrigatório ≥ 2 chars, whatsapp no mesmo padrão de validação do lead, birthday ISO date opcional sem data futura, skin_tone/notes opcionais; mensagens pt-BR cobrindo campo ausente) + schema de **update parcial onde campos nullable aceitam `null` explícito para limpar** (ausente = não alterar; o form mapeia vazio → `null`) + schema de resposta + envelope de **lista paginada** reutilizável (`{ data, page, perPage, total }`); `search` limitado a 100 chars no schema de query.
- **RF-03** — API módulo `clients` (routes → service → repository, factories injetadas; TODAS as rotas autenticadas pelo guard existente): `GET /clients` (paginação obrigatória `?page`/`?perPage` com default 20 e máximo 100; `?search` filtra por nome ou WhatsApp, case-insensitive), `POST /clients` (201), `GET /clients/:id` (200/404), `PATCH /clients/:id` (parcial, 200/404), `DELETE /clients/:id` (204/404 — exclusão física a pedido, LGPD).
- **RF-04** — Toda operação é escopada pela consultora da **sessão** (`consultant_id` vem do token validado, nunca do body); cliente de outra consultora responde 404 (não 403 — não vaza existência).
- **RF-05** — Erro de domínio `ClientNotFoundError` mapeado para 404 no error-handler central com mensagem pt-BR; validação de body/query → 422 pt-BR (padrão existente). Param `:id` validado como uuid; **id malformado ⇒ 404** (mesma resposta de inexistente — não vaza formato interno).
- **RF-06** — Web `/crm/clients`: listagem mobile-first (cards) buscada no servidor (RSC → API com Bearer do cookie), busca por query param (`?search=`, form GET), paginação (anterior/próxima), e os estados obrigatórios de `web.md`: **loading (skeleton via `loading.tsx`)**, vazio (call-to-action "cadastrar primeira cliente"), erro (mensagem + retry) e conteúdo. `searchParams` inválidos (`?page=abc`, `?page=0`) caem nos defaults (saneamento Zod na fronteira da page), não em erro. Cada card mostra nome, WhatsApp e botão de conversa.
- **RF-07** — Web `/crm/clients/new`: formulário RHF + schema compartilhado (mesma validação da API), estados loading/erro, sucesso → redirect para o **detalhe** (`/crm/clients/[id]`) com `revalidatePath`.
- **RF-08** — Web `/crm/clients/[id]`: detalhe com edição (form pré-preenchido, PATCH), exclusão com confirmação explícita (dupla ação — não um clique só), estados loading (skeleton) e erro, e **botão WhatsApp** abrindo `wa.me` com o número da cliente **normalizado para E.164** (`toWaPhone`: número armazenado com 10–11 dígitos ganha prefixo "55"; com 12–13 dígitos já iniciando em "55" passa direto; demais casos passam como estão — fallthrough total, `buildWhatsAppUrl` aceita 10–15 dígitos) via `buildWhatsAppUrl` do LP-04; sem mensagem pré-preenchida obrigatória.
- **RF-09** — Datas exibidas `dd/mm/aaaa`; textos pt-BR; acessibilidade mínima (labels, botões com texto/aria-label, foco navegável).
- **RF-10** — LGPD/logs: nenhum nome/WhatsApp/dado pessoal em log (IDs apenas); Server Actions repassam somente o necessário.
- **RF-11** — Retoques adiados do CRM-02 (Decisions Log): `role="list"` nas `<ul>` da navegação e alvo de toque maior do botão "Sair" no mobile.

## Critérios de Aceite

- [ ] (RF-01) Integração (Testcontainers): tabela criada com colunas/nullabilidade/FK+índice; insert válido funciona; FK inválida falha.
- [ ] (RF-02) Unidade (shared): create aceita mínimo válido; rejeita name curto/ausente e whatsapp inválido com pt-BR (incl. `{}`); rejeita `birthday` futuro com pt-BR; paginação: `perPage > 100` ⇒ **422**.
- [ ] (RF-03) Integração: fluxo completo — POST 201 → GET lista (paginada, total correto) → GET :id 200 → PATCH altera parcial → DELETE 204 → GET :id 404; busca por fragmento de nome e de whatsapp (case-insensitive) retorna só as que casam; `?page`/`?perPage` respeitados com defaults e máximo.
- [ ] (RF-04) Integração: com duas consultoras semeadas, a sessão da consultora A não lista nem acessa (GET/PATCH/DELETE ⇒ 404) cliente da consultora B.
- [ ] (RF-05) Integração: id inexistente ⇒ 404 `{ error: { code, message pt-BR } }`; **id malformado (não-uuid) ⇒ 404**; body inválido ⇒ 422 pt-BR; sem token ⇒ 401 (guard); update com `null` explícito **limpa** campo nullable (birthday/skin_tone/notes) e ausência de campo **não altera**.
- [ ] (RF-06..RF-08) Unidade dos helpers do web (api-client de clients: URLs, Bearer, mapeamento de erro; `formatDateBr`; `toWaPhone` com e sem código do país) + QA de runtime com checklist (lista com dados/vazio/busca, `loading.tsx` presente nas rotas de dados, criar, editar, excluir com confirmação, link `wa.me/55…` correto para cliente cadastrada com número local de 11 dígitos).
- [ ] (RF-11) Inspeção: `role="list"` presente nas ULs da nav; "Sair" com alvo ≥ 44px no mobile.

## Fora de Escopo

- Conversão lead → cliente e vínculo `lead_id` (CRM-04); histórico de compras no detalhe (CRM-06); "produtos que usa" estruturado (usa `notes` por ora — decisão registrada); importação em massa; foto da cliente; soft delete (exclusão é física, LGPD).

## Restrições Conhecidas

- **LGPD × histórico de vendas**: o DELETE físico desta fase colide com `Client 1—N Sale` e "venda não se apaga" quando o CRM-06 criar a FK — registrar como pendência na graduação (CRM-06 decide: anonimização vs bloqueio com vendas).

- Sem E2E (known-issue — REL-01); telas cobertas por unidade dos helpers + QA de runtime com checklist obrigatório no plan.
- Busca com `ILIKE %fragmento%` sem índice trigram nesta escala (decisão registrada; revisitar se a lista crescer).
- `skin_tone` como texto livre nullable (sem enum — vocabulário da consultora ainda não definido; enum exigiria decisão de conteúdo que é do humano, LP-08).
