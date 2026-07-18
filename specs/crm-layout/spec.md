---
feature: crm-layout
module: web
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: crm-layout (CRM-02 — Shell autenticado e navegação do CRM)

## O Que

Shell autenticado do grupo `(crm)`: header com marca e nome da consultora logada + botão sair, navegação **mobile-first** (barra inferior fixa no mobile, inline no header em telas ≥ md) entre as seções do CRM (Início, Clientes, Leads, Produtos, Vendas), com estado ativo por rota e páginas placeholder "em breve" para as seções que os itens CRM-03..CRM-06 vão preencher.

## Por Que

CRM-03..CRM-08 dependem de um shell navegável (item CRM-02 do `specs/ROADMAP.md`). A consultora usa o CRM primariamente no celular (`web.md`: mobile-first obrigatório). Hoje o grupo `(crm)` tem só um container mínimo e uma página placeholder com logout (CRM-01).

## Requisitos

- **RF-01** — Header do shell no layout `(crm)`: marca "Lais Barbosa", nome da consultora logada (obtido da sessão já validada pelo guard — sem chamada extra à API) e botão "Sair" (Server Action de logout existente, funciona sem JS).
- **RF-02** — Navegação com 5 destinos: Início (`/crm`), Clientes (`/crm/clients`), Leads (`/crm/leads`), Produtos (`/crm/products`), Vendas (`/crm/sales`). Mobile (< md): barra inferior **fixa** com ícone + rótulo pt-BR por item, área de toque adequada (≥ 44px). Desktop (≥ md): mesma navegação inline (header), sem barra inferior.
- **RF-03** — Item ativo destacado conforme a rota atual, incluindo sub-rotas (ex.: `/crm/clients/123` marca "Clientes"; `/crm` ativa "Início" apenas em match exato). Lógica de ativação como função pura testável.
- **RF-04** — Páginas placeholder para Clientes, Leads, Produtos e Vendas: título pt-BR, mensagem "em breve" e referência à fase (conteúdo real vem nos CRM-03..06). A página Início (`/crm`) mantém papel de home (placeholder até o dashboard CRM-07).
- **RF-05** — Nenhuma página do grupo `(crm)` é indexável: `robots: { index: false }` definido **uma vez** no layout do grupo (herdado), removendo a duplicação por página.
- **RF-06** — Acessibilidade: navegação em `<nav>` com `aria-label`, item ativo com `aria-current="page"`, links/botões com texto visível, contraste AA, navegável por teclado.
- **RF-07** — Client Component só onde há interatividade/estado (estado ativo via `usePathname` no menor componente possível); o restante do shell permanece Server Component. Nenhuma busca de dados nova (o guard do layout já retorna a consultora).
- **RF-08** — Resolver o known-issue "duração da sessão duplicada": o `maxAge` do cookie passa a ser **derivado do `expiresAt`** retornado pela API no login (fonte da verdade única); a constante duplicada de 30 dias sai de `apps/web`. Comportamento fail-safe preservado (expiresAt inválido/no passado ⇒ maxAge 0).

## Critérios de Aceite

- [ ] (RF-01) Header renderiza marca, nome vindo da sessão e "Sair" funcional (action existente); nenhuma chamada adicional a `/auth/me` além da do guard.
- [ ] (RF-02) Em viewport ~375px a barra inferior é fixa com 5 itens e alvos ≥ 44px; em ≥ md a barra inferior não aparece e a navegação está no header (verificação de runtime na QA + inspeção de classes).
- [ ] (RF-03) Unidade: função de ativação cobre match exato de `/crm`, prefixo de sub-rota, e não-match entre seções irmãs (`/crm/clients` não ativa "Leads").
- [ ] (RF-04) Navegar para cada um dos 5 destinos autenticada responde 200 com o placeholder correto (QA de runtime).
- [ ] (RF-05) Nenhuma page do grupo redefine `robots`; resposta das rotas do grupo contém meta robots noindex (herdada do layout).
- [ ] (RF-06) Inspeção: `<nav aria-label>`, `aria-current="page"` no ativo, texto em todos os links.
- [ ] (RF-07) Apenas o componente de navegação (e nada acima dele) tem `"use client"`.
- [ ] (RF-08) Unidade: `maxAge` do cookie = segundos até o `expiresAt` da resposta (arredondado para baixo, mínimo 0); nenhuma constante de duração de sessão permanece em `apps/web`; known-issue atualizado na graduação.

## Fora de Escopo

- Conteúdo real das seções (CRM-03..CRM-08); dashboard (CRM-07).
- Mudanças na API, contratos ou banco. No fluxo de auth, **apenas** o RF-08 (maxAge do cookie) — o restante do CRM-01 fica intacto.
- Menu hambúrguer/drawer, tema escuro, notificações.

## Restrições Conhecidas

- Rotas com segmentos em **inglês** (`/crm/clients`…): regra do projeto "código e nomes de arquivos em inglês" — pastas de rota são nomes de arquivo (decisão no Decisions Log).
- Sem infra E2E (known-issue): navegação provada por QA de runtime manual; unidade cobre a lógica de ativação.
- Vitest roda em ambiente node sem RTL/jsdom — sem teste de componente; markup é coberto por inspeção na QA (mesma limitação registrada no CRM-01).
