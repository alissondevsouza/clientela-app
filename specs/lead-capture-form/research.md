---
feature: lead-capture-form
module: web, shared
phase: research
status: draft
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md]
---

# Research: Formulário de captura de lead

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `packages/shared/src/leads.ts` | `createLeadSchema` (consent literal true; interest normaliza "" → undefined; whatsapp transform p/ dígitos) e `leadCaptureRequestSchema` (+ honeypot `website`) — fonte de verdade do contrato |
| `packages/shared/src/api.ts` | `apiErrorSchema` — o helper de submissão faz narrowing do envelope com ele |
| `apps/api/src/modules/leads/leads.routes.ts` | POST /leads: 201 `{ id }`; 422/400/429/500 envelope `{ error: { code, message } }`; rate limit antes da validação |
| `apps/web/src/lib/env.ts` | `loadWebEnv` — ganha `API_URL`; padrão de env por função testável |
| `apps/web/src/app/(landing)/page.tsx` | Rodapé `id="contato"` placeholder — vira a seção do formulário |
| `apps/web/src/content/landing.ts` | `footer.*` — reformular para isca + textos do form (labels/mensagens de UI ficam no content? decisão: labels são conteúdo, mensagens de validação vêm do schema shared) |
| `apps/web/src/components/ui/` | `button.tsx`, `card.tsx` existentes; faltam `input`, `label`, `textarea`, `checkbox` (CLI shadcn) |

## Padrões do Codebase a Seguir

- Client component na folha (`"use client"` só no form); página RSC estática.
- Env por `loadWebEnv(source)`; erro cita nomes, nunca valores.
- Envelope de erro compartilhado; mensagens de usuário pt-BR acionáveis.
- Testes com fakes explícitos (sem `vi.mock`) — fetch fake injetado por parâmetro.

## Gaps Identificados

- RHF + zodResolver não instalados (`react-hook-form`, `@hookform/resolvers`) — deps novas justificadas por `web.md` (regra manda usá-los).
- `consent: z.literal(true)` é hostil a RHF (defaultValue false) → variante `leadFormSchema` no shared (RF-01).
- Componentes shadcn de formulário ausentes (input/label/textarea/checkbox) — `bunx shadcn@latest add`.
- Server Action + fetch: precisa de helper puro testável (`submitLead(input, deps)`) — action em si é wrapper fino (Next não permite testar action diretamente em unidade sem runtime).
- Honeypot: campo deve ser um input de texto REAL escondido via CSS (`position:absolute` off-screen / `hidden` container) — `type="hidden"` é ignorado por muitos bots; detalhe fixado no plan.

## Referências Externas

- Skills: `.claude/skills/react/SKILL.md` (RHF + server actions + useTransition), `shadcn-ui` (Form patterns), `zod`.
- Rules: `web.md` (server actions, estados obrigatórios, RHF+schema shared), `security.md` (LGPD, logs), `testing.md`.
- LP-02 (`specs/leads-capture-api/spec.md`): contrato e comportamento do endpoint (honeypot 201 sintético; 429 5/min por IP).
