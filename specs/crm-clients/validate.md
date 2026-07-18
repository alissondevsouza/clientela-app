---
feature: crm-clients
phase: validate
status: done
created: 2026-07-18
updated: 2026-07-18
---

# Validate: crm-clients

Executado pelo revisor de QA (neutro) em 2026-07-18. Ambiente: working tree da branch `feature/phase-1-landing-page` (repo sem commits — o "diff" é a árvore inteira; escopo revisado = arquivos listados em tasks.md).

## Ferramentas

| Comando | Resultado |
|---|---|
| `bun run lint` | ✅ `Checked 146 files in 55ms. No fixes applied.` |
| `bun run typecheck` | ✅ shared, web e api — exit 0 |
| `bun run test` (Docker/Testcontainers ativos) | ✅ **28 arquivos / 279 testes, 0 falhas** (70s de testes) |
| `bun run --filter '@clientela/web' build` | ✅ Next 16.2.10 — 13 rotas geradas; `/crm/clients`, `/crm/clients/[id]`, `/crm/clients/new` dinâmicas |

## QA de runtime (checklist do plan.md — 9 itens)

Setup real: Postgres dev `clientela_pg_dev` (porta 5433) já de pé → `bun run db:migrate` aplicou `0002_clear_yellowjacket.sql` (`\d clients` confere colunas/FK/índice) → consultora semeada via `scripts/seed-consultant.ts` (real, argon2id) → API `bun run src/index.ts` (3001) → web `next start` (3000, pós-build). Sessão obtida por `POST /auth/login` real; requests ao web com cookie `clientela_session`.

1. **Lista vazia + loading** ✅ — `GET /crm/clients` (0 clientes) renderiza "Nenhuma cliente cadastrada ainda" + CTA "Cadastrar primeira cliente". `loading.tsx` presente em `clients/` e `clients/[id]/` (inspeção de arquivos).
2. **Criar + validação pt-BR** ✅ — POST 201 com `(11) 91234-5678` → whatsapp normalizado `11912345678`; nome curto ⇒ 422 "Informe o nome da cliente (mínimo 2 caracteres)"; birthday `2030-01-01` ⇒ 422 "A data de nascimento não pode ser futura". Clientes criadas aparecem na lista do web.
3. **Busca + paginação** ✅ — `?search=MARIA` (case-insensitive) filtra só "Maria Silva"; `?search=zzz` mostra "Nenhuma cliente encontrada para…" + "Limpar busca"; busca `(21) 9` (com máscara) casa com `21987654321`; API `?perPage=2&page=2` respeita janela e `total`; `?perPage=101` ⇒ 422; com 25 clientes, link "Próxima" = `/crm/clients?page=2&search=Teste` (**preserva `?search`**) e a página 2 renderiza. `?page=abc` no web ⇒ 200 com defaults (saneamento ok). ⚠️ Achados de borda em review.md: `?search=%` casa tudo (wildcard ILIKE sem escape) e `?page=99` além do fim mostra o vazio de "primeira cliente".
4. **PATCH parcial + datas** ✅ — PATCH só `notes` preserva demais campos; PATCH `{"birthday":null}` limpa; `{}` ⇒ 422 "Informe ao menos um campo para atualizar"; `updated_at` avança; datas `dd/mm/aaaa` (25/03/1990) na lista e detalhe.
5. **WhatsApp E.164** ✅ — cliente com número local de 11 dígitos gera `wa.me/5511912345678` na lista e no detalhe; número armazenado com `55` (13 díg.) passa direto (`wa.me/5531999998888`).
6. **Exclusão** ✅ — confirmação em 2 passos por inspeção do `delete-client-button.tsx` (1º clique só abre confirmação; interação JS não é exercitável por curl — pendência E2E/REL-01); DELETE ⇒ 204 sem corpo; GET ⇒ 404 pt-BR; detalhe web da excluída renderiza `not-found.tsx` ("Cliente não encontrada… excluída"); some da lista.
7. **Guard** ✅ — as 5 rotas `/clients*` sem token ⇒ 401.
8. **RF-11** ✅ — `role="list"` ×2 no DOM (nav mobile + desktop); botão "Sair" com `h-11` (44px) mobile / `md:h-7` desktop.
9. **Logs sem PII** ✅ — grep por nomes/números/e-mail nos logs da API e do web: nenhuma ocorrência (API logou apenas o boot).

## Testes adversariais extras (além do checklist)

- **Cross-tenant em runtime**: 2ª consultora semeada; sessão B em GET/PATCH/DELETE de cliente de A ⇒ **404 idêntico** ao inexistente; lista de B vazia. ✅
- **Mass-assignment**: `POST /clients` com `"consultantId": <id de B>` no body → linha criada com `consultant_id` de **A** (Zod strip na fronteira). `PATCH` só com chave desconhecida ⇒ 422 (body vazio pós-strip). ✅
- **Id malformado/traversal**: `GET /clients/nao-uuid` ⇒ 404; `/crm/clients/..%2Fauth%2Fme` no web ⇒ UI de não-encontrada, sem vazamento. ✅
- **Wildcard ILIKE**: `?search=%` ⇒ total=25 (tudo), `?search=_` ⇒ total=25 — sem escape de `%`/`_` (ALERTA em review.md). ⚠️

## Teardown

Servidores API/web derrubados; clientes de teste (25) e as 2 consultoras QA removidos do banco dev (`clients`=0, `consultants`=0). Postgres dev permaneceu de pé (estado pré-existente).

## Pendências

- E2E (Playwright) inexistente — cliques do fluxo de UI (form RHF, confirmação de exclusão) validados por inspeção + unidade (known-issue REL-01, já registrado no plan).
