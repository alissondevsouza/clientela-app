---
feature: crm-layout
module: web
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: crm-layout

> Contexto herdado do ciclo crm-auth (mesma sessão, 2026-07-17) + inspeção direta dos arquivos do grupo `(crm)`.

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/web/src/app/(crm)/layout.tsx` | Guard server-side (cookie → `fetchSession`); hoje devolve container mínimo. `session.consultant` (id, name, email) já está disponível aqui — o header usa isso sem nova chamada. Comentário no arquivo já anuncia "shell real é o CRM-02" |
| `apps/web/src/app/(crm)/crm/page.tsx` | Placeholder atual com logout; `metadata.robots` por página (migrar para o layout); botão "Sair" com `logoutAction` via `<form action>` |
| `apps/web/src/app/(crm)/actions.ts` | `logoutAction` — reusada pelo header |
| `apps/web/src/components/landing/site-header.tsx` | Padrão de header existente (marca, classes Tailwind) |
| `apps/web/src/components/ui/button.tsx` | shadcn Button (base-ui) para o "Sair" |
| `apps/web/src/lib/utils.ts` | `cn()` para composição de classes (estado ativo) |

## Padrões do Codebase a Seguir

- Server-first: layout e header como RSC; `"use client"` só no componente de navegação (usa `usePathname`) — menor componente possível (`web.md`).
- Componentes de feature em `apps/web/src/components/<feature>/` → novo dir `components/crm/`.
- Textos de UI como constantes nomeadas pt-BR nos próprios arquivos (padrão das tasks do crm-auth).
- Ícones: `lucide-react` já é a iconLibrary do shadcn (`components.json`) — sem dependência nova.
- Metadata: layout pode definir `robots` herdado por todas as pages do grupo (Next App Router).

## Schemas e Tipos Relevantes

Nenhum novo. `AuthConsultant` de `@clientela/shared` já tipa a consultora exposta pelo guard.

## Dependências Entre Packages

Só `apps/web`. Nenhuma mudança em `apps/api` ou `packages/shared`.

## Gaps Identificados

- Não existe `components/crm/`; não existe navegação nenhuma no grupo.
- Não existem as rotas `/crm/clients|leads|products|sales` (404 hoje).
- `robots` duplicado por página (login e crm) — o do grupo `(crm)` centraliza no layout; o de `/login` fica (grupo `(auth)` separado).
- Sem RTL/jsdom para teste de componente (limitação conhecida) — lógica de ativação deve ser extraída pura.

## Referências Externas

- Rules: `web.md` (mobile-first, a11y, server-first), `core.md`.
- Skills: `react`, `tailwindcss`, `shadcn-ui`.
- ADR-0012 (auth/guard já resolvidos — este ciclo não toca auth).
