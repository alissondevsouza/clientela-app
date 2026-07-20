---
feature: crm-leads
phase: validate
status: done
created: 2026-07-18
updated: 2026-07-18
reviewer: QA adversarial (neutro — não implementou)
---

# Validate: crm-leads

Base do diff: `git diff 34994a9` (branch `feature/phase-2-crm`). Todos os comandos executados de fato em 2026-07-18.

## Ferramentas (estático)

| Ferramenta | Comando | Resultado |
|---|---|---|
| Lint | `bun run lint` | ✅ `Checked 159 files in 65ms. No fixes applied.` |
| Typecheck | `bun run typecheck` | ✅ shared/web/api — exit 0 nos 3 workspaces |
| Testes | `bun run test` (Docker/Testcontainers ativo) | ✅ **30 arquivos, 340 testes, 0 falhas** (17.4s; integração com Postgres real incluída) |
| Build web | `bun run --filter '@clientela/web' build` | ✅ 13 rotas; `/crm/leads` dinâmica (ƒ); exit 0 |
| Migração | `bun run db:migrate` (dev 5433) | ✅ `0003_married_blue_shield` aplicada — `client_id` uuid nullable + FK `ON DELETE SET NULL` + índice `leads_client_id_idx` confirmados via `\d leads` |

## QA de runtime (checklist do plan.md — 8 itens)

Infra: Postgres dev `clientela_pg_dev` (5433, já ativo) + migração; seed `seed:consultant` (consultora QA); API real (`bun src/index.ts`, :3001); web **build de produção + `next start`** (:3000 — necessário para invocar Server Actions por id estável; no dev/Turbopack os ids do manifest divergem do processo). Server Actions invocadas de verdade via `POST /crm/leads` + header `next-action: <id do server-reference-manifest>`.

1. **Semear pelo POST público + lista ordenada** ✅ — 3 leads criados via `POST /leads` (contrato da landing intacto, honeypot `website:""` aceito, 201 `{id}`); `GET /leads` autenticado e a page `/crm/leads` listam em `created_at desc` (QA Lead 3 → 2 → 1 → pré-existente).
2. **Filtro + paginação + estados** ✅ — `?status=new` só novos (API e page); `?status` inválido ⇒ 422 `"Status de lead inválido"` (pt-BR, sem termos em inglês); vazio-de-filtro renderiza “Nenhum lead com o status …” + CTA “Ver todos”; com 26 leads `new`: “Página 1 de 2”, links `?page=2&status=new` / `?page=1&status=new` (**filtro preservado na paginação**); `?page=abc&status=banana` cai nos defaults (200, sem error boundary). Skeleton em `loading.tsx` (estático, conferido por código/build).
3. **Ações de status (Server Actions reais)** ✅ — `updateLeadStatusAction` (id `60ad10…`): lead1→`contacted`, lead2→`discarded`, resposta `{"ok":true}` e status confirmado no banco; `revalidatePath` reflete na lista.
4. **Conversão fim-a-fim** ✅ — `convertLeadAction` (id `40962c…`) em lead1: **HTTP 303 + `x-action-redirect: /crm/clients/019f7549-…;push`** (redirect ao detalhe da cliente criada); banco: lead `converted` + `client_id` setado; cliente com name/whatsapp do lead e `notes = "Interesse (lead): Interesse QA 1"`; detalhe da cliente renderiza os dados; lista mostra badge “Convertido” + link “Ver cliente” → `/crm/clients/{id}`.
5. **409** ✅ — convert repetido via curl ⇒ `409 LEAD_ALREADY_CONVERTED` (“Lead já convertido em cliente.”), contagem de clientes segue 1; PATCH em convertido ⇒ 409. **Extra adversarial: 2 converts em paralelo no mesmo lead ⇒ exatamente um 201 e um 409, 1 cliente criada** (guarda TOCTOU dentro da transação provada em runtime).
6. **Escopo do rate limit** ✅ — 15× `GET /leads` autenticado do mesmo IP: 15× 200 (zero 429, bucket não consumido); em seguida `POST /leads` público do mesmo IP: 5× 201 e depois 429 (limite 5/janela). **Extra adversarial: `POST /leads/` (trailing slash) continua limitado (5× 201 → 429)**; `GET/PATCH/convert` sem token ⇒ 401 nas 3 rotas; `/crm/leads` sem cookie ⇒ 307 → `/login`.
7. **wa.me E.164** ✅ — HTML da lista traz `wa.me/5511900010001` etc. (prefixo 55 via `toWaPhone`), com `aria-label="Conversar com … no WhatsApp"`.
8. **Excluir cliente convertida + logs sem PII** ✅ — `DELETE /clients/{id}` ⇒ 204; lead permanece `converted` com `client_id` NULL; page mostra “Cliente excluída” **sem link** (e o outro convertido segue com “Ver cliente”). Grep de nomes/telefones/e-mail/senha nos logs de API e web (dev e prod): **0 ocorrências** (log da API tem 1 linha: “API rodando em …”).

## Encerramento

- Servidores API e web derrubados (health check `000` confirmado).
- Dados de QA removidos do banco dev (28 leads, 1 cliente, 1 sessão, 1 consultora QA); estado final = estado pré-QA (1 lead pré-existente, 0 clientes, 0 consultoras).

## Pendências

- **E2E (Playwright)**: inexistente (REL-01) — pendência já registrada em known-issues; fluxos cobertos aqui por unidade + integração + runtime real.
- Nenhuma outra pendência de validação.
