---
feature: whatsapp-cta
module: web
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: Componente WhatsApp CTA

## Milestone 1: Lógica e config

- [x] **Task 1.1** — `lib/whatsapp.ts` (`buildWhatsAppUrl`: normaliza phone p/ dígitos, valida 10–15, urlencode da mensagem, sem `?text` quando ausente; erro claro) + `whatsapp.test.ts` (casos do RF-01)
  - Arquivos: `apps/web/src/lib/whatsapp.ts`, `apps/web/src/lib/whatsapp.test.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: unidade verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 1.2** — `lib/env.ts` (Zod: `WHATSAPP_PHONE` obrigatória validada, `WHATSAPP_DEFAULT_MESSAGE` com default pt-BR) + `env.test.ts`; `zod` como dep do web; `.env.example` atualizado (comentário sobre build time/rebuild)
  - Arquivos: `apps/web/src/lib/env.ts`, `apps/web/src/lib/env.test.ts`, `apps/web/package.json`, `.env.example`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: unidade verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Componente e integração

- [x] **Task 2.1** — `WhatsAppCta` (Server Component: `<a>` com buttonVariants, `target="_blank"`, `rel="noopener noreferrer"`, props `message`/`variant`/`size`/`className`/`children`) e integração: hero usa o componente; rodapé ganha CTA real (mantendo `id="contato"`); `landing.ts` sem `ctaHref`
  - Arquivos: `apps/web/src/components/landing/whatsapp-cta.tsx`, `hero.tsx`, `apps/web/src/app/(landing)/page.tsx`, `apps/web/src/content/landing.ts`
  - Dependências: Task 1.1, Task 1.2
  - Paralelizável: não
  - Verificação: `bun run lint`/`typecheck`/`test` verdes na raiz; `cd apps/web && bun run build` com `/` estática (env de exemplo no ambiente); build SEM `WHATSAPP_PHONE` falha citando a variável
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem de Execução

M1 (1.1 ∥ 1.2) → M2 (2.1).

## Definition of Done (agregado)
- [ ] Critérios do spec.md atendidos e testados
- [ ] lint/typecheck/test raiz verdes; build web `/` estática
- [ ] Zero `"use client"` no escopo
