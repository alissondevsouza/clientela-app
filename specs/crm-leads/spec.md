---
feature: crm-leads
module: api, web, shared
phase: spec
status: draft
size: L
created: 2026-07-18
updated: 2026-07-18
---

# Spec: crm-leads (CRM-04 — Leads no CRM)

## O Que

Gestão dos leads capturados na landing dentro do CRM: listagem autenticada com filtro por status e paginação, transição de status (`new → contacted → converted/discarded`), **conversão lead → cliente** (cria a cliente a partir do lead, atomicamente, mantendo o vínculo) e telas mobile-first. Inclui a correção do known-issue do rate limit de `/leads` (guard público hoje cobre qualquer método — as rotas autenticadas novas não podem cair no limite de visitante).

## Por Que

CRM-04 do `specs/ROADMAP.md`: os leads capturados na landing (LP-02/LP-06) hoje só existem no banco. O funil (novo → contatado → convertido/descartado) e a conversão em cliente são o elo entre a landing e o CRM. Invariante do domínio: "Lead convertido vira Client mantendo o vínculo" (04-domain-model, relação `Lead 1—0..1 Client`).

## Requisitos

- **RF-01** — Migração: coluna `client_id` uuid **nullable** FK → `clients.id` na tabela `leads`, com índice; `ON DELETE SET NULL` (excluir a cliente não apaga o lead — histórico de captação; o vínculo se desfaz). Sem backfill (não há leads convertidos).
- **RF-02** — Contratos em `packages/shared`: **`leadStatusValues`/`LeadStatus` passam a viver em shared** (hoje só existem em `apps/api/src/db/schema/leads.ts` — o schema Drizzle importa de shared; nunca duplicar o literal, e o web não pode importar de `db/`), schema de resposta do lead (id, name, whatsapp, interest, source, status, clientId nullable, createdAt), query de listagem (paginação existente + filtro `?status=` opcional pelo enum), schema de atualização de status (apenas `new`, `contacted`, `discarded` — **`converted` não é settável via PATCH**), mensagens pt-BR (incl. campo ausente).
- **RF-03** — API (rotas autenticadas no módulo `leads`, camadas existentes): `GET /leads` (paginada, filtro por status, ordenada por `created_at` desc — leads novos primeiro), `PATCH /leads/:id/status` (transições permitidas entre `new`/`contacted`/`discarded`; lead `converted` é **terminal** — tentar alterá-lo ⇒ 409 com mensagem pt-BR), `POST /leads/:id/convert`.
- **RF-04** — Conversão (`POST /leads/:id/convert`): o **service** compõe os dados da cliente (name/whatsapp do lead; consultant da **sessão**; notes com o interesse quando houver, prefixo "Interesse (lead): "); o **repository** executa a **transação** (insert da cliente + update do lead com `client_id` e `status = converted`). A guarda de já-convertido é **dentro da transação** (update condicional `WHERE status <> 'converted'`; 0 linhas afetadas ⇒ rollback + 409) — requisições concorrentes não podem criar duas clientes (invariante `Lead 1—0..1 Client`). Lead já convertido ⇒ 409; inexistente/id malformado ⇒ 404. Resposta: o cliente criado (contrato de clients).
- **RF-05** — Escopo do rate limit público corrigido (known-issue): o guard `onRequest` de leads limita **apenas `POST /leads`** (path normalizado + método); `GET /leads`, `PATCH /leads/:id/status` e `POST /leads/:id/convert` autenticados **não** consomem o bucket do visitante. `POST /leads` público permanece com rate limit + honeypot intactos.
- **RF-06** — Leads não têm dono nesta fase (captura pública não conhece consultora; usuária única): a listagem autenticada mostra todos; a conversão pendura a **cliente** na consultora da sessão. Registrar o drift em relação a `Lead N—1 Consultant` do domínio (Decisions Log + graduação).
- **RF-07** — Web `/crm/leads`: listagem mobile-first substituindo o placeholder — estados loading (skeleton)/vazio/erro(retry)/conteúdo, filtro por status (links/tabs com query param, preservado na paginação), paginação, cards com nome, WhatsApp (botão conversa E.164 via `toWaPhone`), interesse, badge de status pt-BR (Novo/Contatado/Convertido/Descartado) e data de captura `dd/mm/aaaa`.
- **RF-08** — Ações no card/detalhe: "Marcar como contatado" / "Descartar" (Server Actions de status com `revalidatePath`; disponíveis conforme o status atual), "Converter em cliente" com **confirmação explícita** → action de conversão → redirect para o detalhe da cliente criada; lead convertido mostra link para a cliente vinculada em vez das ações; convertido com `clientId` null (cliente excluída depois — RF-01) mostra badge "Convertido" + texto "cliente excluída", sem link e sem ações.
- **RF-09** — LGPD/logs: nenhum nome/WhatsApp em log (IDs apenas); textos pt-BR; a11y mínima (botões com texto/aria-label, badges com texto — não só cor).

## Critérios de Aceite

- [ ] (RF-01) Integração: coluna/FK/índice criados; `ON DELETE SET NULL` provado (delete da cliente vinculada → lead permanece com `client_id` null e status `converted`).
- [ ] (RF-02) Unidade (shared): status inválido no filtro/PATCH rejeitado pt-BR; `converted` rejeitado no schema de PATCH; `{}` coberto.
- [ ] (RF-03) Integração (sessão real): lista paginada ordenada desc; filtro `?status=new` só retorna novos; PATCH transições válidas 200; PATCH em lead `converted` ⇒ 409; id malformado ⇒ 404; sem token ⇒ 401 nas 3 rotas novas.
- [ ] (RF-04) Integração: convert cria cliente com os dados do lead (consultant da sessão; interesse em notes), seta vínculo+status atomicamente; convert repetido ⇒ 409 e **não** cria segunda cliente; falha na criação da cliente não deixa lead meio-convertido (transação — provar com whatsapp inválido injetado direto no banco é difícil: provar atomicidade pelo caminho do 409 + contagem de clientes).
- [ ] (RF-05) Integração: rajada de `GET /leads` autenticado (> limite do visitante) **não** recebe 429; `POST /leads` público continua respondendo 429 após o limite; honeypot intacto (testes existentes verdes).
- [ ] (RF-07/RF-08) Unidade dos helpers web (leads-api: URLs/Bearer/erros; badge/status labels) + QA de runtime com checklist (lista, filtro, contatado/descartado, conversão com confirmação → detalhe da cliente, convertido vira link, 429 só no público).
- [ ] (RF-09) QA: grep de logs sem PII.

## Fora de Escopo

- Follow-up de leads parados (REL-04); edição de dados do lead (nome/whatsapp — lead é registro de captação, não cadastro); exclusão de lead (LGPD a pedido fica para item futuro se surgir demanda — hoje há `DELETE` apenas de cliente); dono (consultant_id) em leads (drift registrado, resolver quando multi-tenant); busca textual na listagem de leads.

## Restrições Conhecidas

- Sem E2E (REL-01); cobertura por unidade + integração + checklist de runtime.
- `POST /leads` público e seu contrato NÃO mudam (testes existentes de LP-02/LP-06 devem continuar verdes sem edição).
- Vitest sob Node: sessão real nos testes usa a porta de hasher com KDF do Node (padrão estabelecido no CRM-01/03).
