---
feature: lead-capture-form
module: web, shared
phase: tasks
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [plan.md]
---

# Tasks: Formulário de captura de lead

## Milestone 1: Schema do form + deps

- [x] **Task 1.1** — `packages/shared/src/lead-form.ts` (`leadFormSchema` via `.extend` de **`leadCaptureRequestSchema`**: `consent` boolean→pipe→literal true com msg LGPD; `website` default "") + re-export + `lead-form.test.ts` (consent false → mensagem LGPD; válido passa E preserva `website` no output; atribuição de tipo output → `LeadCaptureRequest` provada em código); mensagem pt-BR no `.max` de `interest` em `createLeadSchema` (erro default inglês ficaria visível na UI)
  - Arquivos: `packages/shared/src/lead-form.ts`, `lead-form.test.ts`, `packages/shared/src/index.ts`, `packages/shared/src/leads.ts`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: unidade shared verde; typecheck; **suíte da API verde** (mudança de mensagem no schema compartilhado não pode regredir a integração do LP-02)
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 1.2** — Deps web (`react-hook-form`, `@hookform/resolvers` **≥ 5.1** — Zod v4) + shadcn `add input label textarea checkbox`; `API_URL` em `loadWebEnv` (+ teste) e `.env.example`/`.env.local` do web
  - Arquivos: `apps/web/package.json`, `apps/web/src/components/ui/{input,label,textarea,checkbox}.tsx`, `apps/web/src/lib/env.ts`, `env.test.ts`, `apps/web/.env.example`, `apps/web/.env.local`
  - Dependências: nenhuma
  - Paralelizável: sim
  - Verificação: `bun install` ok; unidade env verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 2: Submissão (helper + action)

- [x] **Task 2.1** — `lib/submit-lead.ts` (`submitLead(values, { fetchImpl, apiUrl, clientIp? })`: valida com `leadCaptureRequestSchema`, POST JSON com header `x-forwarded-for: clientIp` quando presente, 201 → ok, envelope conhecido → message, rede/não-JSON/formato inesperado → mensagem genérica pt-BR; nunca lança para a UI) + `submit-lead.test.ts` com fetch fake (7 casos: os 5 de resultado + header presente/ausente)
  - Arquivos: `apps/web/src/lib/submit-lead.ts`, `submit-lead.test.ts`
  - Dependências: Task 1.1
  - Paralelizável: sim (disjunto de 1.2)
  - Verificação: unidade verde; typecheck
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 2.2** — Server Action `app/(landing)/actions.ts` (`"use server"`): extrai o IP do visitante como **ÚLTIMO valor** do XFF recebido via helper puro `extractClientIp(headerValue)` (em `lib/`, com teste unitário: single, multi-valor `"1.2.3.4, 5.6.7.8"` → `"5.6.7.8"`, ausente → undefined, último elemento vazio após trim (`"1.2.3.4, "`) → undefined (tratar como ausente; header omitido)) e chama `submitLead` com `loadWebEnv().API_URL`, fetch global e `clientIp`; sem log de payload
  - Arquivos: `apps/web/src/app/(landing)/actions.ts`, `apps/web/src/lib/client-ip.ts`, `apps/web/src/lib/client-ip.test.ts`
  - Dependências: Task 2.1, Task 1.2
  - Paralelizável: não
  - Verificação: unidade do helper verde; typecheck; lint
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Milestone 3: UI e integração

- [x] **Task 3.1** — `lead-form.tsx` (`"use client"`: RHF + zodResolver(leadFormSchema), campos com Label/Input/Textarea/Checkbox shadcn, erros por campo `aria-describedby`/`aria-invalid`, honeypot off-screen conforme plan, estados enviando/sucesso/erro com retry preservando valores, `useTransition` ou submit assíncrono do RHF)
  - Arquivos: `apps/web/src/components/landing/lead-form.tsx`
  - Dependências: Task 2.2
  - Paralelizável: não
  - Verificação: typecheck; lint
  - Implementado por: clientela-implementer (sessão 2026-07-17)
- [x] **Task 3.2** — `lead-section.tsx` (RSC: heading + isca de `landing.ts` + `<LeadForm />`, `id="contato"` preservado) + `page.tsx` (rodapé placeholder → LeadSection) + `landing.ts` (`footer` → `leadSection` com isca placeholder honesta)
  - Arquivos: `apps/web/src/components/landing/lead-section.tsx`, `apps/web/src/app/(landing)/page.tsx`, `apps/web/src/content/landing.ts`
  - Dependências: Task 3.1
  - Paralelizável: não
  - Verificação: `bun run lint`/`typecheck`/`test` raiz verdes; `cd apps/web && bun run build` → `/` estática; grep no `.next/static` sem `API_URL`/localhost:3001; build sem `API_URL` falha citando a variável; form em uma coluna a 375px (classes mobile-first, sem larguras fixas)
  - Implementado por: clientela-implementer (sessão 2026-07-17)

## Ordem de Execução

M1 (1.1 ∥ 1.2) → M2 (2.1 → 2.2) → M3 (3.1 → 3.2). Checkpoint por milestone.

## Definition of Done (agregado)
- [ ] Critérios do spec.md atendidos e testados
- [ ] lint/typecheck/test verdes; build `/` estática
- [ ] Fluxo fim-a-fim real na QA (form → API → Postgres; honeypot; API off)
- [ ] Pendência E2E registrada no handoff
